"use client";
/* eslint-disable @next/next/no-img-element -- Private image endpoints need browser session cookies. */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  FolderOpen,
  History,
  Link2,
  LoaderCircle,
  LogIn,
  Network,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
  UserRound,
} from "lucide-react";
import { z } from "zod";
import {
  KnowledgeItem,
  ItemType,
  SearchResponse,
  SearchResult,
  Edge,
  buildGraph,
  locationLabel,
  segmentText,
} from "@/lib/knowledge";
import { demoItems } from "@/lib/demo-data";
import { mockItems } from "@/lib/mock-data";
import { edgeAppearance } from "@/lib/graph-layout";
import { KnowledgeGraph } from "./knowledge-graph";
import { AnswerPanel } from "./answer-panel";
import { KnowledgeAnswer } from "@/lib/answers";
import { type AnswerContext } from "@/lib/answer-context";
import { readAnswerStream } from "@/lib/answer-stream";
import { previewLibrarySchema, noteInput } from "@/lib/validation";
import { icons, typeLabels, type SearchHistoryEntry } from "./item-meta";
import { NodeBrainerIcon } from "./brand-icon";
import { RecentActivity, SearchHistory } from "./activity-pages";

type View = "memory" | "activity" | "history" | "library";
const viewTitles: Record<View, string> = {
  memory: "Memory Map",
  activity: "Recent Activity",
  history: "Search History",
  library: "My Library",
};
const historySchema = z
  .array(
    z.object({
      id: z.string(),
      query: z.string().max(500),
      at: z.string(),
      resultCount: z.number(),
      topItemId: z.string().optional(),
      mode: z.string(),
    }),
  )
  .max(50);
