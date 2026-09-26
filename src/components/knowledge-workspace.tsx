"use client";
/* eslint-disable @next/next/no-img-element -- Private image endpoints need browser session cookies. */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  FileText,
  FolderOpen,
  ImageIcon,
  Link2,
  LoaderCircle,
  LogIn,
  Network,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sprout,
  Trash2,
  Upload,
  Video,
  X,
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
  searchKnowledge,
  segmentText,
} from "@/lib/knowledge";
import { demoItems } from "@/lib/demo-data";
import { KnowledgeGraph } from "./knowledge-graph";
import { AnswerPanel } from "./answer-panel";
import {
  KnowledgeAnswer,
  answerSources,
  extractiveAnswer,
} from "@/lib/answers";
import { locatorSchema, noteInput } from "@/lib/validation";

const typeLabels: Record<ItemType, string> = {
  note: "Note",
  pdf: "PDF",
  image: "Image",
  link: "Article",
  video: "Video",
};
const icons = {
  note: FileText,
  pdf: FileText,
  image: ImageIcon,
  link: Link2,
  video: Video,
};
const cacheSchema = z
  .array(
    z.object({
      id: z.string(),
      title: z.string().max(180),
      type: z.enum(["note", "pdf", "image", "link", "video"]),
      content: z.string().max(120000),
      tags: z.array(z.string()),
      segments: z.array(
        z.object({
          id: z.string(),
          text: z.string(),
          kind: z.enum(["text", "transcript", "description"]),
          locator: locatorSchema,
        }),
      ),
      status: z.enum(["ready", "needs-attention"]),
      createdAt: z.string(),
      updatedAt: z.string(),
      version: z.number(),
      sample: z.boolean().optional(),
    }),
  )
  .max(200);
