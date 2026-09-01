// src/api/auth.js
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000")
  .trim()
  .replace(/\/$/, "");

const STORAGE_KEY = "assetdesk_auth";

/**
 * 1) Call /token with username + password (x-www-form-urlencoded)
 * 2) Then call /users/me with the token to get the profile (incl. role)
 */
export async function login(username, password) {
  // --- Step 1: get JWT token ---
  const body = new URLSearchParams();
  body.append("username", username);
  body.append("password", password);

  const tokenRes = await fetch(`${API_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!tokenRes.ok) {
    let msg = "Login failed";
    try {
      const data = await tokenRes.json();
      if (data?.detail) msg = data.detail;
    } catch (_) { }
    throw new Error(msg);
  }

  const tokenData = await tokenRes.json(); // { access_token, token_type }

  // --- Step 2: get current user profile (/users/me) ---
  let user = null;
  try {
    const meRes = await fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (meRes.ok) user = await meRes.json();
  } catch (_) { }

  return { ...tokenData, user };
}

export function getStoredAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function storeAuth(auth) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

export function clearAuth() {
  localStorage.removeItem(STORAGE_KEY);
}

export function authHeaders(extra = {}) {
  const auth = getStoredAuth();
  const headers = { ...(extra || {}) };

  if (auth?.access_token) {
    headers.Authorization = `Bearer ${auth.access_token}`;
  }
  return headers;
}

export { STORAGE_KEY, API_BASE };
