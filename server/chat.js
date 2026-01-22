import db from "./db.js";

/*
  Chat persistence using SQLite 'chat' table.
  Each message stored as:
    { id, username, message, createdAt }
  Functions:
    - addMessage(msg) -> returns message object
    - getMessages({ before, limit })
*/

export function addMessage(msg) {
  // msg: { username, message, ts } where ts is ISO string; store createdAt as integer ms
  const createdAt = msg.ts ? Date.parse(msg.ts) : Date.now();
  const insert = db.prepare(`INSERT INTO chat (username, message, createdAt) VALUES (?, ?, ?)`);
  const info = insert.run(msg.username, msg.message, createdAt);
  // Return the stored message object with createdAt as ISO string in ts for compatibility
  return { id: info.lastInsertRowid, username: msg.username, message: msg.message, ts: new Date(createdAt).toISOString() };
}

/**
 * getMessages({ before, limit })
 * - before: ISO timestamp string OR integer ms; if omitted, return latest `limit` messages
 * - returns messages in chronological order (oldest -> newest) as array of { username, message, ts }
 */
export function getMessages({ before = null, limit = 50 } = {}) {
  limit = Number(limit || 50);
  if (!before) {
    // newest first, then reverse
    const rows = db
      .prepare(`SELECT username, message, createdAt FROM chat ORDER BY createdAt DESC LIMIT ?`)
      .all(limit);
    return rows
      .map((r) => ({ username: r.username, message: r.message, ts: new Date(r.createdAt).toISOString() }))
      .reverse();
  } else {
    // normalize before to integer ms
    const beforeMs = typeof before === "string" ? Date.parse(before) : Number(before);
    const rows = db
      .prepare(`SELECT username, message, createdAt FROM chat WHERE createdAt < ? ORDER BY createdAt DESC LIMIT ?`)
      .all(beforeMs, limit);
    return rows.map((r) => ({ username: r.username, message: r.message, ts: new Date(r.createdAt).toISOString() })).reverse();
  }
}

export default {
  addMessage,
  getMessages,
};