import { type AnswerSource } from "./answers";
import { clusterGraph } from "./clusters";
import {
  buildGraph,
  type KnowledgeItem,
  type SearchResponse,
} from "./knowledge";

export type AnswerContext = {
  matchedItemIds: string[];
  clusters: {
    id: number;
    label: string;
    itemIds: string[];
    sourceIds: string[];
  }[];
  sources: AnswerSource[];
};

/** Use the same full-library communities as the map, with bounded passage context. */
export function buildAnswerContext(
  items: KnowledgeItem[],
  retrieval: SearchResponse,
): AnswerContext {
  const ready = items.filter((item) => item.status === "ready");
  const byId = new Map(ready.map((item) => [item.id, item]));
  const edges = buildGraph(items);
  const communities = clusterGraph(
    items.map((item) => item.id),
    edges,
  );
  const matchedItemIds = [
    ...new Set(
      retrieval.results
        .filter((result) => byId.has(result.itemId))
        .map((result) => result.itemId),
    ),
  ].slice(0, 6);
  const clusterIds = [
    ...new Set(matchedItemIds.map((id) => communities.get(id)!)),
  ].slice(0, 3);
  const sources: AnswerSource[] = [];
  const seen = new Set<string>();
  let remaining = 24000;
  const add = (item: KnowledgeItem, segmentId?: string) => {
    if (sources.length >= 18 || remaining <= 0) return;
    const segment =
      item.segments.find((segment) => segment.id === segmentId) ||
      item.segments[0];
    const text = (segment?.text || item.content)
      .trim()
      .slice(0, Math.min(3500, remaining));
    const key = `${item.id}:${segment?.id || "content"}`;
    if (!text || seen.has(key)) return;
    seen.add(key);
    remaining -= text.length;
    sources.push({
      id: `S${sources.length + 1}`,
      itemId: item.id,
      segmentId: segment?.id || "content",
      title: item.title,
      type: item.type,
      text,
      kind: segment?.kind || "text",
      locator: segment?.locator || {},
    });
  };
  // Direct evidence has priority over neighboring context, even for large clusters.
  for (const result of retrieval.results.filter((result) =>
    matchedItemIds.includes(result.itemId),
  )) {
    const item = byId.get(result.itemId)!;
    add(item, result.segmentId);
  }
  const clusters = clusterIds.map((id) => {
    const members = ready.filter((item) => communities.get(item.id) === id);
    const tags = new Map<string, number>();
    for (const item of members)
      for (const tag of item.tags) tags.set(tag, (tags.get(tag) || 0) + 1);
    return {
      id,
      label:
        [...tags].sort((a, b) => b[1] - a[1])[0]?.[0] ||
        members[0]?.title ||
        "Related sources",
      itemIds: members.map((item) => item.id),
      sourceIds: [] as string[],
    };
  });
  const affinity = new Map<string, number>();
  for (const edge of edges) {
    if (matchedItemIds.includes(edge.source))
      affinity.set(edge.target, (affinity.get(edge.target) || 0) + edge.weight);
    if (matchedItemIds.includes(edge.target))
      affinity.set(edge.source, (affinity.get(edge.source) || 0) + edge.weight);
  }
  const queues = clusters.map((cluster) =>
    cluster.itemIds
      .filter((id) => !matchedItemIds.includes(id))
      .sort(
        (a, b) =>
          (affinity.get(b) || 0) - (affinity.get(a) || 0) || a.localeCompare(b),
      ),
  );
  // Round-robin prevents one large cluster consuming all context.
  for (
    let index = 0;
    queues.some((queue) => index < queue.length) &&
    sources.length < 18 &&
    remaining > 0;
    index++
  ) {
    for (const queue of queues) if (queue[index]) add(byId.get(queue[index])!);
  }
  for (const cluster of clusters)
    cluster.sourceIds = sources
      .filter((source) => cluster.itemIds.includes(source.itemId))
      .map((source) => source.id);
  return { matchedItemIds, clusters, sources };
}
