"use client";
import { ArrowUpRight, Sparkles, Quote } from "lucide-react";
import { KnowledgeAnswer, AnswerSource } from "@/lib/answers";
import { locationLabel } from "@/lib/knowledge";

export function AnswerPanel({
  answer,
  query,
  onSource,
}: {
  answer: KnowledgeAnswer;
  query: string;
  onSource: (source: AnswerSource) => void;
}) {
  return (
    <section
      className="answer-panel"
      aria-label="Answer to your question"
      aria-live="polite"
    >
      <div className="answer-heading">
        <span className="answer-spark">
          <Sparkles size={20} />
        </span>
        <div>
          <span className="eyebrow">
            {answer.mode === "gemini"
              ? "ANSWER FROM YOUR KNOWLEDGE"
              : answer.mode === "extractive"
                ? "LOCAL EXCERPT PREVIEW"
                : "MORE CONTEXT NEEDED"}
          </span>
          <h2>{query}</h2>
        </div>
      </div>
      <div className="answer-prose">
        {answer.paragraphs.map((paragraph, i) => (
          <p key={i}>
            {paragraph.text}
            {paragraph.citations.map((id) => {
              const source = answer.sources.find((s) => s.id === id);
              return source ? (
                <button
                  key={id}
                  className="inline-citation"
                  aria-label={`Open source ${id}: ${source.title}`}
                  onClick={() => onSource(source)}
                >
                  {id.slice(1)}
                </button>
              ) : null;
            })}
          </p>
        ))}
      </div>
      {answer.mode === "extractive" && (
        <p className="answer-note">
          These are matching source excerpts combined into one preview, not a
          generated answer. Connect Gemini in your private workspace for a
          synthesized response.
        </p>
      )}
      {answer.mode === "gemini" && (
        <p className="answer-note">
          Generated from your retrieved passages. Check citations for important
          details.
        </p>
      )}
      {answer.sources.length > 0 && (
        <details className="answer-sources">
          <summary>
            <Quote size={14} />
            Sources behind this answer <span>{answer.sources.length}</span>
          </summary>
          {answer.sources.map((source) => (
            <button
              className="answer-source"
              key={source.id}
              onClick={() => onSource(source)}
            >
              <span className="source-number">{source.id.slice(1)}</span>
              <span>
                <strong>{source.title}</strong>
                <small>
                  {source.type.toUpperCase()} ·{" "}
                  {locationLabel({
                    id: source.segmentId,
                    text: source.text,
                    kind: source.kind,
                    locator: source.locator,
                  })}
                  {source.kind === "description" ? " · AI description" : ""}
                </small>
              </span>
              <ArrowUpRight size={14} />
            </button>
          ))}
        </details>
      )}
    </section>
  );
}
