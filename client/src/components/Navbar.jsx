import React, { useState } from "react";
import ChatModal from "./ChatModal";

export default function Navbar({ user, socket, onOpenProfile }) {
  const [showChat, setShowChat] = useState(false);

  return (
    <>
      <nav className="w-full px-3 py-2 flex items-center justify-between bg-zinc-900 text-white fixed top-0 left-0 z-30">
        <div className="flex items-center gap-2">
          <div className="font-bold">GameSite</div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setShowChat(true)} className="p-2 rounded bg-zinc-800">💬 Chat</button>
          <button onClick={onOpenProfile} className="p-2 rounded bg-zinc-800">Profile</button>
        </div>
      </nav>

      <div style={{ height: 48 }}></div>

      {showChat && <ChatModal socket={socket} username={user?.username} onClose={() => setShowChat(false)} />}
    </>
  );
}