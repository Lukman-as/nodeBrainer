import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PostgresStore } from "../src/lib/postgres-store";
import type { KnowledgeItem } from "../src/lib/knowledge";

test(
  "database stores private assets and enforces ownership and note versions",
  {
    skip: process.env.RUN_DATABASE_TESTS !== "true",
  },
  async () => {
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set("sslmode", "verify-full");
    const pool = new Pool({
      connectionString: url.toString(),
      max: 2,
      connectionTimeoutMillis: 10000,
    });
    const store = new PostgresStore(pool);
    const owner = `integration-test:${randomUUID()}`;
    const outsider = `${owner}:other`;
    const now = new Date().toISOString();
    const item: KnowledgeItem = {
      id: randomUUID(),
      title: "Temporary integration fixture",
      type: "note",
      content: "Synthetic fixture, no user content",
      tags: [],
      segments: [],
      status: "ready",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    // Exceeds the former 3 MiB limit; validates the upgraded fallback constraint.
    const bytes = Buffer.alloc(4 * 1024 * 1024, 65);
    try {
      await store.insertItem(owner, item, {
        buffer: bytes,
        mime: "application/octet-stream",
      });
      assert.equal((await store.listItems(owner))[0].hasAsset, true);
      assert.deepEqual(await store.listItems(outsider), []);
      assert.equal(await store.getAsset(outsider, item.id), undefined);
      const asset = await store.getAsset(owner, item.id);
      assert.deepEqual(asset.asset, bytes);
      assert.equal(asset.asset_path, null);
      const update = {
        title: "Updated fixture",
        content: item.content,
        tags: [],
        segments: [],
        updatedAt: now,
      };
      assert.equal(
        await store.updateNote(outsider, item.id, 1, update),
        undefined,
      );
      assert.equal(
        (await store.updateNote(owner, item.id, 1, update))?.version,
        2,
      );
      assert.equal(
        await store.updateNote(owner, item.id, 1, update),
        undefined,
      );
      assert.equal(await store.deleteItem(outsider, item.id), undefined);
      assert.ok(await store.deleteItem(owner, item.id));
      assert.equal(await store.getAsset(owner, item.id), undefined);
    } finally {
      await pool.query("DELETE FROM knowledge_items WHERE owner_id = $1", [
        owner,
      ]);
      await pool.end();
    }
  },
);
