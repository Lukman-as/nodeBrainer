import test from "node:test";
import assert from "node:assert/strict";
import {
  answerResponseSchema,
  parseGeminiAnswer,
} from "../src/lib/gemini-answer-format";
import type { AnswerSource } from "../src/lib/answers";
import {
  answerThinkingConfig,
  buildAnswerRequest,
} from "../src/lib/gemini-answer-request";
import { GeminiTransport } from "../src/lib/gemini-transport";

const sources: AnswerSource[] = [
  {
    id: "S1",
    itemId: "algebra",
    segmentId: "p1",
    title: "Linear algebra",
    type: "note",
    text: "Linear algebra studies vectors and linear transformations.",
    kind: "text",
    locator: {},
  },
];
const draft = {
  paragraphs: [
    {
      text: "Linear algebra studies vectors and linear transformations.",
      citations: ["S1"],
    },
  ],
  insufficientContext: false,
};
const response = (text: string, finishReason = "STOP") => ({
  candidates: [{ finishReason, content: { parts: [{ text }] } }],
});

test("compact prompts retain primary evidence, cluster context and citation locators", () => {
  const body = buildAnswerRequest("What is linear algebra?", sources, {
    matchedItemIds: ["algebra"],
    clusters: [
      { id: 1, label: "Math", itemIds: ["algebra"], sourceIds: ["S1"] },
    ],
    sources,
  });
  const input = JSON.parse(body.contents[0].parts[0].text);
  assert.deepEqual(input.matchedSourceIds, ["S1"]);
  assert.deepEqual(input.clusters, [{ label: "Math", sourceIds: ["S1"] }]);
  assert.equal(input.sources[0].text, sources[0].text);
  assert.deepEqual(input.sources[0].locator, sources[0].locator);
  assert.equal(input.sources[0].kind, sources[0].kind);
  assert.equal(input.sources[0].itemId, undefined);
  assert.equal(body.generationConfig.maxOutputTokens, 4096);
});

test("fallback requests use thinking settings supported by each model", async () => {
  const bodies: { generationConfig: { thinkingConfig: unknown } }[] = [];
  const transport = new GeminiTransport(async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return bodies.length === 1
      ? Response.json({}, { status: 503 })
      : Response.json(response(JSON.stringify(draft)));
  });
  const body = buildAnswerRequest("What is linear algebra?", sources);
  const result = await transport.call(
    "fixture",
    ["gemini-3.8-flash", "gemini-2.5-flash"],
    "generateContent",
    body,
    20000,
    {
      bodyForModel: (model) => ({
        ...body,
        generationConfig: {
          ...body.generationConfig,
          thinkingConfig: answerThinkingConfig(model),
        },
      }),
    },
  );
  assert.deepEqual(
    bodies.map((b) => b.generationConfig.thinkingConfig),
    [{ thinkingLevel: "low" }, { thinkingBudget: 0 }],
  );
  assert.equal(answerThinkingConfig("gemini-2.0-flash"), undefined);
  assert.equal(answerThinkingConfig("gemini-2.5-pro"), undefined);
  assert.equal(parseGeminiAnswer(result, sources).mode, "gemini");
});

test("answer schema limits generated citation IDs to the provided evidence", () => {
  const schema = answerResponseSchema(sources);
  const paragraphs = schema.properties!.paragraphs as {
    items: {
      properties: { citations: { items: { enum: string[] } } };
      required: string[];
    };
  };
  assert.deepEqual(paragraphs.items.properties.citations.items.enum, ["S1"]);
  assert.ok(paragraphs.items.required.includes("citations"));
  assert.ok(schema.required!.includes("insufficientContext"));
});

test("valid structured answers retain citations and ignore separate thought parts", () => {
  const result = response(JSON.stringify(draft));
  result.candidates[0].content.parts.unshift({
    text: "Reasoning is not answer JSON.",
    thought: true,
  } as { text: string });
  const answer = parseGeminiAnswer(result, sources);
  assert.equal(answer.mode, "gemini");
  assert.deepEqual(answer.paragraphs, draft.paragraphs);
  assert.deepEqual(answer.sources, sources);
  assert.deepEqual(
    parseGeminiAnswer(
      response("```json\n" + JSON.stringify(draft) + "\n```"),
      sources,
    ),
    answer,
  );
});

test("truncation, empty replies and malformed JSON report distinct failures", () => {
  assert.throws(
    () => parseGeminiAnswer(response('{"paragraphs":', "MAX_TOKENS"), sources),
    /cut off at its output limit/,
  );
  assert.throws(
    () => parseGeminiAnswer(response(""), sources),
    /no answer text/,
  );
  assert.throws(
    () => parseGeminiAnswer(response('{"paragraphs":'), sources),
    /incomplete or malformed/,
  );
  assert.throws(
    () => parseGeminiAnswer(response('{"answer":"Wrong shape"}'), sources),
    /expected format/,
  );
  assert.throws(
    () =>
      parseGeminiAnswer({ promptFeedback: { blockReason: "SAFETY" } }, sources),
    /could not complete/,
  );
});

test("invalid or absent citations are still rejected rather than invented", () => {
  for (const [citations, message] of [
    [[], /omitted/],
    [["S999"], /not in the provided context/],
  ] as [string[], RegExp][]) {
    assert.throws(
      () =>
        parseGeminiAnswer(
          response(
            JSON.stringify({
              ...draft,
              paragraphs: [{ ...draft.paragraphs[0], citations }],
            }),
          ),
          sources,
        ),
      message,
    );
  }
});
