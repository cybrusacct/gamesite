// Full server/index.js with new endpoints & ready handling integrated
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
  setPlayerReady,
  rematchRoom,
} from "./rooms.js";
import * as usersModule from "./users.js";
import * as chatModule from "./chat.js";

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

/* ---- Expose users API via usersModule ---- */

// Signup
app.post("/api/signup", (req, res) => {
  const { username, pin } = req.body;
  try {
    if (!username || !pin) return res.status(400).json({ ok: false, error: "Missing fields" });
    if (typeof username !== "string" || typeof pin !== "string") return res.status(400).json({ ok: false, error: "Invalid input" });
    if (username.length < 1) return res.status(400).json({ ok: false, error: "Invalid username" });
    if (!/^\d{4,}$/.test(pin)) return res.status(400).json({ ok: false, error: "Pin must be at least 4 digits" });

    const user = usersModule.createUser(username, pin);
    return res.json({ ok: true, user });
  } catch (err) {
    if (err.message === "Username taken") return res.status(409).json({ ok: false, error: "Username taken" });
    return res.status(400).json({ ok: false, error: err.message || "Signup failed" });
  }
});

// Login
app.post("/api/login", (req, res) => {
  const { username, pin } = req.body;
  if (!username || !pin) return res.status(400).json({ ok: false, error: "Missing fields" });
  const user = usersModule.validateUser(username, pin);
  if (!user) return res.status(401).json({ ok: false, error: "Wrong credentials" });
  return res.json({ ok: true, user });
});

// Get profile
app.get("/api/profile/:username", (req, res) => {
  const u = usersModule.getUser(req.params.username);
  if (!u) return res.status(404).json({ ok: false, error: "User not found" });
  return res.json({ ok: true, user: u });
});

// Leaderboard
app.get("/api/leaderboard", (req, res) => {
  const users = usersModule.getAllUsers();
  // sort by points desc, then wins desc
  users.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.wins - a.wins;
  });
  return res.json({ ok: true, leaderboard: users });
});

/* ---- Chat endpoints for lazy-load ---- */
app.get("/api/chat", (req, res) => {
  const before = req.query.before || null;
  const limit = parseInt(req.query.limit || "50", 10);
  const msgs = chatModule.getMessages({ before, limit });
  return res.json({ ok: true, messages: msgs });
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
const PORT = parseInt(process.env.PORT || "3000", 10);
const server = http.createServer(app);

// Single-instance Socket.IO setup (no Redis adapter)
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN },
  pingTimeout: 20000,
});

console.log("Socket.IO running in single-instance mode (no Redis adapter).");

// Map username -> socketId for private emits (updated on joinRoom)
const usernameToSocketId = new Map();

function getSocketIdForUsername(username) {
  return usernameToSocketId.get(username) || null;
}

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("joinRoom", ({ roomId, username }) => {
    if (!roomId || !username) return;
    if (!getRoom(roomId)) createRoom(roomId);
    socket.join(roomId);

    usernameToSocketId.set(username, socket.id);
    socket.data.username = username;
    socket.data.roomId = roomId;

    addPlayer(roomId, username);
    const room = getRoom(roomId);
    io.to(roomId).emit("updateLobby", { players: room.players, host: room.host, ready: room.ready });

    // do not auto-start on join; host will start
  });

  socket.on("leaveRoom", ({ roomId, username }) => {
    if (!roomId || !username) return;
    removePlayer(roomId, username);
    const room = getRoom(roomId);
    io.to(roomId).emit("updateLobby", { players: room?.players || [], host: room?.host, ready: room?.ready || {} });
    if (usernameToSocketId.get(username) === socket.id) usernameToSocketId.delete(username);
  });

  socket.on("setReady", ({ roomId, username, ready }) => {
    if (!roomId || !username) return;
    setPlayerReady(roomId, username, !!ready);
    const room = getRoom(roomId);
    io.to(roomId).emit("updateLobby", { players: room.players, host: room.host, ready: room.ready });
  });

  socket.on("startGame", ({ roomId }) => {
    if (!roomId) return;
    startCountdown(io, roomId);
  });

  socket.on("passCard", ({ roomId, fromUsername, cardIndex }) => {
    const result = passCard(roomId, fromUsername, cardIndex);
    const room = getRoom(roomId);
    if (!room || !result) return;

    // Broadcast pass animation to room (card back only — no face)
    io.to(roomId).emit("passAnimation", { from: result.from, to: result.to, ts: result.ts });

    // Send private event to recipient with the card face
    const recipientSocketId = getSocketIdForUsername(result.to);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("receiveCard", { from: result.from, to: result.to, card: result.card, ts: result.ts });
    }

    // Send updated game state to everyone
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

    res.winners.forEach((uname) => {
      usersModule.addPoints(uname, 10, true);
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
    io.to(roomId).emit("updateLobby", { players: room.players, host: room.host, ready: room.ready });
  });

  socket.on("suspect", ({ roomId, suspector, target }) => {
    const res = suspectPlayer(roomId, suspector, target);
    const room = getRoom(roomId);
    if (!room || !res) return;

    res.winners.forEach((uname) => {
      usersModule.addPoints(uname, 10, true);
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
    io.to(roomId).emit("updateLobby", { players: room.players, host: room.host, ready: room.ready });
  });

  socket.on("rematch", ({ roomId, username }) => {
    const room = getRoom(roomId);
    if (!room) return;
    if (!room.players.includes(username)) return;
    try {
      rematchRoom(io, roomId);
      io.to(roomId).emit("playSound", { type: "matchEnd" });
    } catch (e) {
      console.warn("rematch error", e);
    }
  });

  socket.on("kickPlayer", ({ roomId, username }) => {
    kickPlayer(roomId, username);
    const room = getRoom(roomId);

    const kickedSocketId = getSocketIdForUsername(username);
    if (kickedSocketId) {
      io.to(kickedSocketId).emit("kicked", { roomId, reason: "You were kicked from the lobby" });
      usernameToSocketId.delete(username);
    }

    io.to(roomId).emit("updateLobby", { players: room?.players || [], host: room?.host, ready: room?.ready || {} });
    io.to(roomId).emit("playSound", { type: "kick" });
  });

  socket.on("swapPlayers", ({ roomId, indexA, indexB }) => {
    swapPlayers(roomId, indexA, indexB);
    const room = getRoom(roomId);
    io.to(roomId).emit("updateLobby", { players: room?.players || [], host: room?.host, ready: room?.ready || {} });
  });

  socket.on("globalChat", ({ username, message }) => {
    const ts = new Date().toISOString();
    const payload = { username, message, ts };
    chatModule.addMessage(payload);
    io.emit("globalChatMessage", payload);
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
    for (const [uname, sid] of usernameToSocketId.entries()) {
      if (sid === socket.id) usernameToSocketId.delete(uname);
    }
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