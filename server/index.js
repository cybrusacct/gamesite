import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import {
  createRoom,
  getRoom,
  addPlayer,
  removePlayer,
  startCountdown,
  passCard,
  sendSignal,
  callJackwhot,
  suspectPlayer,
  swapPlayers,
  kickPlayer,
  clearAllCountdowns,
} from "./rooms.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(helmet());

// Basic rate limiting (tunable)
const limiter = rateLimit({
  windowMs: 5 * 1000, // 5s
  max: 40, // max 40 requests per window per IP
});
app.use(limiter);

// CORS (set via env for production)
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: CORS_ORIGIN }));

/*
  Simple in-memory user store (kept intentionally in-memory per your request).
  Structure:
    users[username] = { pin: "1234", points: 0, wins: 0 }
  Note: Pins are stored in plaintext right now — plan to hash & add auth when ready.
*/
const users = {};

const PORT = parseInt(process.env.PORT || "3000", 10);

const server = http.createServer(app);

// Single-instance Socket.IO setup (no Redis adapter)
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN },
  pingTimeout: 20000,
});

console.log("Socket.IO running in single-instance mode (no Redis adapter).");

/* -------------------------
   HTTP API: Auth & Profile
   ------------------------- */

// Signup
app.post("/api/signup", (req, res) => {
  const { username, pin } = req.body;
  if (!username || !pin) return res.status(400).json({ ok: false, error: "Missing fields" });
  if (typeof username !== "string" || typeof pin !== "string") return res.status(400).json({ ok: false, error: "Invalid input" });
  if (username.length < 1) return res.status(400).json({ ok: false, error: "Invalid username" });
  if (!/^\d{4,}$/.test(pin)) return res.status(400).json({ ok: false, error: "Pin must be at least 4 digits" });

  if (users[username]) {
    return res.status(409).json({ ok: false, error: "Username taken" });
  }
  users[username] = { pin, points: 0, wins: 0 };
  return res.json({ ok: true, user: { username, points: 0, wins: 0 } });
});

// Login
app.post("/api/login", (req, res) => {
  const { username, pin } = req.body;
  if (!username || !pin) return res.status(400).json({ ok: false, error: "Missing fields" });
  const user = users[username];
  if (!user || user.pin !== pin) return res.status(401).json({ ok: false, error: "Wrong credentials" });
  return res.json({ ok: true, user: { username, points: user.points, wins: user.wins } });
});

// Get profile
app.get("/api/profile/:username", (req, res) => {
  const u = users[req.params.username];
  if (!u) return res.status(404).json({ ok: false, error: "User not found" });
  return res.json({ ok: true, user: { username: req.params.username, points: u.points, wins: u.wins } });
});

/* ---- Static serving + health ---- */
const clientBuildPath = path.resolve(__dirname, "build");
app.use(express.static(clientBuildPath));

app.get("/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Fallback for SPA (serve index.html if present)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) return next();
  try {
    return res.sendFile(path.join(clientBuildPath, "index.html"));
  } catch (e) {
    return res.status(404).send("Not found");
  }
});

