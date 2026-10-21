// src/App.jsx
import { useEffect, useState } from "react";
import "./App.css";
import MainApp from "./components/MainApp";
import Login from "./components/login";


const STORAGE_KEY = "assetdesk_auth";
const API_BASE = "http://127.0.0.1:8000";

function isTokenExpired(token) {
  try {
    if (!token) return true;

    const payload = JSON.parse(
      atob(
        token
          .split(".")[1]
          .replace(/-/g, "+")
          .replace(/_/g, "/")
      )
    );

    if (typeof payload.exp !== "number") return true;

    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

export default function App() {
  // Read auth info from localStorage on first load
  const [auth, setAuth] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) return null;

      const savedAuth = JSON.parse(raw);

      const token =
        savedAuth?.access_token ||
        savedAuth?.accessToken ||
        savedAuth?.token;

      if (isTokenExpired(token)) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }

      return savedAuth;
    } catch (e) {
      console.warn("Failed to parse auth from storage", e);
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  });

  // Persist auth to localStorage whenever it changes
  useEffect(() => {
    if (auth && (auth.access_token || auth.token || auth.accessToken)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [auth]);

  // Called by Login.jsx when login succeeds
  const handleLoginSuccess = async ({ access_token, username }) => {
    try {
      // 1) Get full user profile (including role) from backend
      const res = await fetch(`${API_BASE}/users/me`, {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      let user = null;
      if (res.ok) {
        user = await res.json(); // { id, username, full_name, email, role, is_active, ... }
      } else {
        console.warn("Failed to load /users/me, status:", res.status);
      }

      // 2) Build full auth object
      const authObj = {
        access_token,
        token: access_token,        // for existing code that uses auth.token
        accessToken: access_token,  // for new code that uses auth.accessToken
        username: user?.username ?? username,
        user,                       // full user object from backend
        role: user?.role ?? undefined,
      };

      // 3) Save and set
      setAuth(authObj);
    } catch (err) {
      console.error("Error loading /users/me after login:", err);

      // Fallback: at least store token + username
      const authObj = {
        token: access_token,
        accessToken: access_token,
        username,
      };
      setAuth(authObj);
    }
  };

  // Called when user clicks Logout in MainApp
  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
  };

  // If not logged in → show login screen
  if (!auth || !(auth.token || auth.accessToken)) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // If logged in → show main Asset Desk app
  return <MainApp auth={auth} onLogout={handleLogout} />;
}
