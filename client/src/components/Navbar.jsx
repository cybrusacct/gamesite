import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ChatModal from "../components/ChatModal";
import ProfileModal from "./ProfileModal";
import LeaderboardModal from "./LeaderboardModal";

/*
  Navbar (no Play button) — the Join/Create flow is reached from LandingPage (Kemps button).
  Keeps chat caching so recent messages are available anytime.
*/

export default function Navbar({ user, socket, onOpenProfile }) {
  const [showChat, setShowChat] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [chatCache, setChatCache] = useState([]); // oldest -> newest
  const navigate = useNavigate();

  useEffect(() => {
    if (!socket) return;

    const handleHistory = (messages) => {
      if (!Array.isArray(messages)) return;
      setChatCache((prev) => {
        const map = new Map();
        prev.forEach((m) => map.set(`${m.username}|${m.ts}|${m.message}`, m));
        messages.forEach((m) => map.set(`${m.username}|${m.ts}|${m.message}`, m));
        const arr = Array.from(map.values());
        arr.sort((a, b) => new Date(a.ts) - new Date(b.ts));
        return arr;
      });
    };

    const handleIncoming = (msg) => {
      if (!msg || !msg.ts) return;
      setChatCache((prev) => {
        const key = `${msg.username}|${msg.ts}|${msg.message}`;
        const exists = prev.some((m) => `${m.username}|${m.ts}|${m.message}` === key);
        if (exists) return prev;
        const next = [...prev, msg];
        if (next.length > 200) next.splice(0, next.length - 200);
        return next;
      });
    };

    socket.on("chatHistory", handleHistory);
    socket.on("globalChatMessage", handleIncoming);

    return () => {
      socket.off("chatHistory", handleHistory);
      socket.off("globalChatMessage", handleIncoming);
    };
  }, [socket]);

  const previewMessages = chatCache.slice(-3);

  return (
    <>
      <nav className="w-full px-3 py-2 flex items-center justify-between bg-zinc-900 text-white fixed top-0 left-0 z-30">
        <div className="flex items-center gap-2">
          <div className="font-bold cursor-pointer" onClick={() => navigate("/")}>GameSite</div>
        </div>

        <div className="flex items-center gap-3 relative">
          <div className="relative">
            <button onClick={() => setShowChat((s) => !s)} className="p-2 rounded bg-zinc-800">💬 Chat</button>
            <div className="absolute right-0 mt-10 w-64 bg-white text-black rounded shadow-lg p-2 hidden md:block">
              {previewMessages.length === 0 ? (
                <div className="text-xs text-gray-600">No messages</div>
              ) : (
                previewMessages.map((m, i) => (
                  <div key={`${m.username}-${m.ts}-${i}`} className="text-xs mb-1">
                    <span className="font-semibold">{m.username}:</span> <span className="text-gray-700">{m.message}</span>
                  </div>
                ))
              )}
              <div className="text-right">
                <button onClick={() => setShowChat(true)} className="text-sm text-blue-600">Open chat</button>
              </div>
            </div>
          </div>

          <button onClick={() => setShowProfile(true)} className="p-2 rounded bg-zinc-800">Profile</button>
          <button onClick={() => setShowLeaderboard(true)} className="p-2 rounded bg-zinc-800">🏆 Leaderboard</button>
        </div>
      </nav>

      <div style={{ height: 48 }}></div>

      {showChat && <ChatModal socket={socket} username={user?.username} initialMessages={chatCache} onClose={() => setShowChat(false)} />}
      {showProfile && <ProfileModal username={user?.username} onClose={() => setShowProfile(false)} />}
      {showLeaderboard && <LeaderboardModal onClose={() => setShowLeaderboard(false)} />}
    </>
  );
}