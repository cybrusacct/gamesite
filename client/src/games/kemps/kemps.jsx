import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Avatar from "../../components/Avatar";
import useSocket from "../../hooks/useSocket";

/*
  Lobby component:
  - listens for updateLobby and updateGame
  - navigates to /kemps when server emits startGame OR when updateGame.gameActive === true
  - host can swap players and the server enforces host-only permission
*/

export default function Lobby({ user, socket: socketProp, roomId, role }) {
  const socket = socketProp || useSocket();
  const [players, setPlayers] = useState([]);
  const [host, setHost] = useState(null);
  const [readyMap, setReadyMap] = useState({});
  const [swapA, setSwapA] = useState("");
  const [swapB, setSwapB] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!socket) return;

    socket.emit("joinRoom", { roomId, username: user.username });

    const onUpdateLobby = (payload) => {
      const playerList = Array.isArray(payload) ? payload : payload?.players || [];
      const hostUser = Array.isArray(payload) ? null : payload?.host || null;
      setPlayers(playerList);
      setHost(hostUser);
      setReadyMap((payload && payload.ready) || {});
    };
    socket.on("updateLobby", onUpdateLobby);

    // Also listen for public game state updates so we can detect server-authoritative start
    const onUpdateGame = (snapshot) => {
      if (!snapshot) return;
      // if game is active, navigate to game view
      if (snapshot.gameActive) {
        navigate("/kemps");
      }
    };
    socket.on("updateGame", onUpdateGame);

    // old compatibility: server may emit explicit startGame event
    socket.on("startGame", (snapshot) => {
      navigate("/kemps");
    });

    socket.on("kicked", () => {
      navigate("/");
    });

    return () => {
      socket.off("updateLobby", onUpdateLobby);
      socket.off("updateGame", onUpdateGame);
      socket.off("startGame");
      socket.off("kicked");
    };
  }, [socket, roomId, user.username, navigate]);

  const leaveRoom = () => {
    socket.emit("leaveRoom", { roomId, username: user.username });
    navigate("/");
  };

  const isHost = host === user.username;

  const handleKick = (target) => {
    if (!isHost) return;
    socket.emit("kickPlayer", { roomId, username: target });
  };

  const toggleReady = () => {
    const newReady = !Boolean(readyMap[user.username]);
    socket.emit("setReady", { roomId, username: user.username, ready: newReady });
    setReadyMap((m) => ({ ...m, [user.username]: newReady }));
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
    if (players.length >= 2 && players.length <= 4) {
      socket.emit("startGame", { roomId });
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-linear-to-br from-purple-700 to-indigo-900 text-white p-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4 text-center">Lobby: {roomId}</h1>

        <div className="bg-zinc-900 p-3 rounded-lg mb-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Players ({players.length}/4)</div>
            <div className="text-xs text-gray-300">Host: <span className="font-medium">{host}</span></div>
          </div>

          {/* Team A (indices 0,2) top row */}
          <div className="flex gap-2 items-center justify-start flex-wrap">
            {players.map((p, i) => {
              if (i % 2 === 0) {
                return (
                  <div key={p} className="flex items-center gap-2 bg-zinc-800 p-2 rounded">
                    <Avatar name={p} size="sm" />
                    <div className="text-sm">
                      <div className="font-semibold">{p} {host === p && <span className="text-xs bg-yellow-400 text-black px-1 rounded ml-1">HOST</span>}</div>
                      <div className="text-xs text-gray-300">{readyMap[p] ? <span className="text-emerald-300">Ready</span> : <span className="text-gray-400">Not ready</span>}</div>
                    </div>
                    {isHost && p !== user.username && <button onClick={() => handleKick(p)} className="ml-2 bg-red-500 px-2 py-1 rounded text-xs">Kick</button>}
                  </div>
                );
              }
              return null;
            })}
          </div>

          {/* Team B (indices 1,3) bottom row */}
          <div className="mt-2 flex gap-2 items-center justify-start flex-wrap">
            {players.map((p, i) => {
              if (i % 2 === 1) {
                return (
                  <div key={p} className="flex items-center gap-2 bg-zinc-800 p-2 rounded">
                    <Avatar name={p} size="sm" />
                    <div className="text-sm">
                      <div className="font-semibold">{p} {host === p && <span className="text-xs bg-yellow-400 text-black px-1 rounded ml-1">HOST</span>}</div>
                      <div className="text-xs text-gray-300">{readyMap[p] ? <span className="text-emerald-300">Ready</span> : <span className="text-gray-400">Not ready</span>}</div>
                    </div>
                    {isHost && p !== user.username && <button onClick={() => handleKick(p)} className="ml-2 bg-red-500 px-2 py-1 rounded text-xs">Kick</button>}
                  </div>
                );
              }
              return null;
            })}
          </div>
        </div>

        {isHost && (
          <div className="bg-zinc-800 p-3 rounded mb-4">
            <h3 className="font-semibold mb-2">Host Controls</h3>
            <div className="flex gap-2 mb-2">
              <select value={swapA} onChange={(e) => setSwapA(e.target.value)} className="flex-1 p-2 rounded bg-zinc-700">
                <option value="">Select Player A</option>
                {players.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={swapB} onChange={(e) => setSwapB(e.target.value)} className="flex-1 p-2 rounded bg-zinc-700">
                <option value="">Select Player B</option>
                {players.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSwap} className="bg-yellow-500 px-3 py-1 rounded">Swap</button>
              <button onClick={handleManualStart} className="bg-emerald-500 px-3 py-1 rounded">Start</button>
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-between">
          <button onClick={toggleReady} className="flex-1 bg-emerald-500 px-4 py-2 rounded">
            {readyMap[user.username] ? "Unready" : "Ready"}
          </button>
          <button onClick={leaveRoom} className="flex-1 bg-red-600 px-4 py-2 rounded">Leave</button>
        </div>
      </div>
    </div>
  );
}