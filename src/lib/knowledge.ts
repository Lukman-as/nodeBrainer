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
// Crude stemming (drop a plural "s", keep a 7-char prefix) so integral/integrals/integration/integrate match.
// ponytail: prefix stemming over-merges rare pairs (universe/university); swap in a real stemmer if that bites.
const stem = (t: string) => t.replace(/s$/, "").slice(0, 7);
export function tokens(text: string): string[] {
  return (
    text
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((t) => t.length > 1 && !stopWords.has(t))
      .map(stem) ?? []
  );
}
export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  const norm = Math.sqrt(aa * bb);
  return norm ? Math.max(0, Math.min(1, dot / norm)) : 0;
}
// Raw embedding cosine is never near 0. On gemini-embedding-001 (768d) unrelated notes sit at
// ~0.64-0.72 and same-topic notes at ~0.82-0.88; a query scores ~0.50-0.58 against unrelated
// passages and ~0.65-0.75 against relevant ones. Rescale those bands onto 0..1.
// ponytail: bands measured for gemini-embedding-001; re-measure if GEMINI_EMBEDDING_MODEL changes.
const rescale = (x: number, lo: number, hi: number) =>
  Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
const noteSimilarity = (cos: number) => rescale(cos, 0.72, 0.87);
const querySimilarity = (cos: number) => rescale(cos, 0.55, 0.75);
// TF-IDF cosine: unrelated notes measured <= 0.05 (a note on web testing vs Java OOP: 0.000),
// related ones 0.06-0.43.
// ponytail: band measured on small libraries; IDF sharpens as a library grows, re-measure past ~100 items.
const textSimilarity = (cos: number) => rescale(cos, 0.04, 0.3);
/** Unit-length TF-IDF vectors: words most notes share count for little, distinctive shared vocabulary counts a lot. */
function termVectors(items: KnowledgeItem[]) {
  const counts = items.map((item) => {
    const tf = new Map<string, number>();
    const add = (text: string, times: number) => {
      for (const t of tokens(text)) tf.set(t, (tf.get(t) ?? 0) + times);
    };
    add(`${item.title} ${item.tags.join(" ")}`, 3); // title and tags name the topic
    add(item.content, 1);
    return tf;
  });
  const df = new Map<string, number>();
  for (const tf of counts)
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  return counts.map((tf) => {
    let norm = 0;
    for (const [t, n] of tf) {
      const w = (1 + Math.log(n)) * Math.log((1 + items.length) / df.get(t)!);
      tf.set(t, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm);
    for (const [t, w] of tf) tf.set(t, norm ? w / norm : 0);
    return tf;
  });
}
function sparseDot(a: Map<string, number>, b: Map<string, number>) {
  if (a.size > b.size) [a, b] = [b, a];
  let dot = 0;
  for (const [t, w] of a) dot += w * (b.get(t) ?? 0);
  return dot;
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
  const ready = items.filter((i) => i.status === "ready");
  const vectors = ready.map(noteVector);
  const terms = termVectors(ready);
  const links = ready.map((i) => i.content.toLowerCase());
  const edges: Edge[] = [];
  for (let a = 0; a < ready.length; a++)
    for (let b = a + 1; b < ready.length; b++) {
      const first = ready[a],
        second = ready[b];
      const av = vectors[a],
        bv = vectors[b];
      const explicit =
        links[a].includes(`[[${second.title.toLowerCase()}]]`) ||
        links[b].includes(`[[${first.title.toLowerCase()}]]`);
      const basis = av && bv && av.model === bv.model ? "semantic" : "lexical";
      const semantic =
        basis === "semantic"
          ? noteSimilarity(cosine(av!.vector, bv!.vector))
          : 0;
      // Meaning is a hard gate: skip the text comparison for pairs the embeddings call unrelated.
      if (basis === "semantic" && !semantic && !explicit) continue;
      const text = textSimilarity(sparseDot(terms[a], terms[b]));
      // Geometric mean: an edge needs both similar meaning AND shared distinctive wording,
      // so a vague topical echo with no common vocabulary (or the reverse) stays near zero.
      const related =
        basis === "semantic" ? Math.sqrt(semantic * text) : text;
      const weight = explicit ? 1 - (1 - related) * 0.4 : related;
      if (weight >= 0.15 || explicit)
        edges.push({
          source: first.id,
          target: second.id,
          weight,
          semantic,
          lexical: text,
          explicit,
          sharedTags: first.tags.filter((t) => second.tags.includes(t)),
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
  const queryTokens = new Set(tokens(query));
  const coverage = (words: Set<string>) => {
    let hits = 0;
    for (const t of queryTokens) if (words.has(t)) hits++;
    return queryTokens.size ? hits / queryTokens.size : 0;
  };
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
      const heading = new Set(tokens(`${item.title} ${item.tags.join(" ")}`));
      const titleHits = coverage(heading);
      const matches = segments
        .map((segment) => {
          const words = new Set(tokens(segment.text));
          for (const t of heading) words.add(t);
          // A title/tag hit outranks the same word buried in a passage.
          const key = 0.7 * coverage(words) + 0.3 * titleHits;
          const compatible =
            queryVector &&
            segment.embeddingModel === queryVector.model &&
            segment.embedding?.length === queryVector.vector.length;
          const sem = compatible
            ? querySimilarity(cosine(queryVector.vector, segment.embedding!))
            : 0;
          return {
            segmentId: segment.id,
            score: compatible ? 0.7 * sem + 0.3 * key : key,
          };
        })
        .sort((a, b) => b.score - a.score);
      return { itemId: item.id, ...matches[0] };
    })
    .sort((a, b) => b.score - a.score);
  const relevance = new Map(ranked.map((r) => [r.itemId, r]));
  const adjacency = new Map<string, Edge[]>();
  for (const edge of edges)
    for (const id of [edge.source, edge.target]) {
      if (!adjacency.has(id)) adjacency.set(id, []);
      adjacency.get(id)!.push(edge);
    }
  const direct = ranked.filter((r) => r.score >= (hasSemantic ? 0.3 : 0.15));
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
    // Edges are sorted by weight, so each adjacency list is strongest-first.
    const neighbors = (adjacency.get(current.id) ?? []).slice(0, 15);
    for (const edge of neighbors) {
      if (scored >= 200) break;
      const id = edge.source === current.id ? edge.target : edge.source;
      if (current.path.includes(id)) continue;
      scored++;
      const match = relevance.get(id)!;
      const strength = current.strength * edge.weight;
      const path = [...current.path, id],
        pathEdges = [...current.edges, edge];
      const score =
        (0.15 + 0.85 * match.score) * strength * 0.8 ** (path.length - 1);
      const existing = results.get(id);
      if (
        !existing ||
        (existing.discovery === "graph" && score > existing.score)
      )
        results.set(id, {
          ...match,
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
