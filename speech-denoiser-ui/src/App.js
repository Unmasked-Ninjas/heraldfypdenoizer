import { useEffect, useState } from "react";
import DenoiserView from "./components/DenoiserView";
import Login from "./components/Login";
import {
  fetchCurrentUser,
  loginRequest,
  registerRequest,
} from "./services/authApi";

const AUTH_EMAIL_KEY = "sd_user_email";
const AUTH_TOKEN_KEY = "sd_auth_token";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userCredits, setUserCredits] = useState(0);

  useEffect(() => {
    const savedToken =
      localStorage.getItem(AUTH_TOKEN_KEY) ||
      sessionStorage.getItem(AUTH_TOKEN_KEY);

    if (!savedToken) return;

    const hydrateSession = async () => {
      try {
        const user = await fetchCurrentUser();
        setIsAuthenticated(true);
        setUserEmail(user.email);
        setUserCredits(user.credits || 0);
      } catch (_error) {
        localStorage.removeItem(AUTH_EMAIL_KEY);
        localStorage.removeItem(AUTH_TOKEN_KEY);
        sessionStorage.removeItem(AUTH_EMAIL_KEY);
        sessionStorage.removeItem(AUTH_TOKEN_KEY);
      }
    };

    hydrateSession();
  }, []);

  const handleLogin = async ({ email, password, remember }) => {
    setAuthLoading(true);

    try {
      const data = await loginRequest({ email, password });

      setIsAuthenticated(true);
      setUserEmail(data.user.email);
      setUserCredits(data.user.credits || 0);

      const storage = remember ? localStorage : sessionStorage;
      const alternateStorage = remember ? sessionStorage : localStorage;

      alternateStorage.removeItem(AUTH_EMAIL_KEY);
      alternateStorage.removeItem(AUTH_TOKEN_KEY);

      storage.setItem(AUTH_EMAIL_KEY, data.user.email);
      storage.setItem(AUTH_TOKEN_KEY, data.token);
    } catch (error) {
      throw error;
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserEmail("");
    setUserCredits(0);
    localStorage.removeItem(AUTH_EMAIL_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_EMAIL_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
  };

  const handleRegister = async ({ email, password }) => {
    setAuthLoading(true);
    try {
      await registerRequest({ email, password });
    } catch (error) {
      throw error;
    } finally {
      setAuthLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <Login
        onLogin={handleLogin}
        onRegister={handleRegister}
        loading={authLoading}
      />
    );
  }

  return (
    <DenoiserView
      userEmail={userEmail}
      userCredits={userCredits}
      onCreditsChange={setUserCredits}
      onLogout={handleLogout}
    />
  );
}
