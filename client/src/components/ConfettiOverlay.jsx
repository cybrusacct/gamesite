import React, { useEffect, useState } from "react";

/*
  Lightweight confetti overlay using simple CSS shapes.
  Show for short bursts.
*/
export default function ConfettiOverlay({ show, duration = 2200 }) {
  const [active, setActive] = useState(show);
  useEffect(() => {
    if (show) {
      setActive(true);
      const t = setTimeout(() => setActive(false), duration);
      return () => clearTimeout(t);
    } else {
      setActive(false);
    }
  }, [show, duration]);

  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <div className="absolute inset-0">
        {/* simple decorative confetti squares */}
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} className={`absolute w-2 h-2 rounded transform ${i % 2 === 0 ? "bg-emerald-400" : "bg-pink-400"}`} style={{
            left: `${(i * 7) % 100}%`,
            top: `${(i * 13) % 100}%`,
            opacity: 0.9,
            animation: `confetti-fall ${1.8 + (i % 5) * 0.2}s linear ${i * 20}ms forwards`
          }} />
        ))}
      </div>

      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-30vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(30vh) rotate(360deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}