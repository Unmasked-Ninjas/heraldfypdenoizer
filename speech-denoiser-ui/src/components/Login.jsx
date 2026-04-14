import { useState } from "react";
import {
  forgotPasswordRequest,
  resetPasswordRequest,
} from "../services/authApi";

export default function Login({ onLogin, onRegister, loading = false }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotToken, setForgotToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [forgotStep, setForgotStep] = useState("request");
  const [forgotLoading, setForgotLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }

    if (isRegisterMode && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (isRegisterMode && password !== confirmPassword) {
      setError("Password and confirm password must match.");
      return;
    }

    try {
      const payload = {
        email: email.trim().toLowerCase(),
        password,
        remember,
      };

      if (isRegisterMode) {
        await onRegister({ email: payload.email, password: payload.password });
        setSuccess("Account created. You can sign in now.");
        setIsRegisterMode(false);
        setPassword("");
        setConfirmPassword("");
        return;
      }

      await onLogin(payload);
    } catch (err) {
      setError(
        err.message || (isRegisterMode ? "Register failed." : "Login failed."),
      );
    }
  };

  const toggleMode = () => {
    if (loading) return;
    setError("");
    setSuccess("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setIsRegisterMode((prev) => !prev);
  };

  const openForgotPassword = () => {
    setForgotEmail(email.trim().toLowerCase());
    setForgotToken("");
    setNewPassword("");
    setConfirmNewPassword("");
    setForgotError("");
    setForgotSuccess("");
    setForgotStep("request");
    setShowForgotPassword(true);
  };

  const closeForgotPassword = () => {
    if (forgotLoading) return;
    setShowForgotPassword(false);
  };

  const requestResetToken = async () => {
    const normalizedEmail = forgotEmail.trim().toLowerCase();

    if (!normalizedEmail) {
      setForgotError("Please enter your email.");
      return;
    }

    try {
      setForgotLoading(true);
      setForgotError("");
      setForgotSuccess("");

      const data = await forgotPasswordRequest({ email: normalizedEmail });

      if (data?.resetToken) {
        setForgotToken(data.resetToken);
        setForgotSuccess(
          "Reset token generated. It is prefilled below for development mode.",
        );
      } else {
        setForgotSuccess(
          "If an account exists for this email, a reset token has been generated.",
        );
      }

      setForgotStep("reset");
    } catch (err) {
      setForgotError(err.message || "Unable to start password reset.");
    } finally {
      setForgotLoading(false);
    }
  };

  const resetPassword = async () => {
    const normalizedEmail = forgotEmail.trim().toLowerCase();

    if (!normalizedEmail || !forgotToken.trim()) {
      setForgotError("Email and reset token are required.");
      return;
    }

    if (newPassword.length < 6) {
      setForgotError("New password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setForgotError("New password and confirm password must match.");
      return;
    }

    try {
      setForgotLoading(true);
      setForgotError("");
      const data = await resetPasswordRequest({
        email: normalizedEmail,
        token: forgotToken.trim(),
        newPassword,
      });

      setSuccess(data?.message || "Password reset successful. Please sign in.");
      setShowForgotPassword(false);
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setForgotError(err.message || "Unable to reset password.");
    } finally {
      setForgotLoading(false);
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
              Secure Access
            </span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white">
            Speech<span className="text-emerald-400">Denoise</span>
          </h1>
          <p className="mt-3 text-sm text-zinc-500 mono">
            {isRegisterMode ? "Create your account" : "Login to continue"}
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
            placeholder="you@example.com"
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

          {isRegisterMode && (
            <>
              <label className="block text-xs mono text-zinc-400 mt-4 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="********"
                  className="w-full px-4 py-3 pr-12 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-400"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 px-4 text-zinc-500 hover:text-emerald-400"
                  aria-label={
                    showConfirmPassword
                      ? "Hide confirm password"
                      : "Show confirm password"
                  }
                >
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>
            </>
          )}

          <div className="mt-4 flex items-center justify-between gap-4">
            {isRegisterMode ? (
              <span />
            ) : (
              <label className="flex items-center gap-2 text-xs text-zinc-400 mono">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="accent-emerald-400"
                />
                Remember me
              </label>
            )}
            {!isRegisterMode && (
              <button
                type="button"
                onClick={() => {
                  openForgotPassword();
                }}
                className="text-xs text-zinc-500 mono hover:text-emerald-400 transition-colors"
              >
                Forgot password?
              </button>
            )}
          </div>

          {error && <p className="mt-4 text-red-400 text-xs mono">{error}</p>}
          {success && (
            <p className="mt-4 text-emerald-400 text-xs mono">{success}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`mt-5 w-full py-3 rounded-xl font-bold text-sm tracking-widest uppercase transition-all duration-300 ${
              loading
                ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                : "bg-emerald-400 text-black hover:bg-emerald-300 active:scale-[0.98]"
            }`}
          >
            {loading
              ? isRegisterMode
                ? "Creating account..."
                : "Signing in..."
              : isRegisterMode
                ? "Create Account"
                : "Sign In"}
          </button>

          <button
            type="button"
            onClick={toggleMode}
            className="mt-3 w-full py-3 rounded-xl border border-zinc-700 text-zinc-300 text-xs font-semibold tracking-wider uppercase hover:border-emerald-400 hover:text-emerald-400 transition-all duration-200"
          >
            {isRegisterMode
              ? "Already have an account? Sign In"
              : "New here? Register"}
          </button>
        </form>
      </div>

      {showForgotPassword && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center px-4 z-50">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="mono text-[11px] text-emerald-400 uppercase tracking-[0.2em]">
                  Forgot Password
                </p>
                <h2 className="text-xl font-lightbold text-white mt-1">
                  Reset Password
                </h2>
              </div>
              <button
                type="button"
                onClick={closeForgotPassword}
                className="text-zinc-500 hover:text-zinc-200"
                aria-label="Close forgot password dialog"
              >
                X
              </button>
            </div>

            <div className="mt-2">
              <label className="block text-xs mono text-zinc-400 mb-2">
                Account Email
              </label>
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-400"
              />

              {forgotStep === "request" ? (
                <button
                  type="button"
                  onClick={requestResetToken}
                  disabled={forgotLoading}
                  className={`mt-3 w-full py-3 rounded-xl font-bold text-xs tracking-widest uppercase ${
                    forgotLoading
                      ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                      : "bg-emerald-400/90 text-black hover:bg-emerald-300"
                  }`}
                >
                  {forgotLoading ? "Sending..." : "Generate Reset Token"}
                </button>
              ) : (
                <>
                  <label className="block text-xs mono text-zinc-400 mt-4 mb-2">
                    Reset Token
                  </label>
                  <input
                    type="text"
                    value={forgotToken}
                    onChange={(e) => setForgotToken(e.target.value)}
                    placeholder="Paste reset token"
                    className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-400"
                  />

                  <label className="block text-xs mono text-zinc-400 mt-4 mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-400"
                  />

                  <label className="block text-xs mono text-zinc-400 mt-4 mb-2">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-400"
                  />

                  <button
                    type="button"
                    onClick={resetPassword}
                    disabled={forgotLoading}
                    className={`mt-4 w-full py-3 rounded-xl font-bold text-xs tracking-widest uppercase ${
                      forgotLoading
                        ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                        : "bg-emerald-400/90 text-black hover:bg-emerald-300"
                    }`}
                  >
                    {forgotLoading ? "Resetting..." : "Reset Password"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (forgotLoading) return;
                      setForgotStep("request");
                      setForgotError("");
                      setForgotSuccess("");
                    }}
                    className="mt-3 w-full py-3 rounded-xl border border-zinc-700 text-zinc-300 text-xs font-semibold tracking-wider uppercase hover:border-emerald-400 hover:text-emerald-400 transition-all duration-200"
                  >
                    Generate New Token
                  </button>
                </>
              )}

              {forgotError && (
                <p className="mt-4 text-red-400 text-xs mono">{forgotError}</p>
              )}
              {forgotSuccess && (
                <p className="mt-4 text-emerald-400 text-xs mono">
                  {forgotSuccess}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