type Props = {
  live?: boolean;
  name?: string;
  authConfigured: boolean;
  geminiConfigured?: boolean;
  semanticEnabled?: boolean;
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
}: Props) {
  const [items, setItems] = useState<KnowledgeItem[]>(live ? [] : demoItems);
  const [serverEdges, setServerEdges] = useState<Edge[]>([]);
  const [hydrated, setHydrated] = useState(false),
    [loading, setLoading] = useState(live);
  const [type, setType] = useState<ItemType | "all">("all"),
    [tag, setTag] = useState("");
  const [selectedId, setSelectedId] = useState("attention"),
    [detail, setDetail] = useState(false);
  const [view, setView] = useState<"library" | "graph">("library");
  const [query, setQuery] = useState(""),
    [searchedQuery, setSearchedQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null),
    [searching, setSearching] = useState(false);
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
      } else {
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
  }, [live]);
  useEffect(() => {
    if (!live && hydrated) {
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
  }, [items, hydrated, live]);
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
  function resetSearch() {
    searchRef.current?.abort();
    searchGeneration.current++;
    setResults(null);
    setAnswer(null);
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
  async function search(value = query) {
    if (!value.trim()) {
      resetSearch();
      return;
    }
    resetSearch();
    const generation = searchGeneration.current;
    const controller = new AbortController();
    searchRef.current = controller;
    setSearching(true);
    setDetail(false);
    setView("library");
    setError("");
    setQuery(value);
    try {
      const data = live
        ? await requestJson("/api/answer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: value, type, tag: tag || undefined }),
            signal: controller.signal,
          })
        : searchKnowledge(filtered, value);
      if (searchGeneration.current === generation) {
        setResults(data);
        setAnswer(
          live
            ? data.answer
            : extractiveAnswer(value, answerSources(filtered, data)),
        );
        setSearchedQuery(value);
      }
    } catch (e) {
      if (
        (e as Error).name !== "AbortError" &&
        searchGeneration.current === generation
      )
        setError((e as Error).message);
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
      setView("library");
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

  return (
    <div className="app-shell lattice-app">
      <aside className="sidebar">
        <Link className="brand" href={live ? "/workspace" : "/"} prefetch={false}>
          <span className="brand-mark">
            <Network size={23} />
          </span>
          lattice<span className="brand-period">.</span>
        </Link>
        <div className="workspace-label">
          <span className="workspace-avatar">
            {live ? name?.[0] || "Y" : "D"}
          </span>
          <div>
            {live ? "My knowledge space" : "The curiosity collection"}
            <small>{live ? "Private workspace" : "Interactive demo"}</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <p className="nav-label">YOUR WORKSPACE</p>
        <nav aria-label="Workspace">
          <button
            className={`nav-item ${view === "library" && type === "all" ? "active" : ""}`}
            onClick={() => {
              setView("library");
              setType("all");
              setTag("");
              setDetail(false);
              resetSearch();
            }}
          >
            <FolderOpen size={18} />
            My library<span className="nav-count">{items.length}</span>
          </button>
          <button
            className={`nav-item ${view === "graph" ? "active" : ""}`}
            onClick={() => {
              setView("graph");
              setDetail(false);
              resetSearch();
            }}
          >
            <Network size={18} />
            Connections
          </button>
        </nav>
        <div className="type-navigation">
          <p className="nav-label">CONTENT TYPES</p>
          {(Object.keys(typeLabels) as ItemType[]).map((t) => {
            const Icon = icons[t];
            return (
              <button
                key={t}
                className={`nav-item ${type === t ? "active" : ""}`}
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
        <div className="sidebar-bottom">
          <span className="small-orbit">
            <Sprout size={21} />
          </span>
          <strong>Let your ideas find each other.</strong>
          <p>
            A second brain.
            <br />A new perspective.
          </p>
          <Link href="/setup" className="edition" prefetch={false}>
            WORKSPACE SETTINGS <ArrowUpRight size={12} />
          </Link>
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
            {view === "graph" ? "Connections" : "My library"}
          </div>
          <div className="topbar-actions">
            <span className="preview-pill">
              <span />
              {live ? "Private library" : "Local demo"}
            </span>
            <button
              className="icon-button"
              aria-label="Export library as JSON"
              onClick={() =>
                download(
                  "lattice-library.json",
                  JSON.stringify(items, null, 2),
                  "application/json",
                )
              }
            >
              <ArrowDownToLine size={17} />
            </button>
            <Link className="icon-button" href="/setup" aria-label="Settings" prefetch={false}>
              <Settings2 size={17} />
            </Link>
          </div>
        </header>
        <div className="knowledge-layout">
          <div className="library-panel">
            <div className="page-heading">
              <div>
                <div className="eyebrow">YOUR PERSONAL KNOWLEDGE GARDEN</div>
                <h1>
                  {view === "graph"
                    ? "Everything is connected."
                    : "Collect a little. Connect a lot."}
                </h1>
                <p>All your knowledge, with the dots connected.</p>
              </div>
              <button className="button dark" onClick={() => openModal("note")}>
                <Plus size={16} />
                Add content
              </button>
            </div>
            {!live && (
              <div className="demo-strip">
                <span>
                  <span className="status-dot" />
                  Sample sources · real local search and editing
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
            <form
              className="search-form"
              onSubmit={(e) => {
                e.preventDefault();
                void search();
              }}
            >
              <Search size={19} />
              <input
                aria-label="Search your knowledge"
                placeholder="Ask your library a question…"
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
            {live && geminiConfigured && (
              <p className="answer-privacy">
                Your question and retrieved passages are sent to Google Gemini
                to compose the answer.
              </p>
            )}
            {!detail && !results && !searching && view === "library" && (
              <section className="discovery-banner">
                <div>
                  <span className="hero-kicker">
                    <Sparkles size={12} /> A LITTLE SERENDIPITY
                  </span>
                  <h2>
                    The next insight is
                    <br />
                    already in your library.
                  </h2>
                  <p>
                    Find the passage. Follow the thread.
                    <br />
                    See something you hadn’t seen before.
                  </p>
                  <button
                    onClick={() => void search("conditional probability")}
                    className="discovery-link"
                  >
                    Try a connected search <ArrowUpRight size={14} />
                  </button>
                </div>
                <div className="banner-art" aria-hidden="true">
                  <div className="idea-line l1" />
                  <div className="idea-line l2" />
                  <div className="idea-line l3" />
                  <div className="idea-node central">
                    <Network size={28} />
                  </div>
                  <div className="idea-node n1">
                    <FileText size={18} />
                  </div>
                  <div className="idea-node n2">
                    <Video size={19} />
                  </div>
                  <div className="idea-node n3">
                    <ImageIcon size={18} />
                  </div>
                  <span className="idea-caption">a new way to see it</span>
                </div>
              </section>
            )}
            {loading || searching ? (
              <div className="empty-state">
                <LoaderCircle className="spin" />
                {searching
                  ? "Reading your sources and composing an answer…"
                  : "Opening your library…"}
              </div>
            ) : view === "graph" ? (
              <section className="graph-workspace">
                <div className="section-heading">
                  <h2>Your connected knowledge</h2>
                  <span>{edges.length} CONNECTIONS</span>
                </div>
                <KnowledgeGraph
                  large
                  items={items}
                  edges={edges}
                  selectedId={selectedId || items[0]?.id || ""}
                  onSelect={(id) => {
                    selectItem(id);
                    setView("library");
                  }}
                />
                <p>
                  Explore your whole library in 3D. Stronger connections are
                  thicker and brighter; weak connections are dashed. Hover an
                  edge to inspect its actual evidence. The faint brain contour
                  is decorative.
                </p>
                <div className="graph-item-picker">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      className={item.id === selectedId ? "selected" : ""}
                      onClick={() => setSelectedId(item.id)}
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              </section>
            ) : detail && selected ? (
              <section className="item-detail">
                <button className="back-link" onClick={() => setDetail(false)}>
                  <ArrowLeft size={15} />
                  Back to {answer ? "answer" : "library"}
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
              </section>
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
                    <h3>
                      {results ? "No matches yet." : "Room for your next idea."}
                    </h3>
                    <p>
                      {results
                        ? "Try a specific term, clear a filter, or add more knowledge."
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
                  <span>Keep something worth coming back to.</span>
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
                lattice. <span>A little room for connected thinking.</span>
              </span>
              <span>
                {items.length} ITEMS · {edges.length} CONNECTIONS
              </span>
            </footer>
          </div>
          <aside className="connections-panel">
            <div className="connections-title">
              <Network size={16} />
              <h2>Connected thinking</h2>
              <span className="status-dot" />
            </div>
            <p className="panel-subtitle">A wider view of what you know.</p>
            <KnowledgeGraph
              items={items}
              edges={edges}
              selectedId={selectedId || items[0]?.id || ""}
              onSelect={selectItem}
              highlighted={explanation?.path}
            />
            <div className="graph-legend">
              <span>Hover nodes and edges to inspect</span>
            </div>
            {explanation ? (
              <div className="explanation">
                <div className="eyebrow">FOLLOW THE THREAD</div>
                <h3>
                  {explanation.discovery === "graph"
                    ? "A connection worth exploring."
                    : "A direct match."}
                </h3>
                <p>
                  {explanation.discovery === "graph"
                    ? "This is the actual path used to discover the item."
                    : "This passage matched your query through keyword overlap or enabled semantic retrieval."}
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
                    <strong>Connection score: {edge.weight.toFixed(2)}</strong>
                    <span>
                      {edge.explicit ? "Explicit [[link]] · " : ""}
                      {edge.basis === "semantic"
                        ? `Semantic ${edge.semantic.toFixed(2)}`
                        : `Text similarity ${edge.lexical.toFixed(2)}`}
                      {edge.sharedTags.length
                        ? ` · Shared: ${edge.sharedTags.join(", ")}`
                        : ""}
                    </span>
                  </div>
                ))}
                <small>
                  Scores are ranking signals, not accuracy probabilities.
                </small>
                <button
                  className="text-action"
                  onClick={() => setExplanation(null)}
                >
                  Close explanation
                </button>
              </div>
            ) : answer ? (
              <div className="insight-note">
                <Sparkles size={17} />
                <h3>One answer. A connected foundation.</h3>
                <p>
                  Open a numbered citation to inspect the passage behind your
                  answer, or explore the graph above.
                </p>
              </div>
            ) : (
              <>
                <div className="related-heading">
                  <h3>In this neighborhood</h3>
                  <span>{neighbors.length}</span>
                </div>
                {neighbors.map((edge) => {
                  const id =
                      edge.source === selectedId ? edge.target : edge.source,
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
                {!neighbors.length && (
                  <p className="panel-subtitle">
                    Add shared tags or [[links]] to connect this item with your
                    library.
                  </p>
                )}
                <div className="insight-note">
                  <Sparkles size={17} />
                  <h3>Follow your curiosity.</h3>
                  <p>
                    A useful idea doesn’t always match your exact words.
                    Sometimes, it’s one connection away.
                  </p>
                </div>
              </>
            )}
            <div className="panel-footer">
              <ShieldCheck size={13} />
              {live
                ? "Only your account can access this library."
                : "Demo content stays in this browser."}
            </div>
          </aside>
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
            <span className="eyebrow">MAKE SPACE FOR AN IDEA</span>
            <h2>
              {deleteId
                ? "Remove this item?"
                : editing
                  ? "A little room to think."
                  : "Add to your knowledge."}
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
                      placeholder="What’s on your mind?"
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
                    <strong>A little knowledge, in any format.</strong>
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
