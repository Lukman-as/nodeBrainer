"use client";
import dynamic from "next/dynamic";
import type { Edge, KnowledgeItem } from "@/lib/knowledge";
export type GraphProps = {
  items: KnowledgeItem[];
  edges: Edge[];
  selectedId: string;
  onSelect: (id: string) => void;
  highlighted?: string[];
  large?: boolean;
};
const GraphScene = dynamic(
  () => import("./graph-scene").then((m) => m.GraphScene),
  {
    ssr: false,
    loading: () => (
      <div className="neural-loading">Opening your knowledge brain…</div>
    ),
  },
);
export function KnowledgeGraph(props: GraphProps) {
  return <GraphScene {...props} />;
}
