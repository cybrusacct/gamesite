// server/index.js (updated excerpts)
// ... keep existing imports at top ...
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

/* Rate limiter - keep but exclude chat history endpoint from limiter */
const limiter = rateLimit({
  windowMs: 5 * 1000,
  max: 40,
});
app.use((req, res, next) => {
  // allow unlimited /api/chat GET (history)
  if (req.path === "/api/chat" && req.method === "GET") return next();
  return limiter(req, res, next);
});

const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: CORS_ORIGIN }));

// user routes unchanged...
// chat route unchanged...

/* ---- Socket.IO setup ---- */
const PORT = parseInt(process.env.PORT || "3000", 10);
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CORS_ORIGIN } });

console.log("Socket.IO running");

/// Periodic cleanup of inactive rooms
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
    // update lastActive inside addPlayer
    const room = getRoom(roomId);
    io.to(roomId).emit("updateLobby", { players: room.players, host: room.host, ready: room.ready, version: room.version });
    console.log("JOIN", roomId, username);
  });

  socket.on("rejoinRoom", ({ roomId, username }) => {
    // on reconnect (client asks), reply with full public snapshot and private hand sync
    const room = getRoom(roomId);
    if (!room) return;
    attachSocket(roomId, username, socket.id);
    socket.join(roomId);
    // send public snapshot
    socket.emit("updateGame", publicSnapshot(roomId));
    // send private full hand
    const hand = room.hands?.[username] || [];
    socket.emit("syncHand", { hand, roomVersion: room.version });
  });

  socket.on("leaveRoom", ({ roomId, username }) => {
    if (!roomId || !username) return;
    removePlayer(roomId, username);
    const room = getRoom(roomId);
    io.to(roomId).emit("updateLobby", { players: room?.players || [], host: room?.host, ready: room?.ready || {}, version: room?.version || 0 });
    // remove mapping
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
    // server verifies readiness and runs countdown (startCountdown locks room)
    startCountdown(io, roomId, socket.id);
    console.log("START requested", roomId, socket.id);
  });

  // passCard: server authoritative
  socket.on("passCard", ({ roomId, fromUsername, cardIndex }) => {
    if (!roomId || !fromUsername) return;
    const lastPass = passCard(io, roomId, fromUsername, cardIndex);
    // After passCard: passCard function already emitted passAnimation, receiveCard (private), and updateGame
    if (lastPass) {
      // nothing else to do here - logs at server
    }
  });

  socket.on("sendSignal", ({ roomId, username }) => {
    if (!roomId || !username) return;
    const res = sendSignal(io, roomId, username);
    // sendSignal already emitted updateGame/signal Sent
  });

  socket.on("callJackwhot", ({ roomId, callerUsername }) => {
    if (!roomId || !callerUsername) return;
    const res = callJackwhot(io, roomId, callerUsername);
    const room = getRoom(roomId);
    if (!room || !res) return;
    // update user stats - maintained in index.js previously; here we only do logic in rooms
    // actual broadcast is done by calling code in index.js (the earlier structure). Keep it consistent:
    // The higher-level server index will handle awarding points and emitting gameOver after calling this function.
  });

  socket.on("suspect", ({ roomId, suspector, target }) => {
    if (!roomId || !suspector || !target) return;
    const res = suspectPlayer(io, roomId, suspector, target);
    const room = getRoom(roomId);
    if (!room || !res) return;
    // The index.js caller will handle awarding points and final emits (gameOver)
  });

  socket.on("rematch", ({ roomId, username }) => {
    if (!roomId || !username) return;
    const room = getRoom(roomId);
    if (!room || !room.players.includes(username)) return;
    rematchRoom(io, roomId);
  });

  socket.on("requestHand", ({ roomId, username }) => {
    // client requests private sync of their hand
    const room = getRoom(roomId);
    if (!room) return;
    const hand = room.hands?.[username] || [];
    socket.emit("syncHand", { hand, roomVersion: room.version });
  });

  socket.on("globalChat", ({ username, message }) => {
    // persist via chatModule and broadcast
    const ts = new Date().toISOString();
    const payload = { username, message, ts };
    chatModule.addMessage(payload);
    io.emit("globalChatMessage", payload);
    // update room lastActive if we can guess room from socket.rooms (optional)
  });

  socket.on("disconnect", () => {
    console.log("disconnect", socket.id);
    // cleanup mapping entries
    Object.values(rooms).forEach((r) => {
      if (r._socketMap) {
        for (const [u, sid] of Object.entries(r._socketMap)) {
          if (sid === socket.id) delete r._socketMap[u];
        }
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});