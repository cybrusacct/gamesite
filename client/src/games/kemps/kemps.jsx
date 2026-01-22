import React, { useState, useEffect, useRef } from "react";

const CARD_EMOJIS = {
  Circle: "⚫",
  Square: "⬛",
  Cross: "➕",
  Heart: "🖤",
};
const CARD_BACK_CLASS = "bg-gray-900";

export default function Kemps({ user, socket, roomId }) {
  const [hands, setHands] = useState({});
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [message, setMessage] = useState("");
  const [turnIndex, setTurnIndex] = useState(0);
  const [currentTurnUsername, setCurrentTurnUsername] = useState(null);
  const [showJackwhotLocal, setShowJackwhotLocal] = useState(false); // whether I (ally) see the jackwhot button
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [countdown, setCountdown] = useState(5);
  const [gameStarted, setGameStarted] = useState(false);
  const [signalDisabled, setSignalDisabled] = useState(false);
  const [pendingSignal, setPendingSignal] = useState(null); // { signer, ally }
  const [revealedPlayers, setRevealedPlayers] = useState([]); // players whose hands are revealed
  const [showSuspectList, setShowSuspectList] = useState(false);
  const [showGameOver, setShowGameOver] = useState(false);
  const [gameOverInfo, setGameOverInfo] = useState(null); // { win, winners, winningTeam, hands }
  const [lastPassAnim, setLastPassAnim] = useState(null); // { from, to, card }
  const movingCardRef = useRef(null);

  // Compute positions (guard against missing players)
  const myIndex = lobbyPlayers.indexOf(user.username);
  const ally = myIndex >= 0 ? lobbyPlayers[(myIndex + 2) % 4] : "Ally";
  const enemyLeft = myIndex >= 0 ? lobbyPlayers[(myIndex + 3) % 4] : "Left";
  const enemyRight = myIndex >= 0 ? lobbyPlayers[(myIndex + 1) % 4] : "Right";

  // Simple tone player using WebAudio (no external files)
  const audioCtxRef = useRef(null);
  function playTone(freq = 440, duration = 150) {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration / 1000);
      setTimeout(() => {
        try { o.stop(); } catch (e) {}
      }, duration + 20);
    } catch (e) {
      // ignore audio errors on unsupported platforms
    }
  }

  // JOIN LOBBY & GAME LISTENERS
  useEffect(() => {
    if (!socket || !roomId) return;

    // Ensure we are in the server room (server will avoid duplicates)
    socket.emit("joinRoom", { roomId, username: user.username });

    const handleUpdateLobby = (payload) => {
      // payload may be array (older) or object { players, host }
      const players = Array.isArray(payload) ? payload : payload?.players || [];
      setLobbyPlayers(players || []);
    };

    socket.on("updateLobby", handleUpdateLobby);

    socket.on("countdown", (seconds) => {
      setCountdown(seconds);
      if (seconds === 0) setGameStarted(true);
    });

    socket.on("startGame", (room) => {
      setHands(room.hands || {});
      setLobbyPlayers(room.players || []);
      setGameStarted(true);
      setMessage("Game started!");
      setTurnIndex(room.turnIndex ?? 0);
      setCurrentTurnUsername((room.players || [])[room.turnIndex ?? 0]);
      setSelectedIndex(null);
      setPendingSignal(null);
      setRevealedPlayers([]);
    });

    socket.on("updateGame", (room) => {
      setHands(room.hands || {});
      setLobbyPlayers(room.players || []);
      setTurnIndex(room.turnIndex ?? 0);
      setCurrentTurnUsername((room.players || [])[room.turnIndex ?? 0]);
      setSelectedIndex(null);

      // handle lastPass animation data
      if (room.lastPass) {
        setLastPassAnim(room.lastPass);
        // clear after animation duration so clients stop showing moving card
        setTimeout(() => setLastPassAnim(null), 800);
      } else {
        setLastPassAnim(null);
      }
    });

    socket.on("signalSent", (data) => {
      setPendingSignal(data);
      // only the ally should see the JACKWHOT button
      if (data && data.ally === user.username) {
        setShowJackwhotLocal(true);
        // hide after 3s
        setTimeout(() => setShowJackwhotLocal(false), 3000);
      } else {
        setShowJackwhotLocal(false);
      }
    });

    socket.on("revealCards", ({ target, hands }) => {
      // reveal target's cards to everyone
      setRevealedPlayers((prev) => {
        if (!prev.includes(target)) return [...prev, target];
        return prev;
      });
      setHands(hands || {});
    });

    socket.on("gameOver", (info) => {
      setGameOverInfo(info);
      setShowGameOver(true);
      // update hands and reveal everybody for the modal
      setHands(info.hands || {});
      setRevealedPlayers(Object.keys(info.hands || {}));
    });

    socket.on("playSound", ({ type }) => {
      if (type === "suspect") playTone(520, 180);
      else if (type === "signal") playTone(660, 120);
      else if (type === "jackwhot-false") playTone(220, 400);
      else if (type === "matchEnd") playTone(880, 200);
      else if (type === "kick") playTone(300, 140);
    });

    // global chat can be handled elsewhere; Kemps may show messages if desired

    return () => {
      socket.off("updateLobby", handleUpdateLobby);
      socket.off("countdown");
      socket.off("startGame");
      socket.off("updateGame");
      socket.off("signalSent");
      socket.off("revealCards");
      socket.off("gameOver");
      socket.off("playSound");
    };
  }, [socket, roomId, user.username]);

  // SELECT / PASS CARD
  const selectCard = (index) => {
    if (currentTurnUsername !== user.username) {
      setMessage("Not your turn ⚠️");
      return;
    }
    setSelectedIndex(index);
    setMessage("");
  };

  const passCard = () => {
    if (currentTurnUsername !== user.username) {
      setMessage("It's not your turn to pass");
      return;
    }
    if (selectedIndex === null) return setMessage("Select a card first ⚠️");
    socket.emit("passCard", { roomId, fromUsername: user.username, cardIndex: selectedIndex });
    setSelectedIndex(null);
  };

  const signalJackwhot = () => {
    // always visible but disable quick repeats locally
    setSignalDisabled(true);
    socket.emit("sendSignal", { roomId, username: user.username });
    setTimeout(() => setSignalDisabled(false), 1200);
  };

  const callJackwhot = () => {
    // ally clicks JACKWHOT
    setShowJackwhotLocal(false);
    socket.emit("callJackwhot", { roomId, callerUsername: user.username });
  };

  const leaveRoom = () => {
    socket.emit("leaveRoom", { roomId, username: user.username });
    window.location.href = "/";
  };

  const openSuspectList = () => {
    setShowSuspectList((s) => !s);
  };

  const suspectTarget = (target) => {
    setShowSuspectList(false);
    socket.emit("suspect", { roomId, suspector: user.username, target });
  };

  const rematch = () => {
    // Go back to lobby view (client-side)
    setShowGameOver(false);
    setGameOverInfo(null);
    setGameStarted(false);
    setRevealedPlayers([]);
    // navigate to lobby
    window.location.href = "/lobby";
  };

  // RENDER CARDS
  const renderCards = (playerUsername, small = false) => {
    const isYou = playerUsername === user.username;
    const isRevealed = revealedPlayers.includes(playerUsername);
    return (
      <div className="flex gap-1 mt-1">
        {(hands[playerUsername] || []).map((card, i) => {
          const clickable = isYou && currentTurnUsername === user.username;
          return (
            <div
              key={i}
              onClick={() => isYou && selectCard(i)}
              className={`flex items-center justify-center
              bg-white text-black border border-black rounded-md select-none
              ${clickable ? "cursor-pointer" : "cursor-default"}
              ${small ? "w-8 h-12 text-lg" : "w-10 h-16 text-2xl"}
              ${isYou && selectedIndex === i ? "ring-2 ring-yellow-400" : ""}`}
            >
              {isYou || isRevealed ? CARD_EMOJIS[card] : <div className={`${CARD_BACK_CLASS} w-full h-full rounded`}></div>}
            </div>
          );
        })}
      </div>
    );
  };

  // Determine opponents (for suspect UI)
  const opponents = lobbyPlayers.filter((p) => p !== user.username && p !== ally);

  // moving card animation overlay (simple)
  const MovingCard = ({ info }) => {
    if (!info) return null;
    // show a small element indicating movement; face shown only to owner
    const amIFrom = info.from === user.username;
    const amITo = info.to === user.username;
    const showFace = amIFrom || amITo || revealedPlayers.includes(info.from) || revealedPlayers.includes(info.to);
    return (
      <div className="fixed left-1/2 top-1/2 z-40 pointer-events-none">
        <div className="animate-pulse bg-white text-green-800 px-2 py-1 rounded shadow">
          {showFace ? CARD_EMOJIS[info.card] : <div className={`${CARD_BACK_CLASS} w-6 h-8 rounded`}></div>}
        </div>
      </div>
    );
  };

  // LOBBY VIEW
  if (!gameStarted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-green-900 text-white p-4">
        <h1 className="text-lg font-bold mb-2">Lobby - Room {roomId}</h1>
        <div className="bg-green-700 p-3 rounded w-80">
          <p className="text-sm font-semibold mb-1">Players in lobby:</p>
          {lobbyPlayers.map((p, i) => (
            <p key={i} className="text-xs">{p}</p>
          ))}
        </div>

        {lobbyPlayers.length === 4 && (
          <p className="mt-2 text-yellow-300 font-bold">
            Game starting in: {countdown}...
          </p>
        )}

        <button
          onClick={leaveRoom}
          className="mt-4 bg-red-500 hover:bg-red-600 text-white px-4 py-1 rounded"
        >
          Leave Lobby
        </button>
      </div>
    );
  }

  // GAME VIEW
  return (
    <div className="min-h-screen bg-green-900 text-white flex flex-col items-center p-2">
      <MovingCard info={lastPassAnim} />

      <h1 className="text-lg font-bold">Kemps (Jackwhot)</h1>
      <p className="text-xs mb-1">Player: {user.username}</p>

      {hands[user.username] && (
        <div className="relative w-full max-w-sm aspect-square bg-green-700 rounded-lg mt-2">

          <div className="absolute top-1 left-1/2 -translate-x-1/2 text-xs">
            <p className="text-center">Ally: {ally}</p>
            {renderCards(ally, true)}
          </div>

          <div className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 text-xs">
            <p className="text-center">Opp: {enemyLeft}</p>
            {renderCards(enemyLeft, true)}
          </div>

          <div className="absolute right-0 top-1/2 -translate-y-1/2 rotate-90 text-xs">
            <p className="text-center">Opp: {enemyRight}</p>
            {renderCards(enemyRight, true)}
          </div>

          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs">
            <p className="text-center">You</p>
            {renderCards(user.username)}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <button
          onClick={passCard}
          disabled={currentTurnUsername !== user.username}
          className={`px-4 py-1 rounded text-sm ${currentTurnUsername === user.username ? "bg-white text-green-800" : "bg-zinc-700 text-zinc-300 cursor-not-allowed"}`}
        >
          Pass Selected
        </button>

        <div className="flex gap-2">
          <button
            onClick={signalJackwhot}
            disabled={signalDisabled}
            className={`px-3 py-1 rounded text-sm ${signalDisabled ? "bg-yellow-200 text-gray-700 cursor-not-allowed" : "bg-yellow-400 text-black"}`}
          >
            Signal
          </button>

          <button
            onClick={openSuspectList}
            className="px-3 py-1 rounded text-sm bg-indigo-600 text-white"
          >
            Suspect
          </button>
        </div>

        {showJackwhotLocal && (
          <div className="animate-bounce bg-white text-green-800 px-3 py-1 rounded text-sm text-center">
            <button onClick={callJackwhot} className="font-bold">JACKWHOT!</button>
          </div>
        )}

        {showSuspectList && (
          <div className="bg-zinc-800 p-2 rounded text-xs">
            <p className="font-semibold mb-1">Suspect which opponent?</p>
            {opponents.map((o, i) => (
              <button key={i} onClick={() => suspectTarget(o)} className="block w-full text-left px-2 py-1 hover:bg-zinc-700 rounded">{o}</button>
            ))}
            <button onClick={() => setShowSuspectList(false)} className="mt-2 px-2 py-1 rounded bg-red-600">Cancel</button>
          </div>
        )}

        {message && (
          <p className="mt-2 text-xs text-center font-semibold">{message}</p>
        )}
      </div>

      <p className="mt-1 text-xs">
        Turn: <span className="font-bold">{currentTurnUsername ?? "—"}</span>
      </p>

      <button
        onClick={leaveRoom}
        className="mt-3 bg-red-500 hover:bg-red-600 text-white px-4 py-1 rounded"
      >
        Leave Game
      </button>

      {/* Game over modal */}
      {showGameOver && gameOverInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white text-black rounded-lg p-4 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-2">{gameOverInfo.winners.includes(user.username) ? "You Won 🎉" : "You Lose 😞"}</h2>
            <p className="text-sm mb-2">Winning Team: {gameOverInfo.winningTeam}</p>
            <p className="text-sm mb-2">Winners: {gameOverInfo.winners.join(", ")}</p>

            <div className="mt-2 flex gap-2">
              <button onClick={rematch} className="flex-1 bg-emerald-500 text-white px-3 py-1 rounded">Rematch</button>
              <button onClick={() => { setShowGameOver(false); window.location.href = "/"; }} className="flex-1 bg-gray-700 text-white px-3 py-1 rounded">Exit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}