// Kemps.jsx
import React from "react";
import { useNavigate } from "react-router-dom";

export default function FlagTrivia({ user }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-green-700 flex flex-col items-center justify-center text-white p-4">
      <h1 className="text-3xl font-bold">Flag Trivia</h1>
      <p className="mt-2 text-center">
        Player: {user?.username || "Guest"}
      </p>
      <button
        className="mt-6 bg-white text-red-500 px-4 py-2 rounded-lg font-bold"
        onClick={() => navigate("/")}
      >
        Back to Landing
      </button>

      <h2 className="text-sm mt-10">COMING SOON...</h2>
    </div>
  );
}
