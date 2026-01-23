// games/kemps/kemps.jsx (client authoritative rendering)
// - Renders publicSnapshot from updateGame
// - Maintains privateHand for the local user only (initHand, syncHand, receiveCard private events)
// - Ignores updateGame with older version numbers
// - Uses cardCounts from publicSnapshot for opponent/back rendering
// - Does not locally mutate public state (server is source of truth)

import React, { useEffect, useState } from "react";
import useSocket from "../../hooks/useSocket";
import Card from "../../components/Card";
import CardAnimation from "../../components/CardAnimation";
import ConfettiOverlay from "../../components/ConfettiOverlay";
import RedOverlay from "../../components/RedOverlay";

export default function Kemps({ user, socket: socketProp, roomId }) {
  const socket = socketProp || useSocket();
  const myName = user?.username;

  // public snapshot from server (masked)
  const [publicState, setPublicState] = useState(null);
  const [roomVersion, setRoomVersion] = useState(0);

  // private hand faces for this client only
  const [privateHand, setPrivateHand] = useState([]);

  // UI state
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [lastPassAnim, setLastPassAnim] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showRed, setShowRed] = useState(false);
  const [showSuspectModal, setShowSuspectModal] = useState(false);
  const [suspectTarget, setSuspectTarget] = useState(null);

  useEffect(() => {
    if (!socket || !roomId) return;

    // on connect/reconnect, request rejoin so server sends canonical snapshot + private sync
    const doRejoin = () => {
      socket.emit("rejoinRoom", { roomId, username: myName });
    };
    if (socket.connected) doRejoin();
    socket.on("connect", doRejoin);

    // canonical updateGame (public) - includes version
    const handleUpdateGame = (snapshot) => {
      if (!snapshot || typeof snapshot.version !== "number") return;
      // ignore stale
      if (snapshot.version <= (roomVersion || 0)) return;
      setPublicState(snapshot);
      setRoomVersion(snapshot.version);
    };
    socket.on("updateGame", handleUpdateGame);

    // private initHand (on start) - authoritative
    socket.on("initHand", ({ hand = [], roomVersion: v }) => {
      setPrivateHand(Array.isArray(hand) ? [...hand] : []);
      if (typeof v === "number" && v > roomVersion) setRoomVersion(v);
    });

    // private syncHand (on demand or rejoin)
    socket.on("syncHand", ({ hand = [], roomVersion: v }) => {
      setPrivateHand(Array.isArray(hand) ? [...hand] : []);
      if (typeof v === "number" && v > roomVersion) setRoomVersion(v);
    });

    // private receiveCard: append to privateHand only
    socket.on("receiveCard", ({ card, roomVersion: v }) => {
      setPrivateHand((prev) => [...(prev || []), card]);
      if (typeof v === "number" && v > roomVersion) setRoomVersion(v);
    });

    // pass animation
    socket.on("passAnimation", (data) => {
      setLastPassAnim(data);
      setTimeout(() => setLastPassAnim(null), 800);
    });

    // gameOver - display overlays (server also sent updateGame)
    socket.on("gameOver", (info) => {
      if (info.winners && info.winners.includes(myName)) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2400);
      } else {
        setShowRed(true);
        setTimeout(() => setShowRed(false), 2000);
      }
    });

    return () => {
      socket.off("connect", doRejoin);
      socket.off("updateGame", handleUpdateGame);
      socket.off("initHand");
      socket.off("syncHand");
      socket.off("receiveCard");
      socket.off("passAnimation");
      socket.off("gameOver");
    };
  }, [socket, roomId, myName, roomVersion]);

  // Actions: only emit to server; server will respond with updateGame + private events
  const passSelected = () => {
    if (!publicState) return;
    const turnPlayer = publicState.players?.[publicState.turnIndex];
    if (turnPlayer !== myName) return;
    if (selectedIndex == null) return;
    socket.emit("passCard", { roomId, fromUsername: myName, cardIndex: selectedIndex });
    setSelectedIndex(null);
  };

  const sendSignal = () => socket.emit("sendSignal", { roomId, username: myName });
  const openSuspect = () => { setSuspectTarget(null); setShowSuspectModal(true); };
  const confirmSuspect = () => {
    if (!suspectTarget) return;
    socket.emit("suspect", { roomId, suspector: myName, target: suspectTarget });
    setShowSuspectModal(false);
    setSuspectTarget(null);
  };

  // Render helpers: publicState contains cardCounts for each player (numbers)
  const safeCount = (player) => (publicState?.cardCounts?.[player] ?? 0);
  const players = publicState?.players || [];

  // rotation logic
  const rotationFor = (player) => {
    if (!player) return 0;
    const myIndex = players.indexOf(myName);
    if (myIndex === -1) return 0;
    const idx = players.indexOf(player);
    // compute relative position
    const rel = (idx - myIndex + players.length) % players.length;
    // For 4 players: 0=you(bottom), 1=right, 2=ally(top), 3=left
    if (rel === 0) return 0;
    if (rel === 1) return -90;
    if (rel === 2) return 180;
    if (rel === 3) return 90;
    return 0;
  };

  // Render backs for other players using counts, face up for you using privateHand
  const renderPlayerBacks = (player) => {
    const cnt = safeCount(player);
    if (player === myName) {
      // render privateHand faces
      return privateHand.map((c, i) => (
        <div key={`me-${i}`} onClick={() => setSelectedIndex(i)} style={{ cursor: "pointer", transform: `rotate(${rotationFor(player)}deg)` }}>
          <Card face={c} faceUp={true} size="md" selected={selectedIndex === i} />
        </div>
      ));
    }
    // other players: render backs equal to count
    return Array.from({ length: Math.max(0, cnt) }).map((_, i) => (
      <div key={`${player}-back-${i}`} style={{ transform: `rotate(${rotationFor(player)}deg)` }}>
        <Card face={null} faceUp={false} size="sm" />
      </div>
    ));
  };

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
        {/* Top / Ally */}
        <div className="flex flex-col items-center mb-6">
          <div className="text-sm mb-2">Ally: {players.length ? players[(players.indexOf(myName) + 2) % (players.length || 1)] : ""}</div>
          <div className="bg-green-600 rounded px-4 py-4 w-full flex justify-center">
            {renderPlayerBacks(players.length ? players[(players.indexOf(myName) + 2) % players.length] : null)}
          </div>
        </div>

        <div className="flex justify-between items-start">
          <div>{renderPlayerBacks(players.length ? players[(players.indexOf(myName) + (players.length - 1)) % players.length] : null)}</div>
          <div className="flex-1 mx-6 min-h-[220px] rounded-lg border-0"></div>
          <div>{renderPlayerBacks(players.length ? players[(players.indexOf(myName) + 1) % players.length] : null)}</div>
        </div>

        <div className="mt-6 flex flex-col items-center">
          <div className="text-sm mb-2">You</div>
          <div className="flex gap-3 justify-center">
            {renderPlayerBacks(myName)}
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        <button onClick={passSelected} className="px-4 py-2 rounded bg-white text-green-800">Pass Selected</button>
        <button onClick={sendSignal} className="px-3 py-2 rounded bg-yellow-400 text-black">Signal</button>
        <button onClick={openSuspect} className="px-3 py-2 rounded bg-indigo-600 text-white">Suspect</button>
      </div>

      <div className="mt-2 text-xs">Turn: <span className="font-bold">{publicState?.players ? publicState.players[publicState.turnIndex] : "—"}</span></div>

      {showSuspectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white text-black rounded-lg p-4 w-full max-w-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">Suspect an opponent</h3>
              <button onClick={() => setShowSuspectModal(false)} className="text-sm text-gray-600">Close</button>
            </div>
            <div className="space-y-2">
              {(publicState?.players || []).filter(p => p && p !== myName).map((p) => (
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
    </div>
  );
}