import React, { useState, useEffect } from "react";
import Card from "../../components/Card";
import CardAnimation from "../../components/CardAnimation";
import Avatar from "../../components/Avatar";
import ConfettiOverlay from "../../components/ConfettiOverlay";
import RedOverlay from "../../components/RedOverlay";
import useSocket from "../../hooks/useSocket";
import { playPass } from "../../utils/sounds";

/*
  Classic Kemps board layout:
   - big centered green board
   - ally row top (backs)
   - left/right opponents vertical stacks (backs)
   - player hand at bottom (faces)

  Fixes:
  - normalize hands from server payload so every player has an array (prevents undefined)
  - always render backs for opponents/ally unless revealed
  - use data-player-area attributes for CardAnimation
*/

export default function Kemps({ user, socket: socketProp, roomId }) {
  const socket = socketProp || useSocket();

  const [hands, setHands] = useState({});
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [currentTurnUsername, setCurrentTurnUsername] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [revealedPlayers, setRevealedPlayers] = useState([]);
  const [lastPassAnim, setLastPassAnim] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showRed, setShowRed] = useState(false);
  const [gameOverInfo, setGameOverInfo] = useState(null);
  const [showGameOver, setShowGameOver] = useState(false);

  // compute positions robustly even if players missing
  const myIndex = lobbyPlayers.indexOf(user?.username);
  const ally = myIndex >= 0 && lobbyPlayers.length > 0 ? lobbyPlayers[(myIndex + 2) % lobbyPlayers.length] : null;
  const enemyLeft = myIndex >= 0 && lobbyPlayers.length > 0 ? lobbyPlayers[(myIndex + (lobbyPlayers.length - 1)) % lobbyPlayers.length] : null;
  const enemyRight = myIndex >= 0 && lobbyPlayers.length > 0 ? lobbyPlayers[(myIndex + 1) % lobbyPlayers.length] : null;

  // helper: normalize hands so every player has an array (prevents undefined)
  function normalizeHands(room) {
    const normalized = {};
    const players = room?.players || [];
    players.forEach((p) => {
      normalized[p] = (room?.hands && Array.isArray(room.hands[p])) ? [...room.hands[p]] : [];
    });
    return normalized;
  }

  useEffect(() => {
    if (!socket || !roomId) return;
    // join room (server manages duplicates)
    socket.emit("joinRoom", { roomId, username: user.username });

    const onUpdateLobby = (payload) => {
      const players = Array.isArray(payload) ? payload : payload?.players || [];
      setLobbyPlayers(players || []);
    };
    socket.on("updateLobby", onUpdateLobby);

    socket.on("startGame", (room) => {
      const players = room?.players || [];
      setLobbyPlayers(players);
      setHands(normalizeHands(room));
      setGameStarted(true);
      setCurrentTurnUsername(players[room?.turnIndex ?? 0] || null);
      setRevealedPlayers(room?.revealedPlayers || []);
      setShowGameOver(false);
      setGameOverInfo(null);
    });

    socket.on("updateGame", (room) => {
      setLobbyPlayers(room?.players || []);
      setHands(normalizeHands(room));
      setCurrentTurnUsername((room?.players || [])[room?.turnIndex ?? 0] || null);

      if (room?.lastPass) {
        setLastPassAnim(room.lastPass);
        setTimeout(() => setLastPassAnim(null), 800);
      } else {
        setLastPassAnim(null);
      }
    });

    socket.on("passAnimation", (data) => {
      // show only back
      setLastPassAnim(data);
      playPass();
      setTimeout(() => setLastPassAnim(null), 800);
    });

    socket.on("revealCards", ({ target, hands: newHands }) => {
      setRevealedPlayers((prev) => (prev.includes(target) ? prev : [...prev, target]));
      if (newHands) {
        // ensure normalized structure when server provides hands
        const roomLike = { players: lobbyPlayers, hands: newHands };
        setHands(normalizeHands(roomLike));
      }
    });

    socket.on("gameOver", (info) => {
      setGameOverInfo(info);
      setShowGameOver(true);
      setHands(normalizeHands({ players: info?.players || lobbyPlayers, hands: info.hands || {} }));
      setRevealedPlayers(Object.keys(info.hands || {}));
      if (info.winners && info.winners.includes(user.username)) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2400);
      } else {
        setShowRed(true);
        setTimeout(() => setShowRed(false), 2000);
      }
    });

    // cleanup
    return () => {
      socket.off("updateLobby", onUpdateLobby);
      socket.off("startGame");
      socket.off("updateGame");
      socket.off("passAnimation");
      socket.off("revealCards");
      socket.off("gameOver");
    };
  }, [socket, roomId, user.username]);

  const selectCard = (index) => {
    if (currentTurnUsername !== user.username) return;
    setSelectedIndex(index);
  };

  const passCard = () => {
    if (currentTurnUsername !== user.username) return;
    if (selectedIndex == null) return;
    socket.emit("passCard", { roomId, fromUsername: user.username, cardIndex: selectedIndex });
    setSelectedIndex(null);
  };

  const signal = () => socket.emit("sendSignal", { roomId, username: user.username });
  const callJack = () => socket.emit("callJackwhot", { roomId, callerUsername: user.username });
  const openSuspectList = () => {}; // UI handled elsewhere
  const suspectTarget = (target) => socket.emit("suspect", { roomId, suspector: user.username, target });

  // safe read for hands
  const safeHand = (uname) => (hands && Array.isArray(hands[uname]) ? hands[uname] : []);

  // render player's cards (faceUp if you or revealed)
  const renderPlayerCards = (playerUsername, small = false) => {
    const isYou = playerUsername === user.username;
    const isRevealed = revealedPlayers.includes(playerUsername);
    const cards = safeHand(playerUsername);
    const size = small ? "sm" : "md";
    return (
      <div className={`flex ${small ? "gap-2" : "gap-3"} items-center justify-center`}>
        {cards.map((card, i) => {
          const faceUp = isYou || isRevealed;
          return (
            <div key={`${playerUsername}-${i}`} onClick={() => isYou && selectCard(i)} style={{ cursor: isYou ? "pointer" : "default" }}>
              <Card face={card} faceUp={faceUp} size={size} selected={isYou && selectedIndex === i} />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-green-900 text-white flex flex-col items-center px-2 py-4">
      <ConfettiOverlay show={showConfetti} />
      <RedOverlay show={showRed} />
      <CardAnimation event={lastPassAnim} />

      <div className="text-center mb-2">
        <h1 className="text-xl font-bold">Kemps (Jackwhot)</h1>
        <div className="text-xs">Player: {user.username}</div>
      </div>

      {/* centered big board */}
      <div className="relative w-full max-w-3xl bg-green-700 rounded-xl p-6">
        {/* Ally row at top */}
        <div className="flex flex-col items-center mb-6">
          <div className="text-sm mb-2">Ally: {ally}</div>
          <div className="bg-green-600 rounded px-4 py-4 w-full flex justify-center" data-player-area={ally || ""}>
            {renderPlayerCards(ally, true)}
          </div>
        </div>

        {/* Middle: left & right opponents */}
        <div className="flex justify-between items-start">
          {/* left opponent vertical */}
          <div className="flex flex-col items-center space-y-2" data-player-area={enemyLeft || ""}>
            <div className="text-xs transform -rotate-90 whitespace-nowrap">{enemyLeft || ""}</div>
            <div className="flex flex-col gap-2">
              {safeHand(enemyLeft).map((_, i) => (
                <div key={`L-${i}`} className="w-10 h-16">
                  <Card face={null} faceUp={false} size="sm" />
                </div>
              ))}
            </div>
          </div>

          {/* center empty play area */}
          <div className="flex-1 mx-6 min-h-[220px] rounded-lg border-0"></div>

          {/* right opponent vertical */}
          <div className="flex flex-col items-center space-y-2" data-player-area={enemyRight || ""}>
            <div className="text-xs transform rotate-90 whitespace-nowrap">{enemyRight || ""}</div>
            <div className="flex flex-col gap-2">
              {safeHand(enemyRight).map((_, i) => (
                <div key={`R-${i}`} className="w-10 h-16">
                  <Card face={null} faceUp={false} size="sm" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom: your hand */}
        <div className="mt-6 flex flex-col items-center">
          <div className="text-sm mb-2">You</div>
          <div className="flex gap-3 justify-center" data-player-area={user.username}>
            {renderPlayerCards(user.username, false)}
          </div>
        </div>
      </div>

      {/* controls */}
      <div className="mt-4 flex gap-3">
        <button onClick={passCard} disabled={currentTurnUsername !== user.username} className={`px-4 py-2 rounded ${currentTurnUsername === user.username ? "bg-white text-green-800" : "bg-zinc-700 text-zinc-300"}`}>Pass Selected</button>
        <button onClick={signal} className="px-3 py-2 rounded bg-yellow-400 text-black">Signal</button>
        <div className="relative">
          <button className="px-3 py-2 rounded bg-indigo-600 text-white" onClick={openSuspectList}>Suspect</button>
        </div>
      </div>

      <div className="mt-2 text-xs">Turn: <span className="font-bold">{currentTurnUsername ?? "—"}</span></div>

      {/* Game over modal */}
      {showGameOver && gameOverInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white text-black rounded-lg p-4 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-2">{gameOverInfo.winners.includes(user.username) ? "You Won 🎉" : "You Lose 😞"}</h2>
            <p className="text-sm mb-2">Winning Team: {gameOverInfo.winningTeam}</p>
            <p className="text-sm mb-2">Winners: {gameOverInfo.winners.join(", ")}</p>

            <div className="mt-2 flex gap-2">
              <button onClick={() => { socket.emit("rematch", { roomId, username: user.username }); setShowGameOver(false);} } className="flex-1 bg-emerald-500 text-white px-3 py-1 rounded">Rematch</button>
              <button onClick={() => { setShowGameOver(false); window.location.href = "/"; }} className="flex-1 bg-gray-700 text-white px-3 py-1 rounded">Exit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}