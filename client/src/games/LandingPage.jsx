import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import ProfileModal from "../components/ProfileModal";

export default function LandingPage({ user, socket }) {
  const navigate = useNavigate();
  const [showProfile, setShowProfile] = useState(false);

  return (
    <div className="min-h-screen bg-linear-to-br from-purple-700 to-indigo-900 flex flex-col items-center p-4 text-white">
      <Navbar user={user} socket={socket} onOpenProfile={() => setShowProfile(true)} />

      {/* Welcome / Hero Section */}
      <header className="text-center mt-8 mb-6">
        <h1 className="text-3xl sm:text-5xl font-bold">🎮 GameSite</h1>
        <p className="mt-2 text-sm sm:text-lg">
          Welcome {user?.username || "Player"}! Choose a game to start.
        </p>
      </header>

      {/* Game Cards */}
      <div className="flex flex-col gap-4 w-full max-w-md">
        {/* Kemps (Jackwhot) */}
        <div
          className="p-6 rounded-xl shadow-xl cursor-pointer transition transform bg-red-500 hover:bg-red-600 hover:scale-105"
          onClick={() => navigate("/join")}
        >
          <h2 className="text-xl sm:text-2xl font-bold">
            Kemps (Jackwhot)
          </h2>
          <p className="text-sm sm:text-base mt-1">
            4 players, team strategy game
          </p>
        </div>

        {/* Memory Game */}
        <div
          className="p-6 rounded-xl shadow-xl cursor-pointer transition transform bg-blue-500 hover:bg-blue-600 hover:scale-105"
          onClick={() => navigate("/memory")}
        >
          <h2 className="text-xl sm:text-2xl font-bold">Memory Game</h2>
          <p className="text-sm sm:text-base mt-1">
            2–4 players, match the cards
          </p>
        </div>

        {/* Flag Trivia */}
        <div
          className="p-6 rounded-xl shadow-xl cursor-pointer transition transform bg-green-500 hover:bg-green-600 hover:scale-105"
          onClick={() => navigate("/flag-trivia")}
        >
          <h2 className="text-xl sm:text-2xl font-bold">Flag Trivia</h2>
          <p className="text-sm sm:text-base mt-1">
            2–4 players, quick quiz fun
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-auto text-xs sm:text-sm text-gray-300 mb-4">
        &copy; 2026 GameSite. All rights reserved.
      </footer>

      {showProfile && <ProfileModal username={user.username} onClose={() => setShowProfile(false)} />}
    </div>
  );
}