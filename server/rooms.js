const rooms = {};

/* =======================
   HELPERS
======================= */
function createDeck() {
  const shapes = ["Circle", "Square", "Triangle", "Cross"];
  const deck = [];
  shapes.forEach((s) => {
    for (let i = 0; i < 13; i++) deck.push(s);
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
    // set first joined as host
    if (!room.host) room.host = username;
  }
}

export function removePlayer(roomId, username) {
  const room = rooms[roomId];
  if (!room) return;

  room.players = room.players.filter((p) => p !== username);
  delete room.hands[username];
  if (room.host === username) {
    // pick new host if possible
    room.host = room.players[0] || null;
  }
}

/* =======================
   START GAME
   Deal ratio: 4,4,4,5 (random player gets 5 and starts)
======================= */
export function startCountdown(io, roomId) {
  const room = rooms[roomId];
  if (!room || room.players.length !== 4 || room.countdown) return;

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
      // choose random player index to get 5 cards
      const fiveIndex = Math.floor(Math.random() * 4);

      room.players.forEach((p, idx) => {
        const count = idx === fiveIndex ? 5 : 4;
        room.hands[p] = [];
        for (let k = 0; k < count; k++) {
          room.hands[p].push(room.deck.shift());
        }
      });

      // starting player is the one with 5 cards
      room.turnIndex = fiveIndex;
      room.gameActive = true;
      room.lastPass = null;
      room.pendingSignal = null;
      room.revealedPlayers = [];

      io.to(roomId).emit("startGame", room);
    }
  }, 1000);
}

/* =======================
   GAME LOGIC
   passCard accepts a card index (server enforces turn)
   Passing is anticlockwise: nextIdx = (turnIndex + 3) % 4
======================= */
export function passCard(roomId, fromUsername, cardIndex) {
  const room = rooms[roomId];
  if (!room || !room.gameActive) return;

  const currentPlayer = room.players[room.turnIndex];
  if (currentPlayer !== fromUsername) return;

  const hand = room.hands[fromUsername];
  if (!hand || cardIndex == null || cardIndex < 0 || cardIndex >= hand.length) return;

  // remove card by index
  const [card] = hand.splice(cardIndex, 1);

  const nextIndex = (room.turnIndex + 3) % 4; // anticlockwise
  const nextPlayer = room.players[nextIndex];

  room.hands[nextPlayer].push(card);
  // record lastPass for animation & POV
  room.lastPass = {
    from: fromUsername,
    to: nextPlayer,
    card,
    ts: Date.now(),
  };

  room.turnIndex = nextIndex;
}

/* =======================
   SIGNAL FLOW
   sendSignal sets pending signal that allows ally to call Jackwhot within 3s
======================= */
export function sendSignal(roomId, signerUsername) {
  const room = rooms[roomId];
  if (!room || room.players.length !== 4 || !room.gameActive) return null;

  const signerIndex = room.players.indexOf(signerUsername);
  if (signerIndex === -1) return null;

  const allyIndex = (signerIndex + 2) % 4;
  const allyName = room.players[allyIndex];

  room.pendingSignal = {
    signer: signerUsername,
    ally: allyName,
    expiresAt: Date.now() + 3000,
  };

  // Return data for emit
  return { signer: signerUsername, ally: allyName };
}

/* =======================
   callJackwhot: ally clicks JACKWHOT within signal window
   returns { win: boolean, winners: [usernames], winningTeam: "A"|"B" }
   Team A = indices 0 & 2, Team B = 1 & 3
======================= */
export function callJackwhot(roomId, callerUsername) {
  const room = rooms[roomId];
  if (!room || !room.pendingSignal || !room.gameActive) return null;

  const { ally, expiresAt } = room.pendingSignal;
  // ensure caller is the ally and within time
  if (callerUsername !== ally) return null;
  if (Date.now() > expiresAt) {
    // expired
    room.pendingSignal = null;
    return null;
  }

  const signerIndex = room.players.indexOf(room.pendingSignal.signer);
  const allyIndex = room.players.indexOf(ally);
  const allyHand = room.hands[ally];
  if (!allyHand) return null;

  // Count shapes
  const counts = allyHand.reduce((acc, shape) => {
    acc[shape] = (acc[shape] || 0) + 1;
    return acc;
  }, {});

  const hasFour = Object.values(counts).some((c) => c >= 4);

  let winners = [];
  let winningTeam = null;

  if (hasFour) {
    // ally's team wins
    const teamIndices = allyIndex % 2 === 0 ? [0, 2] : [1, 3];
    winners = teamIndices.map((i) => room.players[i]);
    winningTeam = teamIndices[0] % 2 === 0 ? "A" : "B";
  } else {
    // opponents win
    const oppIndices = allyIndex % 2 === 0 ? [1, 3] : [0, 2];
    winners = oppIndices.map((i) => room.players[i]);
    winningTeam = oppIndices[0] % 2 === 0 ? "A" : "B";
  }

  // clear pending signal
  room.pendingSignal = null;
  // game ends
  room.gameActive = false;

  return { win: hasFour, winners, winningTeam };
}

/* =======================
   Suspect flow:
   suspector picks a target; target's cards are revealed to everyone then resolved.
   If target has 4-of-a-kind => suspector's team wins, else target's team wins.
======================= */
export function suspectPlayer(roomId, suspector, target) {
  const room = rooms[roomId];
  if (!room || !room.gameActive) return null;
  if (!room.hands[target]) return null;

  room.revealedPlayers.push(target);

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
    // suspector's team wins
    const teamIndices = suspectorIndex % 2 === 0 ? [0, 2] : [1, 3];
    winners = teamIndices.map((i) => room.players[i]);
    winningTeam = teamIndices[0] % 2 === 0 ? "A" : "B";
  } else {
    // target's team wins
    const teamIndices = targetIndex % 2 === 0 ? [0, 2] : [1, 3];
    winners = teamIndices.map((i) => room.players[i]);
    winningTeam = teamIndices[0] % 2 === 0 ? "A" : "B";
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