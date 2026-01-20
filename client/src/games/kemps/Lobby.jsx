import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Lobby({ user, socket, roomId, role }) {
  const [players, setPlayers] = useState([]);
  const [host, setHost] = useState(null);
  const [countdown, setCountdown] = useState(null); // null | 5→1
  const [swapA, setSwapA] = useState("");
  const [swapB, setSwapB] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!socket) return;

    // Join room
    socket.emit("joinRoom", { roomId, username: user.username });

    // Listen for updates
    socket.on("updateLobby", (payload) => {
      // payload may be array or object
      let playerList = Array.isArray(payload) ? payload : payload?.players || [];
      const hostUser = Array.isArray(payload) ? null : payload?.host || null;
      setPlayers(playerList);
      setHost(hostUser);

      // If 4 players joined, start countdown if not already started
      if (playerList.length === 4 && countdown === null) {
        setCountdown(5);
      }
    });

    // Listen for countdown tick from server (or local countdown)
    socket.on("startGame", () => {
      navigate("/kemps");
    });

    return () => {
      socket.off("updateLobby");
      socket.off("startGame");
    };
  }, [socket, roomId]);

  // Local countdown
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      socket.emit("startGame", { roomId });
      navigate("/kemps");
      return;
    }

    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const leaveRoom = () => {
    socket.emit("leaveRoom", { roomId, username: user.username });
    navigate("/join");
  };

  const isHost = host === user.username;

  const handleKick = (target) => {
    if (!isHost) return;
    socket.emit("kickPlayer", { roomId, username: target });
  };

  const handleSwap = () => {
    if (!isHost) return;
    const indexA = players.indexOf(swapA);
    const indexB = players.indexOf(swapB);
    if (indexA === -1 || indexB === -1) return;
    socket.emit("swapPlayers", { roomId, indexA, indexB });
    setSwapA("");
    setSwapB("");
  };

  const handleManualStart = () => {
    if (!isHost) return;
    if (players.length === 4) {
      socket.emit("startGame", { roomId });
      navigate("/kemps");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-green-900 text-white p-4">
      <h1 className="text-2xl font-bold mb-4">Lobby: {roomId}</h1>

      <div className="bg-green-800 p-4 rounded-lg w-full max-w-sm mb-4">
        <h2 className="font-semibold mb-2">Players Joined ({players.length}/4):</h2>
        <ul className="list-disc list-inside">
          {players.map((p, i) => (
            <li key={i} className="flex items-center justify-between">
              <span>{p}{host === p ? " (host)" : ""}</span>
              {isHost && p !== user.username && (
                <button onClick={() => handleKick(p)} className="ml-2 bg-red-500 px-2 py-1 rounded text-xs">Kick</button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {isHost && (
        <div className="bg-green-700 p-3 rounded mb-4 w-full max-w-sm">
          <h3 className="font-semibold mb-2">Host Controls</h3>
          <div className="flex gap-2 mb-2">
            <select value={swapA} onChange={(e) => setSwapA(e.target.value)} className="flex-1 p-2 rounded bg-zinc-800">
              <option value="">Select Player A</option>
              {players.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={swapB} onChange={(e) => setSwapB(e.target.value)} className="flex-1 p-2 rounded bg-zinc-800">
              <option value="">Select Player B</option>
              {players.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSwap} className="bg-yellow-500 px-3 py-1 rounded">Swap</button>
            <button onClick={handleManualStart} disabled={players.length !== 4} className="bg-emerald-500 px-3 py-1 rounded disabled:opacity-50">Start</button>
          </div>
        </div>
      )}

      {countdown !== null && (
        <div className="text-3xl font-bold mb-4 animate-pulse">
          Starting in: {countdown}...
        </div>
      )}

      <button
        onClick={leaveRoom}
        className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded font-bold"
      >
        Leave Room
      </button>
    </div>
  );
}