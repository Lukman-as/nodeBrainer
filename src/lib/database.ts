import "server-only";
import { Pool } from "pg";
import { databaseConfig } from "./database-config.mjs";
const globalForDatabase = globalThis as typeof globalThis & {
  postgresPool?: Pool;
  postgresConnectionString?: string;
};
export function getDatabase() {
  const config = databaseConfig();
  if (
    !globalForDatabase.postgresPool ||
    globalForDatabase.postgresConnectionString !== config.connectionString
  ) {
    const previous = globalForDatabase.postgresPool;
    const pool = new Pool(config);
    pool.on("error", () => console.error("Database pool connection failed."));
    globalForDatabase.postgresPool = pool;
    globalForDatabase.postgresConnectionString = config.connectionString;
    if (previous) void previous.end().catch(() => {});
  }
  return globalForDatabase.postgresPool;
}
