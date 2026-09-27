// Groups the 100 mock notes into clusters and prints them. Run: npm run clusters
import { buildGraph } from "../src/lib/knowledge";
import { clusterGraph } from "../src/lib/clusters";
import { mockItems } from "../src/lib/mock-data";

const edges = buildGraph(mockItems);
const clusters = clusterGraph(
  mockItems.map((i) => i.id),
  edges,
);
const groups = new Map<number, typeof mockItems>();
for (const item of mockItems) {
  const c = clusters.get(item.id)!;
  groups.set(c, [...(groups.get(c) ?? []), item]);
}
let correct = 0;
for (const [c, members] of [...groups].sort((a, b) => a[0] - b[0])) {
  // Mock notes carry their topic as tags, so the most common topic is the cluster's true label.
  const topics = new Map<string, number>();
  for (const m of members) {
    const topic = m.tags.join(" / ");
    topics.set(topic, (topics.get(topic) ?? 0) + 1);
  }
  const [label, hits] = [...topics].sort((a, b) => b[1] - a[1])[0];
  correct += hits;
  console.log(`\nCluster ${c + 1} · ${members.length} notes · mostly "${label}" (${hits}/${members.length})`);
  for (const m of members) console.log(`  - ${m.title}${m.tags.join(" / ") === label ? "" : `  [${m.tags.join(" / ")}]`}`);
}
console.log(
  `\n${groups.size} clusters from ${mockItems.length} notes and ${edges.length} edges · purity ${Math.round((100 * correct) / mockItems.length)}%`,
);
