import React, { useState, useEffect } from "react";

const CARD_EMOJIS = {
  Circle: "⚫",
  Square: "⬛",
  Triangle: "🖤",
  Cross: "➕",
};
const CARD_BACK = "🃏";

export default function Kemps({ user, socket, roomId }) {
  const [hands, setHands] = useState({});
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [message, setMessage] = useState("");
  const [turnIndex, setTurnIndex] = useState(0);
  const [currentTurnUsername, setCurrentTurnUsername] = useState(null);
  const [showJackwhot, setShowJackwhot] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [countdown, setCountdown] = useState(5);
  const [gameStarted, setGameStarted] = useState(false);
  const [signalDisabled, setSignalDisabled] = useState(false);

  // Compute positions (guard against missing players)
  const myIndex = lobbyPlayers.indexOf(user.username);
  const ally = myIndex >= 0 ? lobbyPlayers[(myIndex + 2) % 4] : "Ally";
  const enemyLeft = myIndex >= 0 ? lobbyPlayers[(myIndex + 3) % 4] : "Left";
  const enemyRight = myIndex >= 0 ? lobbyPlayers[(myIndex + 1) % 4] : "Right";

  // JOIN LOBBY & GAME LISTENERS
  useEffect(() => {
    if (!socket || !roomId) return;

    // Ensure we are in the server room (server will avoid duplicates)
    socket.emit("joinRoom", { roomId, username: user.username });

    socket.on("updateLobby", (players) => {
      setLobbyPlayers(players || []);
    });

    socket.on("countdown", (seconds) => {
      setCountdown(seconds);
      if (seconds === 0) setGameStarted(true);
    });

    socket.on("startGame", (room) => {
      setHands(room.hands || {});
      setLobbyPlayers(room.players || []);
      setGameStarted(true);
      setMessage("Game started!");
      setTurnIndex(room.turnIndex ?? 0);
      setCurrentTurnUsername((room.players || [])[room.turnIndex ?? 0]);
      setSelectedIndex(null);
    });

    socket.on("updateGame", (room) => {
      setHands(room.hands || {});
      setLobbyPlayers(room.players || []);
      setTurnIndex(room.turnIndex ?? 0);
      setCurrentTurnUsername((room.players || [])[room.turnIndex ?? 0]);
      setSelectedIndex(null);
    });

    socket.on("jackwhotResult", (win) => {
      setMessage(win ? "🎉 JACKWHOT! Your team wins!" : "❌ False signal! Opponents win!");
      setShowJackwhot(win);
      setSignalDisabled(false);
      if (win) setTimeout(() => setShowJackwhot(false), 3000);
    });

    return () => {
      socket.off("updateLobby");
      socket.off("countdown");
      socket.off("startGame");
      socket.off("updateGame");
      socket.off("jackwhotResult");
    };
  }, [socket, roomId, user.username]);

  // SELECT / PASS CARD
  const selectCard = (index) => {
    if (currentTurnUsername !== user.username) {
      setMessage("Not your turn ⚠️");
      return;
    }
    setSelectedIndex(index);
    setMessage("");
  };

  const passCard = () => {
    if (currentTurnUsername !== user.username) {
      setMessage("It's not your turn to pass");
      return;
    }
    if (selectedIndex === null) return setMessage("Select a card first ⚠️");
    socket.emit("passCard", { roomId, fromUsername: user.username, cardIndex: selectedIndex });
    setSelectedIndex(null);
  };

  const signalJackwhot = () => {
    // disable repeated signals until result
    setSignalDisabled(true);
    socket.emit("sendSignal", { roomId, username: user.username });
  };

  const leaveRoom = () => {
    socket.emit("leaveRoom", { roomId, username: user.username });
    window.location.reload();
  };

  // RENDER HANDS
  const renderCards = (playerUsername, small = false) => (
    <div className="flex gap-1 mt-1">
      {(hands[playerUsername] || []).map((card, i) => {
        const isYou = playerUsername === user.username;
        return (
          <div
            key={i}
            onClick={() => isYou && selectCard(i)}
            className={`flex items-center justify-center
              bg-white text-black border border-black rounded-md
              select-none ${isYou ? "cursor-pointer" : "cursor-default"}
              ${small ? "w-8 h-12 text-lg" : "w-10 h-16 text-2xl"}
              ${isYou && selectedIndex === i ? "ring-2 ring-yellow-400" : ""}`}
          >
            {isYou ? CARD_EMOJIS[card] : CARD_BACK}
          </div>
        );
      })}
    </div>
  );

  // LOBBY VIEW
  if (!gameStarted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-green-900 text-white p-4">
        <h1 className="text-lg font-bold mb-2">Lobby - Room {roomId}</h1>
        <div className="bg-green-700 p-3 rounded w-80">
          <p className="text-sm font-semibold mb-1">Players in lobby:</p>
          {lobbyPlayers.map((p, i) => (
            <p key={i} className="text-xs">{p}</p>
          ))}
        </div>

        {lobbyPlayers.length === 4 && (
          <p className="mt-2 text-yellow-300 font-bold">
            Game starting in: {countdown}...
          </p>
        )}

        <button
          onClick={leaveRoom}
          className="mt-4 bg-red-500 hover:bg-red-600 text-white px-4 py-1 rounded"
        >
          Leave Lobby
        </button>
      </div>
    );
  }

  // GAME VIEW
  return (
    <div className="min-h-screen bg-green-900 text-white flex flex-col items-center p-2">
      <h1 className="text-lg font-bold">Kemps (Jackwhot)</h1>
      <p className="text-xs mb-1">Player: {user.username}</p>

      {hands[user.username] && (
        <div className="relative w-full max-w-sm aspect-square bg-green-700 rounded-lg mt-2">

          <div className="absolute top-1 left-1/2 -translate-x-1/2 text-xs">
            <p className="text-center">Ally: {ally}</p>
            {renderCards(ally, true)}
          </div>

          <div className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 text-xs">
            <p className="text-center">Opponent: {enemyLeft}</p>
            {renderCards(enemyLeft, true)}
          </div>

          <div className="absolute right-0 top-1/2 -translate-y-1/2 rotate-90 text-xs">
            <p className="text-center">Opponent: {enemyRight}</p>
            {renderCards(enemyRight, true)}
          </div>

          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs">
            <p className="text-center">You</p>
            {renderCards(user.username)}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <button
          onClick={passCard}
          disabled={currentTurnUsername !== user.username}
          className={`px-4 py-1 rounded text-sm ${currentTurnUsername === user.username ? "bg-white text-green-800" : "bg-zinc-700 text-zinc-300 cursor-not-allowed"}`}
        >
          Pass Selected
        </button>

        <button
          onClick={signalJackwhot}
          disabled={signalDisabled}
          className={`px-4 py-1 rounded text-sm ${signalDisabled ? "bg-yellow-200 text-gray-700 cursor-not-allowed" : "bg-yellow-400 text-black"}`}
        >
          Signal JACKWHOT
        </button>

        {showJackwhot && (
          <div className="animate-bounce bg-white text-green-800 px-3 py-1 rounded text-sm text-center">
            JACKWHOT! 🎉
          </div>
        )}
      </div>

      {message && (
        <p className="mt-2 text-xs text-center font-semibold">{message}</p>
      )}

      <p className="mt-1 text-xs">
        Turn: <span className="font-bold">{currentTurnUsername ?? "—"}</span>
      </p>

      <button
        onClick={leaveRoom}
        className="mt-3 bg-red-500 hover:bg-red-600 text-white px-4 py-1 rounded"
      >
        Leave Game
      </button>
    </div>
  );
}