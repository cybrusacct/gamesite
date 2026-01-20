import React, { useEffect, useState } from "react";

export default function ProfileModal({ username, onClose }) {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!username) return;
    fetch(`/api/profile/${encodeURIComponent(username)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setProfile(data.user);
      })
      .catch(() => {});
  }, [username]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="bg-white text-black rounded-lg p-4 w-full max-w-sm">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold">Profile</h3>
          <button onClick={onClose} className="text-sm text-gray-600">Close</button>
        </div>

        {!profile && <div>Loading...</div>}
        {profile && (
          <div className="space-y-2">
            <div><strong>Name:</strong> {profile.username}</div>
            <div><strong>Points earned:</strong> {profile.points}</div>
            <div><strong>Matches won:</strong> {profile.wins}</div>
          </div>
        )}
      </div>
    </div>
  );
}