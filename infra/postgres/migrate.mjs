#!/usr/bin/env node
/**
 * Idempotent Postgres migrator — safe for existing volumes.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const dir = process.env.MIGRATIONS_DIR || '/migrations';
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

async function waitReady(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('postgres not ready');
}

await waitReady();
await pool.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations(
    id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
`);

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

for (const file of files) {
  const id = file.replace(/\.sql$/, '');
  const exists = await pool.query('SELECT 1 FROM schema_migrations WHERE id=$1', [id]);
  const sql = fs.readFileSync(path.join(dir, file), 'utf8');
  // Always re-apply IF NOT EXISTS DDL for brownfield safety; track once
  console.log(`applying ${file} ...`);
  await pool.query(sql);
  if (!exists.rowCount) {
    await pool.query('INSERT INTO schema_migrations(id) VALUES($1) ON CONFLICT DO NOTHING', [id]);
  }
  console.log(`ok ${file}`);
}

await pool.end();
console.log('migrations complete');
