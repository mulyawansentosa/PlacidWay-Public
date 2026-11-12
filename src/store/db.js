import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';

let db = null;

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sources (
    id            TEXT PRIMARY KEY,
    url           TEXT NOT NULL,
    page_type     TEXT,
    title         TEXT,
    treatment     TEXT,
    country       TEXT,
    city          TEXT,
    clinic        TEXT,
    content_hash  TEXT,
    etag          TEXT,
    last_modified TEXT,
    status        TEXT NOT NULL DEFAULT 'pending',
    error         TEXT,
    fetched_at    TEXT,
    chunk_count   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id          TEXT PRIMARY KEY,
    source_id   TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    heading     TEXT,
    content     TEXT NOT NULL,
    metadata    TEXT NOT NULL DEFAULT '{}',
    embedding   BLOB
  );
  CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_id, chunk_index);

  CREATE TABLE IF NOT EXISTS price_facts (
    id          TEXT PRIMARY KEY,
    source_id   TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    treatment   TEXT,
    country     TEXT,
    city        TEXT,
    clinic      TEXT,
    amount      REAL,
    amount_max  REAL,
    currency    TEXT,
    qualifier   TEXT,
    raw_text    TEXT,
    valid_until TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_price_facts_lookup ON price_facts(treatment, country);

  CREATE TABLE IF NOT EXISTS conversations (
    id         TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    locale     TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    sources         TEXT,
    model           TEXT,
    latency_ms      INTEGER,
    created_at      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id);

  CREATE TABLE IF NOT EXISTS unanswered (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT,
    question        TEXT NOT NULL,
    reason          TEXT NOT NULL,
    top_score       REAL,
    detail          TEXT,
    created_at      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_unanswered_created ON unanswered(created_at);

  CREATE TABLE IF NOT EXISTS leads (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT,
    name            TEXT NOT NULL,
    email           TEXT NOT NULL,
    message         TEXT,
    consent         INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ingest_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at  TEXT NOT NULL,
    finished_at TEXT,
    status      TEXT NOT NULL,
    stats       TEXT,
    error       TEXT
  );
`;

export function openDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  db = new Database(config.dbPath);
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/**
 * Adds columns introduced after the first schema. SQLite has no
 * "ADD COLUMN IF NOT EXISTS", so the table info is checked first.
 */
const ADDED_COLUMNS = {
  price_facts: [
    ['price_type', 'TEXT'],
    ['package_includes', 'TEXT'],
    ['last_updated', 'TEXT'],
  ],
};

function migrate(database) {
  for (const [table, columns] of Object.entries(ADDED_COLUMNS)) {
    const existing = new Set(database.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
    for (const [name, type] of columns) {
      if (!existing.has(name)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    }
  }
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function getMeta(key, fallback = null) {
  const row = openDb().prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setMeta(key, value) {
  openDb()
    .prepare('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

export function getIndexVersion() {
  return getMeta('index_version', '0');
}

export function touchIndexVersion() {
  const version = `${nowIso()}-${crypto.randomBytes(4).toString('hex')}`;
  setMeta('index_version', version);
  return version;
}

export function upsertSource(source) {
  openDb()
    .prepare(
      `INSERT INTO sources
         (id, url, page_type, title, treatment, country, city, clinic, status)
       VALUES (@id, @url, @pageType, @title, @treatment, @country, @city, @clinic, 'pending')
       ON CONFLICT(id) DO UPDATE SET
         url = excluded.url,
         page_type = excluded.page_type,
         title = excluded.title,
         treatment = excluded.treatment,
         country = excluded.country,
         city = excluded.city,
         clinic = excluded.clinic`
    )
    .run({
      id: source.id,
      url: source.url,
      pageType: source.pageType || 'page',
      title: source.title || source.id,
      treatment: source.treatment || '',
      country: source.country || '',
      city: source.city || '',
      clinic: source.clinic || '',
    });
}

export function updateSourceState(id, fields) {
  const allowed = [
    'content_hash',
    'etag',
    'last_modified',
    'status',
    'error',
    'fetched_at',
    'chunk_count',
  ];
  const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
  if (!entries.length) return;
  const assignments = entries.map(([key]) => `${key} = @${key}`).join(', ');
  openDb()
    .prepare(`UPDATE sources SET ${assignments} WHERE id = @id`)
    .run({ id, ...Object.fromEntries(entries) });
}

export function listSourceRows() {
  return openDb().prepare('SELECT * FROM sources ORDER BY id').all();
}

export function getSourceRow(id) {
  return openDb().prepare('SELECT * FROM sources WHERE id = ?').get(id);
}

export function replaceSourceContent(source, chunks, priceFacts) {
  const database = openDb();
  const run = database.transaction(() => {
    database.prepare('DELETE FROM chunks WHERE source_id = ?').run(source.id);
    database.prepare('DELETE FROM price_facts WHERE source_id = ?').run(source.id);

    const insertChunk = database.prepare(
      `INSERT INTO chunks (id, source_id, chunk_index, heading, content, metadata, embedding)
       VALUES (@id, @sourceId, @chunkIndex, @heading, @content, @metadata, @embedding)`
    );
    for (const chunk of chunks) {
      insertChunk.run({
        id: chunk.id,
        sourceId: source.id,
        chunkIndex: chunk.index,
        heading: chunk.heading || '',
        content: chunk.content,
        metadata: JSON.stringify(chunk.metadata || {}),
        embedding: chunk.embedding
          ? Buffer.from(chunk.embedding.buffer, chunk.embedding.byteOffset, chunk.embedding.byteLength)
          : null,
      });
    }

    const insertFact = database.prepare(
      `INSERT INTO price_facts
         (id, source_id, treatment, country, city, clinic, amount, amount_max, currency, qualifier,
          raw_text, valid_until, price_type, package_includes, last_updated)
       VALUES
         (@id, @sourceId, @treatment, @country, @city, @clinic, @amount, @amountMax, @currency, @qualifier,
          @rawText, @validUntil, @priceType, @packageIncludes, @lastUpdated)`
    );
    const lastUpdated = nowIso();
    for (const fact of priceFacts) {
      insertFact.run({
        id: fact.id,
        sourceId: source.id,
        treatment: fact.treatment || '',
        country: fact.country || '',
        city: fact.city || '',
        clinic: fact.clinic || '',
        amount: fact.amount ?? null,
        amountMax: fact.amountMax ?? null,
        currency: fact.currency || '',
        qualifier: fact.qualifier || '',
        rawText: fact.rawText || '',
        validUntil: fact.validUntil || null,
        priceType: fact.priceType || 'listed',
        packageIncludes: fact.packageIncludes?.length ? JSON.stringify(fact.packageIncludes) : null,
        lastUpdated,
      });
    }
  });
  run();
}

export function listAllChunks() {
  return openDb()
    .prepare(
      `SELECT c.id, c.source_id, c.chunk_index, c.heading, c.content, c.metadata, c.embedding,
              s.url, s.title AS source_title, s.page_type, s.treatment AS source_treatment,
              s.country AS source_country, s.clinic AS source_clinic
         FROM chunks c
         JOIN sources s ON s.id = c.source_id
        ORDER BY c.source_id, c.chunk_index`
    )
    .all();
}

export function findPriceFacts({ treatment = '', countries = [] } = {}) {
  if (!treatment && !countries.length) return [];
  const database = openDb();
  const clauses = [];
  const params = {};

  if (treatment) {
    clauses.push('(lower(pf.treatment) LIKE @treatment OR lower(pf.raw_text) LIKE @treatment)');
    params.treatment = `%${treatment.toLowerCase()}%`;
  }
  if (countries.length) {
    const countryClauses = countries.map((_, index) => `lower(pf.country) LIKE @country${index}`);
    clauses.push(`(${countryClauses.join(' OR ')})`);
    countries.forEach((country, index) => {
      params[`country${index}`] = `%${country.toLowerCase()}%`;
    });
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return database
    .prepare(
      `SELECT pf.*, s.url AS source_url, s.title AS source_title, s.page_type AS source_page_type
         FROM price_facts pf
         JOIN sources s ON s.id = pf.source_id
         ${where}
        ORDER BY pf.amount ASC`
    )
    .all(params);
}

export function listAllPriceFacts() {
  return openDb().prepare('SELECT * FROM price_facts ORDER BY country, treatment, amount').all();
}

export function getConversationLocale(id) {
  const row = openDb().prepare('SELECT locale FROM conversations WHERE id = ?').get(id);
  return row?.locale || null;
}

export function ensureConversation(id, locale = 'en') {
  const database = openDb();
  const now = nowIso();
  database
    .prepare(
      `INSERT INTO conversations (id, created_at, updated_at, locale)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, locale = excluded.locale`
    )
    .run(id, now, now, locale);
}

export function getHistory(conversationId, limit = 8) {
  const rows = openDb()
    .prepare(
      `SELECT role, content, created_at FROM messages
        WHERE conversation_id = ? ORDER BY id DESC LIMIT ?`
    )
    .all(conversationId, limit);
  return rows.reverse();
}

export function saveMessage({ conversationId, role, content, sources = null, model = null, latencyMs = null }) {
  openDb()
    .prepare(
      `INSERT INTO messages (conversation_id, role, content, sources, model, latency_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      conversationId,
      role,
      content,
      sources ? JSON.stringify(sources) : null,
      model,
      latencyMs,
      nowIso()
    );
}

export function logUnanswered({ conversationId, question, reason, topScore = null, detail = '' }) {
  openDb()
    .prepare(
      `INSERT INTO unanswered (conversation_id, question, reason, top_score, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(conversationId, question, reason, topScore, detail, nowIso());
}

export function listUnanswered(limit = 200) {
  return openDb()
    .prepare('SELECT * FROM unanswered ORDER BY id DESC LIMIT ?')
    .all(limit);
}

export function saveLead({ conversationId, name, email, message, consent }) {
  openDb()
    .prepare(
      `INSERT INTO leads (conversation_id, name, email, message, consent, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(conversationId || null, name, email, message || '', consent ? 1 : 0, nowIso());
}

export function startIngestRun() {
  const result = openDb()
    .prepare('INSERT INTO ingest_runs (started_at, status) VALUES (?, ?)')
    .run(nowIso(), 'running');
  return Number(result.lastInsertRowid);
}

export function finishIngestRun(id, status, stats, error = null) {
  openDb()
    .prepare('UPDATE ingest_runs SET finished_at = ?, status = ?, stats = ?, error = ? WHERE id = ?')
    .run(nowIso(), status, JSON.stringify(stats || {}), error, id);
}

export function getLastIngestRun() {
  return openDb().prepare('SELECT * FROM ingest_runs ORDER BY id DESC LIMIT 1').get();
}
