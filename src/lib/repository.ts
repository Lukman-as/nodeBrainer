import "server-only";
import { getDatabase } from "./database";
import { PostgresStore } from "./postgres-store";
import type { KnowledgeItem } from "./knowledge";
const store = () => new PostgresStore(getDatabase());
export const listItems = (owner: string) => store().listItems(owner);
export const getItem = (owner: string, id: string) => store().getItem(owner, id);
export const getAsset = (owner: string, id: string) => store().getAsset(owner, id);
export const deleteItem = (owner: string, id: string) => store().deleteItem(owner, id);
export const insertItem = (...args: Parameters<PostgresStore["insertItem"]>) => store().insertItem(...args);
export const updateNote = (...args: Parameters<PostgresStore["updateNote"]>) => store().updateNote(...args);
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
