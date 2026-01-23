// server/rooms.js
// Authoritative room state manager
// - each room has version, lastActive, locked, countdown (interval id), hands (server-side full faces)
// - public updateGame emits a masked view (cardCounts) + version
// - private events: initHand, receiveCard, syncHand

import { createDeck as _createDeck, shuffle as _shuffle } from "./rooms_helpers.js"; // optional - or inline below

const rooms = {};

/* =======================
   HELPERS
======================= */
function createDeck() {
  // Deck counts per spec: 5 × Circle, 4 × Square, 4 × Cross, 4 × Heart (total 17)
  const deck = [];
  const counts = {
    Circle: 5,
    Square: 4,
    Cross: 4,
    Heart: 4,
  };
  Object.keys(counts).forEach((shape) => {
    for (let i = 0; i < counts[shape]; i++) deck.push(shape);
  });
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

/* =======================
   ROOM CORE
======================= */
export function createRoom(roomId) {
  rooms[roomId] = {
    players: [],
    host: null,
    hands: {},           // full faces (server-only truth)
    cardCounts: {},      // public counts
    deck: [],
    turnIndex: 0,
    countdown: null,     // { intervalId, value }
    locked: false,
    version: 0,
    lastPass: null,      // { from, to, ts } (public)
    pendingSignal: null, // { signer, ally, expiresAt }
    revealedPlayers: [], // players whose hands revealed
    gameActive: false,
    ready: {},           // username -> bool
    lastActive: Date.now(),
  };
}

export function getRoom(roomId) {
  return rooms[roomId];
}

function touchRoom(room) {
  if (!room) return;
  room.lastActive = Date.now();
}

/* =======================
   LOBBY
======================= */
export function addPlayer(roomId, username) {
  const room = rooms[roomId];
  if (!room) return;
  if (!room.players.includes(username)) {
    room.players.push(username);
    room.ready[username] = false;
    if (!room.host) room.host = username;
    room.version++;
    touchRoom(room);
  }
}

export function removePlayer(roomId, username) {
  const room = rooms[roomId];
  if (!room) return;
  room.players = room.players.filter((p) => p !== username);
  delete room.hands[username];
  delete room.cardCounts[username];
  delete room.ready[username];
  if (room.host === username) room.host = room.players[0] || null;
  room.version++;
  touchRoom(room);
}

/* =======================
   UTILS: mask public snapshot
   Returns object suitable for updateGame emit
   - players, host, turnIndex, cardCounts (lengths), version, lastPass, gameActive, revealedPlayers, locked
======================= */
export function publicSnapshot(roomId) {
  const room = rooms[roomId];
  if (!room) return null;
  const cardCounts = {};
  room.players.forEach((p) => {
    cardCounts[p] = Array.isArray(room.hands[p]) ? room.hands[p].length : (room.cardCounts[p] || 0);
  });
  return {
    players: [...room.players],
    host: room.host,
    turnIndex: room.turnIndex,
    cardCounts,
    version: room.version,
    lastPass: room.lastPass,
    gameActive: room.gameActive,
    revealedPlayers: [...room.revealedPlayers],
    locked: !!room.locked,
  };
}

/* =======================
   START GAME / COUNTDOWN
   Enforce single countdown, readiness, lock room when starting
======================= */
export function startCountdown(io, roomId, forcedBy = null) {
  const room = rooms[roomId];
  if (!room) return;
  touchRoom(room);

  // only allow when 2..4 players
  if (room.players.length < 2 || room.players.length > 4) return;

  // require all players ready (unless forcedBy is host and we allow forced start)
  const allReady = room.players.every((p) => room.ready[p]);
  if (!allReady && forcedBy !== room.host) {
    // do not start
    return;
  }

  if (room.countdown) {
    // already counting
    return;
  }

  room.locked = true; // prevent leaving/joins affecting start
  room.countdown = { intervalId: null, value: 5 };
  const emitCountdown = () => {
    io.to(roomId).emit("countdown", room.countdown.value);
  };
  emitCountdown();

  room.countdown.intervalId = setInterval(() => {
    room.countdown.value--;
    emitCountdown();
    if (room.countdown.value <= 0) {
      clearInterval(room.countdown.intervalId);
      room.countdown = null;

      // DEAL: authoritative on server
      room.deck = createDeck();
      shuffle(room.deck);
      room.hands = {};
      // For 4 players: one gets 5 randomly as spec; for 2-3 distribute as evenly as possible
      const playerCount = room.players.length;
      let fiveIndex = -1;
      if (playerCount === 4) fiveIndex = Math.floor(Math.random() * 4);

      room.players.forEach((p, idx) => {
        let count = 4;
        if (playerCount === 4) {
          count = idx === fiveIndex ? 5 : 4;
        } else {
          const base = Math.floor(17 / playerCount);
          const remainder = 17 % playerCount;
          count = base + (idx < remainder ? 1 : 0);
        }
        room.hands[p] = [];
        for (let k = 0; k < count; k++) {
          room.hands[p].push(room.deck.shift());
        }
      });

      // set turnIndex to fiveIndex if present else 0
      room.turnIndex = fiveIndex >= 0 ? fiveIndex : 0;
      room.gameActive = true;
      room.lastPass = null;
      room.pendingSignal = null;
      room.revealedPlayers = [];
      room.version++;
      touchRoom(room);

      // Private: send each player their own hand (init)
      room.players.forEach((p) => {
        const sid = room._socketMap?.[p];
        if (sid) {
          io.to(sid).emit("initHand", { hand: room.hands[p] || [], roomVersion: room.version });
        }
      });

      // Public canonical update (masked)
      io.to(roomId).emit("updateGame", publicSnapshot(roomId));
    }
  }, 1000);
}

/* =======================
   Rematch: re-deal to same players (host can trigger)
======================= */
export function rematchRoom(io, roomId) {
  const room = rooms[roomId];
  if (!room) return null;
  if (room.players.length < 2) return null;

  // reset internal deck/hands and deal similar to startCountdown (but immediate)
  room.deck = createDeck();
  shuffle(room.deck);
  room.hands = {};
  const playerCount = room.players.length;
  let fiveIndex = -1;
  if (playerCount === 4) fiveIndex = Math.floor(Math.random() * 4);

  room.players.forEach((p, idx) => {
    let count = 4;
    if (playerCount === 4) {
      count = idx === fiveIndex ? 5 : 4;
    } else {
      const base = Math.floor(17 / playerCount);
      const remainder = 17 % playerCount;
      count = base + (idx < remainder ? 1 : 0);
    }
    room.hands[p] = [];
    for (let k = 0; k < count; k++) {
      room.hands[p].push(room.deck.shift());
    }
  });

  room.turnIndex = fiveIndex >= 0 ? fiveIndex : 0;
  room.gameActive = true;
  room.lastPass = null;
  room.pendingSignal = null;
  room.revealedPlayers = [];
  room.version++;
  touchRoom(room);

  // send private initHand and public updateGame
  room.players.forEach((p) => {
    const sid = room._socketMap?.[p];
    if (sid) io.to(sid).emit("initHand", { hand: room.hands[p] || [], roomVersion: room.version });
  });
  io.to(roomId).emit("updateGame", publicSnapshot(roomId));
  return room;
}

/* =======================
   PASS CARD
   Server authoritative:
   - update server hands
   - record lastPass (from,to,ts) for animation
   - send passAnimation (no face) to all
   - send private receiveCard to recipient with face
   - emit one canonical updateGame (masked) with incremented version
======================= */
export function passCard(io, roomId, fromUsername, cardIndex) {
  const room = rooms[roomId];
  if (!room || !room.gameActive) return null;
  touchRoom(room);

  const currentPlayer = room.players[room.turnIndex];
  if (currentPlayer !== fromUsername) return null;

  const hand = room.hands[fromUsername];
  if (!Array.isArray(hand) || cardIndex == null || cardIndex < 0 || cardIndex >= hand.length) return null;

  // remove the card (server-side truth)
  const [card] = hand.splice(cardIndex, 1);

  // anticlockwise recipient calculation
  const nextIndex = (room.turnIndex + (room.players.length - 1)) % room.players.length;
  const nextPlayer = room.players[nextIndex];

  // append face to recipient's server hand
  if (!Array.isArray(room.hands[nextPlayer])) room.hands[nextPlayer] = [];
  room.hands[nextPlayer].push(card);

  // record lastPass for animation (no face included in public)
  room.lastPass = { from: fromUsername, to: nextPlayer, ts: Date.now() };

  // advance turn
  room.turnIndex = nextIndex;

  // increment version
  room.version++;
  touchRoom(room);

  // Save cardCounts (for convenience)
  room.players.forEach((p) => {
    room.cardCounts[p] = Array.isArray(room.hands[p]) ? room.hands[p].length : 0;
  });

  // Emit passAnimation (mask)
  io.to(roomId).emit("passAnimation", { from: fromUsername, to: nextPlayer, ts: room.lastPass.ts });

  // Private send face to recipient
  const sid = room._socketMap?.[nextPlayer];
  if (sid) {
    io.to(sid).emit("receiveCard", { from: fromUsername, to: nextPlayer, card, ts: Date.now(), roomVersion: room.version });
  }

  // One canonical public update
  io.to(roomId).emit("updateGame", publicSnapshot(roomId));
  console.log("PASS", roomId, fromUsername, "->", nextPlayer, "version", room.version);
  return room.lastPass;
}

/* =======================
   SIGNAL / CALL / SUSPECT (authoritative)
   Each action updates room state, increments version, and emits single updateGame.
======================= */
export function sendSignal(io, roomId, signerUsername) {
  const room = rooms[roomId];
  if (!room || room.players.length < 2 || !room.gameActive) return null;
  touchRoom(room);

  const signerIndex = room.players.indexOf(signerUsername);
  if (signerIndex === -1) return null;
  const allyIndex = (signerIndex + 2) % room.players.length;
  const allyName = room.players[allyIndex];

  room.pendingSignal = {
    signer: signerUsername,
    ally: allyName,
    expiresAt: Date.now() + 3000,
  };

  room.version++;
  io.to(roomId).emit("signalSent", { signer: signerUsername, ally: allyName, roomVersion: room.version });
  io.to(roomId).emit("playSound", { type: "signal" });
  io.to(roomId).emit("updateGame", publicSnapshot(roomId));
  touchRoom(room);
  return room.pendingSignal;
}

export function callJackwhot(io, roomId, callerUsername) {
  const room = rooms[roomId];
  if (!room || !room.pendingSignal || !room.gameActive) return null;
  touchRoom(room);

  const { ally, expiresAt } = room.pendingSignal;
  if (callerUsername !== ally) return null;
  if (Date.now() > expiresAt) {
    room.pendingSignal = null;
    room.version++;
    io.to(roomId).emit("updateGame", publicSnapshot(roomId));
    return null;
  }

  const allyIndex = room.players.indexOf(ally);
  const allyHand = room.hands[ally];
  if (!allyHand) return null;

  const counts = allyHand.reduce((acc, shape) => {
    acc[shape] = (acc[shape] || 0) + 1;
    return acc;
  }, {});
  const hasFour = Object.values(counts).some((c) => c >= 4);

  let winners = [];
  let winningTeam = null;

  if (hasFour) {
    if (room.players.length >= 4) {
      const teamIndices = allyIndex % 2 === 0 ? [0, 2] : [1, 3];
      winners = teamIndices.map((i) => room.players[i]).filter(Boolean);
      winningTeam = teamIndices[0] % 2 === 0 ? "A" : "B";
    } else {
      winners = [ally];
      winningTeam = "A";
    }
  } else {
    if (room.players.length >= 4) {
      const oppIndices = allyIndex % 2 === 0 ? [1, 3] : [0, 2];
      winners = oppIndices.map((i) => room.players[i]).filter(Boolean);
      winningTeam = oppIndices[0] % 2 === 0 ? "A" : "B";
    } else {
      winners = room.players.filter((p) => p !== ally);
      winningTeam = "B";
    }
  }

  room.pendingSignal = null;
  room.gameActive = false;
  room.version++;
  touchRoom(room);

  return { win: hasFour, winners, winningTeam };
}

export function suspectPlayer(io, roomId, suspector, target) {
  const room = rooms[roomId];
  if (!room || !room.gameActive) return null;
  if (!room.hands[target]) return null;
  touchRoom(room);

  if (!room.revealedPlayers.includes(target)) room.revealedPlayers.push(target);

  const targetHand = room.hands[target];
  const counts = targetHand.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {});
  const hasFour = Object.values(counts).some((c) => c >= 4);

  let winners = [];
  let winningTeam = null;

  const targetIndex = room.players.indexOf(target);
  const suspectorIndex = room.players.indexOf(suspector);

  if (hasFour) {
    if (room.players.length >= 4) {
      const teamIndices = suspectorIndex % 2 === 0 ? [0, 2] : [1, 3];
      winners = teamIndices.map((i) => room.players[i]).filter(Boolean);
      winningTeam = teamIndices[0] % 2 === 0 ? "A" : "B";
    } else {
      winners = [suspector];
      winningTeam = "A";
    }
  } else {
    if (room.players.length >= 4) {
      const teamIndices = targetIndex % 2 === 0 ? [0, 2] : [1, 3];
      winners = teamIndices.map((i) => room.players[i]).filter(Boolean);
      winningTeam = teamIndices[0] % 2 === 0 ? "A" : "B";
    } else {
      winners = [target];
      winningTeam = "B";
    }
  }

  room.pendingSignal = null;
  room.gameActive = false;
  room.version++;
  touchRoom(room);

  return { win: hasFour, winners, winningTeam };
}

