import { useState } from "react";

const CARD_EMOJIS = {
  Circle: "⚫",
  Square: "⬛",
  Triangle: "🖤",
  Cross: "➕",
};

export default function KempsSandbox() {
  const [cards, setCards] = useState([
    "Circle",
    "Square",
    "Triangle",
    "Cross",
    "Circle",
  ]);

  const [selected, setSelected] = useState(null);

  const passCard = () => {
    if (selected === null) return;

    setCards((prev) => prev.filter((_, i) => i !== selected));
    setSelected(null);
  };

  return (
    <div className="min-h-screen bg-green-900 text-white flex flex-col items-center p-4">
      <h1 className="mb-4 font-bold">Kemps Sandbox</h1>

      <div className="flex gap-2 mb-4">
        {cards.map((c, i) => (
          <div
            key={i}
            onClick={() => setSelected(i)}
            className={`w-12 h-20 bg-white text-black rounded border flex items-center justify-center text-2xl
              ${selected === i ? "ring-2 ring-yellow-400" : ""}
            `}
          >
            {CARD_EMOJIS[c]}
          </div>
        ))}
      </div>

      <button
        onClick={passCard}
        className="bg-white text-black px-4 py-1 rounded"
      >
        Pass Selected
      </button>
    </div>
  );
}
