import type { Edge, KnowledgeItem } from "./knowledge";
export type GraphPosition = { id: string; x: number; y: number; z: number };
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
      strength >= 0.5 ? "#b7f4bd" : strength >= 0.2 ? "#76afa3" : "#536b78",
  };
}
/** Stable, bounded spring layout. Every point is a real library item. */
export function layoutGraph(
  items: KnowledgeItem[],
  edges: Edge[],
): GraphPosition[] {
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  const nodes = sorted.map((item, i) => {
    const y = 1 - (2 * (i + 0.5)) / Math.max(sorted.length, 1),
      phi = i * Math.PI * (3 - Math.sqrt(5)),
      r = Math.sqrt(1 - y * y);
    return {
      id: item.id,
      x: 58 * r * Math.cos(phi),
      y: y * 45,
      z: 42 * r * Math.sin(phi),
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
        pull = (dist - (25 + 30 * (1 - edge.weight))) * 0.012 * edge.weight;
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
