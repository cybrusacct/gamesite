import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Avatar from "../../components/Avatar";
import useSocket from "../../hooks/useSocket";

/*
  Lobby UI matching your screenshot/flow:
  - Two-column player tiles with HOST badge and Ready label
  - Host sees Swap, Kick and Start controls
  - Players see Ready and Leave buttons
  - On mount: joinRoom + rejoinRoom to ensure canonical snapshot
  - Listens for updateLobby, countdown, startGame, updateGame
  - Navigates to /kemps when server signals start
*/

export default function Lobby({ user, socket: socketProp, roomId, role }) {
  const socket = socketProp || useSocket();
  const [players, setPlayers] = useState([]);
  const [host, setHost] = useState(null);
  const [readyMap, setReadyMap] = useState({});
  const [countdown, setCountdown] = useState(null);
  const [swapA, setSwapA] = useState("");
  const [swapB, setSwapB] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!socket) return;

    // join and request canonical snapshot
    socket.emit("joinRoom", { roomId, username: user.username });
    socket.emit("rejoinRoom", { roomId, username: user.username });

    const onUpdateLobby = (payload) => {
      const list = Array.isArray(payload) ? payload : payload?.players || [];
      setPlayers(list || []);
      setHost(payload?.host || null);
      setReadyMap(payload?.ready || {});
    };

    const onCountdown = (secs) => setCountdown(secs);

    const onStartGame = (snapshot) => {
      // server instructs to start; navigate to game
      navigate("/kemps");
    };

    const onUpdateGame = (snapshot) => {
      if (snapshot?.gameActive) navigate("/kemps");
    };

    socket.on("updateLobby", onUpdateLobby);
    socket.on("countdown", onCountdown);
    socket.on("startGame", onStartGame);
    socket.on("updateGame", onUpdateGame);

    socket.on("kicked", () => navigate("/"));

    return () => {
      socket.off("updateLobby", onUpdateLobby);
      socket.off("countdown", onCountdown);
      socket.off("startGame", onStartGame);
      socket.off("updateGame", onUpdateGame);
      socket.off("kicked");
    };
  }, [socket, roomId, user.username, navigate]);

  const isHost = host === user.username;

  const toggleReady = () => {
    const newReady = !Boolean(readyMap[user.username]);
    socket.emit("setReady", { roomId, username: user.username, ready: newReady });
    setReadyMap((m) => ({ ...m, [user.username]: newReady }));
  };

  const leaveRoom = () => {
    socket.emit("leaveRoom", { roomId, username: user.username });
    navigate("/");
  };

  const handleStart = () => {
    if (!isHost) return;
    socket.emit("startGame", { roomId });
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

  const handleKick = (username) => {
    if (!isHost) return;
    socket.emit("kickPlayer", { roomId, username });
  };

  const PlayerTile = ({ name }) => {
    const isHostTile = name === host;
    const isReady = !!readyMap[name];
    return (
      <div className="bg-zinc-800 p-3 rounded-lg flex items-center gap-3 shadow-sm">
        <Avatar name={name} size="sm" />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div className="font-semibold">{name}</div>
            {isHostTile && <div className="text-[10px] bg-yellow-400 text-black px-2 py-1 rounded">HOST</div>}
          </div>
          <div className={`text-xs mt-1 ${isReady ? "text-emerald-300" : "text-gray-400"}`}>{isReady ? "Ready" : "Not ready"}</div>
        </div>
        {isHost && name !== user.username && (
          <div className="flex items-center gap-2">
            <button onClick={() => handleKick(name)} className="text-xs bg-red-600 px-2 py-1 rounded">Kick</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-[#0f1720] text-white p-6">
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl font-bold mb-4 text-center">Lobby: {roomId}</h1>

        <div className="bg-transparent p-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {players.map((p) => <PlayerTile key={p} name={p} />)}
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          {isHost ? (
            <>
              <div className="flex-1">
                <div className="flex gap-2 mb-2">
                  <select value={swapA} onChange={(e) => setSwapA(e.target.value)} className="flex-1 p-2 rounded bg-zinc-700">
                    <option value="">Select A</option>
                    {players.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select value={swapB} onChange={(e) => setSwapB(e.target.value)} className="flex-1 p-2 rounded bg-zinc-700">
                    <option value="">Select B</option>
                    {players.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSwap} className="flex-1 bg-yellow-500 hover:bg-yellow-600 py-3 rounded text-black font-semibold">Swap</button>
                  <button onClick={handleStart} className="flex-1 bg-emerald-500 hover:bg-emerald-600 py-3 rounded text-black font-semibold">Start</button>
                </div>
              </div>
            </>
          ) : (
            <>
              <button onClick={toggleReady} className="flex-1 bg-emerald-500 hover:bg-emerald-600 py-3 rounded text-black font-semibold">
                {readyMap[user.username] ? "Unready" : "Ready"}
              </button>
              <button onClick={leaveRoom} className="flex-1 bg-red-600 hover:bg-red-700 py-3 rounded text-white font-semibold">Leave</button>
            </>
          )}
        </div>

        {countdown !== null && (
          <div className="mt-6 text-center">
            <div className="text-4xl font-bold text-yellow-300">Starting in: {countdown}</div>
          </div>
        )}
      </div>
    </div>
  );
}