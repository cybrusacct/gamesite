import React from "react";
import { useNavigate } from "react-router-dom";

/*
  LandingPage: offers game tiles. Clicking the Kemps (Jackwhot) tile navigates to /join
  where the JoinGame component shows the Create / Join UI.
*/

export default function LandingPage({ user, socket }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-linear-to-br from-gray-900 to-green-800 text-white p-8">
      <div className="w-full max-w-4xl">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold">GameSite</h1>
          <p className="text-gray-300 mt-2">Pick a game and play with friends.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Kemps (Jackwhot) card */}
          <div className="bg-green-700 rounded-xl p-6 shadow-lg flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Kemps (Jackwhot)</h2>
                <p className="text-sm text-green-100 mt-1">Traditional partner-based card game. Click to create or join a room.</p>
              </div>
              <div className="text-sm text-green-200">{/* optional icon */}</div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => navigate("/join")}
                className="bg-white text-green-800 px-4 py-2 rounded font-semibold hover:bg-gray-100"
              >
                Play Kemps
              </button>

              <button
                onClick={() => {
                  // show quick rules or demo; keep simple
                  alert("Kemps (Jackwhot) - partners, pass cards, call JACKWHOT to win. Click Play to create or join a room.");
                }}
                className="bg-transparent border border-white/20 px-4 py-2 rounded text-sm"
              >
                Rules
              </button>
            </div>
          </div>

          {/* Placeholder for other games */}
          <div className="bg-indigo-700 rounded-xl p-6 shadow-lg flex flex-col">
            <div>
              <h2 className="text-2xl font-bold">Other Games</h2>
              <p className="text-sm text-indigo-100 mt-1">Memory, Flag trivia, and more.</p>
            </div>

            <div className="mt-6">
              <button onClick={() => navigate("/memory")} className="bg-white text-indigo-700 px-4 py-2 rounded font-semibold hover:bg-gray-100">Play Memory</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}