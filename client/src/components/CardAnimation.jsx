import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";

/*
  Position-based card animation between two player areas.

  Usage: <CardAnimation event={animEvent} />
  Where animEvent is { from: 'Alice', to: 'Bob', ts: 123456789 }
  The player's card areas must include data-player-area="{username}" attribute.
*/
export default function CardAnimation({ event, duration = 700 }) {
  const [runningAnim, setRunningAnim] = useState(null);
  const animRef = useRef(null);

  useEffect(() => {
    if (!event) return;
    const { from, to } = event;
    const fromEl = document.querySelector(`[data-player-area="${CSS.escape(from)}"]`);
    const toEl = document.querySelector(`[data-player-area="${CSS.escape(to)}"]`);
    if (!fromEl || !toEl) {
      // Fallback: simple pulse in center
      setRunningAnim({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      const t = setTimeout(() => setRunningAnim(null), duration);
      return () => clearTimeout(t);
    }

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    const startX = fromRect.left + fromRect.width / 2;
    const startY = fromRect.top + fromRect.height / 2;
    const endX = toRect.left + toRect.width / 2;
    const endY = toRect.top + toRect.height / 2;

    setRunningAnim({ startX, startY, endX, endY, createdAt: Date.now() });

    const t = setTimeout(() => setRunningAnim(null), duration + 50);
    return () => clearTimeout(t);
  }, [event, duration]);

  if (!runningAnim) return null;

  // Render animated element as portal
  return ReactDOM.createPortal(<AnimPiece anim={runningAnim} duration={duration} />, document.body);
}

function AnimPiece({ anim, duration }) {
  const elRef = useRef(null);
  const { startX, startY, endX, endY } = anim;
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    // position at start
    el.style.left = `${startX - 18}px`;
    el.style.top = `${startY - 26}px`;
    // trigger transition to end in next tick
    requestAnimationFrame(() => {
      el.style.transition = `transform ${duration}ms cubic-bezier(.2,.8,.2,1), opacity ${duration}ms`;
      const dx = endX - startX;
      const dy = endY - startY;
      el.style.transform = `translate(${dx}px, ${dy}px) scale(0.95)`;
      el.style.opacity = "0.95";
    });

    const cleanup = setTimeout(() => {
      try {
        if (el) el.remove();
      } catch (e) {}
    }, duration + 60);

    return () => clearTimeout(cleanup);
  }, [startX, startY, endX, endY, duration]);

  return (
    <div
      ref={elRef}
      style={{
        position: "fixed",
        width: 36,
        height: 48,
        pointerEvents: "none",
        transform: "translate(0,0)",
        opacity: 1,
        zIndex: 9999,
      }}
    >
      <div className="bg-gray-900 w-full h-full rounded shadow-lg" />
    </div>
  );
}