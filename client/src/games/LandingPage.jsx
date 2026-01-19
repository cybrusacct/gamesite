import React from "react";
import { useNavigate } from "react-router-dom"; // for routing

export default function LandingPage({ user }) {
  const navigate = useNavigate();

  const games = [
    {
      name: "Kemps (Jackwhot)",
      description: "4 players, team strategy game",
      route: "/kemps",
      color: "bg-red-500 hover:bg-red-600",
    },
    {
      name: "Memory Game",
      description: "2-4 players, match the cards",
      route: "/memory",
      color: "bg-blue-500 hover:bg-blue-600",
    },
    {
      name: "Flag Trivia",
      description: "2-4 players, quick quiz fun",
      route: "/flag-trivia",
      color: "bg-green-500 hover:bg-green-600",
    },
  ];

  return (
    <div className="min-h-screen bg-linear-to-br from-purple-700 to-indigo-900 flex flex-col items-center p-4 text-white">
      {/* Welcome / Hero Section */}
      <header className="text-center mt-8 mb-6">
        <h1 className="text-3xl sm:text-5xl font-bold">🎮 GameSite</h1>
        <p className="mt-2 text-sm sm:text-lg">
          Welcome {user?.username || "Player"}! Choose a game to start.
        </p>
      </header>

      {/* Game Cards */}
      <div className="flex flex-col gap-4 w-full max-w-md">
        {games.map((game) => (
          <div
            key={game.name}
            className={`p-6 rounded-xl shadow-xl cursor-pointer transition transform ${game.color} hover:scale-105`}
            onClick={() => navigate(game.route)}
          >
            <h2 className="text-xl sm:text-2xl font-bold">{game.name}</h2>
            <p className="text-sm sm:text-base mt-1">{game.description}</p>
          </div>
        ))}

        <button
  onClick={() => navigate("/join")}
  className="bg-emerald-500 hover:bg-emerald-600 p-2 rounded"
>
  Play Kemps
</button>

      </div>

      {/* Footer */}
      <footer className="mt-auto text-xs sm:text-sm text-gray-300 mb-4">
        &copy; 2026 GameSite. All rights reserved.
      </footer>
    </div>
  );
}