/* =======================
   Host actions
======================= */
export function swapPlayers(roomId, indexA, indexB) {
  const room = rooms[roomId];
  if (!room) return;
  if (indexA == null || indexB == null || indexA < 0 || indexB < 0 || indexA >= room.players.length || indexB >= room.players.length) return;
  const tmp = room.players[indexA];
  room.players[indexA] = room.players[indexB];
  room.players[indexB] = tmp;
  room.host = room.players[0] || null;
  room.version++;
  touchRoom(room);
}

export function kickPlayer(roomId, username) {
  const room = rooms[roomId];
  if (!room) return;
  room.players = room.players.filter((p) => p !== username);
  delete room.hands[username];
  delete room.ready[username];
  if (room.host === username) room.host = room.players[0] || null;
  room.version++;
  touchRoom(room);
}

/* =======================
   READY
======================= */
export function setPlayerReady(roomId, username, ready) {
  const room = rooms[roomId];
  if (!room) return;
  room.ready[username] = !!ready;
  room.version++;
  touchRoom(room);
}

/* =======================
   Rejoin / Sync helpers
   - attach socket id mapping for private emits
   - on rejoin, send public snapshot + private syncHand to requester
======================= */
export function attachSocket(roomId, username, socketId) {
  const room = rooms[roomId];
  if (!room) return;
  if (!room._socketMap) room._socketMap = {};
  room._socketMap[username] = socketId;
  touchRoom(room);
}

