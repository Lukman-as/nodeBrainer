"use client";
import {
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Sparkles,
  X,
} from "lucide-react";
import type { GraphQuestion } from "./knowledge-graph";
import type { KnowledgeItem } from "@/lib/knowledge";

export function MapAnswer({
  question,
  item,
  collapsed,
  onCollapse,
  onDismiss,
  onFocus,
  onOpen,
}: {
  question: GraphQuestion;
  item?: KnowledgeItem;
  collapsed: boolean;
  onCollapse: () => void;
  onDismiss?: () => void;
  onFocus: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const passage = question.context?.sources.find(
    (source) => source.itemId === item?.id,
  );
  const description = (passage?.text || item?.content || "")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const context = question.context;
  return (
    <aside
      className={`map-answer ${collapsed ? "is-collapsed" : ""}`}
      aria-label="Answer in your memory map"
    >
      <header>
        <Sparkles size={14} />
        <span>
          {question.answer?.mode === "extractive"
            ? "SOURCE EXCERPT"
            : question.answer?.mode === "gemini"
              ? "GEMINI"
              : "YOUR ANSWER"}
        </span>
        <button
          onClick={onCollapse}
          aria-label={collapsed ? "Expand map answer" : "Minimize map answer"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        <button onClick={onDismiss} aria-label="Dismiss answer">
          <X size={14} />
        </button>
      </header>
      {!collapsed && (
        <div className="map-answer-body">
          <h3>{question.query}</h3>
          <div
            className="map-answer-response"
            aria-live="polite"
            aria-busy={question.loading}
          >
            {question.loading && (
              <p className="map-answer-progress">
                <LoaderCircle size={14} className="spin" />
                {context
                  ? "Thinking about your question…"
                  : "Finding connected memories…"}
              </p>
            )}
            {question.error && (
              <p role="alert" className="map-answer-error">
                {question.error}
              </p>
            )}
            {question.answer && (
              <>
                {question.answer.paragraphs.map((paragraph, index) => (
                  <p key={index}>
                    {paragraph.text}
                    {paragraph.citations.map((id) => {
                      const source = question.answer!.sources.find(
                        (source) => source.id === id,
                      );
                      return source ? (
                        <button
                          className="map-answer-citation"
                          key={id}
                          aria-label={`Show source ${id}: ${source.title}`}
                          title={source.title}
                          onClick={() => onFocus(source.itemId)}
                        >
                          {id.slice(1)}
                        </button>
                      ) : null;
                    })}
                  </p>
                ))}
              </>
            )}
          </div>
          {item && context && (
            <div className="map-answer-node">
              <small>BEST MATCH</small>
              <button onClick={() => onOpen(item.id)}>{item.title} ↗</button>
              <p>
                {description
                  ? `${description.slice(0, 180)}${description.length > 180 ? "…" : ""}`
                  : "No description available."}
              </p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
