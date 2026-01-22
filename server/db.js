import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const DATA_DIR = "/data";
const DB_PATH = path.join(DATA_DIR, "database.sqlite");

// Ensure /data exists (best-effort)
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) {
  // If mkdir fails, rethrow because DB cannot initialize without data dir
  console.warn("Warning: failed to ensure /data directory:", e && e.message);
}

// Open SQLite database (synchronous, file will be created if missing)
const db = new Database(DB_PATH);

// Initialize required tables if they do not exist
// USERS TABLE:
// id (integer, primary key, auto-increment)
// username (text, unique)
// pin (text)
// points (integer, default 0)
// matchesWon (integer, default 0)
db.prepare(
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    pin TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    matchesWon INTEGER NOT NULL DEFAULT 0
  )`
).run();

// CHAT TABLE (optional):
// id (integer primary key), username (text), message (text), createdAt (integer timestamp)
db.prepare(
  `CREATE TABLE IF NOT EXISTS chat (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    message TEXT,
    createdAt INTEGER
  )`
).run();

export default db;