import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';
import { config } from '../config';

export type Db = BetterSQLite3Database<typeof schema>;

type Holder = { sqlite: Database.Database; db: Db; path: string };

const g = globalThis as unknown as { __frontedDb?: Holder };

export const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle');

function open(dbPath: string): Holder {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { sqlite, db, path: dbPath };
}

/** The single shared connection for this process (Next.js server, worker, or script). */
export function getDb(): Db {
  if (!g.__frontedDb) g.__frontedDb = open(config.dbPath);
  return g.__frontedDb.db;
}

export function getSqlite(): Database.Database {
  getDb();
  return g.__frontedDb!.sqlite;
}

/** Tests: replace the shared connection with a fresh in-memory database. */
export function useFreshDb(dbPath = ':memory:'): Db {
  if (g.__frontedDb) {
    try {
      g.__frontedDb.sqlite.close();
    } catch {
      /* already closed */
    }
  }
  g.__frontedDb = open(dbPath);
  return g.__frontedDb.db;
}

/** Alias for scripts (avoids the React hooks lint rule on `use*` names). */
export const openFreshDb = (dbPath = ':memory:'): Db => useFreshDb(dbPath);

export function closeDb(): void {
  if (g.__frontedDb) {
    g.__frontedDb.sqlite.close();
    g.__frontedDb = undefined;
  }
}

export { schema };
