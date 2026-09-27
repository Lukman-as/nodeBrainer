import test from "node:test";
import assert from "node:assert/strict";
import { buildAnswerContext } from "../src/lib/answer-context";
import { readAnswerStream } from "../src/lib/answer-stream";
import { demoItems } from "../src/lib/demo-data";
import {
  segmentText,
  type KnowledgeItem,
  type SearchResponse,
} from "../src/lib/knowledge";
import { extractiveAnswer } from "../src/lib/answers";

const item = (id: string, title: string, content: string): KnowledgeItem => ({
  ...demoItems[0],
  id,
  title,
  content,
  tags: [],
  segments: segmentText(content),
});
const library = [
  item(
    "a",
    "Bayes",
    "Bayesian priors describe initial beliefs. See [[Evidence]].",
  ),
  item(
    "b",
    "Evidence",
    "Evidence updates Bayesian priors into posterior beliefs.",
  ),
  item("c", "Carbonara", "Pasta uses eggs, pepper and pecorino cheese."),
];
const retrieval: SearchResponse = {
  results: [
    {
      itemId: "a",
      segmentId: "segment-0",
      score: 1,
      discovery: "direct",
      path: ["a"],
      edges: [],
    },
  ],
  edges: [],
  mode: "keyword + graph",
  expanded: 1,
  scored: 1,
  elapsedMs: 1,
};

test("answer context includes an unranked cluster neighbor but excludes unrelated nodes", () => {
  const context = buildAnswerContext(library, retrieval);
  assert.deepEqual(context.matchedItemIds, ["a"]);
  assert.deepEqual(
    context.sources.map((source) => source.itemId),
    ["a", "b"],
  );
  assert.deepEqual(context.clusters[0].itemIds, ["a", "b"]);
  assert.deepEqual(context.clusters[0].sourceIds, ["S1", "S2"]);
  assert.equal(context.sources[1].text, library[1].segments[0].text);
});

test("context never adds sources without a match or from outside the supplied library", () => {
  assert.deepEqual(buildAnswerContext(library, { ...retrieval, results: [] }), {
    matchedItemIds: [],
    clusters: [],
    sources: [],
  });
  assert.equal(
    buildAnswerContext(library.slice(1), retrieval).sources.length,
    0,
  );
  assert.equal(
    buildAnswerContext(
      library.map((item) => ({ ...item, status: "needs-attention" })),
      retrieval,
    ).sources.length,
    0,
  );
});

test("large cluster context is bounded, prioritizes matched passages and excludes vectors", () => {
  const items = Array.from({ length: 40 }, (_, i) => ({
    ...item(
      `note-${i}`,
      "Shared topic",
      "Bayesian evidence and prior beliefs. ".repeat(120),
    ),
    graphEmbedding: { vector: [1, 0], model: "test", version: 2 },
  }));
  const context = buildAnswerContext(items, {
    ...retrieval,
    results: [{ ...retrieval.results[0], itemId: "note-0" }],
  });
  assert.equal(context.sources[0].itemId, "note-0");
  assert.ok(context.sources.length > 1 && context.sources.length <= 18);
  assert.ok(
    context.sources.reduce((size, source) => size + source.text.length, 0) <=
      24000,
  );
  assert.equal(
    new Set(context.sources.map((source) => source.id)).size,
    context.sources.length,
  );
  assert.ok(!JSON.stringify(context).includes("vector"));
});

test("retrieval reaches the map before the answer, even with fragmented UTF-8 chunks", async () => {
  const context = buildAnswerContext(library, retrieval);
  const answer = extractiveAnswer("Bayesian priors", context.sources);
  answer.paragraphs[0].text += " — evidence.";
  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array>;
  let revealed = false;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "retrieval", retrieval, context }) + "\n",
          ),
        );
      },
    }),
  );
  const result = await readAnswerStream(response, (event) => {
    assert.deepEqual(event.context.matchedItemIds, ["a"]);
    revealed = true;
    const bytes = encoder.encode(
      JSON.stringify({ type: "answer", answer }) + "\n",
    );
    for (let i = 0; i < bytes.length; i += 7)
      streamController.enqueue(bytes.slice(i, i + 7));
    streamController.close();
  });
  assert.ok(revealed);
  assert.deepEqual(result.answer, answer);
});

test("stream errors preserve revealed context and never masquerade as an answer", async () => {
  const context = buildAnswerContext(library, retrieval);
  let revealed = false;
  const first =
    JSON.stringify({ type: "retrieval", retrieval, context }) + "\n";
  await assert.rejects(
    readAnswerStream(
      new Response(
        first +
          JSON.stringify({ type: "error", error: "Gemini is unavailable." }),
      ),
      () => {
        revealed = true;
      },
    ),
    /Gemini is unavailable/,
  );
  assert.ok(revealed);
  await assert.rejects(
    readAnswerStream(new Response(first), () => {}),
    /interrupted/,
  );
});
