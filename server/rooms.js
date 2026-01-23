// server/rooms.js
// Authoritative room state manager (self-contained)
// - each room has version, lastActive, locked, countdown (interval id), hands (server-side full faces)
// - public updateGame emits a masked view (cardCounts) + version
// - private events: initHand, receiveCard, syncHand

const rooms = {};

/* =======================
   HELPERS (self-contained)
======================= */
// Deck counts per spec: 5 × Circle, 4 × Square, 4 × Cross, 4 × Heart (total 17)
function createDeck() {
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
    cardCounts: {},      // public counts (convenience)
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
    _socketMap: {},      // username -> socketId for private emits
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
  if (room._socketMap && room._socketMap[username]) delete room._socketMap[username];
  room.version++;
  touchRoom(room);
}

/* =======================
   PUBLIC SNAPSHOT (masked)
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
   COUNTDOWN / START (server authoritative)
   - single countdown per room
   - requires all ready unless forced by host
   - locks room while countdown runs
   - deals on expire and emits canonical events
======================= */
export function startCountdown(io, roomId, forcedBy = null) {
  const room = rooms[roomId];
  if (!room) return;
  touchRoom(room);

  if (room.players.length < 2 || room.players.length > 4) return;

  const allReady = room.players.every((p) => room.ready[p]);
  if (!allReady && forcedBy !== room.host) {
    // do not start if not all ready and not forced by host
    return;
  }

  if (room.countdown) return; // already counting

  room.locked = true;
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

      // DEAL authoritative
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

      // send private initHand to each player (if socket mapping exists)
      room.players.forEach((p) => {
        const sid = room._socketMap?.[p];
        if (sid) io.to(sid).emit("initHand", { hand: room.hands[p] || [], roomVersion: room.version });
      });

      // send canonical public snapshot
      io.to(roomId).emit("updateGame", publicSnapshot(roomId));
      console.log("START_GAME", roomId, "version", room.version);
    }
  }, 1000);
}

/* =======================
   REMATCH
======================= */
export function rematchRoom(io, roomId) {
  const room = rooms[roomId];
  if (!room) return null;
  if (room.players.length < 2) return null;

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

  room.players.forEach((p) => {
    const sid = room._socketMap?.[p];
    if (sid) io.to(sid).emit("initHand", { hand: room.hands[p] || [], roomVersion: room.version });
  });
  io.to(roomId).emit("updateGame", publicSnapshot(roomId));
  console.log("REMATCH", roomId, "version", room.version);
  return room;
}

/* =======================
   PASS CARD (authoritative)
   - server updates hands
   - emits passAnimation (mask) to room
   - emits private receiveCard to recipient
   - emits canonical updateGame
======================= */
export function passCard(io, roomId, fromUsername, cardIndex) {
  const room = rooms[roomId];
  if (!room || !room.gameActive) return null;
  touchRoom(room);

  const currentPlayer = room.players[room.turnIndex];
  if (currentPlayer !== fromUsername) return null;

  const hand = room.hands[fromUsername];
  if (!Array.isArray(hand) || cardIndex == null || cardIndex < 0 || cardIndex >= hand.length) return null;

  const [card] = hand.splice(cardIndex, 1);

  const nextIndex = (room.turnIndex + (room.players.length - 1)) % room.players.length;
  const nextPlayer = room.players[nextIndex];

  if (!Array.isArray(room.hands[nextPlayer])) room.hands[nextPlayer] = [];
  room.hands[nextPlayer].push(card);

  room.lastPass = { from: fromUsername, to: nextPlayer, ts: Date.now() };
  room.turnIndex = nextIndex;
  room.version++;
  touchRoom(room);

  // update cardCounts
  room.players.forEach((p) => {
    room.cardCounts[p] = Array.isArray(room.hands[p]) ? room.hands[p].length : 0;
  });

  io.to(roomId).emit("passAnimation", { from: fromUsername, to: nextPlayer, ts: room.lastPass.ts });

  const sid = room._socketMap?.[nextPlayer];
  if (sid) {
    io.to(sid).emit("receiveCard", { from: fromUsername, to: nextPlayer, card, ts: Date.now(), roomVersion: room.version });
  }

  io.to(roomId).emit("updateGame", publicSnapshot(roomId));
  console.log("PASS", roomId, fromUsername, "->", nextPlayer, "version", room.version);
  return room.lastPass;
}

/* =======================
   SIGNAL / CALL / SUSPECT
   - update room state, increment version, emit canonical updateGame
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
  console.log("SIGNAL", roomId, signerUsername, "ally", allyName, "version", room.version);
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

  const counts = allyHand.reduce((acc, shape) => { acc[shape] = (acc[shape] || 0) + 1; return acc; }, {});
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

  // Return resolution data; higher-level code (index.js) may award points and broadcast gameOver
  console.log("CALL_JACKWHOT", roomId, callerUsername, "win?", hasFour, "version", room.version);
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

  console.log("SUSPECT", roomId, suspector, "target", target, "win?", hasFour, "version", room.version);
  return { win: hasFour, winners, winningTeam };
}

/* =======================
   HOST ACTIONS
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
  if (room._socketMap && room._socketMap[username]) delete room._socketMap[username];
  room.version++;
  touchRoom(room);
}

/* =======================
   READY / ATTACH SOCKET
======================= */
export function setPlayerReady(roomId, username, ready) {
  const room = rooms[roomId];
  if (!room) return;
  room.ready[username] = !!ready;
  room.version++;
  touchRoom(room);
}

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
        io.to(roomId).emit("roomExpired", { roomId, reason: "inactive" });
      } catch (e) {}
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