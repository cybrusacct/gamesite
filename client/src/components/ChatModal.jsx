import React, { useEffect, useState, useRef } from "react";

/*
  Simple global chat. Messages from self float to right, others to left (WhatsApp-like).
  Each message shows sender and timestamp.
*/
export default function ChatModal({ socket, username, onClose }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    const handler = (msg) => {
      setMessages((m) => [...m, msg]);
      // small sound on receive
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = 880;
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.01);
        setTimeout(() => { try { o.stop(); } catch (e) {} }, 80);
      } catch (e) {}
    };

    socket.on("globalChatMessage", handler);
    return () => socket.off("globalChatMessage", handler);
  }, [socket]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const send = () => {
    if (!text.trim()) return;
    const ts = new Date().toISOString();
    const payload = { username, message: text.trim(), ts };
    if (socket) socket.emit("globalChat", payload);
    // locally push it immediately
    setMessages((m) => [...m, payload]);
    setText("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4">
      <div className="bg-white text-black rounded-lg w-full max-w-md shadow-lg flex flex-col">
        <div className="p-3 flex items-center justify-between border-b">
          <div className="font-semibold">Global Chat</div>
          <button onClick={onClose} className="text-sm text-gray-600">Close</button>
        </div>

        <div ref={listRef} className="p-3 overflow-auto flex-1 space-y-2" style={{ maxHeight: "50vh" }}>
          {messages.map((m, i) => {
            const isMe = m.username === username;
            const align = isMe ? "justify-end" : "justify-start";
            const bubble = isMe ? "bg-emerald-500 text-white" : "bg-zinc-200 text-black";
            return (
              <div key={i} className={`flex ${align}`}>
                <div className={`rounded-lg px-3 py-2 ${bubble} max-w-[80%]`}>
                  <div className="text-xs(font-semibold">{m.username} <span className="text-[10px] text-gray-700">{new Date(m.ts).toLocaleTimeString()}</span></div>
                  <div className="text-sm">{m.message}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-2 border-t flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} className="flex-1 p-2 rounded bg-zinc-100" placeholder="Say something..." />
          <button onClick={send} className="bg-emerald-500 text-white px-3 py-1 rounded">Send</button>
        </div>
      </div>
    </div>
  );
}