const cacheSchema = previewLibrarySchema;
type Props = {
  live?: boolean;
  name?: string;
  authConfigured: boolean;
  geminiConfigured?: boolean;
  semanticEnabled?: boolean;
  mock?: boolean;
};
async function requestJson(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
function download(name: string, text: string, mime = "text/markdown") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function KnowledgeWorkspace({
  live = false,
  name,
  authConfigured,
  geminiConfigured = false,
  semanticEnabled = false,
  mock = false,
}: Props) {
  const [items, setItems] = useState<KnowledgeItem[]>(
    live ? [] : mock ? mockItems : demoItems,
  );
  const [serverEdges, setServerEdges] = useState<Edge[]>([]);
  const [hydrated, setHydrated] = useState(false),
    [loading, setLoading] = useState(live);
  const [type, setType] = useState<ItemType | "all">("all"),
    [tag, setTag] = useState("");
  const [selectedId, setSelectedId] = useState("attention"),
    [detail, setDetail] = useState(false);
  const [view, setView] = useState<View>("memory");
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  // Per-browser convenience; kept apart for the demo and the private workspace.
  const historyKey = `nodebrainer-search-history-${live ? "private" : "demo"}`;
  const [query, setQuery] = useState(""),
    [searchedQuery, setSearchedQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null),
    [searching, setSearching] = useState(false);
  const [questionId, setQuestionId] = useState(0);
  const [answerContext, setAnswerContext] = useState<AnswerContext | null>(
    null,
  );
  const [answerError, setAnswerError] = useState("");
  const [mapFocusId, setMapFocusId] = useState("");
  const [answer, setAnswer] = useState<KnowledgeAnswer | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [modal, setModal] = useState<"note" | "file" | "link" | null>(null);
  const [editing, setEditing] = useState<KnowledgeItem | null>(null),
    [busy, setBusy] = useState(false);
  const [explanation, setExplanation] = useState<SearchResult | null>(null);
  const [deleteId, setDeleteId] = useState("");
  const searchRef = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const searchGeneration = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const stored = localStorage.getItem(historyKey);
        if (stored) setHistory(historySchema.parse(JSON.parse(stored)));
      } catch {
        // Unreadable or unavailable history starts empty.
      }
      if (live) {
        try {
          const data = await requestJson("/api/items");
          if (!cancelled) {
            setItems(data.items);
            setServerEdges(data.edges);
            setSelectedId(data.items[0]?.id || "");
          }
        } catch (e) {
          if (!cancelled) setError((e as Error).message);
        }
      } else if (!mock) {
        // The mock library is never stored, so it cannot overwrite a saved demo.
        try {
          const stored = localStorage.getItem("lattice-demo-v1");
          if (stored && !cancelled) {
            const saved = cacheSchema.parse(JSON.parse(stored));
            setItems(saved);
            setSelectedId(saved[0]?.id || "");
          }
        } catch {
          if (!cancelled)
            setNotice(
              "The saved demo could not be loaded. Showing the sample library.",
            );
        }
      }
      if (!cancelled) {
        setHydrated(true);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
      searchRef.current?.abort();
    };
  }, [live, mock, historyKey]);
  useEffect(() => {
    if (!live && !mock && hydrated) {
      try {
        localStorage.setItem("lattice-demo-v1", JSON.stringify(items));
      } catch {
        // Report an external storage failure; the notice is not an effect dependency.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setNotice(
          "Browser storage is unavailable or full. Export your library before closing this page.",
        );
      }
    }
  }, [items, hydrated, live, mock]);
  useEffect(() => {
    if (modal || deleteId) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal, deleteId]);

  const edges = useMemo(
    () => (live ? serverEdges : buildGraph(items)),
    [items, live, serverEdges],
  );
  const selected = items.find((i) => i.id === selectedId);
  const filtered = useMemo(
    () =>
      items.filter(
        (i) =>
          (type === "all" || i.type === type) && (!tag || i.tags.includes(tag)),
      ),
    [items, type, tag],
  );
  const allTags = [...new Set(items.flatMap((i) => i.tags))].sort();
  const neighbors = edges
    .filter((e) => e.source === selectedId || e.target === selectedId)
    .slice(0, 7);
  // Map emphasis: the explained discovery path, else the current search's top results.
  const mapHighlights = useMemo(
    () =>
      explanation?.path ??
      (results ? results.results.slice(0, 8).map((r) => r.itemId) : undefined),
    [explanation, results],
  );
  // Labeled as suggestions on the Search History page, never shown as past searches.
  const historySuggestions = [
    ...(live
      ? []
      : ["what is a transformer architecture", "conditional probability"]),
    ...allTags.slice(0, 4),
  ].slice(0, 5);
  function resetSearch() {
    searchRef.current?.abort();
    searchGeneration.current++;
    setResults(null);
    setAnswer(null);
    setAnswerContext(null);
    setAnswerError("");
    setMapFocusId("");
    setSearching(false);
    setExplanation(null);
    setSearchedQuery("");
  }
  function selectItem(id: string) {
    setSelectedId(id);
    setExplanation(null);
    setDetail(true);
  }
  async function refresh() {
    if (live) {
      const data = await requestJson("/api/items");
      setItems(data.items);
      setServerEdges(data.edges);
    }
  }
  function saveHistory(next: SearchHistoryEntry[]) {
    setHistory(next);
    try {
      localStorage.setItem(historyKey, JSON.stringify(next));
    } catch {
      // History is a convenience; searching still works without storage.
    }
  }
  async function search(value = query) {
    if (!value.trim()) {
      resetSearch();
      return;
    }
    resetSearch();
    const generation = searchGeneration.current;
    setQuestionId(generation);
    const controller = new AbortController();
    searchRef.current = controller;
    setSearching(true);
    setDetail(false);
    // Questions reveal their evidence and answer together in the Memory Map.
    setView("memory");
    setError("");
    setQuery(value);
    setSearchedQuery(value);
    try {
      const reveal = (retrieval: SearchResponse, context: AnswerContext) => {
        if (searchGeneration.current !== generation) return;
        setResults(retrieval);
        setAnswerContext(context);
        const first = context.matchedItemIds[0] || "";
        setMapFocusId(first);
        if (first) setSelectedId(first);
      };
      const response = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: value,
          type,
          tag: tag || undefined,
          stream: true,
          library: live ? "private" : mock ? "mock" : "demo",
          previewItems: !live && !mock ? items : undefined,
        }),
        signal: controller.signal,
      });
      const data = await readAnswerStream(response, ({ retrieval, context }) =>
        reveal(retrieval, context),
      );
      if (searchGeneration.current === generation) {
        setAnswer(data.answer);
        setSearchedQuery(value);
        saveHistory(
          [
            {
              id: crypto.randomUUID(),
              query: value.trim(),
              at: new Date().toISOString(),
              resultCount: data.results.length,
              topItemId: data.results[0]?.itemId,
              mode: data.mode,
            },
            ...history.filter(
              (h) => h.query.toLowerCase() !== value.trim().toLowerCase(),
            ),
          ].slice(0, 50),
        );
      }
    } catch (e) {
      if (
        (e as Error).name !== "AbortError" &&
        searchGeneration.current === generation
      ) {
        setAnswerError((e as Error).message);
      }
    } finally {
      if (searchGeneration.current === generation) setSearching(false);
    }
  }
  function openModal(kind: "note" | "file" | "link", item?: KnowledgeItem) {
    setEditing(item || null);
    setError("");
    setModal(kind);
  }
  async function saveContent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      let item: KnowledgeItem;
      if (modal === "note") {
        const input = noteInput.parse({
          title: form.get("title"),
          content: form.get("content"),
          tags: String(form.get("tags") || "")
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean),
        });
        if (live)
          item = (
            await requestJson(
              editing ? `/api/items/${editing.id}` : "/api/items",
              {
                method: editing ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...input,
                  ...(editing ? { version: editing.version } : {}),
                }),
              },
            )
          ).item;
        else {
          const now = new Date().toISOString();
          item = {
            ...input,
            id: editing?.id || crypto.randomUUID(),
            type: "note",
            segments: segmentText(input.content),
            status: "ready",
            createdAt: editing?.createdAt || now,
            updatedAt: now,
            version: (editing?.version || 0) + 1,
          };
        }
      } else if (modal === "file") {
        const file = fileInput.current?.files?.[0];
        if (!file) throw new Error("Choose a file first.");
        if (live) {
          const data = new FormData();
          data.set("file", file);
          data.set("consent", form.get("consent") === "on" ? "true" : "false");
          item = (
            await requestJson("/api/import", { method: "POST", body: data })
          ).item;
        } else {
          if (!/\.(md|markdown|txt)$/i.test(file.name))
            throw new Error(
              "The local demo imports Markdown and text. Sign in and connect Gemini for PDF, image, and video extraction.",
            );
          if (file.size > 160000)
            throw new Error("Text imports support up to 40,000 characters.");
          const content = await file.text();
          const input = noteInput.parse({
            title: file.name.replace(/\.[^.]+$/, ""),
            content,
            tags: [],
          });
          const now = new Date().toISOString();
          item = {
            ...input,
            id: crypto.randomUUID(),
            type: "note",
            segments: segmentText(content),
            status: "ready",
            version: 1,
            createdAt: now,
            updatedAt: now,
          };
        }
      } else {
        if (!live)
          throw new Error(
            "Sign in to import public articles and YouTube links. You can paste an excerpt into a demo note now.",
          );
        item = (
          await requestJson("/api/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: form.get("url"),
              consent: form.get("consent") === "on",
            }),
          })
        ).item;
      }
      if (!editing && items.length >= 200 && !live)
        throw new Error(
          "The demo supports 200 items. Export or remove an item first.",
        );
      if (live) await refresh();
      else
        setItems((previous) => [
          item,
          ...previous.filter((i) => i.id !== item.id),
        ]);
      resetSearch();
      setSelectedId(item.id);
      setDetail(true);
      setModal(null);
      setNotice(editing ? "Your note is saved." : "Added to your library.");
    } catch (e) {
      setError(
        e instanceof z.ZodError ? e.issues[0].message : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function removeItem() {
    setBusy(true);
    setError("");
    try {
      if (live) {
        await requestJson(`/api/items/${deleteId}`, { method: "DELETE" });
        await refresh();
      } else setItems((previous) => previous.filter((i) => i.id !== deleteId));
      resetSearch();
      setDetail(false);
      setSelectedId(items.find((i) => i.id !== deleteId)?.id || "");
      setDeleteId("");
      setNotice("Item removed from your library.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const explanationView = explanation && (
    <div className="explanation">
      <div className="eyebrow">WHY THIS RESULT</div>
      <h3>
        {explanation.discovery === "graph"
          ? "Found through a connection."
          : "A direct match."}
      </h3>
      <p>
        {explanation.discovery === "graph"
          ? "This is the path search followed to find it."
          : "This passage matched your search directly."}
      </p>
      <ol>
        {explanation.path.map((id) => (
          <li key={id}>
            <button onClick={() => selectItem(id)}>
              {items.find((i) => i.id === id)?.title}
            </button>
          </li>
        ))}
      </ol>
      {explanation.edges.map((edge, i) => (
        <div className="edge-evidence" key={i}>
          <strong>
            {edgeAppearance(edge.weight).label} connection:{" "}
            {edge.weight.toFixed(2)}
          </strong>
          <span>
            {edge.explicit ? "Explicit [[link]] · " : ""}
            {edge.basis === "semantic"
              ? `Meaning match ${Math.round(edge.semantic * 100)}%`
              : `Shared wording ${Math.round(edge.lexical * 100)}%`}
            {edge.sharedTags.length
              ? ` · Shared: ${edge.sharedTags.join(", ")}`
              : ""}
          </span>
        </div>
      ))}
      <small>Scores are ranking signals, not accuracy probabilities.</small>
      <button className="text-action" onClick={() => setExplanation(null)}>
        Close explanation
      </button>
    </div>
  );

  return (
    <div className="app-shell lattice-app">
      <aside className="sidebar">
        <Link
          className="brand"
          href={live ? "/workspace" : "/"}
          prefetch={false}
        >
          <span className="brand-mark">
            {/* Decorative: the link's name is the NodeBrainer text beside it. */}
            <NodeBrainerIcon size={20} />
          </span>
          <span className="brand-name">
            Node<span className="brand-accent">Brainer</span>
          </span>
        </Link>
        <nav aria-label="Workspace" className="sidebar-nav">
          <p className="nav-label">MEMORY</p>
          <button
            className={`nav-item ${view === "memory" ? "active" : ""}`}
            aria-current={view === "memory" ? "page" : undefined}
            onClick={() => {
              setView("memory");
              setDetail(false);
              resetSearch();
            }}
          >
            <NodeBrainerIcon size={18} />
            Memory Map
          </button>
          <button
            className={`nav-item ${view === "activity" ? "active" : ""}`}
            aria-current={view === "activity" ? "page" : undefined}
            onClick={() => {
              setView("activity");
              setDetail(false);
            }}
          >
            <Activity size={18} />
            Recent Activity
          </button>
          <button
            className={`nav-item ${view === "history" ? "active" : ""}`}
            aria-current={view === "history" ? "page" : undefined}
            onClick={() => {
              setView("history");
              setDetail(false);
            }}
          >
            <History size={18} />
            Search History
            {history.length > 0 && (
              <span className="nav-count">{history.length}</span>
            )}
          </button>
          <p className="nav-label">LIBRARY</p>
          <button
            className={`nav-item ${view === "library" && type === "all" ? "active" : ""}`}
            aria-current={
              view === "library" && type === "all" ? "page" : undefined
            }
            onClick={() => {
              setView("library");
              setType("all");
              setTag("");
              setDetail(false);
              resetSearch();
            }}
          >
            <FolderOpen size={18} />
            My Library<span className="nav-count">{items.length}</span>
          </button>
        </nav>
        <div className="type-navigation library-subnav">
          {(Object.keys(typeLabels) as ItemType[]).map((t) => {
            const Icon = icons[t];
            return (
              <button
                key={t}
                className={`nav-item ${view === "library" && type === t ? "active" : ""}`}
                onClick={() => {
                  setType(t);
                  setView("library");
                  setDetail(false);
                  resetSearch();
                }}
              >
                <Icon size={16} />
                {typeLabels[t]}s
                <span className="nav-count">
                  {items.filter((i) => i.type === t).length}
                </span>
              </button>
            );
          })}
        </div>
        <div className="profile">
          <span className="avatar">{live ? name?.[0] || "Y" : "D"}</span>
          <div>
            {live ? name || "Your account" : "Demo explorer"}
            <small>{live ? "Secured by Auth0" : "Saved in this browser"}</small>
          </div>
          {live ? (
            <a className="signout" href="/auth/logout">
              Log out
            </a>
          ) : (
            <a
              className="signin-icon"
              aria-label="Sign in"
              href={authConfigured ? "/auth/login" : "/setup"}
            >
              <LogIn size={17} />
            </a>
          )}
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <span className="slash">/</span>
            {viewTitles[view]}
          </div>
          <div className="topbar-actions">
            <button
              className="button dark topbar-add"
              onClick={() => openModal("note")}
            >
              <Plus size={16} />
              Add content
            </button>
            <span className="preview-pill">
              <span />
              {live ? "Private library" : "Local demo"}
            </span>
            <button
              className="icon-button"
              aria-label="Export library as JSON"
              onClick={() =>
                download(
                  "nodebrainer-library.json",
                  JSON.stringify(items, null, 2),
                  "application/json",
                )
              }
            >
              <ArrowDownToLine size={17} />
            </button>
            <Link
              className="profile-button"
              href="/setup"
              prefetch={false}
              aria-label="Profile and workspace settings"
            >
              <UserRound size={17} />
            </Link>
          </div>
        </header>
        <div className="knowledge-layout full-width">
          <div className={`library-panel view-${view}`}>
            <div className="page-heading">
              <div>
                <div className="eyebrow">{viewTitles[view].toUpperCase()}</div>
                <h1>
                  {view === "memory"
                    ? "Find what you worked on."
                    : view === "activity"
                      ? "Pick up where you left off."
                      : view === "history"
                        ? "Your recent searches."
                        : "Everything you’ve saved."}
                </h1>
                <p>
                  {view === "memory"
                    ? "Search your notes, files, and past work."
                    : view === "activity"
                      ? "Your recent files, notes, and searches."
                      : view === "history"
                        ? "Find something you looked up before."
                        : "Notes, files, links, and media in one place."}
                </p>
              </div>
            </div>
            {!live && (
              <div className="demo-strip">
                <span>
                  <span className="status-dot" />
                  Sample library · Gemini answers
                </span>
                <a href={authConfigured ? "/auth/login" : "/setup"}>
                  Make it yours <ArrowRight size={13} />
                </a>
              </div>
            )}
            {notice && (
              <div className="notice" role="status">
                <Check size={15} />
                {notice}
                <button
                  onClick={() => setNotice("")}
                  aria-label="Dismiss notification"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {error && !modal && !deleteId && (
              <div className="error-message" role="alert">
                {error}
                <button onClick={() => setError("")} aria-label="Dismiss error">
                  <X size={14} />
                </button>
              </div>
            )}
            {(view === "memory" || view === "library") && (
              <form
                className={`search-form ${view === "memory" ? "memory-search" : ""}`}
                role="search"
                onSubmit={(e) => {
                  e.preventDefault();
                  void search();
                }}
              >
                <Search size={view === "memory" ? 22 : 19} />
                <input
                  aria-label={
                    view === "memory"
                      ? "Search memory"
                      : "Search your knowledge"
                  }
                  placeholder={
                    view === "memory"
                      ? "What are you looking for?"
                      : "Ask your library a question…"
                  }
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={500}
                />
                {query && (
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setQuery("");
                      resetSearch();
                    }}
                  >
                    <X size={15} />
                  </button>
                )}
                <button className="search-submit" disabled={searching}>
                  {searching ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <ArrowRight size={18} />
                  )}
                  <span className="sr-only">Search</span>
                </button>
              </form>
            )}
            {live &&
              geminiConfigured &&
              (view === "memory" || view === "library") && (
                <p className="answer-privacy">
                  Your question and relevant passages from your library are sent
                  to Google Gemini to compose the answer.
                </p>
              )}
            {loading ? (
              <div className="empty-state">
                <LoaderCircle className="spin" />
                Opening your library…
              </div>
            ) : detail && selected ? (
              <section className="item-detail">
                <button className="back-link" onClick={() => setDetail(false)}>
                  <ArrowLeft size={15} />
                  Back to{" "}
                  {view === "library"
                    ? answer
                      ? "answer"
                      : "library"
                    : viewTitles[view]}
                </button>
                <div className="detail-heading">
                  <span className={`type-badge ${selected.type}`}>
                    {typeLabels[selected.type]}
                  </span>
                  <div>
                    {selected.type === "note" && (
                      <button
                        className="text-action"
                        onClick={() => openModal("note", selected)}
                      >
                        Edit note
                      </button>
                    )}
                    <button
                      className="icon-button"
                      aria-label="Export this item"
                      onClick={() =>
                        download(
                          `${selected.title.replace(/[^a-z0-9 -]/gi, "").slice(0, 80)}.md`,
                          selected.content,
                        )
                      }
                    >
                      <ArrowDownToLine size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Delete this item"
                      onClick={() => {
                        setError("");
                        setDeleteId(selected.id);
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <h2>{selected.title}</h2>
                <div className="detail-tags">
                  {selected.tags.map((t) => (
                    <span key={t}>#{t}</span>
                  ))}
                </div>
                {selected.sample && (
                  <div className="sample-label">
                    Illustrative demo content ·{" "}
                    {selected.type === "note"
                      ? "editable sample"
                      : "sample excerpt, no original file attached"}
                  </div>
                )}
                {selected.sourceUrl && (
                  <a
                    className="source-link"
                    href={selected.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open original source <ArrowUpRight size={14} />
                  </a>
                )}
                {selected.hasAsset && (
                  <div className="asset-viewer">
                    {selected.type === "image" ? (
                      <img
                        alt={selected.title}
                        src={`/api/items/${selected.id}/asset`}
                      />
                    ) : selected.type === "video" ? (
                      <video controls src={`/api/items/${selected.id}/asset`} />
                    ) : (
                      <a
                        className="source-link"
                        href={`/api/items/${selected.id}/asset#page=${selected.segments[0]?.locator.page || 1}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open original PDF <ArrowUpRight size={14} />
                      </a>
                    )}
                  </div>
                )}
                {selected.type !== "note" && !selected.sample && (
                  <div className="sample-label">
                    Extracted passages are a preview, not a complete
                    transcription. Verify AI-generated text and locations
                    against the original.
                  </div>
                )}
                {view === "library" && explanationView}
                <div className="segments">
                  {selected.segments.map((s) => (
                    <article
                      key={s.id}
                      className={
                        explanation?.segmentId === s.id
                          ? "highlighted-segment"
                          : ""
                      }
                    >
                      <div className="segment-label">
                        {locationLabel(s)}
                        {s.kind === "description" && (
                          <span>AI description · not a source quotation</span>
                        )}
                        {s.kind === "transcript" && (
                          <span>Transcript excerpt</span>
                        )}
                        {selected.hasAsset &&
                          selected.type === "pdf" &&
                          s.locator.page && (
                            <a
                              href={`/api/items/${selected.id}/asset#page=${s.locator.page}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Open page ↗
                            </a>
                          )}
                        {selected.hasAsset &&
                          selected.type === "video" &&
                          s.locator.start !== undefined && (
                            <a
                              href={`/api/items/${selected.id}/asset#t=${s.locator.start}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Open moment ↗
                            </a>
                          )}
                      </div>
                      <p>{s.text}</p>
                    </article>
                  ))}
                </div>
                {view === "library" && neighbors.length > 0 && (
                  <div className="detail-connections">
                    <h3>Connected to this</h3>
                    {neighbors.map((edge) => {
                      const id =
                          edge.source === selected.id
                            ? edge.target
                            : edge.source,
                        item = items.find((i) => i.id === id);
                      if (!item) return null;
                      const Icon = icons[item.type];
                      return (
                        <button
                          className="related-item"
                          key={id}
                          onClick={() => selectItem(id)}
                        >
                          <span className={`content-icon ${item.type}`}>
                            <Icon size={15} />
                          </span>
                          <span>
                            <strong>{item.title}</strong>
                            <small>
                              {typeLabels[item.type]} ·{" "}
                              {edgeAppearance(edge.weight).label} ·{" "}
                              {edge.explicit
                                ? "Explicit link"
                                : edge.basis === "semantic"
                                  ? "Semantic connection"
                                  : "Text / tag connection"}
                            </small>
                          </span>
                          <span className="edge-score">
                            {edge.weight.toFixed(2)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : view === "memory" ? (
              <>
                <section className="memory-map" aria-label="Memory Map">
                  <div className="section-heading">
                    <h2>Your memory map</h2>
                    <span>
                      {items.length} MEMORIES · {edges.length} CONNECTIONS
                    </span>
                  </div>
                  <KnowledgeGraph
                    large
                    items={items}
                    edges={edges}
                    selectedId={selectedId || items[0]?.id || ""}
                    onSelect={(id) => {
                      if (!searchedQuery) return selectItem(id);
                      setSelectedId(id);
                      setMapFocusId(id);
                      setExplanation(null);
                    }}
                    highlighted={mapHighlights}
                    question={
                      searchedQuery
                        ? {
                            id: questionId,
                            query: searchedQuery,
                            loading: searching,
                            context: answerContext,
                            answer,
                            error: answerError,
                            focusItemId: mapFocusId,
                          }
                        : undefined
                    }
                    onDismissQuestion={resetSearch}
                  />
                </section>
              </>
            ) : view === "activity" ? (
              <RecentActivity
                items={items}
                edges={edges}
                history={history}
                onOpen={selectItem}
                onSearch={(q) => {
                  setView("memory");
                  void search(q);
                }}
              />
            ) : view === "history" ? (
              <SearchHistory
                items={items}
                history={history}
                suggestions={historySuggestions}
                onSearch={(q) => {
                  setView("memory");
                  void search(q);
                }}
                onRemove={(id) =>
                  saveHistory(history.filter((h) => h.id !== id))
                }
                onClear={() => saveHistory([])}
              />
            ) : searching ? (
              <div className="empty-state">
                <LoaderCircle className="spin" />
                Reading your sources and composing an answer…
              </div>
            ) : answer ? (
              <AnswerPanel
                answer={answer}
                query={searchedQuery}
                onSource={(source) => {
                  selectItem(source.itemId);
                  setExplanation(
                    results?.results.find(
                      (result) =>
                        result.itemId === source.itemId &&
                        result.segmentId === source.segmentId,
                    ) || null,
                  );
                }}
              />
            ) : (
              <>
                <div className="library-toolbar">
                  <div className="filter-tabs">
                    {(
                      ["all", "note", "pdf", "image", "video", "link"] as const
                    ).map((t) => (
                      <button
                        key={t}
                        className={type === t ? "selected" : ""}
                        onClick={() => {
                          setType(t);
                          resetSearch();
                        }}
                      >
                        {t === "all" ? "Everything" : typeLabels[t]}
                      </button>
                    ))}
                  </div>
                  <select
                    aria-label="Filter by topic"
                    value={tag}
                    onChange={(e) => {
                      setTag(e.target.value);
                      resetSearch();
                    }}
                  >
                    <option value="">All topics</option>
                    {allTags.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="section-heading">
                  <h2>
                    {results
                      ? `Results for “${searchedQuery}”`
                      : "Your library"}
                  </h2>
                  <span>
                    {results
                      ? `${results.results.length} RESULTS`
                      : `${filtered.length} ITEMS`}
                    <ChevronDown size={12} />
                  </span>
                </div>
                {explanationView}
                {results && (
                  <div className="search-meta">
                    {results.mode} · {results.expanded} nodes explored ·{" "}
                    {results.scored} neighbors scored
                  </div>
                )}
                <div className={results ? "result-list" : "item-grid"}>
                  {(results
                    ? results.results.map((r) => ({
                        item: items.find((i) => i.id === r.itemId)!,
                        result: r,
                      }))
                    : filtered.map((item) => ({ item, result: undefined }))
                  )
                    .filter((row) => row.item)
                    .map(({ item, result }) => {
                      const Icon = icons[item.type];
                      const segment =
                        item.segments.find((s) => s.id === result?.segmentId) ||
                        item.segments[0];
                      return (
                        <article
                          key={item.id}
                          className={`knowledge-card ${selectedId === item.id ? "current" : ""}`}
                        >
                          <button
                            className="card-open"
                            onClick={() => {
                              selectItem(item.id);
                              setExplanation(result || null);
                            }}
                          >
                            <div className="card-top">
                              <span className={`content-icon ${item.type}`}>
                                <Icon size={19} />
                              </span>
                              <span className="content-type">
                                {typeLabels[item.type]}{" "}
                                {result?.discovery === "graph" && (
                                  <span className="graph-badge">
                                    Connected discovery
                                  </span>
                                )}
                              </span>
                              <ArrowUpRight className="card-arrow" size={15} />
                            </div>
                            <h3>{item.title}</h3>
                            <p>
                              {(segment?.text || item.content)
                                .replace(/#{1,6}\s/g, "")
                                .replace(/\[\[|\]\]/g, "")
                                .slice(0, result ? 240 : 135)}
                              …
                            </p>
                            <div className="card-footer">
                              <span className="tag-pill">
                                {item.tags[0] || "Unsorted"}
                              </span>
                              <span>
                                {item.type === "note"
                                  ? `${item.segments.length} passage${item.segments.length === 1 ? "" : "s"}`
                                  : locationLabel(segment)}
                              </span>
                            </div>
                          </button>
                          {result && (
                            <button
                              className="why-button"
                              onClick={() => {
                                setExplanation(result);
                                setSelectedId(item.id);
                              }}
                            >
                              <Network size={12} />
                              {result.discovery === "graph"
                                ? "Why this connection?"
                                : "Why this result?"}
                              <span>score {result.score.toFixed(2)}</span>
                            </button>
                          )}
                        </article>
                      );
                    })}
                </div>
                {((results && !results.results.length) ||
                  (!results && !filtered.length)) && (
                  <div className="empty-state">
                    <Search size={26} />
                    <h3>{results ? "No matches." : "Nothing saved yet."}</h3>
                    <p>
                      {results
                        ? "Try a different word, or clear a filter."
                        : "Add a note, a file, or a link to get started."}
                    </p>
                    <button
                      className="button dark"
                      onClick={() => openModal("note")}
                    >
                      <Plus size={15} />
                      Write a note
                    </button>
                  </div>
                )}
                <div className="quick-add">
                  <span>Add more:</span>
                  <button onClick={() => openModal("file")}>
                    <Upload size={14} />
                    Upload a file
                  </button>
                  <button onClick={() => openModal("link")}>
                    <Link2 size={14} />
                    Save a link
                  </button>
                </div>
              </>
            )}
            <footer>
              <span>
                NodeBrainer <span>Your second mind.</span>
              </span>
              <span>
                {items.length} ITEMS · {edges.length} CONNECTIONS
              </span>
            </footer>
          </div>
        </div>
      </main>
      <dialog
        ref={dialog}
        className="content-dialog"
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else {
            setModal(null);
            setDeleteId("");
          }
        }}
        onClose={() => {
          if (!busy) {
            setModal(null);
            setDeleteId("");
          }
        }}
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">
              {deleteId ? "REMOVE" : editing ? "EDIT NOTE" : "ADD CONTENT"}
            </span>
            <h2>
              {deleteId
                ? "Remove this item?"
                : editing
                  ? "Edit your note."
                  : "Add to your library."}
            </h2>
          </div>
          <button
            className="icon-button"
            disabled={busy}
            aria-label="Close dialog"
            onClick={() => {
              setModal(null);
              setDeleteId("");
            }}
          >
            <X size={20} />
          </button>
        </div>
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
        {deleteId ? (
          <div className="delete-content">
            <p>
              This removes “{items.find((i) => i.id === deleteId)?.title}” and
              its original file from your library. Export it first if you need a
              copy.
            </p>
            <button
              className="button dark"
              disabled={busy}
              onClick={() => void removeItem()}
            >
              {busy ? "Removing…" : "Remove item"}
            </button>
          </div>
        ) : (
          <>
            <div className="modal-tabs">
              {(["note", "file", "link"] as const).map((t) => (
                <button
                  disabled={busy || Boolean(editing)}
                  className={modal === t ? "selected" : ""}
                  key={t}
                  onClick={() => setModal(t)}
                >
                  {t === "note"
                    ? "Write a note"
                    : t === "file"
                      ? "Upload a file"
                      : "Paste a link"}
                </button>
              ))}
            </div>
            <form
              key={`${modal}-${editing?.id || "new"}`}
              onSubmit={saveContent}
            >
              {modal === "note" ? (
                <>
                  <label>
                    Title
                    <input
                      name="title"
                      required
                      maxLength={180}
                      placeholder="Title"
                      defaultValue={editing?.title}
                    />
                  </label>
                  <label>
                    Your note
                    <textarea
                      name="content"
                      rows={9}
                      required
                      maxLength={40000}
                      placeholder="Write in Markdown. Use [[Note title]] to make a connection."
                      defaultValue={editing?.content}
                    />
                  </label>
                  <label>
                    Topics <span>separated by commas</span>
                    <input
                      name="tags"
                      placeholder="research, ideas, machine learning"
                      defaultValue={editing?.tags.join(", ")}
                    />
                  </label>
                </>
              ) : modal === "file" ? (
                <>
                  <label className="upload-zone">
                    <Upload size={28} />
                    <strong>Choose a file to upload.</strong>
                    <span>
                      {live
                        ? "Markdown, PDF, image, or short video · up to 14 MB"
                        : "Try a Markdown or text file in this demo"}
                    </span>
                    <input
                      ref={fileInput}
                      name="file"
                      type="file"
                      required
                      accept=".md,.markdown,.txt,.pdf,.png,.jpg,.jpeg,.webp,.mp4,.webm"
                    />
                  </label>
                  {!live && (
                    <p className="form-help">
                      PDFs, images, and videos need a signed-in workspace with
                      Gemini configured.
                    </p>
                  )}
                </>
              ) : (
                <label>
                  Source link
                  <input
                    name="url"
                    type="url"
                    required
                    maxLength={2000}
                    placeholder="https://example.com/a-good-read"
                  />
                  <p className="form-help">
                    Public articles and supported YouTube links. Private and
                    sign-in-only posts may need a pasted excerpt.
                  </p>
                </label>
              )}
              {modal !== "note" && live && (
                <label className="consent">
                  <input type="checkbox" name="consent" />
                  <span>
                    Allow this PDF, image, or video to be sent to Google Gemini
                    for extraction. Free-tier content may be used to improve
                    Google’s products.
                  </span>
                </label>
              )}
              {live && semanticEnabled && (
                <p className="form-help">
                  Semantic indexing is enabled. Saved text and search queries
                  are sent to Google for embeddings.
                </p>
              )}
              {modal !== "note" && live && !geminiConfigured && (
                <p className="form-help">
                  Gemini is not connected yet. Notes and public article
                  extraction are available; media extraction needs an API key.
                </p>
              )}
              <div className="dialog-actions">
                <span>
                  {busy
                    ? "Processing your content. Please keep this window open…"
                    : live
                      ? "Saved privately to your account"
                      : "Saved locally in this browser"}
                </span>
                <button className="button dark" disabled={busy}>
                  {busy ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <Plus size={15} />
                  )}{" "}
                  {busy
                    ? "Processing…"
                    : editing
                      ? "Save changes"
                      : "Add to library"}
                </button>
              </div>
            </form>
          </>
        )}
      </dialog>
    </div>
  );
}
