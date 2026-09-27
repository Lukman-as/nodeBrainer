import "server-only";
import { getDatabase } from "./database";
import { PostgresStore } from "./postgres-store";
import type { KnowledgeItem } from "./knowledge";
import { embedSegments, embeddingModel, embeddingsEnabled } from "./gemini";
const store = () => new PostgresStore(getDatabase());
export const listItems = (owner: string) => store().listItems(owner);
export const getItem = (owner: string, id: string) => store().getItem(owner, id);
export const getAsset = (owner: string, id: string) => store().getAsset(owner, id);
export const deleteItem = (owner: string, id: string) => store().deleteItem(owner, id);
export const insertItem = (...args: Parameters<PostgresStore["insertItem"]>) => store().insertItem(...args);
export const updateNote = (...args: Parameters<PostgresStore["updateNote"]>) => store().updateNote(...args);
/** Embeds items saved while embeddings were off (or under another model) so they join the semantic graph. */
export async function indexMissingEmbeddings(owner: string, items: KnowledgeItem[]) {
  if (!embeddingsEnabled()) return;
  const model = embeddingModel();
  // ponytail: 20 items per page load keeps it fast; a larger backlog finishes over the next loads.
  const stale = items
    .filter((i) => i.status === "ready" && i.segments.some((s) => s.embeddingModel !== model))
    .slice(0, 20);
  await Promise.all(
    stale.map(async (item) => {
      try {
        const segments = await embedSegments(item.segments, item.title);
        await store().setSegments(owner, item.id, item.version, segments);
        item.segments = segments;
      } catch {
        console.error("Embedding backfill failed; the item stays on text matching.");
      }
    }),
  );
}
export function withoutVectors(item: KnowledgeItem): KnowledgeItem {
  return {
    ...item,
    segments: item.segments.map((segment) => ({
      id: segment.id,
      text: segment.text,
      kind: segment.kind,
      locator: segment.locator,
    })),
  };
}
