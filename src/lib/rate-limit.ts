import "server-only";
import { getDatabase } from "./database";
import { PostgresStore } from "./postgres-store";
export async function limitExpensiveRequests(ownerId: string) {
  await new PostgresStore(getDatabase()).limitExpensiveRequests(ownerId);
}
