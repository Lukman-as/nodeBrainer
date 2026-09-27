import type { KnowledgeItem, Segment } from "./knowledge";
import { GeminiTransport } from "./gemini-transport";
import { ApiError } from "./api-error";

export const EMBEDDING_VERSION = 2;
const transport = new GeminiTransport();
export const embeddingModel = () =>
  process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
export const semanticEnabled = () =>
  Boolean(
    process.env.GEMINI_API_KEY &&
    process.env.ENABLE_GEMINI_EMBEDDINGS === "true",
  );
function vector(values: unknown): number[] {
  if (
    !Array.isArray(values) ||
    values.length !== 768 ||
    !values.every((v) => typeof v === "number" && Number.isFinite(v))
  )
    throw new ApiError(502, "Embedding service returned an invalid vector.");
  const norm = Math.hypot(...values);
  if (!norm)
    throw new ApiError(502, "Embedding service returned an empty vector.");
  return values.map((v) => v / norm);
}
async function batch(requests: object[]) {
  const name = embeddingModel();
  if (name !== "gemini-embedding-001")
    throw new ApiError(
      503,
      "This semantic index requires gemini-embedding-001. Changing embedding models requires a compatible indexing adapter and reindex.",
    );
  const result = await transport.call(
    process.env.GEMINI_API_KEY!,
    [name],
    "batchEmbedContents",
    { requests },
    30000,
  );
  if (
    !Array.isArray(result.embeddings) ||
    result.embeddings.length !== requests.length
  )
    throw new ApiError(
      502,
      "Embedding response was incomplete. Retry semantic indexing.",
    );
  return result.embeddings.map((entry: { values: unknown }) =>
    vector(entry.values),
  );
}
function embeddingRequest(text: string, taskType: string, title?: string) {
  return {
    model: `models/${embeddingModel()}`,
    content: { parts: [{ text }] },
    outputDimensionality: 768,
    taskType,
    ...(title ? { title } : {}),
  };
}
export function isIndexed(item: KnowledgeItem) {
  const graph = item.graphEmbedding;
  return (
    graph?.model === embeddingModel() &&
    graph.version === EMBEDDING_VERSION &&
    item.segments.length > 0 &&
    item.segments.every(
      (s) =>
        s.embeddingModel === embeddingModel() &&
        s.embeddingVersion === EMBEDDING_VERSION &&
        s.embedding?.length === 768,
    )
  );
}
export async function indexKnowledgeItem(
  item: KnowledgeItem,
): Promise<KnowledgeItem> {
  if (!semanticEnabled()) return item;
  const overview =
    `Title: ${item.title}\nTopics: ${item.tags.join(", ")}\n` +
    item.segments
      .map((s) =>
        s.text.slice(0, Math.floor(6000 / Math.max(item.segments.length, 1))),
      )
      .join("\n");
  const vectors = await batch([
    // Symmetric task for item-to-item relationships, separate from retrieval embeddings.
    embeddingRequest(overview, "SEMANTIC_SIMILARITY"),
    ...item.segments.map((s) =>
      embeddingRequest(s.text.slice(0, 5000), "RETRIEVAL_DOCUMENT", item.title),
    ),
  ]);
  return {
    ...item,
    graphEmbedding: {
      vector: vectors[0],
      model: embeddingModel(),
      version: EMBEDDING_VERSION,
    },
    segments: item.segments.map((s, i) => ({
      ...s,
      embedding: vectors[i + 1],
      embeddingModel: embeddingModel(),
      embeddingVersion: EMBEDDING_VERSION,
    })),
  };
}
// Query cache is process-local, bounded and short lived; it contains no retrieved user data.
const queries = new Map<
  string,
  {
    expires: number;
    value: { vector: number[]; model: string; version: number };
  }
>();
export async function embedQuery(query: string) {
  if (!semanticEnabled()) return undefined;
  const key = `${embeddingModel()}:${query.trim()}`;
  const cached = queries.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const vectors = await batch([embeddingRequest(query, "RETRIEVAL_QUERY")]);
  const value = {
    vector: vectors[0],
    model: embeddingModel(),
    version: EMBEDDING_VERSION,
  };
  if (queries.size >= 100) queries.delete(queries.keys().next().value!);
  queries.set(key, { value, expires: Date.now() + 60000 });
  return value;
}
export async function reindexItems(
  items: KnowledgeItem[],
  save: (
    item: KnowledgeItem,
    segments: Segment[],
    graph: NonNullable<KnowledgeItem["graphEmbedding"]>,
  ) => Promise<boolean>,
  maximum = 5,
) {
  const pending = items.filter(
    (item) => item.status === "ready" && !isIndexed(item),
  );
  let updated = 0;
  for (const item of pending.slice(0, maximum)) {
    const indexed = await indexKnowledgeItem(item);
    if (
      indexed.graphEmbedding &&
      (await save(item, indexed.segments, indexed.graphEmbedding))
    )
      updated++;
  }
  return { updated, remaining: pending.length - updated };
}
