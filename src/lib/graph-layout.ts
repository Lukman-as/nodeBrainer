import type { Edge, KnowledgeItem } from "./knowledge";
import { clusterGraph } from "./clusters";
export type GraphPosition = {
  id: string;
  x: number;
  y: number;
  z: number;
  cluster: number;
};
/** Point i of n spread evenly over a unit sphere (Fibonacci lattice). */
function spherePoint(i: number, n: number) {
  if (n <= 1) return { x: 0, y: 0, z: 0 };
  const y = 1 - (2 * (i + 0.5)) / n,
    phi = i * Math.PI * (3 - Math.sqrt(5)),
    r = Math.sqrt(1 - y * y);
  return { x: r * Math.cos(phi), y, z: r * Math.sin(phi) };
}
export function edgeAppearance(weight: number) {
  const strength = Math.max(
    0,
    Math.min(1, Number.isFinite(weight) ? weight : 0),
  );
  return {
    radius: 0.09 + strength * 0.75,
    opacity: 0.16 + strength * 0.7,
    dashed: strength < 0.2,
    label: strength >= 0.5 ? "Strong" : strength >= 0.2 ? "Medium" : "Weak",
    color:
      strength >= 0.5 ? "#7ee787" : strength >= 0.2 ? "#a78bfa" : "#5d5680",
  };
}
/**
 * Stable, bounded spring layout. Every point is a real library item. Each cluster gets its own
 * region of the sphere and its members start clumped there, so related notes read as a group.
 */
export function layoutGraph(
  items: KnowledgeItem[],
  edges: Edge[],
): GraphPosition[] {
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  const clusters = clusterGraph(
    sorted.map((i) => i.id),
    edges,
  );
  const members = new Map<number, string[]>();
  for (const item of sorted) {
    const c = clusters.get(item.id)!;
    if (!members.has(c)) members.set(c, []);
    members.get(c)!.push(item.id);
  }
  const nodes = sorted.map((item) => {
    const c = clusters.get(item.id)!,
      group = members.get(c)!,
      center = spherePoint(c, members.size),
      spread = members.size > 1 ? 5 + 3 * Math.sqrt(group.length) : 58,
      offset = spherePoint(group.indexOf(item.id), group.length);
    return {
      id: item.id,
      x: 58 * center.x + spread * offset.x,
      y: 45 * center.y + spread * offset.y * 0.8,
      z: 42 * center.z + spread * offset.z,
      cluster: c,
    };
  });
  const anchors = nodes.map((n) => ({ ...n })),
    byId = new Map(nodes.map((n, i) => [n.id, i]));
  for (let step = 0; step < 80; step++) {
    const forces = nodes.map(() => ({ x: 0, y: 0, z: 0 }));
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x,
          dy = nodes[i].y - nodes[j].y,
          dz = nodes[i].z - nodes[j].z,
          dist = Math.hypot(dx, dy, dz) || 1,
          push = Math.min(1.2, 35 / (dist * dist));
        for (const [key, value] of [
          ["x", dx],
          ["y", dy],
          ["z", dz],
        ] as const) {
          forces[i][key] += (value / dist) * push;
          forces[j][key] -= (value / dist) * push;
        }
      }
    for (const edge of edges) {
      const ai = byId.get(edge.source),
        bi = byId.get(edge.target);
      if (ai === undefined || bi === undefined) continue;
      const a = nodes[ai],
        b = nodes[bi],
        dist = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) || 1,
        same = a.cluster === b.cluster,
        // Short springs inside a cluster keep it tight; slack, weak ones between clusters keep
        // bridge notes visible without dragging whole groups into each other.
        rest = same ? 8 + 12 * (1 - edge.weight) : 45,
        pull = (dist - rest) * 0.012 * edge.weight * (same ? 1 : 0.3);
      for (const axis of ["x", "y", "z"] as const) {
        const delta = ((b[axis] - a[axis]) / dist) * pull;
        forces[ai][axis] += delta;
        forces[bi][axis] -= delta;
      }
    }
    nodes.forEach((node, i) => {
      for (const axis of ["x", "y", "z"] as const)
        node[axis] += Math.max(
          -2,
          Math.min(
            2,
            forces[i][axis] + (anchors[i][axis] - node[axis]) * 0.008,
          ),
        );
    });
  }
  return nodes;
}
