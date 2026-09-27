// Copies the 100 mock notes (the /?mock library) into one account's real library, or removes them.
//   npm run db:seed-mock -- <auth0-user-id>            e.g. google-oauth2|1234567890
//   npm run db:seed-mock -- <auth0-user-id> --remove
// On Windows, npm mangles the "|" in the id; call node directly (see the error message below).
// Mock notes keep their "mock-" ids and sample flag, so re-running is a no-op and --remove only touches them.
import { createRequire } from "node:module";
import pg from "pg";
import { databaseConfig } from "../src/lib/database-config.mjs";

const require = createRequire(import.meta.url);
const { mockItems } = require("../.test-build/src/lib/mock-data.js");
const [owner, flag] = process.argv.slice(2);
// Auth0 ids look like provider|id. npm on Windows runs scripts through cmd.exe, which can turn "|" into "^|".
if (!/^[\w-]+\|[\w.-]+$/.test(owner ?? ""))
  throw new Error(
    'Pass the Auth0 user id (the `sub`, e.g. google-oauth2|123...) as the first argument. On Windows, run: npx tsc -p tsconfig.test.json && node --env-file=.env scripts/seed-mock.mjs "<id>"',
  );

const pool = new pg.Pool(databaseConfig());
try {
  if (flag === "--remove") {
    const { rowCount } = await pool.query(
      "DELETE FROM knowledge_items WHERE owner_id = $1 AND id LIKE 'mock-%' AND (document->>'sample')::boolean",
      [owner],
    );
    console.log(`Removed ${rowCount} mock notes.`);
  } else {
    const items = await embed(mockItems);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Same per-owner lock and 200-item cap as the app's insert path.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [owner],
      );
      const { rows } = await client.query(
        "SELECT count(*)::int AS n, count(*) FILTER (WHERE id LIKE 'mock-%')::int AS mock FROM knowledge_items WHERE owner_id = $1",
        [owner],
      );
      const adding = items.length - rows[0].mock;
      if (rows[0].n + adding > 200)
        throw new Error(
          `This library has ${rows[0].n} items; adding ${adding} would pass the 200-item limit.`,
        );
      let inserted = 0;
      for (const item of items) {
        const result = await client.query(
          "INSERT INTO knowledge_items (owner_id, id, document, created_at) VALUES ($1, $2, $3::jsonb, $4) ON CONFLICT (owner_id, id) DO NOTHING",
          [
            owner,
            item.id,
            JSON.stringify({ ...item, hasAsset: false }),
            item.createdAt,
          ],
        );
        inserted += result.rowCount;
      }
      await client.query("COMMIT");
      console.log(
        `Added ${inserted} mock notes (${items.length - inserted} were already there).`,
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}

/** Embeds each passage the way the app does, so the notes join the semantic graph immediately. */
async function embed(items) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || process.env.ENABLE_GEMINI_EMBEDDINGS !== "true") {
    console.log(
      "Embeddings are off; notes will be embedded on later library loads.",
    );
    return items;
  }
  const model = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
  const passages = items.flatMap((item) =>
    item.segments.map((segment) => ({ item, segment })),
  );
  for (let i = 0; i < passages.length; i += 100) {
    const batch = passages.slice(i, i + 100);
    // Each passage counts against the per-minute quota; on 429 wait out the window and retry.
    for (let attempt = 1; ; attempt++) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            requests: batch.map(({ item, segment }) => ({
              model: `models/${model}`,
              content: {
                parts: [
                  { text: `${item.title}\n\n${segment.text}`.slice(0, 5000) },
                ],
              },
              outputDimensionality: 768,
              ...(model === "gemini-embedding-001"
                ? { taskType: "RETRIEVAL_DOCUMENT" }
                : {}),
            })),
          }),
        },
      );
      const data = await response.json();
      if (response.status === 429 && attempt < 4) {
        console.log("Gemini rate limit reached; retrying in 65s...");
        await new Promise((resolve) => setTimeout(resolve, 65_000));
        continue;
      }
      if (!response.ok || data.embeddings?.length !== batch.length)
        throw new Error(
          `Embedding failed (${response.status}); nothing was inserted.`,
        );
      batch.forEach(({ segment }, j) => {
        segment.embedding = data.embeddings[j].values;
        segment.embeddingModel = model;
      });
      break;
    }
  }
  return items;
}
