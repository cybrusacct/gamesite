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

  // ensure Card component uses same faces as server (server: Circle, Square, Cross, Heart)
  useEffect(() => {
    if (!socket || !roomId) return;
    // join on mount
    socket.emit("joinRoom", { roomId, username: user.username });

    const handleUpdateLobby = (payload) => {
      const players = Array.isArray(payload) ? payload : payload?.players || [];
      setLobbyPlayers(players || []);
    };
    socket.on("updateLobby", handleUpdateLobby);

    socket.on("startGame", (room) => {
      // server sends full room with hands and players
      const rplayers = room?.players || [];
      setLobbyPlayers(rplayers);
      setHands(room?.hands || {});
      setGameStarted(true);
      setCurrentTurnUsername(rplayers[room?.turnIndex ?? 0] || null);
      setRevealedPlayers(room?.revealedPlayers || []);
      setShowGameOver(false);
      setGameOverInfo(null);
    });

    socket.on("updateGame", (room) => {
      // update hands and turn
      setHands(room?.hands || {});
      setLobbyPlayers(room?.players || []);
      setCurrentTurnUsername((room?.players || [])[room?.turnIndex ?? 0] || null);

      // last pass animation handling
      if (room?.lastPass) {
        setLastPassAnim(room.lastPass);
        setTimeout(() => setLastPassAnim(null), 800);
      } else {
        setLastPassAnim(null);
      }
    });

    // passAnimation (card-back visible to all)
    socket.on("passAnimation", (data) => {
      setLastPassAnim(data);
      playPass();
      setTimeout(() => setLastPassAnim(null), 800);
    });

    socket.on("revealCards", ({ target, hands: newHands }) => {
      setRevealedPlayers((prev) => (prev.includes(target) ? prev : [...prev, target]));
      if (newHands) setHands(newHands);
    });

    socket.on("gameOver", (info) => {
      setGameOverInfo(info);
      setShowGameOver(true);
      setHands(info.hands || {});
      setRevealedPlayers(Object.keys(info.hands || {}));
      if (info.winners && info.winners.includes(user.username)) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2400);
      } else {
        setShowRed(true);
        setTimeout(() => setShowRed(false), 2000);
      }
    });

    // cleanup listeners on unmount
    return () => {
      socket.off("updateLobby", handleUpdateLobby);
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

  const signal = () => {
    socket.emit("sendSignal", { roomId, username: user.username });
  };

  const callJack = () => {
    socket.emit("callJackwhot", { roomId, callerUsername: user.username });
  };

  const openSuspect = (target) => {
    socket.emit("suspect", { roomId, suspector: user.username, target });
  };

  // helper safe access
  const safeHand = (uname) => (hands && hands[uname]) ? hands[uname] : [];

  // render a face-up card (you) or back for opponents/ally (unless revealed)
  const renderPlayerCards = (playerUsername, small = false) => {
    const isYou = playerUsername === user.username;
    const isRevealed = revealedPlayers.includes(playerUsername);
    const cards = safeHand(playerUsername);
    const size = small ? "sm" : "md";
    return (
      <div className={`flex ${small ? "gap-2" : "gap-3"} items-center`}>
        {cards.map((card, i) => {
          const faceUp = isYou || isRevealed;
          return (
            <div key={`${playerUsername}-${i}`} style={{ cursor: isYou ? "pointer" : "default" }} onClick={() => isYou && selectCard(i)}>
              <Card face={card} faceUp={faceUp} size={small ? "sm" : "md"} selected={isYou && selectedIndex === i} />
            </div>
          );
        })}
      </div>
    );
  };

  // top header + board container
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
            {/* show backs for ally (or faces if revealed) */}
            {renderPlayerCards(ally, true)}
          </div>
        </div>

        {/* Middle: left & right opponents */}
        <div className="flex justify-between items-start">
          {/* left opponent vertical */}
          <div className="flex flex-col items-center space-y-2" data-player-area={enemyLeft || ""}>
            <div className="text-xs transform -rotate-90 whitespace-nowrap">{enemyLeft || ""}</div>
            <div className="flex flex-col gap-2">
              {(safeHand(enemyLeft) || []).map((_, i) => (
                <div key={`L-${i}`} className="w-10 h-16">
                  <Card face={null} faceUp={false} size="sm" />
                </div>
              ))}
            </div>
          </div>

          {/* center empty play area (visual) */}
          <div className="flex-1 mx-6 min-h-[220px] rounded-lg border-0"></div>

          {/* right opponent vertical */}
          <div className="flex flex-col items-center space-y-2" data-player-area={enemyRight || ""}>
            <div className="text-xs transform rotate-90 whitespace-nowrap">{enemyRight || ""}</div>
            <div className="flex flex-col gap-2">
              {(safeHand(enemyRight) || []).map((_, i) => (
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
          <button className="px-3 py-2 rounded bg-indigo-600 text-white">Suspect</button>
        </div>
      </div>

      {/* small turn info */}
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