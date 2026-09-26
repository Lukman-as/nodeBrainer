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
    const { rows } = await client.query('SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()');
    console.log(`Tiger Data tables and indexes ready. TLS: ${rows[0]?.ssl ? 'enabled' : 'not enabled'}.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
} catch (error) {
  console.error('Database setup failed:', error.code || error.name);
  process.exitCode = 1;
} finally { await pool.end(); }
