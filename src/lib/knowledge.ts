export type ItemType = "note" | "pdf" | "image" | "link" | "video";
export type Segment = {
  id: string;
  text: string;
  kind: "text" | "transcript" | "description";
  locator: { page?: number; start?: number; end?: number; section?: string };
  embedding?: number[];
  embeddingModel?: string;
};
export type KnowledgeItem = {
  id: string;
  title: string;
  type: ItemType;
  content: string;
  tags: string[];
  segments: Segment[];
  status: "ready" | "needs-attention";
  createdAt: string;
  updatedAt: string;
  version: number;
  sourceUrl?: string;
  hasAsset?: boolean;
  sample?: boolean;
  error?: string;
};
export type Edge = {
  source: string;
  target: string;
  weight: number;
  semantic: number;
  lexical: number;
  explicit: boolean;
  sharedTags: string[];
  basis: "semantic" | "lexical";
};
export type SearchResult = {
  itemId: string;
  segmentId: string;
  score: number;
  discovery: "direct" | "graph";
  path: string[];
  edges: Edge[];
};
export type SearchResponse = {
  results: SearchResult[];
  edges: Edge[];
  mode: "semantic + keyword + graph" | "keyword + graph";
  expanded: number;
  scored: number;
  elapsedMs: number;
};

const stopWords = new Set(
  "a an the and or of to in is it for on with how what why where did i my do does can are was this that from as be by at your about me find explain".split(
    " ",
  ),
);
export function tokens(text: string): string[] {
  return (
    text
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((t) => t.length > 1 && !stopWords.has(t)) ?? []
  );
}
export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  const dot = a.reduce((s, x, i) => s + x * b[i], 0);
  const norm = Math.hypot(...a) * Math.hypot(...b);
  return norm ? Math.max(0, Math.min(1, dot / norm)) : 0;
}
function lexical(a: string, b: string) {
  const aa = new Set(tokens(a));
  const bb = new Set(tokens(b));
  const shared = [...aa].filter((t) => bb.has(t)).length;
  return aa.size && bb.size ? shared / Math.sqrt(aa.size * bb.size) : 0;
}
function noteVector(item: KnowledgeItem) {
  const segments = item.segments.filter((s) => s.embedding?.length);
  if (!segments.length) return undefined;
  const model = segments[0].embeddingModel;
  const vectors = segments.filter(
    (s) =>
      s.embeddingModel === model &&
      s.embedding!.length === segments[0].embedding!.length,
  );
  return {
    model,
    vector: vectors[0].embedding!.map(
      (_, i) =>
        vectors.reduce((sum, s) => sum + s.embedding![i], 0) / vectors.length,
    ),
  };
}
export function buildGraph(items: KnowledgeItem[]): Edge[] {
  const vectors = new Map(items.map((i) => [i.id, noteVector(i)]));
  const edges: Edge[] = [];
  for (let a = 0; a < items.length; a++)
    for (let b = a + 1; b < items.length; b++) {
      const first = items[a],
        second = items[b];
      if (first.status !== "ready" || second.status !== "ready") continue;
      const av = vectors.get(first.id),
        bv = vectors.get(second.id);
      const semantic =
        av && bv && av.model === bv.model ? cosine(av.vector, bv.vector) : 0;
      const basis = av && bv && av.model === bv.model ? "semantic" : "lexical";
      const overlap = lexical(
        `${first.title} ${first.content}`,
        `${second.title} ${second.content}`,
      );
      const explicit =
        first.content
          .toLowerCase()
          .includes(`[[${second.title.toLowerCase()}]]`) ||
        second.content
          .toLowerCase()
          .includes(`[[${first.title.toLowerCase()}]]`);
      const sharedTags = first.tags.filter((t) => second.tags.includes(t));
      const union = new Set([...first.tags, ...second.tags]).size;
      const weight =
        0.65 * (basis === "semantic" ? semantic : overlap) +
        0.25 * Number(explicit) +
        0.1 * (union ? sharedTags.length / union : 0);
      if (weight >= 0.09 || explicit)
        edges.push({
          source: first.id,
          target: second.id,
          weight,
          semantic,
          lexical: overlap,
          explicit,
          sharedTags,
          basis,
        });
    }
  return edges.sort((a, b) => b.weight - a.weight);
}
export function searchKnowledge(
  items: KnowledgeItem[],
  query: string,
  queryVector?: { vector: number[]; model: string },
): SearchResponse {
  const started = performance.now();
  const edges = buildGraph(items);
  const queryTokens = tokens(query);
  const hasSemantic = Boolean(
    queryVector &&
    items.some((i) =>
      i.segments.some(
        (s) =>
          s.embeddingModel === queryVector.model &&
          s.embedding?.length === queryVector.vector.length,
      ),
    ),
  );
  const ranked = items
    .filter((i) => i.status === "ready")
    .map((item) => {
      const segments = item.segments.length
        ? item.segments
        : [
            {
              id: "content",
              text: item.content,
              kind: "text" as const,
              locator: {},
            },
          ];
      const matches = segments
        .map((segment) => {
          const text =
            `${item.title} ${item.tags.join(" ")} ${segment.text}`.toLowerCase();
          const key = queryTokens.length
            ? queryTokens.filter((t) => tokens(text).includes(t)).length /
              queryTokens.length
            : 0;
          const compatible =
            queryVector &&
            segment.embeddingModel === queryVector.model &&
            segment.embedding?.length === queryVector.vector.length;
          const sem = compatible
            ? cosine(queryVector.vector, segment.embedding!)
            : 0;
          return {
            segmentId: segment.id,
            score: compatible ? 0.75 * sem + 0.25 * key : key,
          };
        })
        .sort((a, b) => b.score - a.score);
      return { itemId: item.id, ...matches[0] };
    })
    .sort((a, b) => b.score - a.score);
  const direct = ranked.filter((r) => r.score >= (hasSemantic ? 0.35 : 0.15));
  const results = new Map<string, SearchResult>(
    direct.map((r) => [
      r.itemId,
      { ...r, discovery: "direct", path: [r.itemId], edges: [] },
    ]),
  );
  const queue = direct
    .slice(0, 5)
    .map((r) => ({
      id: r.itemId,
      path: [r.itemId],
      edges: [] as Edge[],
      strength: 1,
      priority: r.score,
    }));
  let expanded = 0,
    scored = 0;
  const best = new Map<string, number>();
  while (queue.length && expanded < 40 && scored < 200) {
    queue.sort((a, b) => b.priority - a.priority);
    const current = queue.shift()!;
    if (
      current.path.length > 2 ||
      (best.get(current.id) ?? -1) >= current.priority
    )
      continue;
    best.set(current.id, current.priority);
    expanded++;
    const neighbors = edges
      .filter((e) => e.source === current.id || e.target === current.id)
      .slice(0, 15);
    for (const edge of neighbors) {
      if (scored >= 200) break;
      const id = edge.source === current.id ? edge.target : edge.source;
      if (current.path.includes(id)) continue;
      scored++;
      const relevance = ranked.find((r) => r.itemId === id)!;
      const strength = current.strength * edge.weight;
      const path = [...current.path, id],
        pathEdges = [...current.edges, edge];
      const score =
        (0.15 + 0.85 * relevance.score) * strength * 0.8 ** (path.length - 1);
      const existing = results.get(id);
      if (
        !existing ||
        (existing.discovery === "graph" && score > existing.score)
      )
        results.set(id, {
          ...relevance,
          score,
          discovery: "graph",
          path,
          edges: pathEdges,
        });
      queue.push({ id, path, edges: pathEdges, strength, priority: score });
    }
  }
  return {
    results: [...results.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 20),
    edges,
    mode: hasSemantic ? "semantic + keyword + graph" : "keyword + graph",
    expanded,
    scored,
    elapsedMs: Math.round(performance.now() - started),
  };
}
export function segmentText(text: string): Segment[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length && chunks.length < 24) {
    let end = Math.min(2500, remaining.length);
    if (end < remaining.length) {
      const boundary = remaining.slice(0, end).search(/\s+\S*$/);
      if (boundary > 1250) end = boundary;
    }
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  return chunks
    .filter((t) => t.trim())
    .slice(0, 24)
    .map((text, i) => ({
      id: `segment-${i}`,
      text: text.trim(),
      kind: "text",
      locator: { section: `Passage ${i + 1}` },
    }));
}
export function locationLabel(segment?: Segment): string {
  if (!segment) return "Source excerpt";
  if (segment.locator.page) return `Page ${segment.locator.page}`;
  if (segment.locator.start !== undefined) {
    const seconds = Math.floor(segment.locator.start);
    return `${Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  }
  return (
    segment.locator.section ||
    (segment.kind === "description" ? "Visual description" : "Source excerpt")
  );
}
