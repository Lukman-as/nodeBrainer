"use client";
import type { ReactNode } from "react";
import { ArrowUpRight, Network, Search, Sparkles, X } from "lucide-react";
import type {
  Edge,
  KnowledgeItem,
  SearchResponse,
  SearchResult,
} from "@/lib/knowledge";
import { edgeAppearance } from "@/lib/graph-layout";
import { icons, typeLabels } from "./item-meta";

type Props = {
  /** Shown only while a Memory Map search is running or has results. */
  open: boolean;
  /** Clears the search, which hides the panel again. */
  onClose: () => void;
  items: KnowledgeItem[];
  edges: Edge[];
  selectedId: string;
  results: SearchResponse | null;
  searchedQuery: string;
  searching: boolean;
  tab: "search" | "selected";
  onTab: (tab: "search" | "selected") => void;
  /** Focus a memory on the map (and highlight its discovery path, if any). */
  onPick: (id: string, result?: SearchResult) => void;
  /** Open the full source view for a memory. */
  onOpen: (id: string) => void;
  explanation?: ReactNode;
  footer: ReactNode;
};

/**
 * Right-hand panel of the Memory Map. Everything shown here is derived from
 * data the page already has: search results from the existing search call,
 * or the selected memory's graph neighbors.
 */
export function RelatedMemories({
  open,
  onClose,
  items,
  edges,
  selectedId,
  results,
  searchedQuery,
  searching,
  tab,
  onTab,
  onPick,
  onOpen,
  explanation,
  footer,
}: Props) {
  const selected = items.find((i) => i.id === selectedId);
  const showSearch = tab === "search" && Boolean(results);
  const neighbors = edges
    .filter((e) => e.source === selectedId || e.target === selectedId)
    .slice(0, 12);
  const SelectedIcon = selected ? icons[selected.type] : Network;

  // An empty grid slot keeps the column so the map can widen and narrow smoothly.
  if (!open) return <div className="related-slot" aria-hidden="true" />;
  return (
    <aside className="connections-panel related-memories">
      <div className="connections-title">
        <Sparkles size={16} />
        <h2>Related Memories</h2>
        <button
          className="icon-button related-close"
          aria-label="Clear search and close Related Memories"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </div>
      <p className="panel-subtitle">
        {showSearch
          ? "What your search found, strongest first."
          : "Memories linked to the one you’ve selected."}
      </p>
      {results && (
        <div className="related-tabs" role="tablist" aria-label="Related to">
          <button
            role="tab"
            aria-selected={tab === "search"}
            className={tab === "search" ? "selected" : ""}
            onClick={() => onTab("search")}
          >
            Your search
          </button>
          <button
            role="tab"
            aria-selected={tab === "selected"}
            className={tab === "selected" ? "selected" : ""}
            onClick={() => onTab("selected")}
          >
            Selected memory
          </button>
        </div>
      )}
      {searching ? (
        <p className="panel-subtitle">Searching your memory…</p>
      ) : showSearch && results ? (
        <>
          <div className="related-heading">
            <h3>Related to “{searchedQuery}”</h3>
            <span>{results.results.length}</span>
          </div>
          {results.results.slice(0, 12).map((result) => {
            const item = items.find((i) => i.id === result.itemId);
            if (!item) return null;
            const Icon = icons[item.type];
            return (
              <button
                className={`related-item ${item.id === selectedId ? "current" : ""}`}
                key={item.id}
                onClick={() => onPick(item.id, result)}
              >
                <span className={`content-icon ${item.type}`}>
                  <Icon size={15} />
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {typeLabels[item.type]} ·{" "}
                    {result.discovery === "graph"
                      ? "Connected discovery"
                      : "Direct match"}
                  </small>
                </span>
                <span className="edge-score" title="Relevance score">
                  {result.score.toFixed(2)}
                </span>
              </button>
            );
          })}
          {results.results.length ? (
            <p className="related-note">
              Relevance is a ranking signal, not a probability.
            </p>
          ) : (
            <div className="insight-note related-empty">
              <Search size={17} />
              <h3>No related memories yet.</h3>
              <p>
                Nothing in your memory matched “{searchedQuery}”. Try different
                words, or add the memory you’re thinking of.
              </p>
            </div>
          )}
        </>
      ) : selected ? (
        <>
          <div className="related-focus">
            <span className={`content-icon ${selected.type}`}>
              <SelectedIcon size={16} />
            </span>
            <span>
              <small>{typeLabels[selected.type]} · selected</small>
              <strong>{selected.title}</strong>
            </span>
            <button
              className="text-action"
              onClick={() => onOpen(selected.id)}
              aria-label={`Open ${selected.title}`}
            >
              Open <ArrowUpRight size={12} />
            </button>
          </div>
          <div className="related-heading">
            <h3>Connected to this memory</h3>
            <span>{neighbors.length}</span>
          </div>
          {neighbors.map((edge) => {
            const id = edge.source === selectedId ? edge.target : edge.source,
              item = items.find((i) => i.id === id);
            if (!item) return null;
            const Icon = icons[item.type];
            return (
              <button
                className="related-item"
                key={id}
                onClick={() => onPick(id)}
              >
                <span className={`content-icon ${item.type}`}>
                  <Icon size={15} />
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {typeLabels[item.type]} ·{" "}
                    {edge.explicit
                      ? "Explicit link"
                      : edge.basis === "semantic"
                        ? "Semantic connection"
                        : "Text / tag connection"}
                  </small>
                </span>
                <span className="edge-score" title="Connection strength">
                  {edgeAppearance(edge.weight).label}
                  <br />
                  {edge.weight.toFixed(2)}
                </span>
              </button>
            );
          })}
          {!neighbors.length && (
            <p className="panel-subtitle">
              No connections yet. Add shared topics or [[links]] to connect this
              memory with others.
            </p>
          )}
        </>
      ) : (
        <div className="insight-note">
          <Search size={17} />
          <h3>Nothing selected.</h3>
          <p>
            Select a memory on the map, or search for what you’re trying to
            remember.
          </p>
        </div>
      )}
      {explanation}
      {footer}
    </aside>
  );
}
