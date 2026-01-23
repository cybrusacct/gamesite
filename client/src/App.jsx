import React from "react";
import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import LoadingScreen from './games/LoadingScreen';
import SignUp from './games/signUp';
import LandingPage from './games/LandingPage';
import JoinGame from './games/kemps/JoinGame';
import Lobby from './games/kemps/Lobby';
import Kemps from './games/kemps/kemps';
import MemoryGame from './games/memorygame/MemoryGame';
import FlagTrivia from './games/flag-trivia/FlagTrivia';
import Navbar from './components/Navbar';
import { SocketProvider } from './contexts/SocketProvider';

function App() {
  const [stage, setStage] = useState("loading"); // loading | signup | landing
  const [user, setUser] = useState(null);

  const [gameInfo, setGameInfo] = useState(null);
  // { roomId, role } => passed from JoinGame to Lobby/Kemps
  // socket is obtained inside components via useSocket()

  useEffect(() => {
    if (stage === "loading") {
      const timer = setTimeout(() => setStage("signup"), 2550);
      return () => clearTimeout(timer);
    }
  }, [stage]);

  return (
    <div className="bg-[#10171f]">
      {stage === "loading" && <LoadingScreen />}
      {stage === "signup" && (
        <SignUp
          onSuccess={(userData) => {
            setUser(userData);
            setStage("landing");
          }}
        />
      )}

      {stage === "landing" && (
        <SocketProvider>
          <Router>
            {/* Navbar shown for all routes once user logged in (Navbar should call useSocket() internally) */}
            <Navbar user={user} />

            <Routes>
              {/* Landing page */}
              <Route path="/" element={<LandingPage user={user} />} />

              {/* Join/Create Game */}
              <Route
                path="/join"
                element={<JoinGame user={user} onJoin={(info) => {
                  // store only roomId + role — components use the shared socket hook
                  setGameInfo({ roomId: info.roomId, role: info.role });
                }} />}
              />

              {/* Lobby: wait for 2–4 players + manual start */}
              <Route
                path="/lobby"
                element={
                  gameInfo ? (
                    <Lobby
                      user={user}
                      roomId={gameInfo.roomId}
                      role={gameInfo.role}
                    />
                  ) : (
                    <p className="text-white">Please join a room first!</p>
                  )
                }
              />

              {/* Kemps game */}
              <Route
                path="/kemps"
                element={
                  gameInfo ? (
                    <Kemps
                      user={user}
                      roomId={gameInfo.roomId}
                      role={gameInfo.role}
                    />
                  ) : (
                    <p className="text-white">Please join a room first!</p>
                  )
                }
              />

              <Route path="/memory" element={<MemoryGame user={user} />} />
              <Route path="/flag-trivia" element={<FlagTrivia user={user} />} />
            </Routes>
          </Router>
        </SocketProvider>
      )}
    </div>
  );
}

export default App;