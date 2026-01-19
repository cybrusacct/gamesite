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

function App() {
  const [stage, setStage] = useState("loading"); // loading | signup | landing
  const [user, setUser] = useState(null);

  const [gameInfo, setGameInfo] = useState(null); 
  // { socket, roomId, role } => passed from JoinGame to Lobby/Kemps

  useEffect(() => {
    if (stage === "loading") {
      const timer = setTimeout(() => setStage("signup"), 2550);
      return () => clearTimeout(timer);
    }
  }, [stage]);

  return (
    <>
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
        <Router>
          <Routes>
            {/* Landing page */}
            <Route path="/" element={<LandingPage user={user} />} />

            {/* Join/Create Game */}
            <Route
              path="/join"
              element={<JoinGame user={user} onJoin={(info) => setGameInfo(info)} />}
            />

            {/* Lobby: wait for 4 players + countdown */}
            <Route
              path="/lobby"
              element={
                gameInfo ? (
                  <Lobby
                    user={user}
                    socket={gameInfo.socket}
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
                    socket={gameInfo.socket}
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
      )}
    </>
  );
}

export default App;

