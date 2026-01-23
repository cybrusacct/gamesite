import React, { useState, useEffect } from "react";
import Card from "../../components/Card";
import CardAnimation from "../../components/CardAnimation";
import Avatar from "../../components/Avatar";
import ConfettiOverlay from "../../components/ConfettiOverlay";
import RedOverlay from "../../components/RedOverlay";
import useSocket from "../../hooks/useSocket";
import { playPass } from "../../utils/sounds";

/*
  Fixed Kemps view:
  - normalize hands so no undefined maps
  - safe receiveCard functional update
  - orientation: bottom=0, top=180, left=90, right=-90
  - public passAnimation shows back only (no face data used)
  - suspect modal / selection preserved
*/

export default function Kemps({ user, socket: socketProp, roomId }) {
  const socket = socketProp || useSocket();
  const myName = user?.username;

  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [hands, setHands] = useState({}); // normalized map username -> array
  const [turnUsername, setTurnUsername] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [revealedPlayers, setRevealedPlayers] = useState([]);
  const [lastPassAnim, setLastPassAnim] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showRed, setShowRed] = useState(false);
  const [gameOverInfo, setGameOverInfo] = useState(null);
  const [showGameOver, setShowGameOver] = useState(false);

  // suspect modal
  const [showSuspectModal, setShowSuspectModal] = useState(false);
  const [suspectTarget, setSuspectTarget] = useState(null);

  // computed positions
  const myIndex = lobbyPlayers.indexOf(myName);
  const ally = myIndex >= 0 && lobbyPlayers.length > 0 ? lobbyPlayers[(myIndex + 2) % lobbyPlayers.length] : null;
  const enemyLeft = myIndex >= 0 && lobbyPlayers.length > 0 ? lobbyPlayers[(myIndex + (lobbyPlayers.length - 1)) % lobbyPlayers.length] : null;
  const enemyRight = myIndex >= 0 && lobbyPlayers.length > 0 ? lobbyPlayers[(myIndex + 1) % lobbyPlayers.length] : null;

  // Normalize hands: ensure each player key exists and is an array
  const normalizeHands = (roomOrPlayers, roomHands) => {
    const normalized = {};
    const players = Array.isArray(roomOrPlayers) ? roomOrPlayers : (roomOrPlayers?.players || []);
    players.forEach((p) => {
      normalized[p] = Array.isArray(roomHands?.[p]) ? [...roomHands[p]] : [];
    });
    return normalized;
  };

  useEffect(() => {
    if (!socket || !roomId) return;

    // join idempotent
    socket.emit("joinRoom", { roomId, username: myName });

    const onUpdateLobby = (payload) => {
      const players = Array.isArray(payload) ? payload : payload?.players || [];
      setLobbyPlayers(players || []);
    };
    socket.on("updateLobby", onUpdateLobby);

    socket.on("startGame", (room) => {
      const players = room?.players || [];
      setLobbyPlayers(players);
      setHands(normalizeHands(players, room.hands || {}));
      setTurnUsername(players[room?.turnIndex ?? 0] || null);
      setRevealedPlayers(room?.revealedPlayers || []);
      setGameOverInfo(null);
      setShowGameOver(false);
    });

    socket.on("updateGame", (room) => {
      const players = room?.players || lobbyPlayers || [];
      setLobbyPlayers(players);
      setHands(normalizeHands(players, room.hands || {}));
      setTurnUsername(players[room?.turnIndex ?? 0] || null);

      if (room?.lastPass) {
        setLastPassAnim(room.lastPass);
        setTimeout(() => setLastPassAnim(null), 800);
      } else {
        setLastPassAnim(null);
      }
    });

    // passAnimation: only back is displayed for all
    socket.on("passAnimation", (data) => {
      setLastPassAnim(data);
      playPass();
      setTimeout(() => setLastPassAnim(null), 800);
    });

    // private receiveCard: append to recipient's hand safely
    socket.on("receiveCard", ({ from, to, card }) => {
      if (!to) return;
      setHands((prev) => {
        // functional update with safe defaults
        const next = { ...prev };
        next[to] = Array.isArray(next[to]) ? [...next[to], card] : [card];
        return next;
      });
    });

    socket.on("revealCards", ({ target, hands: newHands }) => {
      if (target) {
        setRevealedPlayers((prev) => (prev.includes(target) ? prev : [...prev, target]));
      }
      if (newHands) {
        setHands(normalizeHands(lobbyPlayers, newHands));
      }
    });

    socket.on("gameOver", (info) => {
      const players = info?.players || lobbyPlayers || [];
      setGameOverInfo(info);
      setShowGameOver(true);
      setHands(normalizeHands(players, info?.hands || {}));
      setRevealedPlayers(Object.keys(info?.hands || {}));
      if (info.winners && info.winners.includes(myName)) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2400);
      } else {
        setShowRed(true);
        setTimeout(() => setShowRed(false), 2000);
      }
    });

    return () => {
      socket.off("updateLobby", onUpdateLobby);
      socket.off("startGame");
      socket.off("updateGame");
      socket.off("passAnimation");
      socket.off("receiveCard");
      socket.off("revealCards");
      socket.off("gameOver");
    };
  }, [socket, roomId, myName, lobbyPlayers]);

  // actions
  const selectCard = (i) => {
    if (turnUsername !== myName) return;
    setSelectedIndex(i);
  };

  const passSelected = () => {
    if (turnUsername !== myName) return;
    if (selectedIndex == null) return;
    socket.emit("passCard", { roomId, fromUsername: myName, cardIndex: selectedIndex });
    setSelectedIndex(null);
  };

  const sendSignal = () => socket.emit("sendSignal", { roomId, username: myName });
  const callJackwhot = () => socket.emit("callJackwhot", { roomId, callerUsername: myName });

  // suspect modal
  const openSuspect = () => {
    setSuspectTarget(null);
    setShowSuspectModal(true);
  };
  const confirmSuspect = () => {
    if (!suspectTarget) return;
    socket.emit("suspect", { roomId, suspector: myName, target: suspectTarget });
    setShowSuspectModal(false);
    setSuspectTarget(null);
  };

  // safe getter
  const safeHand = (uname) => (hands && Array.isArray(hands[uname]) ? hands[uname] : []);

  // rotation degrees for visual orientation
  const rotationFor = (player) => {
    if (!player) return 0;
    if (player === myName) return 0;             // bottom
    if (player === ally) return 180;              // top
    if (player === enemyLeft) return 90;          // left
    if (player === enemyRight) return -90;        // right
    return 0;
  };

  // rendering helpers
  const renderAlly = () => (
    <div className="flex flex-col items-center mb-6">
      <div className="text-sm mb-2">Ally: {ally}</div>
      <div className="bg-green-600 rounded px-4 py-4 w-full flex justify-center" data-player-area={ally || ""}>
        {safeHand(ally).length === 0
          ? Array.from({ length: 5 }).map((_, i) => <div key={`ab-${i}`} className="mx-1"><Card face={null} faceUp={false} size="sm" /></div>)
          : safeHand(ally).map((c, i) => (
              <div key={`ally-${i}`} className="mx-1" style={{ transform: `rotate(${rotationFor(ally)}deg)` }}>
                <Card face={c} faceUp={revealedPlayers.includes(ally)} size="sm" />
              </div>
            ))
        }
      </div>
    </div>
  );

  const renderOpponentCol = (opp, side) => (
    <div className="flex flex-col items-center space-y-2" data-player-area={opp || ""}>
      <div className={`text-xs ${side === "left" ? "transform -rotate-90" : "transform rotate-90"} whitespace-nowrap`}>{opp || ""}</div>
      <div className="flex flex-col gap-2">
        {safeHand(opp).length === 0
          ? Array.from({ length: 4 }).map((_, i) => <div key={`${opp}-bk-${i}`} className="w-10 h-16"><Card face={null} faceUp={false} size="sm" /></div>)
          : safeHand(opp).map((c, i) => (
              <div key={`${opp}-${i}`} className="w-10 h-16" style={{ transform: `rotate(${rotationFor(opp)}deg)` }}>
                <Card face={null} faceUp={false} size="sm" />
              </div>
            ))
        }
      </div>
    </div>
  );

  const renderMyHand = () => (
    <div className="mt-6 flex flex-col items-center">
      <div className="text-sm mb-2">You</div>
      <div className="flex gap-3 justify-center" data-player-area={myName}>
        {safeHand(myName).map((c, i) => (
          <div key={`me-${i}`} onClick={() => selectCard(i)} style={{ cursor: turnUsername === myName ? "pointer" : "default", transform: `rotate(${rotationFor(myName)}deg)` }}>
            <Card face={c} faceUp={true} size="md" selected={selectedIndex === i} />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-green-900 text-white flex flex-col items-center px-2 py-4">
      <ConfettiOverlay show={showConfetti} />
      <RedOverlay show={showRed} />
      <CardAnimation event={lastPassAnim} />

      <div className="text-center mb-2">
        <h1 className="text-xl font-bold">Kemps (Jackwhot)</h1>
        <div className="text-xs">Player: {myName}</div>
      </div>

      <div className="relative w-full max-w-3xl bg-green-700 rounded-xl p-6">
        {renderAlly()}
        <div className="flex justify-between items-start">
          <div>{renderOpponentCol(enemyLeft, "left")}</div>
          <div className="flex-1 mx-6 min-h-[220px] rounded-lg border-0"></div>
          <div>{renderOpponentCol(enemyRight, "right")}</div>
        </div>
        {renderMyHand()}
      </div>

      <div className="mt-4 flex gap-3">
        <button onClick={passSelected} disabled={turnUsername !== myName} className={`px-4 py-2 rounded ${turnUsername === myName ? "bg-white text-green-800" : "bg-zinc-700 text-zinc-300"}`}>Pass Selected</button>
        <button onClick={sendSignal} className="px-3 py-2 rounded bg-yellow-400 text-black">Signal</button>
        <button onClick={openSuspect} className="px-3 py-2 rounded bg-indigo-600 text-white">Suspect</button>
      </div>

      <div className="mt-2 text-xs">Turn: <span className="font-bold">{turnUsername ?? "—"}</span></div>

      {showSuspectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white text-black rounded-lg p-4 w-full max-w-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">Suspect an opponent</h3>
              <button onClick={() => setShowSuspectModal(false)} className="text-sm text-gray-600">Close</button>
            </div>
            <div className="space-y-2">
              {lobbyPlayers.filter(p => p && p !== myName).map((p) => (
                <button key={p} onClick={() => setSuspectTarget(p)} className={`w-full text-left px-3 py-2 rounded ${suspectTarget === p ? "bg-zinc-800 text-white" : "bg-zinc-100 text-black"}`}>{p}</button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button disabled={!suspectTarget} onClick={confirmSuspect} className="flex-1 bg-emerald-500 text-white px-3 py-2 rounded">Confirm</button>
              <button onClick={() => setShowSuspectModal(false)} className="flex-1 bg-gray-300 text-black px-3 py-2 rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showGameOver && gameOverInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white text-black rounded-lg p-4 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-2">{gameOverInfo.winners.includes(myName) ? "You Won 🎉" : "You Lose 😞"}</h2>
            <p className="text-sm mb-2">Winning Team: {gameOverInfo.winningTeam}</p>
            <p className="text-sm mb-2">Winners: {gameOverInfo.winners.join(", ")}</p>

            <div className="mt-2 flex gap-2">
              <button onClick={() => { socket.emit("rematch", { roomId, username: myName }); setShowGameOver(false); }} className="flex-1 bg-emerald-500 text-white px-3 py-1 rounded">Rematch</button>
              <button onClick={() => { setShowGameOver(false); window.location.href = "/"; }} className="flex-1 bg-gray-700 text-white px-3 py-1 rounded">Exit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}