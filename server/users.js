import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import db from "./db.js";

const USERS_JSON = path.join(process.cwd(), "data", "users.json");

/**
 * Migration: if users.json exists, import users into SQLite ONCE.
 * Do not overwrite existing DB users. After successful import, rename the JSON file
 * to users.json.migrated.<timestamp> so migration is not repeated.
 */
(async function migrateJsonUsers() {
  try {
    // Check if file exists
    if (!fsSync.existsSync(USERS_JSON)) return;
    const raw = await fs.readFile(USERS_JSON, "utf8");
    if (!raw) {
      // rename empty file to avoid repeated attempts
      const migrated = `${USERS_JSON}.migrated.${Date.now()}`;
      await fs.rename(USERS_JSON, migrated);
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // invalid JSON: rename and bail
      const bad = `${USERS_JSON}.invalid.${Date.now()}`;
      await fs.rename(USERS_JSON, bad);
      return;
    }

    // Expect structure: users[username] = { pin, points, wins }
    const insertStmt = db.prepare(
      `INSERT OR IGNORE INTO users (username, pin, points, matchesWon) VALUES (@username, @pin, @points, @matchesWon)`
    );

    const selectStmt = db.prepare(`SELECT username FROM users WHERE username = ? LIMIT 1`);

    const entries = Object.entries(parsed || {});
    for (const [username, info] of entries) {
      const pin = String(info.pin || "");
      const points = Number(info.points || 0);
      // older files used 'wins' — map to matchesWon
      const matchesWon = Number(info.wins || 0);
      if (!username) continue;
      // Only insert if not exists (INSERT OR IGNORE used)
      // We still check existence to avoid unnecessary writes
      const exists = selectStmt.get(username);
      if (!exists) {
        try {
          insertStmt.run({ username, pin, points, matchesWon });
        } catch (e) {
          // ignore individual insert failures
          console.warn("users.json migration insert failed for", username, e && e.message);
        }
      }
    }

    // Rename original JSON to mark migrated
    const migrated = `${USERS_JSON}.migrated.${Date.now()}`;
    await fs.rename(USERS_JSON, migrated);
    console.log("users.json migrated to SQLite as", migrated);
  } catch (e) {
    console.warn("users.json migration error:", e && e.message);
  }
})();

/* =========================
   User API (SQLite-backed)
   Exports:
     - createUser(username, pin)
     - validateUser(username, pin)
     - getUser(username)
     - addPoints(username, pts = 0, win = false)
     - getAllUsers()
========================= */

/**
 * createUser
 * Inserts a new user into SQLite.
 * Throws Error("Username taken") when username already exists (to match previous behavior).
 * Returns { username, points: 0, wins: 0 }
 */
export function createUser(username, pin) {
  if (!username || !pin) throw new Error("Missing fields");
  if (typeof username !== "string" || typeof pin !== "string") throw new Error("Invalid input");

  const insert = db.prepare(
    `INSERT INTO users (username, pin, points, matchesWon) VALUES (?, ?, 0, 0)`
  );
  try {
    insert.run(username, pin);
    return { username, points: 0, wins: 0 };
  } catch (err) {
    // If UNIQUE constraint violated
    if (err && err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new Error("Username taken");
    }
    throw err;
  }
}

/**
 * validateUser
 * Returns { username, points, wins } or null if invalid
 */
export function validateUser(username, pin) {
  if (!username || !pin) return null;
  const row = db
    .prepare(`SELECT username, points, matchesWon FROM users WHERE username = ? AND pin = ? LIMIT 1`)
    .get(username, pin);
  if (!row) return null;
  return { username: row.username, points: row.points, wins: row.matchesWon };
}

/**
 * getUser
 * Returns { username, points, wins } or null if not found
 */
export function getUser(username) {
  if (!username) return null;
  const row = db
    .prepare(`SELECT username, points, matchesWon FROM users WHERE username = ? LIMIT 1`)
    .get(username);
  if (!row) return null;
  return { username: row.username, points: row.points, wins: row.matchesWon };
}

/**
 * addPoints
 * Increment points and optionally matchesWon for a user.
 * API kept compatible: addPoints(username, pts = 0, win = false)
 */
export function addPoints(username, pts = 0, win = false) {
  if (!username) return;
  const incWins = win ? 1 : 0;
  const stmt = db.prepare(
    `UPDATE users SET points = COALESCE(points, 0) + ?, matchesWon = COALESCE(matchesWon, 0) + ? WHERE username = ?`
  );
  stmt.run(Number(pts || 0), incWins, username);
}

/**
 * getAllUsers
 * Returns array of { username, points, wins } for leaderboard
 */
export function getAllUsers() {
  const rows = db.prepare(`SELECT username, points, matchesWon FROM users`).all();
  return rows.map((r) => ({ username: r.username, points: r.points, wins: r.matchesWon }));
}

export default {
  createUser,
  validateUser,
  getUser,
  addPoints,
  getAllUsers,
};