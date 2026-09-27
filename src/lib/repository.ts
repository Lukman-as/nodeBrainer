import "server-only";
import { getDatabase } from "./database";
import { PostgresStore } from "./postgres-store";
import type { KnowledgeItem } from "./knowledge";
import {
  indexKnowledgeItem,
  isIndexed,
  semanticEnabled,
} from "./semantic-index";
const store = () => new PostgresStore(getDatabase());
export const listItems = (owner: string) => store().listItems(owner);
export const getItem = (owner: string, id: string) =>
  store().getItem(owner, id);
export const getAsset = (owner: string, id: string) =>
  store().getAsset(owner, id);
export const deleteItem = (owner: string, id: string) =>
  store().deleteItem(owner, id);
export const insertItem = (...args: Parameters<PostgresStore["insertItem"]>) =>
  store().insertItem(...args);
export const updateNote = (...args: Parameters<PostgresStore["updateNote"]>) =>
  store().updateNote(...args);
export function withoutVectors(item: KnowledgeItem): KnowledgeItem {
  const { graphEmbedding: _graph, ...publicFields } = item;
  void _graph;
  return {
    ...publicFields,
    segments: item.segments.map((segment) => ({
      id: segment.id,
      text: segment.text,
      kind: segment.kind,
      locator: segment.locator,
    })),
  };
}

export const saveIndex = (...args: Parameters<PostgresStore["saveIndex"]>) =>
  store().saveIndex(...args);

/** Backfill older items using the current semantic index. */
export async function indexMissingEmbeddings(
  owner: string,
  items: KnowledgeItem[],
) {
  if (!semanticEnabled()) return;
  const stale = items
    .filter((item) => item.status === "ready" && !isIndexed(item))
    .slice(0, 20);
  await Promise.all(
    stale.map(async (item) => {
      try {
        const indexed = await indexKnowledgeItem(item);
        if (
          indexed.graphEmbedding &&
          (await saveIndex(
            owner,
            item,
            indexed.segments,
            indexed.graphEmbedding,
          ))
        ) {
          item.segments = indexed.segments;
          item.graphEmbedding = indexed.graphEmbedding;
        }
      } catch {
        console.error(
          "Embedding backfill failed; the item stays on text matching.",
        );
      }
    }),
  );
}
