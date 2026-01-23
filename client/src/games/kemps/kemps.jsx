import React, { useState, useEffect } from "react";
import Card from "../../components/Card";
import CardAnimation from "../../components/CardAnimation";
import Avatar from "../../components/Avatar";
import ConfettiOverlay from "../../components/ConfettiOverlay";
import RedOverlay from "../../components/RedOverlay";
import useSocket from "../../hooks/useSocket";
import { playPass } from "../../utils/sounds";

/*
  Kemps game view (fixed):
  - Normalize hands from server payload so we never do .map on undefined
  - Render card-backs for opponents/ally (faceUp=false)
  - Render your hand face-up
  - Listen for private receiveCard events and merge into local hands
  - Suspect flow: modal selection UI -> confirm -> emit
*/

export default function Kemps({ user, socket: socketProp, roomId }) {
  const socket = socketProp || useSocket();

  const [hands, setHands] = useState({});               // normalized map username -> array
  const [lobbyPlayers, setLobbyPlayers] = useState([]); // ordered players
  const [turnUsername, setTurnUsername] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [revealedPlayers, setRevealedPlayers] = useState([]);
  const [lastPassAnim, setLastPassAnim] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showRed, setShowRed] = useState(false);
  const [gameOverInfo, setGameOverInfo] = useState(null);
  const [showGameOver, setShowGameOver] = useState(false);

  // suspect selection modal
  const [showSuspectModal, setShowSuspectModal] = useState(false);
  const [suspectTarget, setSuspectTarget] = useState(null);

  const myName = user?.username;

  // compute ally/opponents robustly even with fewer players
  const myIndex = lobbyPlayers.indexOf(myName);
  const ally = myIndex >= 0 && lobbyPlayers.length > 0 ? lobbyPlayers[(myIndex + 2) % lobbyPlayers.length] : null;
  const enemyLeft = myIndex >= 0 && lobbyPlayers.length > 0 ? lobbyPlayers[(myIndex + (lobbyPlayers.length - 1)) % lobbyPlayers.length] : null;
  const enemyRight = myIndex >= 0 && lobbyPlayers.length > 0 ? lobbyPlayers[(myIndex + 1) % lobbyPlayers.length] : null;

  // Helpers
  const normalizeHands = (room) => {
    const out = {};
    const ps = (room?.players || []);
    // ensure every player key exists and is an array
    ps.forEach((p) => {
      out[p] = Array.isArray(room?.hands?.[p]) ? [...room.hands[p]] : [];
    });
    return out;
  };

  useEffect(() => {
    if (!socket || !roomId) return;

    // Join room (server idempotent)
    socket.emit("joinRoom", { roomId, username: myName });

    // Lobby updates
    const onUpdateLobby = (payload) => {
      const players = Array.isArray(payload) ? payload : payload?.players || [];
      setLobbyPlayers(players || []);
    };
    socket.on("updateLobby", onUpdateLobby);

    // Start game - server sends the room with hands/players and turnIndex
    socket.on("startGame", (room) => {
      setLobbyPlayers(room?.players || []);
      setHands(normalizeHands(room));
      setTurnUsername((room?.players || [])[room?.turnIndex ?? 0] || null);
      setRevealedPlayers(room?.revealedPlayers || []);
      setShowGameOver(false);
      setGameOverInfo(null);
    });

    // game updates
    socket.on("updateGame", (room) => {
      setLobbyPlayers(room?.players || []);
      setHands(normalizeHands(room));
      setTurnUsername((room?.players || [])[room?.turnIndex ?? 0] || null);

      if (room?.lastPass) {
        setLastPassAnim(room.lastPass);
        setTimeout(() => setLastPassAnim(null), 800);
      } else {
        setLastPassAnim(null);
      }
    });

    // public pass animation (no faces) - everyone sees a back moving
    socket.on("passAnimation", (data) => {
      setLastPassAnim(data);
      playPass();
      setTimeout(() => setLastPassAnim(null), 800);
    });

    // private receiveCard: only recipient gets the face value
    socket.on("receiveCard", ({ from, to, card }) => {
      if (!to) return;
      setHands((prev) => {
        const copy = { ...prev };
        copy[to] = Array.isArray(copy[to]) ? [...copy[to], card] : [card];
        return copy;
      });
    });

    // reveal event: reveal target's hand to everyone
    socket.on("revealCards", ({ target, hands: newHands }) => {
      if (target) {
        setRevealedPlayers((prev) => (prev.includes(target) ? prev : [...prev, target]));
      }
      if (newHands) {
        // normalize new hands data
        setHands(normalizeHands({ players: lobbyPlayers, hands: newHands }));
      }
    });

    // game over
    socket.on("gameOver", (info) => {
      setGameOverInfo(info);
      setShowGameOver(true);
      setHands(normalizeHands({ players: info?.players || lobbyPlayers, hands: info?.hands || {} }));
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
  }, [socket, roomId, myName]);

  // UI actions
  const selectCard = (i) => {
    // only allow selecting when it's your turn - but selection state doesn't block render
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

  // suspect modal handlers
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

  // Safe getter
  const safeHand = (uname) => (hands && Array.isArray(hands[uname]) ? hands[uname] : []);

  // Render helpers
  const renderTopAlly = () => (
    <div className="flex flex-col items-center mb-6">
      <div className="text-sm mb-2">Ally: {ally}</div>
      <div className="bg-green-600 rounded px-4 py-4 w-full flex justify-center" data-player-area={ally || ""}>
        {safeHand(ally).length === 0 ? (
          // show a row of backs (default 5 visually) if ally has no data yet
          Array.from({ length: 5 }).map((_, i) => <div key={`ab-${i}`} className="mx-1"><Card face={null} faceUp={false} size="sm" /></div>)
        ) : (
          safeHand(ally).map((c, i) => <div key={`ally-${i}`} className="mx-1"><Card face={c} faceUp={revealedPlayers.includes(ally)} size="sm" /></div>)
        )}
      </div>
    </div>
  );

  const renderVerticalOpponent = (opp, side) => (
    <div className="flex flex-col items-center space-y-2" data-player-area={opp || ""}>
      <div className={`text-xs ${side === "left" ? "transform -rotate-90" : "transform rotate-90"} whitespace-nowrap`}>{opp || ""}</div>
      <div className="flex flex-col gap-2">
        {safeHand(opp).length === 0 ? (
          // show 4 backs if unknown count
          Array.from({ length: 4 }).map((_, i) => <div key={`${opp}-${i}`} className="w-10 h-16"><Card face={null} faceUp={false} size="sm" /></div>)
        ) : (
          safeHand(opp).map((c, i) => <div key={`${opp}-${i}`} className="w-10 h-16"><Card face={null} faceUp={false} size="sm" /></div>)
          // we intentionally show backs for opponents even if face exists, unless revealed
        )}
      </div>
    </div>
  );

  const renderMyHand = () => (
    <div className="mt-6 flex flex-col items-center">
      <div className="text-sm mb-2">You</div>
      <div className="flex gap-3 justify-center" data-player-area={myName}>
        {safeHand(myName).map((c, i) => (
          <div key={`me-${i}`} onClick={() => selectCard(i)} style={{ cursor: turnUsername === myName ? "pointer" : "default" }}>
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
        {renderTopAlly()}
        <div className="flex justify-between items-start">
          <div>{renderVerticalOpponent(enemyLeft, "left")}</div>
          <div className="flex-1 mx-6 min-h-[220px] rounded-lg border-0"></div>
          <div>{renderVerticalOpponent(enemyRight, "right")}</div>
        </div>
        {renderMyHand()}
      </div>

      <div className="mt-4 flex gap-3">
        <button onClick={passSelected} disabled={turnUsername !== myName} className={`px-4 py-2 rounded ${turnUsername === myName ? "bg-white text-green-800" : "bg-zinc-700 text-zinc-300"}`}>Pass Selected</button>
        <button onClick={sendSignal} className="px-3 py-2 rounded bg-yellow-400 text-black">Signal</button>
        <button onClick={openSuspect} className="px-3 py-2 rounded bg-indigo-600 text-white">Suspect</button>
      </div>

      <div className="mt-2 text-xs">Turn: <span className="font-bold">{turnUsername ?? "—"}</span></div>

      {/* Suspect modal */}
      {showSuspectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white text-black rounded-lg p-4 w-full max-w-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">Suspect an opponent</h3>
              <button onClick={() => setShowSuspectModal(false)} className="text-sm text-gray-600">Close</button>
            </div>
            <div className="space-y-2">
              {lobbyPlayers.filter(p => p && p !== myName).map((p) => (
                <button
                  key={p}
                  onClick={() => setSuspectTarget(p)}
                  className={`w-full text-left px-3 py-2 rounded ${suspectTarget === p ? "bg-zinc-800 text-white" : "bg-zinc-100 text-black"}`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button disabled={!suspectTarget} onClick={confirmSuspect} className="flex-1 bg-emerald-500 text-white px-3 py-2 rounded">Confirm</button>
              <button onClick={() => setShowSuspectModal(false)} className="flex-1 bg-gray-300 text-black px-3 py-2 rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Game over modal */}
      {showGameOver && gameOverInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white text-black rounded-lg p-4 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-2">{gameOverInfo.winners.includes(myName) ? "Your Team Won 🎉" : "Your Team Lost 😞"}</h2>
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