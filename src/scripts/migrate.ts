import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createPool } from '../config/database.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Missing required environment variable DATABASE_URL');

const dir = path.resolve(process.env.MIGRATIONS_DIR ?? 'migrations');
const pool = createPool(databaseUrl, process.env.DATABASE_SSL === 'true');
const client = await pool.connect();

try {
  // Serialize concurrent deploys.
  await client.query('SELECT pg_advisory_lock(727001)');
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
  );
  const applied = new Set(
    (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((row) => row.name),
  );
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Applied migration ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  console.log('Database is up to date.');
} finally {
  await client.query('SELECT pg_advisory_unlock(727001)').catch(() => undefined);
  client.release();
  await pool.end();
}
