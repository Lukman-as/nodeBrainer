import type { Pool } from "pg";
import type { KnowledgeItem } from "./knowledge";
import { ApiError } from "./api-error";

/** All operations require the Auth0 subject; callers must never accept ownership from input. */
export class PostgresStore {
  constructor(private pool: Pool) {}
  async listItems(ownerId: string): Promise<KnowledgeItem[]> {
    const result = await this.pool.query<{ document: KnowledgeItem }>(
      "SELECT document FROM knowledge_items WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 200",
      [ownerId],
    );
    return result.rows.map((row) => row.document);
  }
  async getItem(
    ownerId: string,
    id: string,
  ): Promise<KnowledgeItem | undefined> {
    const result = await this.pool.query<{ document: KnowledgeItem }>(
      "SELECT document FROM knowledge_items WHERE owner_id = $1 AND id = $2",
      [ownerId, id],
    );
    return result.rows[0]?.document;
  }
  async getAsset(ownerId: string, id: string) {
    // `asset` holds bytes from before files moved to object storage.
    const result = await this.pool.query<{
      asset_path: string | null;
      asset: Buffer | null;
      mime: string | null;
    }>(
      "SELECT asset_path, asset, mime FROM knowledge_items WHERE owner_id = $1 AND id = $2",
      [ownerId, id],
    );
    return result.rows[0];
  }
  async insertItem(
    ownerId: string,
    item: KnowledgeItem,
    asset?: { path: string; mime: string } | { buffer: Buffer; mime: string },
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize concurrent inserts for an owner so the library cap cannot be raced.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [ownerId],
      );
      const count = await client.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM knowledge_items WHERE owner_id = $1",
        [ownerId],
      );
      if (count.rows[0].count >= 200)
        throw new ApiError(
          409,
          "This prototype supports 200 items per library. Export or remove an item before adding another.",
        );
      await client.query(
        "INSERT INTO knowledge_items (owner_id, id, document, created_at, asset_path, mime, asset) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)",
        [
          ownerId,
          item.id,
          JSON.stringify({ ...item, hasAsset: Boolean(asset) }),
          item.createdAt,
          asset && "path" in asset ? asset.path : null,
          asset?.mime ?? null,
          asset && "buffer" in asset ? asset.buffer : null,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async updateNote(
    ownerId: string,
    id: string,
    version: number,
    update: Pick<
      KnowledgeItem,
      "title" | "content" | "tags" | "segments" | "updatedAt" | "graphEmbedding"
    >,
  ): Promise<KnowledgeItem | undefined> {
    const result = await this.pool.query<{ document: KnowledgeItem }>(
      `UPDATE knowledge_items SET document = document || $4::jsonb
       WHERE owner_id = $1 AND id = $2 AND (document->>'version')::integer = $3
       AND document->>'type' = 'note' RETURNING document`,
      [
        ownerId,
        id,
        version,
        JSON.stringify({ ...update, version: version + 1 }),
      ],
    );
    return result.rows[0]?.document;
  }
  async saveIndex(
    ownerId: string,
    item: KnowledgeItem,
    segments: KnowledgeItem["segments"],
    graphEmbedding: NonNullable<KnowledgeItem["graphEmbedding"]>,
  ) {
    const result = await this.pool.query(
      `UPDATE knowledge_items SET document = document || $4::jsonb
       WHERE owner_id = $1 AND id = $2 AND (document->>'version')::integer = $3`,
      [
        ownerId,
        item.id,
        item.version,
        JSON.stringify({ segments, graphEmbedding }),
      ],
    );
    return Boolean(result.rowCount);
  }
  async deleteItem(ownerId: string, id: string) {
    const result = await this.pool.query<{ asset_path: string | null }>(
      "DELETE FROM knowledge_items WHERE owner_id = $1 AND id = $2 RETURNING asset_path",
      [ownerId, id],
    );
    return result.rows[0];
  }
  async limitExpensiveRequests(ownerId: string) {
    // PostgreSQL has no MongoDB TTL index: expired windows are cleaned up on requests.
    await this.pool.query(
      "DELETE FROM request_limits WHERE expires_at < now()",
    );
    const result = await this.pool.query<{ count: number }>(
      `INSERT INTO request_limits (owner_id, window_id, count, expires_at)
       VALUES ($1, floor(extract(epoch FROM now()) / 60)::bigint, 1, now() + interval '2 minutes')
       ON CONFLICT (owner_id, window_id) DO UPDATE SET count = request_limits.count + 1 RETURNING count`,
      [ownerId],
    );
    if (result.rows[0].count > 20)
      throw new ApiError(
        429,
        "Too many requests. Please wait a minute and try again.",
      );
  }
}
