import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedReference } from './seed.js';

const here = dirname(fileURLToPath(import.meta.url));

export function openDb(file = process.env.DB_PATH || join(here, '../../data/scolario.db')) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  seedReference(db);
  return db;
}

/** Exécute fn dans une transaction (rollback en cas d'erreur). */
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Convertit les objets « null prototype » de node:sqlite en objets simples. */
export const plain = (row) => (row ? { ...row } : row);
export const all = (db, sql, ...params) => db.prepare(sql).all(...params).map(plain);
export const get = (db, sql, ...params) => plain(db.prepare(sql).get(...params));
export const run = (db, sql, ...params) => db.prepare(sql).run(...params);
