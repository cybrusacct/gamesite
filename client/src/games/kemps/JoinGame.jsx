import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";


const socket = io(process.env.REACT_APP_API_URL);


export default function JoinGame({ user, onJoin }) {
  const [createRoomId, setCreateRoomId] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [players, setPlayers] = useState([]);
  const [countdown, setCountdown] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleCreate = () => {
    if (!createRoomId) return setError("Enter a room ID to create");
    // For simplicity we just join the room immediately (server creates it if missing)
    socket.emit("joinRoom", { roomId: createRoomId, username: user.username });
    onJoin({ socket, roomId: createRoomId, role: "You" });
    navigate("/lobby");
  };

  const handleJoin = () => {
    if (!joinRoomId) return setError("Enter a room ID to join");
    socket.emit("joinRoom", { roomId: joinRoomId, username: user.username });
    onJoin({ socket, roomId: joinRoomId, role: "You" });
    navigate("/lobby");
  };

  // Listen to lobby updates (server emits "updateLobby" with object {players, host} )
  useEffect(() => {
    socket.on("updateLobby", (payload) => {
      const playersArr = Array.isArray(payload) ? payload : payload?.players || [];
      setPlayers(playersArr || []);
    });

    // server-driven countdown events
    socket.on("countdown", (seconds) => {
      setCountdown(seconds);
    });

    return () => {
      socket.off("updateLobby");
      socket.off("countdown");
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-linear-to-br from-purple-600 to-indigo-950 text-white p-4">
      <h1 className="text-2xl font-bold mb-6">Join or Create a Game</h1>
      <div className="flex flex-col gap-6 w-full max-w-md">
        {/* CREATE GAME */}
        <div className="bg-zinc-900 p-6 rounded-xl shadow-lg flex flex-col gap-4">
          <h2 className="font-semibold text-lg text-center">Create a Room</h2>
          <input
            type="text"
            placeholder="Room ID"
            value={createRoomId}
            onChange={(e) => setCreateRoomId(e.target.value)}
            className="p-2 rounded bg-zinc-800 placeholder-zinc-400 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={handleCreate}
            className="bg-emerald-500 hover:bg-emerald-600 p-2 rounded font-bold"
          >
            Create
          </button>
        </div>

        {/* JOIN GAME */}
        <div className="bg-zinc-900 p-6 rounded-xl shadow-lg flex flex-col gap-4">
          <h2 className="font-semibold text-lg text-center">Join a Room</h2>
          <input
            type="text"
            placeholder="Room ID"
            value={joinRoomId}
            onChange={(e) => setJoinRoomId(e.target.value)}
            className="p-2 rounded bg-zinc-800 placeholder-zinc-400 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={handleJoin}
            className="bg-blue-500 hover:bg-blue-600 p-2 rounded font-bold"
          >
            Join
          </button>
        </div>

        {error && <p className="text-red-400 text-center">{error}</p>}

        {/* Lobby Info */}
        {players.length > 0 && (
          <div className="bg-zinc-900 p-4 rounded-xl shadow-inner flex flex-col gap-2">
            <h3 className="font-semibold text-center">Lobby ({players.length}/4)</h3>
            <ul className="text-sm flex flex-col gap-1">
              {players.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
            {countdown !== null && <p className="text-yellow-400 text-center">Starting in: {countdown}</p>}
          </div>
        )}
      </div>
    </div>
  );
}