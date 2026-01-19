import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Lobby({ user, socket, roomId, role }) {
  const [players, setPlayers] = useState([]);
  const [countdown, setCountdown] = useState(null); // null | 5→1
  const navigate = useNavigate();

  useEffect(() => {
    if (!socket) return;

    // Join room
    socket.emit("joinRoom", { roomId, username: user.username });

    // Listen for updates
    socket.on("updateLobby", (playerList) => {
      setPlayers(playerList);

      // If 4 players joined, start countdown
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
      return;
    }

    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const leaveRoom = () => {
    socket.emit("leaveRoom", { roomId, username: user.username });
    navigate("/join");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-green-900 text-white p-4">
      <h1 className="text-2xl font-bold mb-4">Lobby: {roomId}</h1>

      <div className="bg-green-800 p-4 rounded-lg w-full max-w-sm mb-4">
        <h2 className="font-semibold mb-2">Players Joined ({players.length}/4):</h2>
        <ul className="list-disc list-inside">
          {players.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </div>

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
