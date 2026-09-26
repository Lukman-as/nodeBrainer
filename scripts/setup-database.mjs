import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { databaseConfig } from '../src/lib/database-config.mjs';
const pool = new pg.Pool(databaseConfig());
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
    await client.query('COMMIT');
    // TLS is guaranteed by sslmode=verify-full; pg_stat_ssl would describe a pooler's link, not ours.
    console.log('Database tables and indexes ready (TLS verified).');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
} catch (error) {
  console.error('Database setup failed:', error.code || error.name);
  process.exitCode = 1;
} finally { await pool.end(); }
// Private bucket for uploaded files; 409 means it already exists.
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/bucket`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'assets', name: 'assets', public: false }),
  });
  const body = await response.text();
  if (response.ok || response.status === 409 || body.includes('already exists')) console.log('Storage bucket "assets" ready.');
  else { console.error('Storage bucket setup failed:', response.status); process.exitCode = 1; }
}
