import React, { useEffect, useState } from "react";

/*
  Leaderboard modal (lowercase filename as requested).
  Fetches /api/leaderboard and displays results in a modal.
*/
export default function LeaderboardModal({ onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return;
        if (data.ok) setRows(data.leaderboard || []);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="bg-white text-black rounded-lg p-4 w-full max-w-md shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">Leaderboard</h3>
          <button onClick={onClose} className="text-sm text-gray-600">Close</button>
        </div>

        {loading && <div>Loading...</div>}

        {!loading && rows.length === 0 && <div className="text-sm text-gray-700">No players yet</div>}

        {!loading && rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.username} className="flex items-center justify-between p-2 rounded bg-zinc-100">
                <div className="flex items-center gap-3">
                  <div className="rounded-full w-8 h-8 bg-zinc-800 text-white flex items-center justify-center font-semibold">
                    {r.username.slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold">{r.username}</div>
                    <div className="text-xs text-gray-600">Wins: {r.wins}</div>
                  </div>
                </div>
                <div className="text-sm font-bold">{r.points} pts</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}