import React from "react";

/*
  Memoized Card component.
  Props:
    - face: "Circle" | "Square" | "Cross" | "Heart" (string)
    - faceUp: boolean
    - size: 'xs'|'sm'|'md'|'lg' (controls tailwind sizing)
    - selected: boolean
    - onClick: fn
*/
const CARD_EMOJIS = {
  Circle: "⚫",
  Square: "⬛",
  Cross: "➕",
  Heart: "🖤",
};

const SIZE_MAP = {
  xs: { card: "w-6 h-10 text-base", wrapper: "p-0.5" },
  sm: { card: "w-8 h-12 text-lg", wrapper: "p-0.5" },
  md: { card: "w-10 h-16 text-2xl", wrapper: "p-1" },
  lg: { card: "w-12 h-20 text-3xl", wrapper: "p-1.5" },
};

function CardInner({ face, faceUp, size }) {
  const sizeClass = (SIZE_MAP[size] || SIZE_MAP.md).card;
  if (!faceUp) {
    return <div className={`rounded ${"bg-gray-900"} ${sizeClass}`}></div>;
  }
  return (
    <div className={`flex items-center justify-center bg-white text-black border border-black rounded ${sizeClass}`}>
      {CARD_EMOJIS[face] || "?"}
    </div>
  );
}

const Card = React.memo(function Card({ face, faceUp = false, size = "md", selected = false, onClick }) {
  const wrapperClass = (SIZE_MAP[size] || SIZE_MAP.md).wrapper;
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      className={`${wrapperClass} select-none ${selected ? "ring-2 ring-yellow-400" : ""} touch-manipulation`}
      onKeyDown={(e) => { if (e.key === "Enter" && onClick) onClick(); }}
    >
      <CardInner face={face} faceUp={faceUp} size={size} />
    </div>
  );
});

export default Card;