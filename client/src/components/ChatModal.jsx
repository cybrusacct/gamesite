import React, { useEffect, useState, useRef } from "react";

/*
  Robust Global Chat modal.

  Behavior:
  - Subscribe to socket "globalChatMessage" BEFORE fetching history to avoid race conditions.
  - Fetch latest N messages from GET /api/chat on mount.
  - Merge + dedupe fetched messages with incoming socket messages.
  - Lazy-load older messages when user scrolls to top (uses `before` timestamp query).
  - Do NOT locally push the sent message onto state; rely on server broadcast as single source of truth.
  - Auto-scroll to bottom after initial load and when new messages arrive.
  - Small receive tone on incoming messages.
*/

const DEFAULT_LIMIT = 50;
const API_CHAT = (opts = {}) => {
  const limit = opts.limit || DEFAULT_LIMIT;
  if (opts.before) {
    return `/api/chat?before=${encodeURIComponent(opts.before)}&limit=${limit}`;
  }
  return `/api/chat?limit=${limit}`;
};

function messageKey(m) {
  // unique key for dedupe: username|ts|message
  return `${m.username}|${m.ts}|${m.message}`;
}

function dedupeMerge(existing = [], incoming = []) {
  // keep chronological order oldest -> newest
  const map = new Map();
  existing.forEach((m) => map.set(messageKey(m), m));
  incoming.forEach((m) => map.set(messageKey(m), m));
  const arr = Array.from(map.values());
  arr.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  return arr;
}

export default function ChatModal({ socket, username, onClose }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const listRef = useRef(null);
  const loadingOlderRef = useRef(false);
  const oldestTsRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!socket) return;

    // Handler for incoming socket messages
    const socketHandler = (msg) => {
      if (!msg || !msg.ts) return;
      setMessages((prev) => {
        const merged = dedupeMerge(prev, [msg]);
        if (!oldestTsRef.current && merged.length > 0) oldestTsRef.current = merged[0].ts;
        // auto-scroll to bottom on next tick for new messages
        setTimeout(() => {
          if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
        }, 30);
        return merged;
      });

      // small receive tone
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = 880;
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
        setTimeout(() => { try { o.stop(); } catch (e) {} }, 120);
      } catch (e) {
        // ignore audio errors
      }
    };

    // Subscribe BEFORE fetching history to avoid missing messages that arrive during fetch
    socket.on("globalChatMessage", socketHandler);

    // Fetch latest messages
    const ac = new AbortController();
    fetch(API_CHAT({ limit: DEFAULT_LIMIT }), { signal: ac.signal })
      .then((r) => r.json())
      .then((data) => {
        if (!mountedRef.current) return;
        if (data && data.ok && Array.isArray(data.messages)) {
          setMessages((prev) => {
            const merged = dedupeMerge(prev, data.messages);
            if (merged.length > 0) oldestTsRef.current = merged[0].ts;
            return merged;
          });
          // scroll to bottom after initial load
          setTimeout(() => {
            if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
          }, 50);
        }
      })
      .catch(() => {
        // ignore fetch errors
      });

    return () => {
      mountedRef.current = false;
      try { ac.abort(); } catch (e) {}
      socket.off("globalChatMessage", socketHandler);
    };
  }, [socket]);

  const loadOlder = () => {
    if (loadingOlderRef.current) return;
    const before = oldestTsRef.current;
    if (!before) return;
    loadingOlderRef.current = true;
    fetch(API_CHAT({ before, limit: DEFAULT_LIMIT }))
      .then((r) => r.json())
      .then((data) => {
        if (!mountedRef.current) return;
        if (data && data.ok && Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages((prev) => {
            const merged = dedupeMerge(data.messages, prev);
            if (merged.length > 0) oldestTsRef.current = merged[0].ts;
            return merged;
          });
          // approximate keep position
          setTimeout(() => {
            if (listRef.current) listRef.current.scrollTop = 200;
          }, 60);
        }
      })
      .catch(() => {})
      .finally(() => {
        loadingOlderRef.current = false;
      });
  };

  const onScroll = () => {
    if (!listRef.current) return;
    if (listRef.current.scrollTop < 80) {
      loadOlder();
    }
  };

  const send = () => {
    if (!text.trim()) return;
    const ts = new Date().toISOString();
    const payload = { username, message: text.trim(), ts };
    // Send via socket only; server will persist and broadcast
    if (socket) socket.emit("globalChat", payload);
    setText("");
    // keep view scrolled to bottom in case broadcast is delayed
    setTimeout(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, 80);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4">
      <div className="bg-white text-black rounded-lg w-full max-w-md shadow-lg flex flex-col">
        <div className="p-3 flex items-center justify-between border-b">
          <div className="font-semibold">Global Chat</div>
          <button onClick={onClose} className="text-sm text-gray-600">Close</button>
        </div>

        <div
          ref={listRef}
          onScroll={onScroll}
          className="p-3 overflow-auto flex-1 space-y-2"
          style={{ maxHeight: "50vh" }}
        >
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
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1 p-2 rounded bg-zinc-100"
            placeholder="Say something..."
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          />
          <button onClick={send} className="bg-emerald-500 text-white px-3 py-1 rounded">Send</button>
        </div>
      </div>
    </div>
  );
}