/* -------------------------
   Socket.IO events (game)
   ------------------------- */
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("joinRoom", ({ roomId, username }) => {
    if (!roomId || !username) return;
    if (!getRoom(roomId)) createRoom(roomId);
    socket.join(roomId);

    addPlayer(roomId, username);
    const room = getRoom(roomId);
    io.to(roomId).emit("updateLobby", { players: room.players, host: room.host });

    if (room.players.length === 4) {
      startCountdown(io, roomId);
    }
  });

  socket.on("leaveRoom", ({ roomId, username }) => {
    if (!roomId || !username) return;
    removePlayer(roomId, username);
    const room = getRoom(roomId);
    io.to(roomId).emit("updateLobby", { players: room?.players || [], host: room?.host });
  });

  socket.on("startGame", ({ roomId }) => {
    if (!roomId) return;
    startCountdown(io, roomId);
  });

  socket.on("passCard", ({ roomId, fromUsername, cardIndex }) => {
    passCard(roomId, fromUsername, cardIndex);
    const room = getRoom(roomId);
    io.to(roomId).emit("updateGame", room);
  });

  socket.on("sendSignal", ({ roomId, username }) => {
    const result = sendSignal(roomId, username);
    const room = getRoom(roomId);
    if (!room) return;
    io.to(roomId).emit("signalSent", result);
    io.to(roomId).emit("playSound", { type: "signal" });
  });

  socket.on("callJackwhot", ({ roomId, callerUsername }) => {
    const res = callJackwhot(roomId, callerUsername);
    const room = getRoom(roomId);
    if (!room || !res) return;

    // update in-memory user stats for winners (+10 points, wins++)
    res.winners.forEach((uname) => {
      if (users[uname]) {
        users[uname].points += 10;
        users[uname].wins += 1;
      }
    });

    io.to(roomId).emit("gameOver", {
      type: "jackwhot",
      win: res.win,
      winners: res.winners,
      winningTeam: res.winningTeam,
      hands: room.hands,
    });
    io.to(roomId).emit("playSound", { type: res.win ? "matchEnd" : "jackwhot-false" });

    room.hands = {};
    room.lastPass = null;
    room.pendingSignal = null;
    room.revealedPlayers = [];
    io.to(roomId).emit("updateLobby", { players: room.players, host: room.host });
  });

  socket.on("suspect", ({ roomId, suspector, target }) => {
    const res = suspectPlayer(roomId, suspector, target);
    const room = getRoom(roomId);
    if (!room || !res) return;

    // update winners stats
    res.winners.forEach((uname) => {
      if (users[uname]) {
        users[uname].points += 10;
        users[uname].wins += 1;
      }
    });

    io.to(roomId).emit("revealCards", { target, hands: room.hands });
    io.to(roomId).emit("playSound", { type: "suspect" });

    io.to(roomId).emit("gameOver", {
      type: "suspect",
      win: res.win,
      winners: res.winners,
      winningTeam: res.winningTeam,
      hands: room.hands,
    });
    io.to(roomId).emit("playSound", { type: "matchEnd" });

    room.hands = {};
    room.lastPass = null;
    room.pendingSignal = null;
    room.revealedPlayers = [];
    io.to(roomId).emit("updateLobby", { players: room.players, host: room.host });
  });

  socket.on("kickPlayer", ({ roomId, username }) => {
    kickPlayer(roomId, username);
    const room = getRoom(roomId);
    io.to(roomId).emit("updateLobby", { players: room?.players || [], host: room?.host });
    io.to(roomId).emit("playSound", { type: "kick" });
  });

  socket.on("swapPlayers", ({ roomId, indexA, indexB }) => {
    swapPlayers(roomId, indexA, indexB);
    const room = getRoom(roomId);
    io.to(roomId).emit("updateLobby", { players: room?.players || [], host: room?.host });
  });

  socket.on("globalChat", ({ username, message }) => {
    const ts = new Date().toISOString();
    io.emit("globalChatMessage", { username, message, ts });
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
    // No automatic user removal here — lobby removal is driven by clients calling leaveRoom
  });
});

/* ---- Graceful shutdown ---- */
async function shutdown() {
  console.log("Shutdown initiated...");
  try {
    clearAllCountdowns(); // clear countdown intervals in rooms.js
  } catch (e) {
    console.warn("Error clearing countdowns:", e);
  }

  try {
    io.close();
  } catch (e) {
    console.warn("Error closing Socket.IO:", e);
  }

  server.close((err) => {
    if (err) console.error("Server close error:", err);
    else console.log("HTTP server closed");
    process.exit(0);
  });

  setTimeout(() => {
    console.warn("Forcing shutdown");
    process.exit(0);
  }, 5000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

/* ---- Start server ---- */
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});