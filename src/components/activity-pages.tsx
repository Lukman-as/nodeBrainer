"use client";
import {
  ArrowUpRight,
  Clock,
  History,
  Pencil,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import type { Edge, KnowledgeItem } from "@/lib/knowledge";
import { icons, typeLabels, type SearchHistoryEntry } from "./item-meta";

function dayLabel(iso: string) {
  const date = new Date(iso),
    today = new Date();
  const days = Math.round(
    (new Date(today.toDateString()).getTime() -
      new Date(date.toDateString()).getTime()) /
      86_400_000,
  );
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
function groupByDay<T extends { at: string }>(rows: T[]) {
  const groups: { day: string; rows: T[] }[] = [];
  for (const row of rows) {
    const day = dayLabel(row.at);
    if (groups.at(-1)?.day === day) groups.at(-1)!.rows.push(row);
    else groups.push({ day, rows: [row] });
  }
  return groups;
}

type ActivityEvent =
  | { key: string; at: string; kind: "added" | "edited"; item: KnowledgeItem }
  | { key: string; at: string; kind: "searched"; entry: SearchHistoryEntry };

/** Built from real item timestamps and this browser's search history. */
export function RecentActivity({
  items,
  edges,
  history,
  onOpen,
  onSearch,
}: {
  items: KnowledgeItem[];
  edges: Edge[];
  history: SearchHistoryEntry[];
  onOpen: (id: string) => void;
  onSearch: (query: string) => void;
}) {
  const events: ActivityEvent[] = [
    ...items.flatMap((item): ActivityEvent[] =>
      item.updatedAt !== item.createdAt
        ? [
            { key: `e-${item.id}`, at: item.updatedAt, kind: "edited", item },
            { key: `a-${item.id}`, at: item.createdAt, kind: "added", item },
          ]
        : [{ key: `a-${item.id}`, at: item.createdAt, kind: "added", item }],
    ),
    ...history.map((entry): ActivityEvent => ({
      key: `s-${entry.id}`,
      at: entry.at,
      kind: "searched",
      entry,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 60);
  // Fixed when the page opens, so the count is stable across re-renders.
  const [weekAgo] = useState(() => Date.now() - 7 * 86_400_000);
  const addedThisWeek = items.filter(
    (i) => new Date(i.createdAt).getTime() >= weekAgo,
  ).length;

  return (
    <section className="activity-page">
      <div className="activity-stats">
        <div>
          <strong>{addedThisWeek}</strong>
          <span>memories added this week</span>
        </div>
        <div>
          <strong>{history.length}</strong>
          <span>searches in this browser</span>
        </div>
        <div>
          <strong>{edges.length}</strong>
          <span>connections on your map</span>
        </div>
      </div>
      {events.length ? (
        groupByDay(events).map((group) => (
          <div className="timeline-group" key={group.day}>
            <h2 className="timeline-day">{group.day}</h2>
            <ol className="timeline">
              {group.rows.map((event) => {
                if (event.kind === "searched") {
                  const top = items.find((i) => i.id === event.entry.topItemId);
                  return (
                    <li key={event.key}>
                      <span className="timeline-icon content-icon search">
                        <Search size={14} />
                      </span>
                      <button
                        className="timeline-body"
                        onClick={() => onSearch(event.entry.query)}
                      >
                        <small>Searched your memory</small>
                        <strong>“{event.entry.query}”</strong>
                        <span>
                          {event.entry.resultCount} result
                          {event.entry.resultCount === 1 ? "" : "s"}
                          {top ? ` · top: ${top.title}` : ""}
                        </span>
                      </button>
                      <time dateTime={event.at}>{timeLabel(event.at)}</time>
                    </li>
                  );
                }
                const Icon = icons[event.item.type];
                return (
                  <li key={event.key}>
                    <span className={`timeline-icon content-icon ${event.item.type}`}>
                      {event.kind === "edited" ? (
                        <Pencil size={13} />
                      ) : (
                        <Icon size={14} />
                      )}
                    </span>
                    <button
                      className="timeline-body"
                      onClick={() => onOpen(event.item.id)}
                    >
                      <small>
                        {event.kind === "edited" ? "Edited" : "Added"}{" "}
                        {typeLabels[event.item.type].toLowerCase()}
                        {event.item.sample ? " · sample" : ""}
                      </small>
                      <strong>{event.item.title}</strong>
                      {event.item.tags.length > 0 && (
                        <span>
                          {event.item.tags
                            .slice(0, 3)
                            .map((t) => `#${t}`)
                            .join(" ")}
                        </span>
                      )}
                    </button>
                    <time dateTime={event.at}>{timeLabel(event.at)}</time>
                  </li>
                );
              })}
            </ol>
          </div>
        ))
      ) : (
        <div className="empty-state">
          <Clock size={26} />
          <h3>Nothing here yet.</h3>
          <p>
            Memories you add and searches you run will appear here, newest
            first.
          </p>
        </div>
      )}
    </section>
  );
}

/** Searches recorded in this browser. Suggestions are labeled as such. */
export function SearchHistory({
  items,
  history,
  suggestions,
  onSearch,
  onRemove,
  onClear,
}: {
  items: KnowledgeItem[];
  history: SearchHistoryEntry[];
  suggestions: string[];
  onSearch: (query: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <section className="activity-page">
      <div className="history-toolbar">
        <p>
          <History size={14} />
          Saved only in this browser. It is not uploaded to your account.
        </p>
        {history.length > 0 && (
          <button className="text-action" onClick={onClear}>
            Clear history
          </button>
        )}
      </div>
      {history.length ? (
        groupByDay(history).map((group) => (
          <div className="timeline-group" key={group.day}>
            <h2 className="timeline-day">{group.day}</h2>
            <ul className="history-list">
              {group.rows.map((entry) => {
                const top = items.find((i) => i.id === entry.topItemId);
                return (
                  <li key={entry.id}>
                    <button
                      className="history-query"
                      onClick={() => onSearch(entry.query)}
                    >
                      <Search size={15} />
                      <span>
                        <strong>{entry.query}</strong>
                        <small>
                          {timeLabel(entry.at)} · {entry.resultCount} result
                          {entry.resultCount === 1 ? "" : "s"}
                          {top ? ` · top: ${top.title}` : ""}
                        </small>
                      </span>
                      <span className="history-again">
                        <RotateCcw size={12} /> Search again
                      </span>
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Remove “${entry.query}” from history`}
                      onClick={() => onRemove(entry.id)}
                    >
                      <X size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      ) : (
        <div className="empty-state history-empty">
          <History size={26} />
          <h3>No searches yet.</h3>
          <p>
            Ask the Memory Map something. Your searches will be kept here so you
            can return to them.
          </p>
          {suggestions.length > 0 && (
            <div className="history-suggestions">
              <span>Suggestions to try, not past searches</span>
              {suggestions.map((query) => (
                <button key={query} onClick={() => onSearch(query)}>
                  {query} <ArrowUpRight size={12} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
