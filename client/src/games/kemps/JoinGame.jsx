import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useSocket from "../../hooks/useSocket";

/*
  JoinGame (fixed)
  - Uses shared socket via useSocket()
  - Create or Join a room by entering code
  - Calls onJoin({ roomId, role }) so App stores roomId/role
  - Shows small lobby preview if server already sent updateLobby
*/

export default function JoinGame({ user, onJoin }) {
  const socket = useSocket();
  const [createRoomId, setCreateRoomId] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [players, setPlayers] = useState([]);
  const [countdown, setCountdown] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    console.debug("JoinGame mounted", { roomPreviewSocketId: socket?.id });
    if (!socket) return;

    const onUpdateLobby = (payload) => {
      const list = Array.isArray(payload) ? payload : payload?.players || [];
      setPlayers(list || []);
    };
    const onCountdown = (s) => setCountdown(s);

    socket.on("updateLobby", onUpdateLobby);
    socket.on("countdown", onCountdown);

    return () => {
      socket.off("updateLobby", onUpdateLobby);
      socket.off("countdown", onCountdown);
    };
  }, [socket]);

  const doJoinRoom = (roomId) => {
    setError("");
    if (!roomId) return setError("Enter a room ID");
    if (!socket) return setError("No socket connection");
    socket.emit("joinRoom", { roomId, username: user.username });
    onJoin({ roomId, role: "You" });
    navigate("/lobby");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-linear-to-br from-gray-900 to-indigo-900 text-white p-6">
      <div className="w-full max-w-lg">
        <h1 className="text-3xl font-bold mb-6 text-center">Kemps (Jackwhot)</h1>

        <div className="grid grid-cols-1 gap-6">
          <div className="bg-zinc-900 p-6 rounded-xl shadow-lg">
            <h2 className="font-semibold text-lg mb-3">Create a Room</h2>
            <input
              value={createRoomId}
              onChange={(e) => setCreateRoomId(e.target.value)}
              placeholder="Enter room code"
              className="w-full p-3 rounded bg-zinc-800 placeholder-zinc-500"
            />
            <div className="mt-3 flex gap-3">
              <button
                onClick={() => doJoinRoom(createRoomId)}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 py-2 rounded font-semibold text-black"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setCreateRoomId(Math.random().toString(36).slice(2, 8).toUpperCase());
                }}
                className="px-3 py-2 bg-zinc-700 rounded"
              >
                Suggest
              </button>
            </div>
          </div>

          <div className="bg-zinc-900 p-6 rounded-xl shadow-lg">
            <h2 className="font-semibold text-lg mb-3">Join a Room</h2>
            <input
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
              placeholder="Enter room code"
              className="w-full p-3 rounded bg-zinc-800 placeholder-zinc-500"
            />
            <div className="mt-3 flex gap-3">
              <button
                onClick={() => doJoinRoom(joinRoomId)}
                className="flex-1 bg-blue-500 hover:bg-blue-600 py-2 rounded font-semibold"
              >
                Join
              </button>
              <button onClick={() => setJoinRoomId("")} className="px-3 py-2 bg-zinc-700 rounded">
                Clear
              </button>
            </div>
          </div>

          {error && <div className="text-red-400 text-center">{error}</div>}

          {players.length > 0 && (
            <div className="bg-zinc-900 p-4 rounded-xl shadow-inner">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">Lobby preview ({players.length}/4)</div>
                {countdown !== null && <div className="text-yellow-400">Starting in: {countdown}</div>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {players.map((p) => (
                  <div key={p} className="bg-zinc-800 p-2 rounded flex items-center gap-2">
                    <div className="rounded-full w-8 h-8 bg-amber-400 text-black flex items-center justify-center font-semibold">
                      {p.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="text-sm">{p}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}