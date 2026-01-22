import React, { useEffect, useState, useRef } from "react";

/*
  Global chat (robust):
  - fetch latest messages on mount
  - subscribe to socket events and merge incoming messages
  - dedupe by (username + ts + message)
  - auto-scroll to bottom after fetch and on new messages
*/

const API_CHAT = "/api/chat?limit=50";

function dedupeMessages(existing, incoming) {
  const map = new Map();
  existing.forEach((m) => {
    map.set(`${m.username}|${m.ts}|${m.message}`, m);
  });
  incoming.forEach((m) => {
    map.set(`${m.username}|${m.ts}|${m.message}`, m);
  });
  // return sorted by timestamp ascending
  const arr = Array.from(map.values());
  arr.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  return arr;
}

export default function ChatModal({ socket, username, onClose }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const listRef = useRef(null);
  const loadingRef = useRef(false);
  const oldestTsRef = useRef(null);

  useEffect(() => {
    if (!socket) return;
    let mounted = true;

    // subscribe first so we don't miss incoming messages during fetch
    const handler = (msg) => {
      setMessages((prev) => {
        const merged = dedupeMessages(prev, [msg]);
        // update oldestTsRef if needed
        if (!oldestTsRef.current && merged.length > 0) oldestTsRef.current = merged[0].ts;
        // auto-scroll
        setTimeout(() => {
          if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
        }, 30);
        return merged;
      });
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

    // fetch latest messages
    fetch(API_CHAT)
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return;
        if (data.ok && Array.isArray(data.messages)) {
          // dedupe merge in case socket received messages during fetch
          setMessages((prev) => {
            const merged = dedupeMessages(prev, data.messages);
            if (merged.length > 0) oldestTsRef.current = merged[0].ts;
            return merged;
          });
          // scroll to bottom
          setTimeout(() => {
            if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
          }, 50);
        }
      })
      .catch(() => {})
      .finally(() => { /* nothing */ });

    return () => {
      mounted = false;
      socket.off("globalChatMessage", handler);
    };
  }, [socket]);

  // lazy-load older on scroll-to-top
  const onScroll = () => {
    if (!listRef.current || loadingRef.current) return;
    if (listRef.current.scrollTop < 80) {
      loadingRef.current = true;
      const before = oldestTsRef.current;
      if (!before) {
        loadingRef.current = false;
        return;
      }
      fetch(`/api/chat?before=${encodeURIComponent(before)}&limit=50`)
        .then((r) => r.json())
        .then((data) => {
          if (data.ok && Array.isArray(data.messages) && data.messages.length > 0) {
            setMessages((prev) => {
              const merged = dedupeMessages(data.messages, prev);
              if (merged.length > 0) oldestTsRef.current = merged[0].ts;
              return merged;
            });
            // preserve scroll rough position
            setTimeout(() => {
              if (listRef.current) listRef.current.scrollTop = 200;
            }, 60);
          }
        })
        .catch(() => {})
        .finally(() => {
          loadingRef.current = false;
        });
    }
  };

  const send = () => {
    if (!text.trim()) return;
    const ts = new Date().toISOString();
    const payload = { username, message: text.trim(), ts };
    if (socket) socket.emit("globalChat", payload);
    // Do NOT push locally — server broadcast will arrive and merge
    setText("");
    setTimeout(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, 50);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4">
      <div className="bg-white text-black rounded-lg w-full max-w-md shadow-lg flex flex-col">
        <div className="p-3 flex items-center justify-between border-b">
          <div className="font-semibold">Global Chat</div>
          <button onClick={onClose} className="text-sm text-gray-600">Close</button>
        </div>

        <div ref={listRef} onScroll={onScroll} className="p-3 overflow-auto flex-1 space-y-2" style={{ maxHeight: "50vh" }}>
          {messages.map((m, i) => {
            const isMe = m.username === username;
            const align = isMe ? "justify-end" : "justify-start";
            const bubble = isMe ? "bg-emerald-500 text-white" : "bg-zinc-200 text-black";
            return (
              <div key={`${m.username}-${m.ts}-${i}`} className={`flex ${align}`}>
                <div className={`rounded-lg px-3 py-2 ${bubble} max-w-[80%]`}>
                  <div className="text-xs font-semibold">{m.username} <span className="text-[10px] text-gray-700">{new Date(m.ts).toLocaleTimeString()}</span></div>
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