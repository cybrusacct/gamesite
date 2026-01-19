const rooms = {};

/* =======================
   HELPERS
======================= */
function createDeck() {
  const shapes = ["Circle", "Square", "Triangle", "Cross"];
  const deck = [];
  shapes.forEach(s => {
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
    hands: {},
    deck: [],
    turnIndex: 0,
    countdown: null,
    countdownValue: 5,
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
  }
}

export function removePlayer(roomId, username) {
  const room = rooms[roomId];
  if (!room) return;

  room.players = room.players.filter(p => p !== username);
  delete room.hands[username];
}

/* =======================
   START GAME
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

      // DEAL CARDS
      room.deck = createDeck();
      shuffle(room.deck);

      room.hands = {};
      room.players.forEach(p => {
        room.hands[p] = room.deck.splice(0, 5);
      });

      room.turnIndex = 0;
      io.to(roomId).emit("startGame", room);
    }
  }, 1000);
}

/* =======================
   GAME LOGIC
   passCard now accepts a card index (to handle duplicates)
======================= */
export function passCard(roomId, fromUsername, cardIndex) {
  const room = rooms[roomId];
  if (!room) return;

  const currentPlayer = room.players[room.turnIndex];
  if (currentPlayer !== fromUsername) return;

  const hand = room.hands[fromUsername];
  if (!hand || cardIndex == null || cardIndex < 0 || cardIndex >= hand.length) return;

  // remove card by index
  const [card] = hand.splice(cardIndex, 1);

  const nextIndex = (room.turnIndex + 1) % 4;
  const nextPlayer = room.players[nextIndex];

  room.hands[nextPlayer].push(card);
  room.turnIndex = nextIndex;
}

/* =======================
   JACKWHOT SIGNAL CHECK
   Returns true if the signer's ally currently has 4 of the same shape.
======================= */
export function handleSignal(roomId, signerUsername) {
  const room = rooms[roomId];
  if (!room || room.players.length !== 4) return false;

  const signerIndex = room.players.indexOf(signerUsername);
  if (signerIndex === -1) return false;

  const allyIndex = (signerIndex + 2) % 4;
  const allyName = room.players[allyIndex];
  const allyHand = room.hands[allyName];
  if (!allyHand) return false;

  // Count shapes
  const counts = allyHand.reduce((acc, shape) => {
    acc[shape] = (acc[shape] || 0) + 1;
    return acc;
  }, {});

  return Object.values(counts).some(c => c >= 4);
}