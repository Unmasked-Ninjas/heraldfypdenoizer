import { useEffect, useState } from "react";
import AdminLogin from "./components/AdminLogin";
import AdminView from "./components/AdminView";
import DenoiserView from "./components/DenoiserView";
import Login from "./components/Login";
import {
  adminLoginRequest,
  fetchCurrentUser,
  loginRequest,
  registerRequest,
} from "./services/authApi";

const AUTH_EMAIL_KEY = "sd_user_email";
const AUTH_TOKEN_KEY = "sd_auth_token";
const ADMIN_EMAIL_KEY = "sd_admin_email";
const ADMIN_TOKEN_KEY = "sd_admin_token";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userCredits, setUserCredits] = useState(0);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  const isAdminRoute = currentPath.startsWith("/admin");

  const navigateTo = (nextPath) => {
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setCurrentPath(nextPath);
  };

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener("popstate", handlePopState);

    const savedToken =
      localStorage.getItem(AUTH_TOKEN_KEY) ||
      sessionStorage.getItem(AUTH_TOKEN_KEY);
    const savedAdminToken =
      localStorage.getItem(ADMIN_TOKEN_KEY) ||
      sessionStorage.getItem(ADMIN_TOKEN_KEY);

    if (!savedToken && !savedAdminToken) return;

    const hydrateSession = async () => {
      if (savedToken) {
        try {
          const user = await fetchCurrentUser();
          setIsAuthenticated(true);
          setUserEmail(user.email);
          setUserCredits(user.credits || 0);
          return;
        } catch (_error) {
          localStorage.removeItem(AUTH_EMAIL_KEY);
          localStorage.removeItem(AUTH_TOKEN_KEY);
          sessionStorage.removeItem(AUTH_EMAIL_KEY);
          sessionStorage.removeItem(AUTH_TOKEN_KEY);
        }
      }

      if (savedAdminToken) {
        const adminEmailFromStorage =
          localStorage.getItem(ADMIN_EMAIL_KEY) ||
          sessionStorage.getItem(ADMIN_EMAIL_KEY) ||
          "";
        setIsAdminAuthenticated(true);
        setAdminEmail(adminEmailFromStorage);
      }
    };

    hydrateSession();
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleLogin = async ({ email, password, remember }) => {
    setAuthLoading(true);

    try {
      const data = await loginRequest({ email, password });

      setIsAuthenticated(true);
      setUserEmail(data.user.email);
      setUserCredits(data.user.credits || 0);
      if (isAdminRoute) {
        navigateTo("/");
      }

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
    navigateTo("/");
    localStorage.removeItem(AUTH_EMAIL_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_EMAIL_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
  };

  const handleAdminLogin = async ({ email, password, remember }) => {
    setAdminLoading(true);

    try {
      const data = await adminLoginRequest({ email, password });

      setIsAdminAuthenticated(true);
      setAdminEmail(data.admin.email);
      if (!isAdminRoute) {
        navigateTo("/admin");
      }

      const storage = remember ? localStorage : sessionStorage;
      const alternateStorage = remember ? sessionStorage : localStorage;

      alternateStorage.removeItem(ADMIN_EMAIL_KEY);
      alternateStorage.removeItem(ADMIN_TOKEN_KEY);

      storage.setItem(ADMIN_EMAIL_KEY, data.admin.email);
      storage.setItem(ADMIN_TOKEN_KEY, data.token);
    } catch (error) {
      throw error;
    } finally {
      setAdminLoading(false);
    }
  };

  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
    setAdminEmail("");
    navigateTo("/admin");
    localStorage.removeItem(ADMIN_EMAIL_KEY);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_EMAIL_KEY);
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
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

  if (isAdminRoute && !isAdminAuthenticated) {
    return (
      <AdminLogin
        onLogin={handleAdminLogin}
        onBack={() => navigateTo("/")}
        loading={adminLoading}
      />
    );
  }

  if (!isAdminRoute && !isAuthenticated) {
    return (
      <Login
        onLogin={handleLogin}
        onRegister={handleRegister}
        loading={authLoading}
      />
    );
  }

  if (isAdminRoute && isAdminAuthenticated) {
    return (
      <AdminView
        userEmail={adminEmail}
        onBack={() => navigateTo("/")}
        onLogout={handleAdminLogout}
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
