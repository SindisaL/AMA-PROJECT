// src/components/Login.jsx
import { useState } from "react";
import { login, storeAuth } from "../api/auth";
import "../login.css";

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    if (!trimmedUsername || !trimmedPassword) {
      setError("Please enter both username and password.");
      setLoading(false);
      return;
    }

    try {
      const data = await login(trimmedUsername, trimmedPassword);
      // data is expected to be something like:
      // { access_token, token_type: "bearer", user: { username, full_name, role, ... } }

      if (!data?.access_token) {
        throw new Error("No access token returned from server.");
      }

      const userFromApi = data.user || {};

      const effectiveUsername =
        userFromApi.username || trimmedUsername;

      const role =
        userFromApi.role ||
        data.role || // fallback if backend sends role at top-level
        "AssetDeskUser";

      // Normalised auth object passed up to App.jsx
      storeAuth({
        access_token: data.access_token,
        token_type: data.token_type || "bearer",
        user: userFromApi,
      });

      onLoginSuccess({
        access_token: data.access_token,
        username: effectiveUsername,
        role,
        user: userFromApi,
      });
    } catch (err) {
      console.error("Login error:", err);
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg">
      <div className="login-box">
        {/* Branding row */}
        <div className="login-brand">
          <img src="/rsr-logo.png" alt="RSR Logo" className="login-logo" />
          <span className="login-brand-title">Asset Manifest</span>
        </div>

        <p className="login-subtitle">Sign in to manage ICT assets</p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="text"
            className="login-input"
            placeholder="Username (e.g. Sindisa.Maluleke)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />

          <input
            type="password"
            className="login-input"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="login-footer">
          Railway Safety Regulator • ICT Asset Management • Developed by RSR ICT
        </div>
      </div>
    </div>
  );
}
