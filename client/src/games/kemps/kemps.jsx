import React, { useState, useEffect, useRef } from "react";
import Card from "../../components/Card";
import CardAnimation from "../../components/CardAnimation";
import Avatar from "../../components/Avatar";
import ConfettiOverlay from "../../components/ConfettiOverlay";
import RedOverlay from "../../components/RedOverlay";
import useSocket from "../../hooks/useSocket";
import { playPass, playSignal, playSuspect, playMatchEnd, playJackwhotFalse, playKick } from "../../utils/sounds";

export default function Kemps({ user, roomId }) {
  const socket = useSocket();
  const [hands, setHands] = useState({});
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [currentTurnUsername, setCurrentTurnUsername] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [pendingSignal, setPendingSignal] = useState(null);
  const [showJackwhotLocal, setShowJackwhotLocal] = useState(false);
  const [revealedPlayers, setRevealedPlayers] = useState([]);
  const [lastPassAnim, setLastPassAnim] = useState(null);
  const [gameOverInfo, setGameOverInfo] = useState(null);
  const [showGameOver, setShowGameOver] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showRed, setShowRed] = useState(false);

  const myIndex = lobbyPlayers.indexOf(user.username);
  const ally = myIndex >= 0 && lobbyPlayers.length > 0 ? lobbyPlayers[(myIndex + 2) % lobbyPlayers.length] : null;
  const opponents = lobbyPlayers.filter((p) => p !== user.username && p !== ally);

  useEffect(() => {
    if (!socket || !roomId) return;
    socket.emit("joinRoom", { roomId, username: user.username });

    const uLobby = (payload) => {
      const players = Array.isArray(payload) ? payload : payload?.players || [];
      setLobbyPlayers(players || []);
    };
    socket.on("updateLobby", uLobby);

    socket.on("startGame", (room) => {
      setHands(room.hands || {});
      setLobbyPlayers(room.players || []);
      setGameStarted(true);
      setCurrentTurnUsername((room.players || [])[room.turnIndex ?? 0]);
      setSelectedIndex(null);
      setPendingSignal(null);
      setRevealedPlayers([]);
      setShowGameOver(false);
      setGameOverInfo(null);
      playMatchStart();
    });

    socket.on("updateGame", (room) => {
      setHands(room.hands || {});
      setLobbyPlayers(room.players || []);
      setCurrentTurnUsername((room.players || [])[room.turnIndex ?? 0]);
      if (room.lastPass) {
        setLastPassAnim(room.lastPass);
        setTimeout(() => setLastPassAnim(null), 800);
      } else {
        setLastPassAnim(null);
      }
    });

    // passAnimation should display only card back for everyone
    socket.on("passAnimation", (data) => {
      setLastPassAnim(data);
      // play pass sound
      playPass();
      setTimeout(() => setLastPassAnim(null), 800);
    });

    socket.on("receiveCard", ({ from, to, card }) => {
      if (to === user.username) {
        setHands((prev) => {
          const myHand = prev[user.username] ? [...prev[user.username]] : [];
          myHand.push(card);
          return { ...prev, [user.username]: myHand };
        });
      }
    });

    socket.on("signalSent", (data) => {
      setPendingSignal(data);
      if (data && data.ally === user.username) {
        setShowJackwhotLocal(true);
        setTimeout(() => setShowJackwhotLocal(false), 3000);
      } else {
        setShowJackwhotLocal(false);
      }
      playSignal();
    });

    socket.on("revealCards", ({ target, hands }) => {
      setRevealedPlayers((prev) => prev.includes(target) ? prev : [...prev, target]);
      setHands(hands || {});
    });

    socket.on("gameOver", (info) => {
      setGameOverInfo(info);
      setShowGameOver(true);
      setHands(info.hands || {});
      setRevealedPlayers(Object.keys(info.hands || {}));
      if (info.winners && info.winners.includes(user.username)) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2500);
        playMatchEnd();
      } else {
        setShowRed(true);
        setTimeout(() => setShowRed(false), 2000);
        playJackwhotFalse();
      }
    });

    socket.on("playSound", ({ type }) => {
      // map server sound types to local playback
      if (type === "suspect") playSuspect();
      else if (type === "signal") playSignal();
      else if (type === "jackwhot-false") playJackwhotFalse();
      else if (type === "matchEnd" || type === "match-end") playMatchEnd();
      else if (type === "kick") playKick();
      else if (type === "pass") playPass();
      else if (type === "matchStart") playMatchStart();
    });

    socket.on("kicked", () => {
      window.location.href = "/";
    });

    return () => {
      socket.off("updateLobby", uLobby);
      socket.off("startGame");
      socket.off("updateGame");
      socket.off("passAnimation");
      socket.off("receiveCard");
      socket.off("signalSent");
      socket.off("revealCards");
      socket.off("gameOver");
      socket.off("playSound");
      socket.off("kicked");
    };
  }, [socket, roomId, user.username]);

  const selectCard = (i) => {
    if (currentTurnUsername !== user.username) return;
    setSelectedIndex(i);
  };

  const passCard = () => {
    if (currentTurnUsername !== user.username) return;
    if (selectedIndex == null) return;
    socket.emit("passCard", { roomId, fromUsername: user.username, cardIndex: selectedIndex });
    setSelectedIndex(null);
  };

  const sendSignal = () => {
    socket.emit("sendSignal", { roomId, username: user.username });
  };

  const callJackwhot = () => {
    socket.emit("callJackwhot", { roomId, callerUsername: user.username });
  };

  const suspectTarget = (target) => {
    socket.emit("suspect", { roomId, suspector: user.username, target });
  };

  const rematch = () => {
    socket.emit("rematch", { roomId, username: user.username });
  };

  const isRevealed = (player) => revealedPlayers.includes(player);
  const myHand = hands[user.username] || [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-800 to-green-900 text-white pb-24">
      <ConfettiOverlay show={showConfetti} />
      <RedOverlay show={showRed} />
      <CardAnimation event={lastPassAnim} />

      <div className="max-w-lg mx-auto px-3 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Avatar name={user.username} size="sm" />
            <div>
              <div className="font-semibold text-base leading-tight">{user.username}</div>
              <div className="text-xs text-green-200">Turn: <span className="font-medium">{currentTurnUsername || "—"}</span></div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-green-100">Room: <span className="font-medium">{roomId}</span></div>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-start gap-3 mb-2">
            <div className="flex items-center gap-2">
              <div className="text-xs text-green-100">Ally</div>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto py-1" data-player-area={ally || ""}>
            {(hands[ally] || []).map((c, i) => (
              <div key={i} className="flex-shrink-0">
                <Card face={c} faceUp={isRevealed(ally)} size="sm" />
              </div>
            ))}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          {opponents.map((op, idx) => (
            <div key={op} className="bg-zinc-800 rounded p-2 flex flex-col items-center" data-player-area={op}>
              <div className="flex items-center gap-2 mb-2">
                <Avatar name={op} size="sm" />
                <div className="text-sm font-medium">{op}</div>
              </div>
              <div className="flex gap-1 overflow-x-auto">
                {(hands[op] || []).map((c, i) => (
                  <div key={i} className="flex-shrink-0">
                    <Card face={c} faceUp={isRevealed(op)} size="xs" />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {opponents.length < 2 && <div className="col-span-2 text-center text-xs text-gray-300">Waiting for opponents...</div>}
        </div>

        <div className="mb-2">
          <div className="text-sm mb-1">Your Hand</div>
          <div className="flex gap-2 overflow-x-auto py-2" data-player-area={user.username}>
            {myHand.map((c, i) => (
              <div key={i} className="flex-shrink-0" onClick={() => selectCard(i)}>
                <Card face={c} faceUp={true} size="md" selected={selectedIndex === i} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-3 bg-black/60 backdrop-blur-sm border-t border-black/40">
        <div className="max-w-lg mx-auto flex items-center gap-2">
          <button
            onClick={passCard}
            className={`flex-1 rounded py-3 text-sm font-semibold ${currentTurnUsername === user.username ? "bg-emerald-500 text-black" : "bg-zinc-700 text-gray-300"}`}
            disabled={currentTurnUsername !== user.username}
          >
            Pass Selected
          </button>

          <button onClick={sendSignal} className="px-3 py-3 rounded bg-yellow-400 text-black text-sm font-semibold">Signal</button>

          <div className="relative">
            <button className="px-3 py-3 rounded bg-indigo-600 text-white text-sm font-semibold">Suspect</button>
          </div>
        </div>

        {showJackwhotLocal && (
          <div className="max-w-lg mx-auto mt-2 text-center">
            <button onClick={callJackwhot} className="bg-white text-green-800 px-4 py-2 rounded font-bold">JACKWHOT!</button>
          </div>
        )}
      </div>

      {showGameOver && gameOverInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white text-black rounded-lg p-4 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-2">{gameOverInfo.winners.includes(user.username) ? "You Won 🎉" : "You Lose 😞"}</h2>
            <p className="text-sm mb-2">Winning Team: {gameOverInfo.winningTeam}</p>
            <p className="text-sm mb-2">Winners: {gameOverInfo.winners.join(", ")}</p>

            <div className="mt-2 flex gap-2">
              <button onClick={rematch} className="flex-1 bg-emerald-500 text-white px-3 py-1 rounded">Rematch</button>
              <button onClick={() => { setShowGameOver(false); window.location.href = "/"; }} className="flex-1 bg-gray-700 text-white px-3 py-1 rounded">Exit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}