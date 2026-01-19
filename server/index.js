import express from "express";
import http from "http";
import { Server } from "socket.io";
import {
  createRoom,
  getRoom,
  addPlayer,
  removePlayer,
  startCountdown,
  passCard,
  handleSignal,
} from "./rooms.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = 3000;

app.get("/", (req, res) => {
  res.send("Server running 🟢");
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

io.on("connection", (socket) => {
  socket.on("joinRoom", ({ roomId, username }) => {
    if (!getRoom(roomId)) createRoom(roomId);
    socket.join(roomId);

    addPlayer(roomId, username);
    io.to(roomId).emit("updateLobby", getRoom(roomId).players);

    if (getRoom(roomId).players.length === 4) {
      startCountdown(io, roomId);
    }
  });

  socket.on("leaveRoom", ({ roomId, username }) => {
    removePlayer(roomId, username);
    io.to(roomId).emit("updateLobby", getRoom(roomId)?.players || []);
  });

  // passCard now expects an index in the player's hand
  socket.on("passCard", ({ roomId, fromUsername, cardIndex }) => {
    passCard(roomId, fromUsername, cardIndex);
    io.to(roomId).emit("updateGame", getRoom(roomId));
  });

  // handle JACKWHOT signals
  socket.on("sendSignal", ({ roomId, username }) => {
    const result = handleSignal(roomId, username);
    io.to(roomId).emit("jackwhotResult", result);
    // Optionally, you can emit a 'gameOver' or reset the room here if desired.
  });
});