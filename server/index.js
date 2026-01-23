// server/index.js
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
  attachSocket,
  removeSocketMapping,
  cleanupInactiveRooms,
  publicSnapshot,
} from "./rooms.js";
import * as usersModule from "./users.js";
import * as chatModule from "./chat.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(helmet());

// Trust proxy so express-rate-limit can use X-Forwarded-For (Render / proxies)
app.set("trust proxy", true);

// Basic rate limiting (tunable)
const limiter = rateLimit({
  windowMs: 5 * 1000, // 5s
  max: 40, // max 40 requests per window per IP
});

// Exclude chat history GET from limiter to avoid blocking history loads
app.use((req, res, next) => {
  if (req.path === "/api/chat" && req.method === "GET") return next();
  return limiter(req, res, next);
});

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
    console.error("SIGNUP_ERROR", err && err.stack);
    return res.status(400).json({ ok: false, error: err.message || "Signup failed" });
  }
});

// Login
app.post("/api/login", (req, res) => {
  try {
    const { username, pin } = req.body;
    if (!username || !pin) return res.status(400).json({ ok: false, error: "Missing fields" });
    const user = usersModule.validateUser(username, pin);
    if (!user) return res.status(401).json({ ok: false, error: "Wrong credentials" });
    return res.json({ ok: true, user });
  } catch (err) {
    console.error("LOGIN_ERROR", err && err.stack);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
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

console.log("Socket.IO running");

// Periodic cleanup of inactive rooms
setInterval(() => {
  try { cleanupInactiveRooms(io); } catch (e) { console.warn("cleanup error", e && e.message); }
}, 60 * 1000); // every 60s

io.on("connection", (socket) => {
  console.log("socket connected", socket.id);

  socket.on("joinRoom", ({ roomId, username }) => {
    if (!roomId || !username) return;
    if (!getRoom(roomId)) createRoom(roomId);
    socket.join(roomId);
    addPlayer(roomId, username);
    attachSocket(roomId, username, socket.id);
    const room = getRoom(roomId);
    io.to(roomId).emit("updateLobby", { players: room.players, host: room.host, ready: room.ready, version: room.version });
    console.log("JOIN", roomId, username);
  });

  socket.on("rejoinRoom", ({ roomId, username }) => {
    const room = getRoom(roomId);
    if (!room) return;
    attachSocket(roomId, username, socket.id);
    socket.join(roomId);
    socket.emit("updateGame", publicSnapshot(roomId));
    const hand = room.hands?.[username] || [];
    socket.emit("syncHand", { hand, roomVersion: room.version });
    console.log("REJOIN", roomId, username);
  });

  socket.on("leaveRoom", ({ roomId, username }) => {
    if (!roomId || !username) return;
    removePlayer(roomId, username);
    const room = getRoom(roomId);
    io.to(roomId).emit("updateLobby", { players: room?.players || [], host: room?.host, ready: room?.ready || {}, version: room?.version || 0 });
    if (room && room._socketMap && room._socketMap[username] === socket.id) delete room._socketMap[username];
    socket.leave(roomId);
    console.log("LEAVE", roomId, username);
  });

  socket.on("setReady", ({ roomId, username, ready }) => {
    if (!roomId || !username) return;
    setPlayerReady(roomId, username, !!ready);
    const room = getRoom(roomId);
    io.to(roomId).emit("updateLobby", { players: room.players, host: room.host, ready: room.ready, version: room.version });
    console.log("READY", roomId, username, ready);
  });

  socket.on("startGame", ({ roomId }) => {
    startCountdown(io, roomId, socket.id);
    console.log("START requested", roomId, socket.id);
  });

  socket.on("passCard", ({ roomId, fromUsername, cardIndex }) => {
    if (!roomId || !fromUsername) return;
    passCard(io, roomId, fromUsername, cardIndex);
    // passCard handles emits
  });

  socket.on("sendSignal", ({ roomId, username }) => {
    if (!roomId || !username) return;
    sendSignal(io, roomId, username);
  });

  socket.on("callJackwhot", ({ roomId, callerUsername }) => {
    if (!roomId || !callerUsername) return;
    const res = callJackwhot(io, roomId, callerUsername);
    if (!res) return;
    // Award points and broadcast gameOver handled in higher-level code if needed
  });

  socket.on("suspect", ({ roomId, suspector, target }) => {
    if (!roomId || !suspector || !target) return;
    const res = suspectPlayer(io, roomId, suspector, target);
    if (!res) return;
    // Higher-level code handles awarding and broadcasting gameOver
  });

  socket.on("rematch", ({ roomId, username }) => {
    if (!roomId || !username) return;
    const room = getRoom(roomId);
    if (!room || !room.players.includes(username)) return;
    rematchRoom(io, roomId);
  });

  socket.on("requestHand", ({ roomId, username }) => {
    const room = getRoom(roomId);
    if (!room) return;
    const hand = room.hands?.[username] || [];
    socket.emit("syncHand", { hand, roomVersion: room.version });
  });

  socket.on("globalChat", ({ username, message }) => {
    const ts = new Date().toISOString();
    const payload = { username, message, ts };
    chatModule.addMessage(payload);
    io.emit("globalChatMessage", payload);
  });

  socket.on("disconnect", () => {
    console.log("disconnect", socket.id);
    // Remove any username->socketId mapping for this socket
    try {
      removeSocketMapping(socket.id);
    } catch (e) {
      console.warn("removeSocketMapping error", e && e.message);
    }
  });
});

/* ---- Graceful shutdown ---- */
async function shutdown() {
  console.log("Shutdown initiated...");
  try {
    clearAllCountdowns();
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