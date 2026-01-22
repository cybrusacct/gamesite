import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

// Use environment variable if available, else default to relative path
const DB_PATH = path.join(process.cwd(), "data", "app.sqlite");


// Ensure the folder exists
const folder = path.dirname(DB_PATH);
try {
  fs.mkdirSync(folder, { recursive: true });
} catch (e) {
  console.warn("Warning: failed to ensure data directory:", e.message);
}

// Open SQLite database (file will be created if missing)
const db = new Database(DB_PATH);

// USERS table
db.prepare(
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    pin TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    matchesWon INTEGER NOT NULL DEFAULT 0
  )`
).run();

// CHAT table
db.prepare(
  `CREATE TABLE IF NOT EXISTS chat (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    message TEXT,
    createdAt INTEGER
  )`
).run();

export default db;
