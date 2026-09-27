import test from "node:test";
import assert from "node:assert/strict";
import {
  answerResponseSchema,
  parseGeminiAnswer,
} from "../src/lib/gemini-answer-format";
import type { AnswerSource } from "../src/lib/answers";

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
