import test from "node:test";
import assert from "node:assert/strict";
import { demoItems } from "../src/lib/demo-data";
import { buildGraph, searchKnowledge } from "../src/lib/knowledge";
import {
  answerSources,
  extractiveAnswer,
  validateAnswerDraft,
} from "../src/lib/answers";
import { edgeAppearance, layoutGraph } from "../src/lib/graph-layout";
import { clusterGraph } from "../src/lib/clusters";
import { mockItems } from "../src/lib/mock-data";

const sources = answerSources(
  demoItems,
  searchKnowledge(demoItems, "what is a transformer architecture"),
);
test("keyless answer is a single labeled excerpt with real source references", () => {
  const answer = extractiveAnswer(
    "what is a transformer architecture",
    sources,
  );
  assert.equal(answer.mode, "extractive");
  assert.equal(answer.paragraphs.length, 1);
  assert.ok(answer.paragraphs[0].text.includes("Self-attention gives a model"));
  assert.ok(!answer.paragraphs[0].text.includes("[["));
  assert.ok(
    answer.paragraphs[0].citations.every((id) =>
      answer.sources.some((s) => s.id === id),
    ),
  );
});
test("no retrieved evidence gives an insufficient-context response", () => {
  const answer = extractiveAnswer("unknown", []);
  assert.equal(answer.mode, "empty");
  assert.equal(answer.insufficientContext, true);
  assert.equal(answer.sources.length, 0);
});
test("generated responses cannot invent source IDs or omit citations", () => {
  assert.throws(() =>
    validateAnswerDraft(
      {
        paragraphs: [{ text: "Claim", citations: ["S999"] }],
        insufficientContext: false,
      },
      sources,
    ),
  );
  assert.throws(() =>
    validateAnswerDraft(
      {
        paragraphs: [{ text: "Claim", citations: [] }],
        insufficientContext: false,
      },
      sources,
    ),
  );
  const accepted = validateAnswerDraft(
    {
      paragraphs: [{ text: "Supported answer", citations: [sources[0].id] }],
      insufficientContext: false,
    },
    sources,
  );
  assert.equal(accepted.sources.length, 1);
  assert.equal(accepted.sources[0].id, sources[0].id);
});
test("source context selection is bounded and never adds absent items", () => {
  const retrieval = searchKnowledge(demoItems, "attention");
  const selected = answerSources(
    demoItems.filter((i) => i.type === "note"),
    retrieval,
  );
  assert.ok(selected.length <= 6);
  assert.ok(selected.every((s) => s.type === "note" && s.text.length <= 3500));
});
test("3D layout is stable, finite, and includes isolated items", () => {
  const edges = buildGraph(demoItems),
    nodes = layoutGraph(demoItems, edges);
  assert.deepEqual(nodes, layoutGraph([...demoItems].reverse(), edges));
  assert.equal(nodes.length, demoItems.length);
  assert.ok(nodes.every((n) => [n.x, n.y, n.z].every(Number.isFinite)));
  assert.ok(new Set(nodes.map((n) => n.z)).size > 1);
  assert.deepEqual(layoutGraph([], []), []);
});
test("edge strength changes thickness, visibility and weak-link dash style", () => {
  const weak = edgeAppearance(0.1),
    strong = edgeAppearance(0.8);
  assert.ok(strong.radius > weak.radius);
  assert.ok(strong.opacity > weak.opacity);
  assert.equal(weak.dashed, true);
  assert.equal(strong.dashed, false);
  assert.deepEqual(edgeAppearance(-1), edgeAppearance(0));
  assert.deepEqual(edgeAppearance(9), edgeAppearance(1));
});
test("clustering groups mock topics together and places each cluster in its own region", () => {
  const edges = buildGraph(mockItems),
    clusters = clusterGraph(mockItems.map((i) => i.id), edges);
  // Each cluster's members should overwhelmingly share one topic (tags are the ground truth).
  const byCluster = new Map<number, Map<string, number>>();
  for (const item of mockItems) {
    const c = clusters.get(item.id)!,
      topics = byCluster.get(c) ?? new Map<string, number>();
    topics.set(item.tags[0], (topics.get(item.tags[0]) ?? 0) + 1);
    byCluster.set(c, topics);
  }
  const pure = [...byCluster.values()].reduce((s, t) => s + Math.max(...t.values()), 0);
  assert.ok(pure / mockItems.length >= 0.95);
  assert.ok(byCluster.size >= 8 && byCluster.size <= 20);
  assert.deepEqual(clusters, clusterGraph([...mockItems].reverse().map((i) => i.id), edges));
  // Unconnected items stay alone rather than being forced into a group.
  assert.deepEqual([...clusterGraph(["a", "b"], []).values()].sort(), [0, 1]);
  const nodes = layoutGraph(mockItems, edges);
  const center = (c: number) => {
    const m = nodes.filter((n) => n.cluster === c);
    return ["x", "y", "z"].map((k) => m.reduce((s, n) => s + n[k as "x"], 0) / m.length);
  };
  const spread = (c: number) => {
    const [cx, cy, cz] = center(c);
    const m = nodes.filter((n) => n.cluster === c);
    return m.reduce((s, n) => s + Math.hypot(n.x - cx, n.y - cy, n.z - cz), 0) / m.length;
  };
  const [a, b] = [center(0), center(1)];
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > spread(0) + spread(1));
});