/* =======================
   Inactivity cleanup
======================= */
export function cleanupInactiveRooms(io, maxIdleMs = 5 * 60 * 1000) {
  const now = Date.now();
  Object.keys(rooms).forEach((roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.lastActive && (now - room.lastActive) > maxIdleMs) {
      console.log("CLEANUP: destroying inactive room", roomId);
      try {
        // notify connected sockets if any
        io.to(roomId).emit("roomExpired", { roomId, reason: "inactive" });
      } catch (e) {}
      // clear countdown
      if (room.countdown && room.countdown.intervalId) {
        try { clearInterval(room.countdown.intervalId); } catch (e) {}
      }
      delete rooms[roomId];
    }
  });
}

/* =======================
   Utility: clear countdown intervals on shutdown
======================= */
export function clearAllCountdowns() {
  Object.values(rooms).forEach((room) => {
    if (room && room.countdown && room.countdown.intervalId) {
      try { clearInterval(room.countdown.intervalId); } catch (e) {}
      room.countdown = null;
    }
  });
}

export default {
  createRoom,
  getRoom,
  addPlayer,
  removePlayer,
  setPlayerReady,
  startCountdown,
  rematchRoom,
  passCard,
  sendSignal,
  callJackwhot,
  suspectPlayer,
  swapPlayers,
  kickPlayer,
  attachSocket,
  cleanupInactiveRooms,
  clearAllCountdowns,
  publicSnapshot,
};