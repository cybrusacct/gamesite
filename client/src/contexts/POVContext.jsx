import React, { createContext, useContext, useMemo } from "react";

/*
  POVContext provides helper utilities:
   - you: username
   - players: ordered players array
   - indexOf(username)
   - isAlly(username), isOpponent(username)
   - allyOf(username)
*/
const POVContext = createContext(null);

export function POVProvider({ you, players = [], children }) {
  const value = useMemo(() => {
    const idx = players.indexOf(you);
    const ally = idx >= 0 && players.length >= 2 ? players[(idx + 2) % players.length] : null;
    return {
      you,
      players,
      idx,
      ally,
      isAlly: (u) => u === ally,
      isOpponent: (u) => u !== you && u !== ally,
      allyOf: (u) => {
        const i = players.indexOf(u);
        if (i === -1) return null;
        return players[(i + 2) % players.length] || null;
      },
    };
  }, [you, players]);

  return <POVContext.Provider value={value}>{children}</POVContext.Provider>;
}

export function usePOV() {
  const ctx = useContext(POVContext);
  if (!ctx) {
    throw new Error("usePOV must be used within POVProvider");
  }
  return ctx;
}

export default POVContext;