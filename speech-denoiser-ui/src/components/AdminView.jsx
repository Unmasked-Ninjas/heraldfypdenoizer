import { useEffect, useState } from "react";
import { fetchAdminUsers } from "../services/authApi";

export default function AdminView({ onBack, onLogout, userEmail }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [users, setUsers] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);

  useEffect(() => {
    const loadAdminUsers = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchAdminUsers(200);
        setUsers(data.users || []);
        setTotalUsers(Number(data.totalUsers || 0));
      } catch (err) {
        setError(err.message || "Could not load admin user list.");
      } finally {
        setLoading(false);
      }
    };

    loadAdminUsers();
  }, []);

  const formatTime = (value) => {
    if (!value) return "-";
    return new Date(value).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center px-4 py-12">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;800&display=swap');
        * { font-family: 'Syne', sans-serif; }
        .mono { font-family: 'Space Mono', monospace; }
      `}</style>

      <div className="w-full max-w-5xl">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <p className="mono text-xs text-emerald-400 tracking-[0.3em] uppercase">
              Admin Panel
            </p>
            <h1 className="text-3xl font-bold text-white mt-2">
              User Overview
            </h1>
            <p className="mono text-xs text-zinc-500 mt-2">
              Signed in as <span className="text-emerald-400">{userEmail}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="mono text-xs uppercase tracking-wider border border-zinc-700 text-zinc-300 px-3 py-2 rounded-md hover:border-emerald-400 hover:text-emerald-400"
            >
              Back to user login
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="mono text-xs uppercase tracking-wider border border-zinc-700 text-zinc-300 px-3 py-2 rounded-md hover:border-emerald-400 hover:text-emerald-400"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="mono text-xs text-emerald-400 uppercase tracking-widest">
              Total Users
            </p>
            <p className="text-2xl font-semibold mt-2">
              {loading ? "..." : totalUsers}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="mono text-xs text-emerald-400 uppercase tracking-widest">
              Showing
            </p>
            <p className="text-2xl font-semibold mt-2">
              {loading ? "..." : users.length}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="mono text-xs text-emerald-400 uppercase tracking-widest">
              Data Source
            </p>
            <p className="text-2xl font-semibold mt-2">Live</p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 mb-6">
            <p className="mono text-xs text-red-300">{error}</p>
          </div>
        )}

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-100">
              Users &amp; Plans
            </h2>
            <span className="mono text-xs text-zinc-500">
              Basic details only
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-950/60 text-zinc-400 mono text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-5 py-3">Credits</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3">Last Purchase</th>
                  <th className="px-5 py-3">Last Denoise</th>
                  <th className="px-5 py-3">Total Denoises</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {loading ? (
                  <tr>
                    <td className="px-5 py-4 text-zinc-500" colSpan={7}>
                      Loading...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td className="px-5 py-4 text-zinc-500" colSpan={7}>
                      No users found.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="text-zinc-200">
                      <td className="px-5 py-4">{user.email}</td>
                      <td className="px-5 py-4">
                        <span className="mono text-xs text-emerald-400 uppercase tracking-widest">
                          {user.plan_id || "free"}
                        </span>
                      </td>
                      <td className="px-5 py-4">{user.credits}</td>
                      <td className="px-5 py-4">
                        {formatTime(user.created_at)}
                      </td>
                      <td className="px-5 py-4">
                        {formatTime(user.last_purchase_at)}
                      </td>
                      <td className="px-5 py-4">
                        {formatTime(user.last_denoise_at)}
                      </td>
                      <td className="px-5 py-4">{user.total_denoises || 0}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
