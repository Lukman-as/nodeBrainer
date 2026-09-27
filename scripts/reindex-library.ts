import pg from "pg";
import { databaseConfig } from "../src/lib/database-config.mjs";
import { PostgresStore } from "../src/lib/postgres-store";
import { reindexItems, semanticEnabled } from "../src/lib/semantic-index";
const title = process.argv[2];
if (!title || !semanticEnabled())
  throw new Error(
    "Enable embeddings and supply an exact item title to identify one account.",
  );
const pool = new pg.Pool(databaseConfig());
try {
  const found = await pool.query<{ owner_id: string }>(
    "SELECT DISTINCT owner_id FROM knowledge_items WHERE document->>'title' = $1",
    [title],
  );
  if (found.rows.length !== 1)
    throw new Error(
      "Title must identify exactly one account. No data changed.",
    );
  const owner = found.rows[0].owner_id;
  const store = new PostgresStore(pool);
  const result = await reindexItems(
    await store.listItems(owner),
    (item, segments, graph) => store.saveIndex(owner, item, segments, graph),
    200,
  );
  console.log("Semantic indexing:", result);
} catch (error) {
  console.error(
    "Indexing failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
