"use client";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import type { Edge, KnowledgeItem } from "@/lib/knowledge";
import type { AnswerContext } from "@/lib/answer-context";
import type { KnowledgeAnswer } from "@/lib/answers";
export type GraphQuestion = {
  id: number;
  query: string;
  loading: boolean;
  context: AnswerContext | null;
  answer: KnowledgeAnswer | null;
  error: string;
  focusItemId: string;
};
export type GraphProps = {
  items: KnowledgeItem[];
  edges: Edge[];
  selectedId: string;
  onSelect: (id: string) => void;
  highlighted?: string[];
  large?: boolean;
  question?: GraphQuestion;
  /** The Memory Map search bar: centred over the idle brain, docked at the top once in use. */
  searchBar?: ReactNode;
  /** Shown under the search bar on the idle brain only. */
  searchNote?: ReactNode;
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
