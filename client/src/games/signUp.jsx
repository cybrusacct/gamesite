import { useState } from "react";

const API_URL = "https://my-gamesite.onrender.com";


export default function SignUp({ onSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("signup"); // 'signup' or 'login'
  const [loading, setLoading] = useState(false);

  const validate = () => {
    if (username.length < 1) {
      setError("Enter username");
      return false;
    }
    if (mode === "signup") {
      // sign up requirements: at least 4 chars and include number as original code required
      if (username.length < 4) {
        setError("Username must be at least 4 characters");
        return false;
      }
      if (!/\d/.test(username)) {
        setError("Username must include at least one number");
        return false;
      }
    }
    if (!/^\d{4,}$/.test(password)) {
      setError("Pin must be at least 4 digit numbers");
      return false;
    }
    setError("");
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      if (mode === "signup") {
const res = await fetch(`${API_URL}/api/signup`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username, pin: password }),
});

        const data = await res.json();
        if (!data.ok) {
          setError(data.error || "Signup failed");
        } else {
          onSuccess({ username, password });
        }
      } else {
        // login
const res = await fetch(`${API_URL}/api/signup`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username, pin: password }),
});

        const data = await res.json();
        if (!data.ok) {
          setError(data.error || "Wrong credentials");
        } else {
          onSuccess({ username, password });
        }
      }
    } catch (err) {
      setError("Server error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-linear-to-br from-purple-600 to-indigo-950 text-white">
      <form
        onSubmit={handleSubmit}
        className="bg-zinc-900 p-8 rounded-xl shadow-xl w-80 flex flex-col gap-4"
      >
        <h1 className="text-lg font-bold text-center">Sign Up / Log in</h1>

        <div className="flex gap-2 text-xs">
          <button type="button" onClick={() => setMode("signup")} className={`flex-1 p-1 rounded ${mode === "signup" ? "bg-emerald-600" : "bg-zinc-800"}`}>Sign Up</button>
          <button type="button" onClick={() => setMode("login")} className={`flex-1 p-1 rounded ${mode === "login" ? "bg-emerald-600" : "bg-zinc-800"}`}>Log In</button>
        </div>

        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="p-2 rounded bg-zinc-800 placeholder-zinc-400"
        />

        <input
          type="password"
          placeholder="Pin (numbers only)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="p-2 rounded bg-zinc-800 placeholder-zinc-400"
        />

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="bg-emerald-500 hover:bg-emerald-600 p-2 rounded font-bold"
        >
          {mode === "signup" ? "Sign Up" : "Log In"}
        </button>
      </form>
    </div>
  );
}