import "server-only";
import { Pool } from "pg";
import { databaseConfig } from "./database-config.mjs";
const globalForDatabase = globalThis as typeof globalThis & { postgresPool?: Pool };
export function getDatabase() {
  if (!globalForDatabase.postgresPool) {
    const pool = new Pool(databaseConfig());
    pool.on("error", () => console.error("Database pool connection failed."));
    globalForDatabase.postgresPool = pool;
  }
  return globalForDatabase.postgresPool;
}
