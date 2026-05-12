import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { User, MemoryMessage } from '../types';

class DB {
  private db!: Database.Database;

  init() {
    const dir = path.dirname(config.db.path);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(config.db.path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.createSchema();
    logger.success('Database initialized', { path: config.db.path });
  }

  private createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        jid TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        language TEXT NOT NULL DEFAULT 'pt-BR',
        personality TEXT NOT NULL DEFAULT 'humanized',
        is_blocked INTEGER NOT NULL DEFAULT 0,
        total_messages INTEGER NOT NULL DEFAULT 0,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        notes TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        jid TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY(jid) REFERENCES users(jid)
      );
      CREATE INDEX IF NOT EXISTS idx_msg_jid_ts ON messages(jid, timestamp);

      CREATE TABLE IF NOT EXISTS facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        jid TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(jid, key)
      );

      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        jid TEXT NOT NULL,
        subject TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'open',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rate_limits (
        jid TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        last_msg INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  // ─── Users ─────────────────────────────────────
  upsertUser(jid: string, name: string) {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO users (jid, name, language, personality, first_seen, last_seen)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(jid) DO UPDATE SET
           name = excluded.name,
           last_seen = excluded.last_seen,
           total_messages = total_messages + 1`
      )
      .run(jid, name, config.agent.language, config.agent.defaultPersonality, now, now);
  }

  getUser(jid: string): User | undefined {
    const row = this.db.prepare('SELECT * FROM users WHERE jid = ?').get(jid) as any;
    if (!row) return undefined;
    return {
      jid: row.jid,
      name: row.name,
      language: row.language,
      personality: row.personality,
      isBlocked: !!row.is_blocked,
      totalMessages: row.total_messages,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      notes: row.notes,
    };
  }

  setUserPersonality(jid: string, personality: string) {
    this.db.prepare('UPDATE users SET personality = ? WHERE jid = ?').run(personality, jid);
  }

  blockUser(jid: string, block: boolean) {
    this.db.prepare('UPDATE users SET is_blocked = ? WHERE jid = ?').run(block ? 1 : 0, jid);
  }

  appendNotes(jid: string, append: string) {
    const u = this.getUser(jid);
    const cur = u?.notes || '';
    const next = (cur ? cur + '\n' : '') + append;
    this.db.prepare('UPDATE users SET notes = ? WHERE jid = ?').run(next.slice(-4000), jid);
  }

  // ─── Messages / memory ─────────────────────────
  saveMessage(jid: string, role: 'user' | 'assistant' | 'system', content: string) {
    this.db
      .prepare('INSERT INTO messages (jid, role, content, timestamp) VALUES (?, ?, ?, ?)')
      .run(jid, role, content, Date.now());
  }

  getRecentMessages(jid: string, limit: number): MemoryMessage[] {
    const rows = this.db
      .prepare(
        'SELECT role, content, timestamp FROM messages WHERE jid = ? ORDER BY timestamp DESC LIMIT ?'
      )
      .all(jid, limit) as any[];
    return rows.reverse().map(r => ({
      role: r.role,
      content: r.content,
      timestamp: r.timestamp,
    }));
  }

  clearMemory(jid: string) {
    this.db.prepare('DELETE FROM messages WHERE jid = ?').run(jid);
  }

  // ─── Facts (long-term) ─────────────────────────
  setFact(jid: string, key: string, value: string) {
    this.db
      .prepare(
        `INSERT INTO facts (jid, key, value, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(jid, key) DO UPDATE SET value = excluded.value`
      )
      .run(jid, key, value, Date.now());
  }

  getFacts(jid: string): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM facts WHERE jid = ?').all(jid) as any[];
    return rows.reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {});
  }

  // ─── Tickets ────────────────────────────────────
  createTicket(jid: string, subject: string, priority: string) {
    const now = Date.now();
    const r = this.db
      .prepare(
        `INSERT INTO tickets (jid, subject, priority, status, created_at, updated_at)
         VALUES (?, ?, ?, 'open', ?, ?)`
      )
      .run(jid, subject, priority, now, now);
    return Number(r.lastInsertRowid);
  }

  // ─── Rate limit ────────────────────────────────
  checkRateLimit(jid: string, maxPerMin: number, cooldownMs: number): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const row = this.db.prepare('SELECT * FROM rate_limits WHERE jid = ?').get(jid) as any;
    if (!row) {
      this.db
        .prepare('INSERT INTO rate_limits (jid, window_start, count, last_msg) VALUES (?, ?, 1, ?)')
        .run(jid, now, now);
      return { allowed: true };
    }
    if (now - row.last_msg < cooldownMs) {
      return { allowed: false, reason: 'cooldown' };
    }
    if (now - row.window_start > 60_000) {
      this.db
        .prepare('UPDATE rate_limits SET window_start = ?, count = 1, last_msg = ? WHERE jid = ?')
        .run(now, now, jid);
      return { allowed: true };
    }
    if (row.count >= maxPerMin) {
      return { allowed: false, reason: 'too_many_per_minute' };
    }
    this.db
      .prepare('UPDATE rate_limits SET count = count + 1, last_msg = ? WHERE jid = ?')
      .run(now, jid);
    return { allowed: true };
  }
}

export const db = new DB();
