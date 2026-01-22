// Full rooms.js with ready map + rematch included
const rooms = {};

/* =======================
   HELPERS
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
    hands: {},
    deck: [],
    turnIndex: 0,
    countdown: null,
    countdownValue: 5,
    lastPass: null, // { from, to, card, ts }
    pendingSignal: null, // { signer, ally, expiresAt }
    revealedPlayers: [], // players whose hands are revealed due to suspect
    gameActive: false,
    ready: {}, // username -> boolean
  };
}

export function getRoom(roomId) {
  return rooms[roomId];
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
    // set first joined as host
    if (!room.host) room.host = username;
  }
}

export function removePlayer(roomId, username) {
  const room = rooms[roomId];
  if (!room) return;

  room.players = room.players.filter((p) => p !== username);
  delete room.hands[username];
  delete room.ready[username];
  if (room.host === username) {
    // pick new host if possible
    room.host = room.players[0] || null;
  }
}

/* =======================
   READY
======================= */
export function setPlayerReady(roomId, username, ready) {
  const room = rooms[roomId];
  if (!room) return;
  room.ready[username] = !!ready;
}

/* =======================
   START GAME
   Deal ratio: 4,4,4,5 (random player gets 5 and starts)
   Start allowed only for 2..4 players (host manually starts)
======================= */
export function startCountdown(io, roomId) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.players.length < 2 || room.players.length > 4) return; // enforce 2-4 players
  if (room.countdown) return;

  room.countdownValue = 5;
  io.to(roomId).emit("countdown", room.countdownValue);

  room.countdown = setInterval(() => {
    room.countdownValue--;
    io.to(roomId).emit("countdown", room.countdownValue);

    if (room.countdownValue <= 0) {
      clearInterval(room.countdown);
      room.countdown = null;

      // DEAL CARDS with ratios 4,4,4,5
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

      io.to(roomId).emit("startGame", room);
    }
  }, 1000);
}

/* =======================
   rematch: deal again to same players, keep host/room
======================= */
export function rematchRoom(io, roomId) {
  const room = rooms[roomId];
  if (!room) return null;
  if (room.players.length < 2) return null;

  // new deck & shuffle
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

  io.to(roomId).emit("startGame", room);
  return room;
}

/* =======================
   GAME LOGIC
   passCard accepts a card index (server enforces turn)
   Passing is anticlockwise: nextIdx = (turnIndex + playersLen - 1) % playersLen
======================= */
export function passCard(roomId, fromUsername, cardIndex) {
  const room = rooms[roomId];
  if (!room || !room.gameActive) return null;

  const currentPlayer = room.players[room.turnIndex];
  if (currentPlayer !== fromUsername) return null;

  const hand = room.hands[fromUsername];
  if (!hand || cardIndex == null || cardIndex < 0 || cardIndex >= hand.length) return null;

  // remove card by index
  const [card] = hand.splice(cardIndex, 1);

  // anticlockwise relative to player order (previous player index)
  const playerLen = room.players.length;
  const nextIndex = (room.turnIndex + playerLen - 1) % playerLen; // anticlockwise
  const nextPlayer = room.players[nextIndex];

  // ensure recipient hand exists
  if (!room.hands[nextPlayer]) room.hands[nextPlayer] = [];
  room.hands[nextPlayer].push(card);

  // record lastPass for animation & POV
  room.lastPass = {
    from: fromUsername,
    to: nextPlayer,
    card,
    ts: Date.now(),
  };

  // advance turn
  room.turnIndex = nextIndex;

  return room.lastPass;
}

/* =======================
   SIGNAL FLOW (unchanged)
   sendSignal, callJackwhot, suspectPlayer follow previous logic
   (copy implementations from earlier file version)
======================= */

export function sendSignal(roomId, signerUsername) {
  const room = rooms[roomId];
  if (!room || room.players.length < 2 || !room.gameActive) return null;

  const signerIndex = room.players.indexOf(signerUsername);
  if (signerIndex === -1) return null;

  const allyIndex = (signerIndex + 2) % room.players.length;
  const allyName = room.players[allyIndex];

  room.pendingSignal = {
    signer: signerUsername,
    ally: allyName,
    expiresAt: Date.now() + 3000,
  };

  return { signer: signerUsername, ally: allyName };
}

export function callJackwhot(roomId, callerUsername) {
  const room = rooms[roomId];
  if (!room || !room.pendingSignal || !room.gameActive) return null;

  const { ally, expiresAt } = room.pendingSignal;
  if (callerUsername !== ally) return null;
  if (Date.now() > expiresAt) {
    room.pendingSignal = null;
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

  return { win: hasFour, winners, winningTeam };
}

export function suspectPlayer(roomId, suspector, target) {
  const room = rooms[roomId];
  if (!room || !room.gameActive) return null;
  if (!room.hands[target]) return null;

  if (!room.revealedPlayers.includes(target)) room.revealedPlayers.push(target);

  const targetHand = room.hands[target];
  const counts = targetHand.reduce((acc, s) => {
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

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

  return { win: hasFour, winners, winningTeam };
}

/* =======================
   Host actions
======================= */
export function swapPlayers(roomId, indexA, indexB) {
  const room = rooms[roomId];
  if (!room) return;
  if (
    indexA == null ||
    indexB == null ||
    indexA < 0 ||
    indexB < 0 ||
    indexA >= room.players.length ||
    indexB >= room.players.length
  )
    return;

  const tmp = room.players[indexA];
  room.players[indexA] = room.players[indexB];
  room.players[indexB] = tmp;
  // adjust host pointer if needed
  room.host = room.players[0] || null;
}

export function kickPlayer(roomId, username) {
  const room = rooms[roomId];
  if (!room) return;
  room.players = room.players.filter((p) => p !== username);
  delete room.hands[username];
  delete room.ready[username];
  if (room.host === username) room.host = room.players[0] || null;
}

/* =======================
   Utility: clear countdown intervals on shutdown
======================= */
export function clearAllCountdowns() {
  Object.values(rooms).forEach((room) => {
    if (room && room.countdown) {
      try {
        clearInterval(room.countdown);
      } catch (e) {
        // ignore
      }
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
  clearAllCountdowns,
};