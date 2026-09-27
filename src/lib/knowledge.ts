export type ItemType = "note" | "pdf" | "image" | "link" | "video";
export type Segment = {
  id: string;
  text: string;
  kind: "text" | "transcript" | "description";
  locator: { page?: number; start?: number; end?: number; section?: string };
  embedding?: number[];
  embeddingModel?: string;
  embeddingVersion?: number;
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
  graphEmbedding?: { vector: number[]; model: string; version: number } | null;
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
  evidence?: string;
};
export type SearchResult = {
  itemId: string;
  segmentId: string;
  score: number;
  discovery: "direct" | "graph";
  passages?: { segmentId: string; score: number }[];
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
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((t) => t.length > 1 && !stopWords.has(t))
    .map((t) =>
      t.length > 4 && t.endsWith("ies")
        ? t.slice(0, -3) + "y"
        : t.length > 4 && t.endsWith("s") && !t.endsWith("ss")
          ? t.slice(0, -1)
          : t,
    )
    .map((t) => t.slice(0, 7));
}
const clamp = (n: number) =>
  Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
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
  return aa && bb ? clamp(dot / Math.sqrt(aa * bb)) : 0;
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
  if (item.graphEmbedding)
    return {
      ...item.graphEmbedding,
      space: `similarity:${item.graphEmbedding.version}`,
    };
  const first = item.segments.find(
    (s) => s.embedding?.length && s.embeddingModel,
  );
  if (!first) return undefined;
  const vectors = item.segments.filter(
    (s) =>
      s.embeddingModel === first.embeddingModel &&
      s.embeddingVersion === first.embeddingVersion &&
      s.embedding?.length === first.embedding!.length,
  );
  const vector = first.embedding!.map(
    (_, i) =>
      vectors.reduce((sum, s) => sum + s.embedding![i], 0) / vectors.length,
  );
  return {
    model: first.embeddingModel,
    vector,
    space: `retrieval:${first.embeddingVersion ?? 0}`,
  };
}
function frequencies(words: string[]) {
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  return counts;
}
function weightedWords(item: KnowledgeItem, text: string) {
  const counts = frequencies(tokens(text));
  for (const word of tokens(item.title))
    counts.set(word, (counts.get(word) ?? 0) + 3);
  for (const word of tokens(item.tags.join(" ")))
    counts.set(word, (counts.get(word) ?? 0) + 2);
  return counts;
}
/** Suppress the background similarity of embeddings. Strength is a ranking signal, not a probability. */
export function semanticStrength(similarity: number) {
  return clamp((similarity - 0.4) / 0.6);
}
export function buildGraph(items: KnowledgeItem[]): Edge[] {
  const ready = items.filter((i) => i.status === "ready");
  const vectors = new Map(ready.map((i) => [i.id, noteVector(i)]));
  const terms = termVectors(ready);
  const edges: Edge[] = [];
  for (let a = 0; a < ready.length; a++)
    for (let b = a + 1; b < ready.length; b++) {
      const first = ready[a],
        second = ready[b],
        av = vectors.get(first.id),
        bv = vectors.get(second.id);
      const compatible = Boolean(
        av &&
        bv &&
        av.model === bv.model &&
        av.space === bv.space &&
        av.vector.length === bv.vector.length,
      );
      const semantic = compatible ? cosine(av!.vector, bv!.vector) : 0;
      const overlap = textSimilarity(sparseDot(terms[a], terms[b]));
      const explicit =
        first.content
          .toLowerCase()
          .includes(`[[${second.title.toLowerCase()}]]`) ||
        second.content
          .toLowerCase()
          .includes(`[[${first.title.toLowerCase()}]]`);
      const tagsA = new Set(first.tags.map((t) => t.toLowerCase())),
        tagsB = new Set(second.tags.map((t) => t.toLowerCase()));
      const sharedTags = [...tagsA].filter((t) => tagsB.has(t));
      const union = new Set([...tagsA, ...tagsB]).size;
      const symmetric = compatible && av!.space.startsWith("similarity:");
      // Existing retrieval vectors keep the upstream calibration; the new
      // symmetric index uses its own similarity scale.
      const base = compatible
        ? symmetric
          ? semanticStrength(semantic)
          : Math.sqrt(noteSimilarity(semantic) * overlap)
        : overlap;
      const weight = symmetric
        ? clamp(
            1 -
              (1 - base) *
                (1 - 0.8 * Number(explicit)) *
                (1 - 0.15 * (union ? sharedTags.length / union : 0)),
          )
        : explicit
          ? 1 - (1 - base) * 0.4
          : base;
      if (
        explicit ||
        (symmetric ? semantic >= 0.52 || sharedTags.length > 0 : weight >= 0.15)
      )
        edges.push({
          source: first.id,
          target: second.id,
          weight,
          semantic,
          lexical: overlap,
          explicit,
          sharedTags,
          basis: compatible ? "semantic" : "lexical",
          evidence: `${compatible ? `Meaning similarity ${semantic.toFixed(2)}; normalized strength ${base.toFixed(2)}` : `Title-aware text similarity ${overlap.toFixed(2)}; semantic index missing`}${explicit ? "; explicit link" : ""}${sharedTags.length ? "; shared topics: " + sharedTags.join(", ") : ""}. Strength is not an accuracy probability.`,
        });
    }
  return edges.sort((a, b) => b.weight - a.weight);
}
export function searchKnowledge(
  items: KnowledgeItem[],
  query: string,
  queryVector?: { vector: number[]; model: string; version?: number },
): SearchResponse {
  const started = performance.now(),
    edges = buildGraph(items);
  const terms = [...new Set(tokens(query))];
  const candidates = items
    .filter((i) => i.status === "ready")
    .flatMap((item) =>
      (item.segments.length
        ? item.segments
        : [
            {
              id: "content",
              text: item.content,
              kind: "text" as const,
              locator: {},
            },
          ]
      ).map((segment) => ({
        item,
        segment,
        tf: weightedWords(item, segment.text),
        length: Math.max(1, tokens(segment.text).length),
      })),
    );
  const average =
    candidates.reduce((n, c) => n + c.length, 0) /
    Math.max(1, candidates.length);
  const df = new Map(
    terms.map((t) => [t, candidates.filter((c) => c.tf.has(t)).length]),
  );
  const byItem = new Map<
    string,
    { segmentId: string; score: number; eligible: boolean }[]
  >();
  let hasSemantic = false;
  for (const candidate of candidates) {
    let bm25 = 0;
    for (const term of terms) {
      const tf = candidate.tf.get(term) ?? 0;
      const idf = Math.log(
        1 +
          (candidates.length - (df.get(term) ?? 0) + 0.5) /
            ((df.get(term) ?? 0) + 0.5),
      );
      bm25 +=
        (idf * (tf * 2.2)) /
        (tf + 1.2 * (0.25 + (0.75 * candidate.length) / average));
    }
    const keyword = 1 - Math.exp(-bm25 / 2);
    const s = candidate.segment;
    const compatible = Boolean(
      queryVector &&
      s.embeddingModel === queryVector.model &&
      (s.embeddingVersion ?? 0) === (queryVector.version ?? 0) &&
      s.embedding?.length === queryVector.vector.length,
    );
    hasSemantic ||= compatible;
    const sem = compatible ? cosine(queryVector!.vector, s.embedding!) : 0;
    const meaning = queryVector?.version
      ? clamp((sem - 0.3) / 0.7)
      : querySimilarity(sem);
    // Preserve exact/rare matches even if a document's semantic representation is weak.
    const score = compatible
      ? Math.max(0.85 * keyword, 0.7 * meaning + 0.3 * keyword)
      : keyword;
    const matches = byItem.get(candidate.item.id) ?? [];
    matches.push({
      segmentId: s.id,
      score,
      eligible: bm25 > 0 || (compatible && sem >= 0.55),
    });
    byItem.set(candidate.item.id, matches);
  }
  const ranked = [...byItem]
    .map(([itemId, matches]) => {
      matches.sort((a, b) => b.score - a.score);
      return {
        itemId,
        ...matches[0],
        passages: matches
          .filter((m) => m.eligible && m.score >= 0.12)
          .slice(0, 3)
          .map(({ segmentId, score }) => ({ segmentId, score })),
      };
    })
    .sort((a, b) => b.score - a.score);
  const rankedById = new Map(ranked.map((r) => [r.itemId, r]));
  const direct = ranked.filter((r) => r.eligible && r.score >= 0.12);
  const results = new Map<string, SearchResult>(
    direct.map(({ eligible: _, ...r }) => [
      r.itemId,
      { ...r, discovery: "direct", path: [r.itemId], edges: [] },
    ]),
  );
  const adjacency = new Map<string, Edge[]>();
  for (const edge of edges)
    for (const id of [edge.source, edge.target]) {
      const list = adjacency.get(id) ?? [];
      list.push(edge);
      adjacency.set(id, list);
    }
  const queue = direct.slice(0, 5).map((r) => ({
    id: r.itemId,
    path: [r.itemId],
    edges: [] as Edge[],
    strength: 1,
    priority: r.score,
    seed: r.score,
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
    for (const edge of (adjacency.get(current.id) ?? []).slice(0, 15)) {
      if (scored >= 200) break;
      const id = edge.source === current.id ? edge.target : edge.source;
      if (current.path.includes(id)) continue;
      scored++;
      const relevance = rankedById.get(id);
      if (!relevance) continue;
      if (!edge.explicit && edge.weight < 0.3) continue;
      const strength = current.strength * edge.weight;
      const path = [...current.path, id],
        pathEdges = [...current.edges, edge];
      const score =
        current.seed *
        (0.35 + 0.65 * relevance.score) *
        strength *
        0.8 ** (path.length - 1);
      if (score < 0.035) continue;
      const existing = results.get(id);
      if (
        !existing ||
        (existing.discovery === "graph" && score > existing.score)
      )
        results.set(id, {
          itemId: id,
          segmentId: relevance.segmentId,
          passages: relevance.passages,
          score,
          discovery: "graph",
          path,
          edges: pathEdges,
        });
      queue.push({
        id,
        path,
        edges: pathEdges,
        strength,
        priority: score,
        seed: current.seed,
      });
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
