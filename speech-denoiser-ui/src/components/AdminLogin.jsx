import { useState } from "react";

export default function AdminLogin({ onLogin, onBack, loading = false }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }

    try {
      await onLogin({
        email: email.trim().toLowerCase(),
        password,
        remember,
      });
    } catch (err) {
      setError(err.message || "Admin login failed.");
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center px-4 py-12">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;800&display=swap');
        * { font-family: 'Syne', sans-serif; }
        @keyframes pulse-ring {
          0% { transform: scale(0.95); opacity: 1; }
          70% { transform: scale(1.05); opacity: 0.4; }
          100% { transform: scale(0.95); opacity: 1; }
        }
      `}</style>

      <div className="w-full max-w-md">
        <div className="mb-10 text-center">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div
              className="w-2 h-2 rounded-full bg-emerald-400"
              style={{ animation: "pulse-ring 2s ease-in-out infinite" }}
            />
            <span className="mono text-xs text-emerald-400 tracking-[0.3em] uppercase">
              Admin Access
            </span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white">
            Admin<span className="text-emerald-400">Login</span>
          </h1>
          <p className="mt-3 text-sm text-zinc-500 mono">
            Sign in to manage user accounts
          </p>
        </div>

        <form
          onSubmit={submit}
          className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6"
        >
          <label className="block text-xs mono text-zinc-400 mb-2">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-400 mb-4"
          />

          <label className="block text-xs mono text-zinc-400 mb-2">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              className="w-full px-4 py-3 pr-12 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-400"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute inset-y-0 right-0 px-4 text-zinc-500 hover:text-emerald-400"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-400 mt-4">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="accent-emerald-400"
            />
            Remember me
          </label>

          {error && <p className="text-xs text-red-400 mt-4">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className={`mt-5 w-full py-3 rounded-xl font-bold text-sm tracking-widest uppercase transition-all duration-300 ${
              loading
                ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                : "bg-emerald-400 text-black hover:bg-emerald-300"
            }`}
          >
            {loading ? "Signing in..." : "Admin Login"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={onBack}
            className="mono text-xs text-zinc-500 hover:text-emerald-400"
          >
            Back to user login
          </button>
        </div>
      </div>
    </div>
  );
}
