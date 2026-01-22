import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import ChatModal from "../components/ChatModal";
import ProfileModal from "./ProfileModal";
import LeaderboardModal from "./LeaderboardModal";

export default function Navbar({ user, socket, onOpenProfile }) {
  const [showChat, setShowChat] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <nav className="w-full px-3 py-2 flex items-center justify-between bg-zinc-900 text-white fixed top-0 left-0 z-30">
        <div className="flex items-center gap-2">
          <div className="font-bold cursor-pointer" onClick={() => navigate("/")}>GameSite</div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setShowChat(true)} className="p-2 rounded bg-zinc-800">💬 Chat</button>
          <button onClick={() => setShowProfile(true)} className="p-2 rounded bg-zinc-800">Profile</button>
          <button onClick={() => setShowLeaderboard(true)} className="p-2 rounded bg-zinc-800">🏆 Leaderboard</button>
        </div>
      </nav>

      <div style={{ height: 48 }}></div>

      {showChat && <ChatModal socket={socket} username={user?.username} onClose={() => setShowChat(false)} />}
      {showProfile && <ProfileModal username={user?.username} onClose={() => setShowProfile(false)} />}
      {showLeaderboard && <LeaderboardModal onClose={() => setShowLeaderboard(false)} />}
    </>
  );
}