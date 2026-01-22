import React, { useEffect, useState } from "react";

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setRows(data.leaderboard || []);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-linear-to-br from-purple-700 to-indigo-900 p-4 text-white">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold mb-4">Leaderboard</h1>
        <div className="bg-white text-black rounded-lg p-3">
          {rows.length === 0 && <div className="text-sm text-gray-700">No players yet</div>}
          {rows.map((r, i) => (
            <div key={r.username} className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-3">
                <div className="rounded-full w-8 h-8 bg-zinc-800 text-white flex items-center justify-center font-semibold">{r.username.slice(0,2).toUpperCase()}</div>
                <div>
                  <div className="font-semibold">{r.username}</div>
                  <div className="text-xs text-gray-600">Wins: {r.wins}</div>
                </div>
              </div>
              <div className="text-sm font-bold">{r.points} pts</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}