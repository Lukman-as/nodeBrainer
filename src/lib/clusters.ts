import type { Edge } from "./knowledge";

/**
 * Groups items into communities, Obsidian-style: Louvain's local-moving phase greedily moves each
 * node to the neighbouring community that most increases weighted modularity, until nothing moves.
 * Returns id -> cluster index, numbered largest cluster first; unconnected items get their own index.
 * ponytail: single Louvain level (no community aggregation); add the aggregation pass if libraries
 * grow past a few thousand items and clusters start fragmenting.
 */
export function clusterGraph(ids: string[], edges: Edge[]): Map<string, number> {
  const order = [...ids].sort(); // deterministic regardless of input order
  const adjacency = new Map(order.map((id) => [id, new Map<string, number>()]));
  const degree = new Map(order.map((id) => [id, 0]));
  let twiceTotal = 0;
  for (const { source, target, weight } of edges) {
    if (!adjacency.has(source) || !adjacency.has(target) || source === target)
      continue;
    adjacency.get(source)!.set(target, weight);
    adjacency.get(target)!.set(source, weight);
    degree.set(source, degree.get(source)! + weight);
    degree.set(target, degree.get(target)! + weight);
    twiceTotal += 2 * weight;
  }
  const community = new Map(order.map((id, i) => [id, i]));
  const communityDegree = order.map((id) => degree.get(id)!);
  for (let pass = 0, moved = true; moved && twiceTotal && pass < 50; pass++) {
    moved = false;
    for (const id of order) {
      const own = community.get(id)!,
        k = degree.get(id)!;
      if (!k) continue;
      const links = new Map<number, number>();
      for (const [neighbor, w] of adjacency.get(id)!) {
        const c = community.get(neighbor)!;
        links.set(c, (links.get(c) ?? 0) + w);
      }
      communityDegree[own] -= k;
      // Modularity gain of joining c is proportional to links(c) - degree(c) * k / 2m.
      let best = own,
        bestGain = (links.get(own) ?? 0) - (communityDegree[own] * k) / twiceTotal;
      for (const [c, w] of links) {
        const gain = w - (communityDegree[c] * k) / twiceTotal;
        if (gain > bestGain + 1e-12 || (gain > bestGain - 1e-12 && c < best)) {
          best = c;
          bestGain = gain;
        }
      }
      communityDegree[best] += k;
      if (best !== own) {
        community.set(id, best);
        moved = true;
      }
    }
  }
  const sizes = new Map<number, number>();
  for (const c of community.values()) sizes.set(c, (sizes.get(c) ?? 0) + 1);
  const rank = new Map(
    [...sizes.keys()]
      .sort((a, b) => sizes.get(b)! - sizes.get(a)! || a - b)
      .map((c, i) => [c, i]),
  );
  return new Map(order.map((id) => [id, rank.get(community.get(id)!)!]));
}
