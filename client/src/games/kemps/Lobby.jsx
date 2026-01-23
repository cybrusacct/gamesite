import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Avatar from "../../components/Avatar";
import useSocket from "../../hooks/useSocket";

/*
  Lobby UI updated to match screenshot:
  - Grid of player tiles (two columns) with HOST badge and Ready status
  - Large green Unready / Start button and red Leave button across the width
  - Host-only Start button shown in place of Unready (host starts match)
  - Uses server authoritative events (updateLobby, updateGame, countdown, startGame)
*/

export default function Lobby({ user, socket: socketProp, roomId, role }) {
  const socket = socketProp || useSocket();
  const [players, setPlayers] = useState([]);
  const [host, setHost] = useState(null);
  const [readyMap, setReadyMap] = useState({});
  const [countdown, setCountdown] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!socket) return;

    // join + request snapshot to avoid missing events
    socket.emit("joinRoom", { roomId, username: user.username });
    socket.emit("rejoinRoom", { roomId, username: user.username });

    const onUpdateLobby = (payload) => {
      const playerList = Array.isArray(payload) ? payload : payload?.players || [];
      const hostUser = Array.isArray(payload) ? null : payload?.host || null;
      setPlayers(playerList);
      setHost(hostUser);
      setReadyMap((payload && payload.ready) || {});
    };

    const onCountdown = (s) => {
      setCountdown(s);
    };

    const onStartGame = (snapshot) => {
      // navigate to kemps; client will receive initHand/syncHand privately
      navigate("/kemps");
    };

    const onUpdateGame = (snapshot) => {
      // if server says gameActive, navigate
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

  const leaveRoom = () => {
    socket.emit("leaveRoom", { roomId, username: user.username });
    navigate("/");
  };

  const toggleReady = () => {
    const newReady = !Boolean(readyMap[user.username]);
    socket.emit("setReady", { roomId, username: user.username, ready: newReady });
    setReadyMap((m) => ({ ...m, [user.username]: newReady }));
  };

  const isHost = host === user.username;

  const handleStart = () => {
    if (!isHost) return;
    socket.emit("startGame", { roomId });
  };

  // Render a player tile like the screenshot
  const PlayerTile = ({ name }) => {
    const isHostTile = name === host;
    const isReady = !!readyMap[name];
    return (
      <div className="bg-zinc-800 p-3 rounded-lg flex items-center gap-3" style={{ minWidth: 220 }}>
        <div><Avatar name={name} size="sm" /></div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div className="font-semibold">{name}</div>
            {isHostTile && <div className="text-[10px] bg-yellow-400 text-black px-2 py-1 rounded ml-2">HOST</div>}
          </div>
          <div className={`text-xs mt-1 ${isReady ? "text-emerald-300" : "text-gray-400"}`}>{isReady ? "Ready" : "Not ready"}</div>
        </div>
      </div>
    );
  };

  // Build two-column grid like the screenshot (max 4 players)
  const gridPlayers = () => {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {players.map((p) => <PlayerTile key={p} name={p} />)}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-[#0f1720] text-white p-6">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-bold mb-4 text-center">Lobby: {roomId}</h1>

        <div className="bg-transparent p-2 mb-4">
          {gridPlayers()}
        </div>

        <div className="mt-6 flex gap-3">
          {isHost ? (
            <button onClick={handleStart} className="flex-1 bg-emerald-500 hover:bg-emerald-600 py-3 rounded text-black font-semibold">Start</button>
          ) : (
            <button onClick={toggleReady} className="flex-1 bg-emerald-500 hover:bg-emerald-600 py-3 rounded text-black font-semibold">
              {readyMap[user.username] ? "Unready" : "Ready"}
            </button>
          )}
          <button onClick={leaveRoom} className="flex-1 bg-red-600 hover:bg-red-700 py-3 rounded text-white font-semibold">Leave</button>
        </div>

        {countdown !== null && <div className="mt-3 text-center text-yellow-400">Starting in: {countdown}</div>}
      </div>
    </div>
  );
}