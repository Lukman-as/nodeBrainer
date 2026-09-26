import test from "node:test";
import assert from "node:assert/strict";
import { demoItems } from "../src/lib/demo-data";
import {
  KnowledgeItem,
  buildGraph,
  searchKnowledge,
  segmentText,
  cosine,
} from "../src/lib/knowledge";

test("connected search finds an indirect source with its real discovery path", () => {
  const result = searchKnowledge(demoItems, "conditional probability");
  const indirect = result.results.find((r) => r.itemId === "screening");
  assert.ok(indirect);
  assert.equal(indirect.discovery, "graph");
  assert.equal(indirect.path.at(-1), "screening");
  assert.equal(indirect.edges.length, indirect.path.length - 1);
  for (let i = 0; i < indirect.edges.length; i++) {
    const edge = indirect.edges[i];
    assert.ok([edge.source, edge.target].includes(indirect.path[i]));
    assert.ok([edge.source, edge.target].includes(indirect.path[i + 1]));
  }
});
test("unmatched queries return no fabricated discoveries", () => {
  assert.equal(
    searchKnowledge(demoItems, "xyzzynonexistent").results.length,
    0,
  );
  assert.equal(searchKnowledge(demoItems, "the and of").results.length, 0);
});
test("isolated direct matches remain searchable", () => {
  const item: KnowledgeItem = {
    ...demoItems[0],
    id: "isolated",
    title: "Volcanology",
    content: "Basalt and lava",
    tags: [],
    segments: segmentText("Basalt and lava"),
  };
  const result = searchKnowledge([...demoItems, item], "basalt");
  assert.equal(result.results[0].itemId, "isolated");
  assert.equal(result.results[0].discovery, "direct");
});
test("traversal terminates within limits and does not put cycles in paths", () => {
  const dense = Array.from({ length: 120 }, (_, i) => ({
    ...demoItems[0],
    id: `node-${i}`,
  }));
  const result = searchKnowledge(dense, "attention");
  assert.ok(result.expanded <= 40);
  assert.ok(result.scored <= 200);
  for (const row of result.results) {
    assert.ok(row.path.length <= 3);
    assert.equal(new Set(row.path).size, row.path.length);
  }
});
test("graph weights remain bounded and explicit links retain evidence", () => {
  const edges = buildGraph(demoItems);
  assert.ok(edges.some((e) => e.explicit));
  assert.ok(edges.every((e) => e.weight >= 0 && e.weight <= 1));
  assert.ok(edges.every((e) => e.basis === "lexical"));
});
test("incompatible embedding models are never compared", () => {
  const items = demoItems
    .slice(0, 2)
    .map((item, i) => ({
      ...item,
      segments: item.segments.map((s) => ({
        ...s,
        embedding: [1, 0],
        embeddingModel: `model-${i}`,
      })),
    }));
  assert.equal(buildGraph(items)[0].basis, "lexical");
  assert.equal(cosine([1, 0], [1]), 0);
});
test("chunking retains long unbroken text and respects chunk size", () => {
  const text = "x".repeat(7300) + " words " + "y".repeat(3100);
  const chunks = segmentText(text);
  assert.equal(
    chunks
      .map((s) => s.text)
      .join("")
      .replace(/\s/g, ""),
    text.replace(/\s/g, ""),
  );
  assert.ok(chunks.every((s) => s.text.length <= 2500));
});
test("semantic retrieval can find a passage without keyword overlap", () => {
  const item = {
    ...demoItems[0],
    segments: demoItems[0].segments.map((s) => ({
      ...s,
      embedding: [1, 0],
      embeddingModel: "test-model",
    })),
  };
  const result = searchKnowledge([item], "unrelatedword", {
    vector: [1, 0],
    model: "test-model",
  });
  assert.equal(result.results[0].itemId, item.id);
  assert.equal(result.mode, "semantic + keyword + graph");
});
