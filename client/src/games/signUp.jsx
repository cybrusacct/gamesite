import { useState } from "react";

export default function SignUp({ onSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const validate = () => {
    if (username.length < 4) {
      setError("Username must be at least 4 characters");
      return false;
    }
    if (!/\d/.test(username)) {
      setError("Username must include at least one number");
      return false;
    }
    if (!/^\d{4,}$/.test(password)) {
      setError("Pin must be at least 4 digit numbers");
      return false;
    }
    setError("");
    return true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      // pass username/password to parent or backend
      onSuccess({ username, password });
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-linear-to-br from-purple-600 to-indigo-950 text-white">
      <form
        onSubmit={handleSubmit}
        className="bg-zinc-900 p-8 rounded-xl shadow-xl w-80 flex flex-col gap-4"
      >
        <h1 className="text-lg font-bold text-center">Sign Up or log in</h1>

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
          className="bg-emerald-500 hover:bg-emerald-600 p-2 rounded font-bold"
        >
          Join
        </button>
      </form>
    </div>
  );
}
