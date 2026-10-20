// src/components/MainApp.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import "../App.css";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000")
  .trim()
  .replace(/\/$/, "");

/* ---------------- Config / Lists ---------------- */
const YEARS = 5;
const MS_IN_DAY = 1000 * 60 * 60 * 24;

const LOCATIONS = [
  "Head Office",
  "Coastal Region",
  "Central Region",
  "Eastern Region",
  "ICT Storeroom",
];

const DEPARTMENTS = [
  "ICT",
  "Finance",
  "Human Resources",
  "Internal Audit",
  "Legal Services",
  "Media & Communications",
  "Operations",
  "Risk & Strategy",
  "Research & Technical Skills Development",
  "COSEC",
];

const ADMIN_EMAILS = {
  assetDeskAdmins: ["assetdesk@rsr.org.za"],
  finance: ["finance@rsr.org.za"],
  hrOffBoardingManager: ["hr.offboarding@rsr.org.za"],
};


/* ---------------- Helpers ---------------- */
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function getEndOfLifeDate(purchaseDateStr) {
  const d = new Date(purchaseDateStr);
  if (isNaN(d)) return null;
  const eol = new Date(d);
  eol.setFullYear(eol.getFullYear() + YEARS);
  return eol;
}

function calcLifeRemainingPercent(purchaseDateStr) {
  const d = new Date(purchaseDateStr);
  if (isNaN(d)) return 0;
  const now = new Date();
  const eol = getEndOfLifeDate(purchaseDateStr);
  if (!eol) return 0;
  const totalDays = Math.max(1, Math.round((eol - d) / MS_IN_DAY));
  const usedDays = Math.max(0, Math.round((now - d) / MS_IN_DAY));
  const remaining = clamp(1 - usedDays / totalDays, 0, 1);
  return Math.round(remaining * 100);
}

const fmtZAR = (n) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(
    Number(n) || 0
  );

const monthKey = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return "Unknown";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (key) => {
  if (key === "Unknown") return "Unknown";
  const [y, m] = key.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleString("en-ZA", { month: "short", year: "numeric" });
};

const isDueForDisposal = (asset) => {
  const status = (asset.status || "").toLowerCase();
  if (status.includes("dispos")) return true;
  if (!asset.purchaseDate) return false;

  const lifePct = calcLifeRemainingPercent(asset.purchaseDate || "");
  if (lifePct <= 0) return true;

  const eol = getEndOfLifeDate(asset.purchaseDate || "");
  if (eol && eol <= new Date()) return true;

  return false;
};

/* Backend → Frontend mapping */
const mapBackendAsset = (asset) => ({
  backendId: asset.id,
  id: asset.asset_tag || `RSR-${String(asset.id).padStart(4, "0")}`,
  description:
    `${asset.brand ?? ""} ${asset.model ?? ""}`.trim() || asset.category || "",
  user: asset.assigned_to || "",
  department: asset.department || asset.office_location || "",
  region: asset.region || "",
  location: asset.location || "",
  status: asset.status || "In Use",
  type: asset.category || "",
  purchaseDate: asset.purchase_date || "",
  value: asset.cost ?? "",
  serial: asset.serial_number || "",
  lifeRemainingPercent: asset.life_remaining_percent ?? null,
  notes: asset.notes || "",
});

/* Reusable stat card */
function StatCard({ title, value, className = "", onClick }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let raf;
    const start = performance.now();
    const duration = 600;

    const tick = (t) => {
      const p = Math.min((t - start) / duration, 1);
      setDisplay(Math.floor(p * value));
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <div
      className={`card stat-card ${className} ${onClick ? "clickable-card" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <h3>{title}</h3>
      <p>{display}</p>
    </div>
  );
}

/* ---------------- Email Stub ---------------- */
function sendEmail({ subject, to, cc = [], body }) {
  console.log("[EMAIL-OUT]", { subject, to, cc, body });
}

/* ---------------- Error Boundary ---------------- */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("[UI CRASH]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, background: "#2b0000", color: "white", borderRadius: 12 }}>
          <h3 style={{ marginTop: 0 }}>UI crashed while rendering</h3>
          <pre style={{ whiteSpace: "pre-wrap" }}>{String(this.state.error)}</pre>
          <p style={{ opacity: 0.85 }}>Open DevTools → Console for the full stack trace.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------------- Main App ---------------- */
export default function MainApp({ auth, onLogout }) {

  // Token + current user
  const accessToken = auth?.accessToken || auth?.token || auth?.access_token || "";
  const currentUsername = auth?.username || auth?.user?.username || "";

  const displayName =
    auth?.username || auth?.user?.full_name || auth?.user?.username || "User";

  const role = auth?.role || auth?.user?.role || "AssetDeskUser";

  const isAdmin = role === "AssetDeskAdmin";
  const isICT = role === "ICT";

  // Permissions
  const canEditAssets = isAdmin || isICT;
  const canIssueReceive = isAdmin || isICT;
  const canCreateDeleteAssets = isAdmin; // keep strict as you intended

  // Helper: auth headers
  function authHeaders(extra = {}) {
    if (!accessToken) return { ...extra };
    return { ...extra, Authorization: `Bearer ${accessToken}` };
  }
  console.log("AUTH OBJECT:", auth);
  console.log("TOKEN FOUND:", accessToken ? "YES" : "NO");

  // Notice/toast (with cleanup)
  const timerRef = useRef(null);
  const [notice, setNotice] = useState(null);
  const showNotice = (type, text) => {
    setNotice({ type, text });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setNotice(null), 2500);
  };
  useEffect(() => () => timerRef.current && clearTimeout(timerRef.current), []);

  // Logout
  const handleLogoutClick = () => {
    const ok = window.confirm("Are you sure you want to log out?");
    if (!ok) return;
    onLogout?.();
  };

  // Theme
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("assetdesk_theme");
    return saved ? saved === "dark" : true;
  });
  useEffect(() => {
    localStorage.setItem("assetdesk_theme", darkMode ? "dark" : "light");
  }, [darkMode]);
  const toggleTheme = () => setDarkMode((v) => !v);

  // Settings modal
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState("GENERAL"); // GENERAL | DATA | USERS

  // Assets state
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Tabs
  const [activeTab, setActiveTab] = useState("Dashboard");

  // Add form
  const initialFormState = {
    id: "",
    description: "",
    user: "",
    department: "",
    location: "",
    status: "In Use",
    type: "Laptop",
    purchaseDate: "",
    value: "",
    serial: "",
  };
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialFormState);

  // Edit state
  const [showEdit, setShowEdit] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editBackendId, setEditBackendId] = useState(null);
  const [editForm, setEditForm] = useState(initialFormState);

  // Issue state
  const [showIssue, setShowIssue] = useState(false);
  const [issueId, setIssueId] = useState(null);
  const [issueForm, setIssueForm] = useState({
    user: "",
    department: "",
    location: "",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  // Receive state
  const [showReceive, setShowReceive] = useState(false);
  const [receiveId, setReceiveId] = useState(null);
  const [receiveForm, setReceiveForm] = useState({
    location: "ICT Storeroom",
    condition: "Good",
    reason: "Off Boarding",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  // Asset modal + history
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [assetEvents, setAssetEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");

  // Users (admin)
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [newUser, setNewUser] = useState({
    username: "",
    full_name: "",
    email: "",
    role: "AssetDeskUser",
    is_active: true,
    password: "",
  });

  /* ---------------- Backend calls ---------------- */
  async function fetchAssets() {
    try {
      setError("");
      const res = await fetch(`${API_BASE}/assets`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch assets");
      const data = await res.json();
      setAssets(Array.isArray(data) ? data.map(mapBackendAsset) : []);
    } catch (err) {
      console.error("Error loading assets:", err);
      setError(err.message || "Error loading assets");
    }
  }

  useEffect(() => {
    fetchAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateAssetOnServer(existingAsset, overrides = {}) {
    const backendId = existingAsset.backendId ?? existingAsset.dbId;
    if (!backendId) throw new Error("Missing backend ID for this asset.");

    const description = overrides.description ?? existingAsset.description ?? "";
    const formattedPurchaseDate = (overrides.purchaseDate ?? existingAsset.purchaseDate ?? "")
      .toString()
      .replace(/\//g, "-")
      .trim();

    const payload = {
      asset_tag: (overrides.id ?? existingAsset.id)?.toString().trim() || null,
      category: overrides.type ?? existingAsset.type ?? "Other",
      brand: description ? description.split(" ")[0] : null,
      model: description || null,
      serial_number: overrides.serial ?? existingAsset.serial ?? null,
      hostname: null,
      status: overrides.status ?? existingAsset.status ?? "In Use",
      assigned_to: overrides.user ?? existingAsset.user ?? null,
      department: overrides.department ?? existingAsset.department ?? null,
      location: overrides.location ?? existingAsset.location ?? null,
      purchase_date: formattedPurchaseDate || null,
      warranty_expiry: null,
      cost:
        overrides.value !== undefined && overrides.value !== null
          ? Number(overrides.value)
          : existingAsset.value !== undefined && existingAsset.value !== null
            ? Number(existingAsset.value)
            : null,
      useful_life_years: 5,
      notes: overrides.notes ?? existingAsset.notes ?? null,
    };

    const res = await fetch(`${API_BASE}/assets/${backendId}`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let msg = "Failed to update asset";
      try {
        const errBody = await res.json();
        if (errBody?.detail) msg = errBody.detail;
      } catch (error) {
        console.error("An error occurred:", error);
      }
      throw new Error(msg);
    }

    const updated = await res.json();
    const mapped = mapBackendAsset(updated);

    setAssets((prev) =>
      prev.map((a) => ((a.backendId ?? a.dbId) === mapped.backendId ? mapped : a))
    );

    return mapped;
  }

  async function logAssetEvent(asset, { event_type, from_status, to_status, details, actor }) {
    const backendId = asset.backendId ?? asset.dbId;
    if (!backendId) return;

    const payload = {
      event_type,
      actor: actor || currentUsername || "AssetDesk",
      from_status: from_status || null,
      to_status: to_status || null,
      details: details || null,
    };

    try {
      const res = await fetch(`${API_BASE}/assets/${backendId}/events`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
      if (!res.ok) console.error("[EVENT] Failed", await res.text());
    } catch (err) {
      console.error("[EVENT] Error", err);
    }
  }

  /* ---------------- Users ---------------- */

  // 1. ) Load Users
  async function loadUsers() {
    setUsersError("");
    setUsersLoading(true);

    try {
      console.log("API_BASE:", API_BASE);
      console.log("Has token:", !!accessToken);

      if (!accessToken) throw new Error("No token found. Please log in again.");

      const res = await fetch(`${API_BASE}/users`, { headers: authHeaders() });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = data?.detail || "Failed to load users.";
        throw new Error(msg);
      }

      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error loading users:", err);
      setUsersError(err.message || "Error loading users.");
    } finally {
      setUsersLoading(false);
    }
  }

  const handleNewUserChange = (e) => {
    const { name, value, type, checked } = e.target;
    setNewUser((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };
  // 2.) Create Users
  async function handleCreateUserSubmit(e) {
    e.preventDefault();
    setUsersError("");

    if (!isAdmin) {
      setUsersError("Only AssetDeskAdmin can create users.");
      return;
    }

    if (!newUser.username.trim() || !newUser.password.trim()) {
      setUsersError("Username and password are required.");
      return;
    }

    try {
      const payload = {
        username: newUser.username.trim(),
        full_name: newUser.full_name.trim() || newUser.username.trim(),
        email: newUser.email.trim() || null,
        role: newUser.role || "AssetDeskUser",
        is_active: newUser.is_active,
        password: newUser.password,
      };

      // ✅ admin-only endpoint
      const res = await fetch(`${API_BASE}/users/admin-create`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = data?.detail || "Failed to create user.";
        throw new Error(msg);
      }

      setUsers((prev) => [...prev, data]);
      setNewUser((prev) => ({
        username: "",
        full_name: "",
        email: "",
        role: prev.role,
        is_active: true,
        password: "",
      }));

      showNotice("success", `User "${data.username}" created.`);
    } catch (err) {
      console.error("Error creating user:", err);
      setUsersError(err.message || "Error creating user.");
      showNotice("error", err.message || "Error creating user.");
    }
  }
  // 2) Disable User
  async function handleDisableUser(user) {
    setUsersError("");

    if (!user?.id) {
      const msg = "User ID missing – cannot disable.";
      setUsersError(msg);
      showNotice("error", msg);
      return;
    }

    if (user.username === currentUsername) {
      const msg = "You cannot disable your own account.";
      setUsersError(msg);
      showNotice("error", msg);
      return;
    }

    const ok = window.confirm(
      `Disable login for user "${user.username}"? They will no longer be able to sign in.`
    );
    if (!ok) return;

    try {
      const res = await fetch(`${API_BASE}/users/${user.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = data?.detail || "Failed to disable user.";
        throw new Error(msg);
      }

      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_active: false } : u)));
      showNotice("success", data?.message || `User "${user.username}" disabled.`);
    } catch (err) {
      console.error("Error disabling user:", err);
      const msg = err.message || "Error disabling user.";
      setUsersError(msg);
      showNotice("error", msg);
    }
  }
  // Enable User
  async function handleEnableUser(user) {
    setUsersError("");

    if (!user?.id) {
      const msg = "User ID missing – cannot enable.";
      setUsersError(msg);
      showNotice("error", msg);
      return;
    }

    const ok = window.confirm(`Re-enable user "${user.username}"?`);
    if (!ok) return;

    try {
      const res = await fetch(`${API_BASE}/users/${user.id}/enable`, {
        method: "PATCH",
        headers: authHeaders(),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = data?.detail || "Failed to enable user.";
        throw new Error(msg);
      }

      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_active: true } : u)));
      showNotice("success", data?.message || `User "${user.username}" enabled.`);
    } catch (err) {
      console.error("Error enabling user:", err);
      const msg = err.message || "Error enabling user.";
      setUsersError(msg);
      showNotice("error", msg);
    }
  }

  useEffect(() => {
    if (showSettingsModal && settingsTab === "USERS" && isAdmin) loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSettingsModal, settingsTab, isAdmin]);

  /* ---------------- UI handlers ---------------- */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  async function handleAddAssetSubmit(e) {
    e.preventDefault();
    setError("");

    if (!canCreateDeleteAssets) {
      showNotice("error", "Not authorized: only admins can add assets.");
      return;
    }

    const idLower = (form.id || "").trim().toLowerCase();
    const serialLower = (form.serial || "").trim().toLowerCase();

    if (idLower && assets.some((a) => (a.id || "").toLowerCase() === idLower)) {
      const msg = "An asset with this Asset ID already exists.";
      setError(msg);
      showNotice("error", msg);
      return;
    }

    if (serialLower && assets.some((a) => (a.serial || "").toLowerCase() === serialLower)) {
      const msg = "An asset with this Serial Number already exists.";
      setError(msg);
      showNotice("error", msg);
      return;
    }

    try {
      const payload = {
        asset_tag: form.id || form.serial || null,
        category: form.type || "Other",
        brand: form.description ? form.description.split(" ")[0] : null,
        model: form.description || null,
        serial_number: form.serial || null,
        hostname: null,
        status: form.status || "In Use",
        assigned_to: form.user || null,
        department: form.department || null,
        location: form.location || null,
        purchase_date: form.purchaseDate || null,
        warranty_expiry: null,
        cost: form.value ? Number(form.value) : null,
        useful_life_years: 5,
        notes: null,
      };

      const res = await fetch(`${API_BASE}/assets`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = data?.detail || "Failed to create asset";
        throw new Error(msg);
      }

      const mapped = mapBackendAsset(data);
      setAssets((prev) => [...prev, mapped]);

      showNotice("success", "Asset added successfully.");
      setShowForm(false);
      setForm(initialFormState);
    } catch (err) {
      console.error("Error creating asset:", err);
      const msg = err.message || "Error creating asset";
      setError(msg);
      showNotice("error", msg);
    }
  }

  const openEdit = (asset) => {
    setShowForm(false);
    setShowIssue(false);
    setShowReceive(false);

    setEditId(asset.id);
    setEditBackendId(asset.backendId ?? asset.dbId ?? null);

    setEditForm({
      id: asset.id || "",
      description: asset.description || "",
      user: asset.user || "",
      department: asset.department || "",
      location: asset.location || "",
      status: asset.status || "In Use",
      type: asset.type || "Laptop",
      purchaseDate: asset.purchaseDate || "",
      value: asset.value ?? "",
      serial: asset.serial || "",
    });

    setShowEdit(true);
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm((f) => ({ ...f, [name]: value }));
  };

  const cancelEdit = () => {
    setShowEdit(false);
    setEditId(null);
    setEditBackendId(null);
    setError("");
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!canEditAssets) {
      showNotice("error", "Not authorized: only ICT/Admin can edit.");
      return;
    }

    if (!editForm.id.trim() || !editForm.description.trim()) {
      const msg = "Asset ID and Description are required.";
      setError(msg);
      showNotice("error", msg);
      return;
    }

    const newIdLower = editForm.id.trim().toLowerCase();
    if (
      newIdLower !== (editId || "").toLowerCase() &&
      assets.some((a) => (a.id || "").toLowerCase() === newIdLower)
    ) {
      const msg = "Another asset with this Asset ID already exists.";
      setError(msg);
      showNotice("error", msg);
      return;
    }

    const original = assets.find((a) => a.id === editId);
    const backendId = editBackendId ?? original?.backendId ?? null;
    if (!backendId) {
      const msg = "Missing backend ID for this asset.";
      setError(msg);
      showNotice("error", msg);
      return;
    }

    try {
      const updated = await updateAssetOnServer({ ...original, backendId }, {
        id: editForm.id.trim(),
        description: editForm.description.trim(),
        user: editForm.user,
        department: editForm.department,
        location: editForm.location,
        status: editForm.status,
        type: editForm.type,
        purchaseDate: editForm.purchaseDate,
        value: editForm.value,
        serial: editForm.serial,
      });

      setShowEdit(false);
      setEditId(null);
      setEditBackendId(null);
      showNotice("success", `Asset ${updated.id} updated.`);
    } catch (err) {
      console.error("Error updating asset:", err);
      const msg = err.message || "Error updating asset";
      setError(msg);
      showNotice("error", msg);
    }
  };

  const openIssue = (asset) => {
    setShowForm(false);
    setShowEdit(false);
    setShowReceive(false);

    setIssueId(asset.id);
    setIssueForm({
      user: asset.user || "",
      department: asset.department || "",
      location: asset.location || "",
      date: new Date().toISOString().slice(0, 10),
      notes: "",
    });

    setShowIssue(true);
  };

  const cancelIssue = () => {
    setShowIssue(false);
    setIssueId(null);
    setIssueForm({
      user: "",
      department: "",
      location: "",
      date: new Date().toISOString().slice(0, 10),
      notes: "",
    });
  };

  const handleIssueChange = (e) => {
    const { name, value } = e.target;
    setIssueForm((f) => ({ ...f, [name]: value }));
  };

  const handleIssueSubmit = async (e) => {
    e.preventDefault();

    if (!canIssueReceive) {
      showNotice("error", "Not allowed (ICT/Admin only).");
      return;
    }

    if (!issueForm.user.trim() || !issueForm.department.trim()) {
      showNotice("error", "User and Department are required to issue.");
      return;
    }

    const asset = assets.find((x) => x.id === issueId);
    if (!asset) {
      showNotice("error", "Asset not found.");
      return;
    }

    const newUser = issueForm.user.trim();
    const newDept = issueForm.department.trim();
    const newLoc = (issueForm.location || asset.location || "").trim();
    const issueDate = issueForm.date;
    const noteText = (issueForm.notes || "").trim();
    const previousStatus = asset.status || null;

    try {
      const updated = await updateAssetOnServer(asset, {
        user: newUser,
        department: newDept,
        location: newLoc,
        status: "In Use",
        notes: noteText || asset.notes || null,
      });

      await logAssetEvent(updated, {
        event_type: "ISSUED",
        actor: currentUsername || "Asset Desk",
        from_status: previousStatus,
        to_status: updated.status || null,
        details: `Issued to ${newUser} (${newDept}) at ${newLoc} on ${issueDate}`,
      });

      sendEmail({
        subject: `Asset Issued: ${updated.id}`,
        to: [`${newUser}@rsr.org.za`],
        cc: [...ADMIN_EMAILS.finance, ...ADMIN_EMAILS.assetDeskAdmins],
        body:
          `Dear ${newUser},\n\n` +
          `The following asset has been issued to you:\n` +
          `• Asset ID: ${updated.id}\n` +
          `• Description: ${updated.description}\n` +
          `• Serial Number: ${updated.serial}\n\n` +
          `Issued on: ${issueDate}\n\n` +
          `Please note that responsibility / risk ownership has now transferred from ICT to you.\n\n` +
          (noteText ? `Additional notes: ${noteText}\n\n` : "") +
          `Regards,\nNo Reply – Asset Desk`,
      });

      setShowIssue(false);
      setIssueId(null);
      showNotice("success", `Asset issued to ${newUser}.`);
    } catch (err) {
      console.error("Error issuing asset:", err);
      showNotice("error", err.message || "Failed to issue asset.");
    }
  };

  const openReceive = (asset) => {
    setShowForm(false);
    setShowEdit(false);
    setShowIssue(false);

    setReceiveId(asset.id);
    setReceiveForm({
      location: "ICT Storeroom",
      condition: "Good",
      reason: "Off Boarding",
      date: new Date().toISOString().slice(0, 10),
      notes: "",
    });

    setShowReceive(true);
  };

  const cancelReceive = () => {
    setShowReceive(false);
    setReceiveId(null);
  };

  const handleReceiveChange = (e) => {
    const { name, value } = e.target;
    setReceiveForm((f) => ({ ...f, [name]: value }));
  };

  const handleReceiveSubmit = async (e) => {
    e.preventDefault();

    if (!canIssueReceive) {
      showNotice("error", "Not allowed (ICT/Admin only).");
      return;
    }

    const asset = assets.find((x) => x.id === receiveId);
    if (!asset) {
      showNotice("error", "Asset not found.");
      return;
    }

    const toAvailable =
      receiveForm.location === "ICT Storeroom" &&
      receiveForm.reason === "Off Boarding" &&
      receiveForm.condition === "Good";

    let newStatus = asset.status;
    let newUser = asset.user;
    let newDept = asset.department;

    if (receiveForm.condition === "Lost") {
      newStatus = "Lost Asset";
    } else if (toAvailable) {
      newStatus = "Available";
      newUser = "Shared Pool";
      newDept = "";
    } else if (receiveForm.condition === "Damaged" || receiveForm.condition === "Faulty") {
      newStatus = "Repair";
    } else if (receiveForm.location === "ICT Storeroom") {
      newStatus = "Active";
    }

    const noteText = (receiveForm.notes || "").trim();
    const previousStatus = asset.status || null;

    try {
      const updated = await updateAssetOnServer(asset, {
        status: newStatus,
        user: newUser,
        department: newDept,
        location: receiveForm.location,
        notes: noteText || asset.notes || null,
      });

      const details =
        `Received (${receiveForm.reason}) – ` +
        `Condition: ${receiveForm.condition}; ` +
        `Location: ${receiveForm.location}; ` +
        `Date: ${receiveForm.date}`;

      await logAssetEvent(updated, {
        event_type: "RECEIVED",
        actor: currentUsername || "Asset Desk",
        from_status: previousStatus,
        to_status: updated.status || null,
        details,
      });

      const baseTo = asset.user ? [`${asset.user}@rsr.org.za`] : ADMIN_EMAILS.assetDeskAdmins;
      const ccCommon = [...ADMIN_EMAILS.finance, ...ADMIN_EMAILS.assetDeskAdmins];

      if (receiveForm.reason === "Off Boarding") {
        sendEmail({
          subject: `Asset Received (Off Boarding): ${asset.id}`,
          to: [...ADMIN_EMAILS.hrOffBoardingManager],
          cc: [...baseTo, ...ccCommon],
          body:
            `The following asset was received:\n` +
            `• Asset ID: ${asset.id}\n` +
            `• Description: ${asset.description}\n` +
            `• Serial Number: ${asset.serial}\n` +
            `• Condition: ${receiveForm.condition}\n` +
            `• Location: ${receiveForm.location}\n` +
            `• Reason: ${receiveForm.reason}\n\n` +
            `Date: ${receiveForm.date}\n` +
            (noteText ? `Notes: ${noteText}\n\n` : "\n") +
            `Regards,\nNo Reply – Asset Desk`,
        });
      } else {
        sendEmail({
          subject: `Asset Received: ${asset.id}`,
          to: baseTo,
          cc: ccCommon,
          body:
            `The following asset was received:\n` +
            `• Asset ID: ${asset.id}\n` +
            `• Description: ${asset.description}\n` +
            `• Serial Number: ${asset.serial}\n` +
            `• Condition: ${receiveForm.condition}\n` +
            `• Location: ${receiveForm.location}\n` +
            `• Reason: ${receiveForm.reason}\n\n` +
            `Date: ${receiveForm.date}\n` +
            (noteText ? `Notes: ${noteText}\n\n` : "\n") +
            `Regards,\nNo Reply – Asset Desk`,
        });
      }

      setShowReceive(false);
      setReceiveId(null);
      showNotice("success", `Asset received (${receiveForm.reason}).`);
    } catch (err) {
      console.error("Error receiving asset:", err);
      showNotice("error", err.message || "Failed to receive asset.");
    }
  };

  const handleRemoveAsset = async (asset) => {
    if (!canCreateDeleteAssets) {
      showNotice("error", "Not authorized: only admins can remove assets.");
      return;
    }

    const ok = window.confirm(`This will permanently remove asset ${asset.id}. Continue?`);
    if (!ok) return;

    try {
      if (!asset.backendId) throw new Error("Missing backend ID for this asset.");

      const res = await fetch(`${API_BASE}/assets/${asset.backendId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || "Failed to delete asset on server.");
      }

      setAssets((prev) => prev.filter((a) => a.backendId !== asset.backendId));
      showNotice("success", `Asset ${asset.id} deleted.`);
    } catch (err) {
      console.error("Error deleting asset:", err);
      showNotice("error", err.message || "Failed to delete asset.");
    }
  };

  const handleMarkForDisposal = async (id) => {
    if (!isAdmin) {
      showNotice("error", "Not authorized: admin only.");
      return;
    }

    const ok = window.confirm("Mark this asset as 'Due for Disposal'?");
    if (!ok) return;

    const asset = assets.find((a) => a.id === id);
    if (!asset) {
      showNotice("error", "Asset not found.");
      return;
    }

    const previousStatus = asset.status || "Unknown";

    try {
      const updated = await updateAssetOnServer(asset, { status: "Due for Disposal" });

      await logAssetEvent(updated, {
        event_type: "DISPOSAL_MARK",
        from_status: previousStatus,
        to_status: updated.status || "Due for Disposal",
        actor: currentUsername || "AssetDesk",
        details: "Asset marked as Due for Disposal by ICT/Admin.",
      });

      showNotice("success", `Asset ${id} marked as 'Due for Disposal'.`);
    } catch (err) {
      console.error("Error marking for disposal:", err);
      showNotice("error", err.message || "Failed to mark asset for disposal.");
    }
  };

  // Asset modal / events
  const closeAssetModal = () => {
    setShowAssetModal(false);
    setSelectedAsset(null);
    setAssetEvents([]);
    setEventsError("");
  };

  const openAssetModal = async (asset) => {
    setSelectedAsset(asset);
    setShowAssetModal(true);
    setAssetEvents([]);
    setEventsError("");
    setEventsLoading(true);

    const backendId = asset.backendId ?? asset.dbId;
    if (!backendId) {
      setEventsError("No backend ID available for this asset.");
      setEventsLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/assets/${backendId}/events`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load history.");
      const data = await res.json();
      setAssetEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error loading events:", err);
      setEventsError(err.message || "Could not load history.");
    } finally {
      setEventsLoading(false);
    }
  };

  /* ---------------- Import/Export ---------------- */
  const CSV_HEADERS = [
    "id",
    "description",
    "user",
    "department",
    "location",
    "status",
    "type",
    "serial",
    "value",
    "purchaseDate",
  ];

  const exportCSV = () => {
    const rows = [CSV_HEADERS.join(",")].concat(
      assets.map((a) =>
        CSV_HEADERS.map((h) => {
          const v = (a[h] ?? "").toString().replace(/"/g, '""');
          return /[",\n]/.test(v) ? `"${v}"` : v;
        }).join(",")
      )
    );

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `assetdesk-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showNotice("success", "Exported CSV.");
  };

  const importCSV = async (file) => {
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (!lines.length) {
        showNotice("error", "File is empty.");
        return;
      }

      const headers = lines[0].split(",").map((h) => h.trim());
      const idx = (n) => headers.indexOf(n);

      const parsed = lines.slice(1).map((line) => {
        const cells = [];
        let cur = "";
        let inQ = false;

        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQ && line[i + 1] === '"') {
              cur += '"';
              i++;
            } else inQ = !inQ;
          } else if (ch === "," && !inQ) {
            cells.push(cur);
            cur = "";
          } else cur += ch;
        }
        cells.push(cur);

        const get = (n) => (idx(n) >= 0 ? cells[idx(n)] ?? "" : "");

        return {
          id: get("id"),
          description: get("description"),
          user: get("user"),
          department: get("department"),
          location: get("location"),
          status: get("status") || "In Use",
          type: get("type") || "Laptop",
          serial: get("serial") || "",
          value: Number(get("value")) || 0,
          purchaseDate: get("purchaseDate"),
        };
      });

      setAssets((prev) => {
        const existing = new Set(prev.map((a) => (a.id || "").toLowerCase()));
        const deduped = parsed.filter((a) => a.id && !existing.has(a.id.toLowerCase()));
        return [...deduped, ...prev];
      });

      showNotice("success", `Imported ${parsed.length} rows (duplicates may be skipped).`);
    } catch (e) {
      console.error(e);
      showNotice("error", "Import failed. Check file format.");
    }
  };

  const exportXLSX = () => {
    const headers = CSV_HEADERS;
    const data = assets.map((a) => {
      const row = {};
      headers.forEach((h) => (row[h] = a[h] ?? ""));
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(data, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Assets");
    XLSX.writeFile(wb, `assetdesk-${new Date().toISOString().slice(0, 10)}.xlsx`);
    showNotice("success", "Exported Excel file.");
  };

  const importXLSX = async (file) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const first = wb.SheetNames[0];
      if (!first) {
        showNotice("error", "No sheet found.");
        return;
      }

      const rows = XLSX.utils.sheet_to_json(wb.Sheets[first], { defval: "" });

      const parsed = rows.map((r) => ({
        id: (r.id ?? r.ID ?? r.Id ?? "").toString().trim(),
        description: (r.description ?? r.Description ?? "").toString().trim(),
        user: (r.user ?? r.User ?? "").toString().trim(),
        department: (r.department ?? r.Department ?? "").toString().trim(),
        location: (r.location ?? r.Location ?? "").toString().trim(),
        status: (r.status ?? r.Status ?? "In Use").toString().trim(),
        type: (r.type ?? r.Type ?? "Laptop").toString().trim(),
        serial: (r.serial ?? r.Serial ?? r.SERIAL ?? "").toString().trim(),
        value: Number(r.value ?? r.Value ?? 0) || 0,
        purchaseDate: (r.purchaseDate ?? r["purchase date"] ?? r.PurchaseDate ?? "")
          .toString()
          .trim(),
      }));

      setAssets((prev) => {
        const existing = new Set(prev.map((a) => (a.id || "").toLowerCase()));
        const deduped = parsed.filter((a) => a.id && !existing.has(a.id.toLowerCase()));
        return [...deduped, ...prev];
      });

      showNotice("success", `Imported ${parsed.length} rows from Excel (duplicates may be skipped).`);
    } catch (e) {
      console.error(e);
      showNotice("error", "Excel import failed. Please check the file.");
    }
  };

  const downloadXlsxTemplate = () => {
    const headers = CSV_HEADERS;
    const ws = XLSX.utils.aoa_to_sheet([headers, ["", "", "", "", "", "", "", "", "", ""]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "assetdesk-template.xlsx");
    showNotice("success", "Excel template downloaded.");
  };

  /* ---------------- Reports Data ---------------- */
  const total = assets.length;

  const inUseCount = assets.filter((a) => (a.status || "").toLowerCase().trim() === "active").length;
  const availableCount = assets.filter((a) => (a.status || "").toLowerCase().trim() === "available").length;
  const inRepairCount = assets.filter((a) => (a.status || "").toLowerCase().includes("repair")).length;
  const lostCount = assets.filter((a) => (a.status || "").toLowerCase().includes("lost")).length;
  const dueForDisposalCount = assets.filter((a) => isDueForDisposal(a)).length;
  const totalValue = assets.reduce((sum, a) => sum + (Number(a.value) || 0), 0);

  const filteredAssets = useMemo(() => {
    const q = (search || "").toString().toLowerCase().trim();
    let base = assets;

    if (statusFilter === "IN_USE") {
      base = base.filter((a) => (a.status || "").toLowerCase().trim() === "active");
    } else if (statusFilter === "AVAILABLE") {
      base = base.filter((a) => (a.status || "").toLowerCase().trim() === "available");
    } else if (statusFilter === "DISPOSAL") {
      base = base.filter((a) => isDueForDisposal(a));
    } else if (statusFilter === "REPAIR") {
      base = base.filter((a) => (a.status || "").toLowerCase().includes("repair"));
    } else if (statusFilter === "LOST") {
      base = base.filter((a) => (a.status || "").toLowerCase().includes("lost"));
    }

    if (!q) return base;

    return base.filter((a) => {
      const id = (a.id || "").toString().toLowerCase();
      const desc = (a.description || "").toString().toLowerCase();
      const user = (a.user || "").toString().toLowerCase();
      const dept = (a.department || "").toString().toLowerCase();
      const loc = (a.location || "").toString().toLowerCase();
      const st = (a.status || "").toString().toLowerCase();
      const serial = (a.serial || "").toString().toLowerCase();

      return (
        id.includes(q) ||
        desc.includes(q) ||
        user.includes(q) ||
        dept.includes(q) ||
        loc.includes(q) ||
        st.includes(q) ||
        serial.includes(q)
      );
    });
  }, [assets, search, statusFilter]);

  const byType = useMemo(() => {
    const m = new Map();
    for (const a of assets) m.set(a.type || "Unknown", (m.get(a.type || "Unknown") || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [assets]);

  const byLocation = useMemo(() => {
    const m = new Map();
    for (const a of assets) m.set(a.location || "Unknown", (m.get(a.location || "Unknown") || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [assets]);

  const byStatus = useMemo(() => {
    const m = new Map();
    for (const a of assets) m.set(a.status || "Unknown", (m.get(a.status || "Unknown") || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [assets]);

  const byMonth = useMemo(() => {
    const m = new Map();
    for (const a of assets) {
      const k = monthKey(a.purchaseDate);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries())
      .sort((a, b) => (a[0] > b[0] ? 1 : -1))
      .map(([k, v]) => [monthLabel(k), v]);
  }, [assets]);

  const openAssetsWithFilter = (filter) => {
    setActiveTab("Assets");
    setStatusFilter(filter);
  };

  /* ---------------- Render ---------------- */
  return (
    <div id="assetdesk" className={darkMode ? "app app-dark" : "app"}>
      <header className="topbar">
        <div className="logo-section">
          <img src="/rsr-logo.png" alt="RSR Logo" className="rsr-logo" />
          <h1 className="logo-text">Asset Manifest</h1>
        </div>

        <nav className="top-tabs" role="tablist" aria-label="Main sections">
          <button
            className={`tab-btn ${activeTab === "Dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("Dashboard")}
          >
            Dashboard
          </button>
          <button
            className={`tab-btn ${activeTab === "Assets" ? "active" : ""}`}
            onClick={() => setActiveTab("Assets")}
          >
            Assets
          </button>
          <button
            className={`tab-btn ${activeTab === "Reports" ? "active" : ""}`}
            onClick={() => setActiveTab("Reports")}
          >
            Reports
          </button>
        </nav>

        <div className="right-controls">
          <div className="settings-wrap">
            <button
              className="theme-btn settings-btn"
              onClick={() => {
                setSettingsTab("GENERAL");
                setShowSettingsModal(true);
              }}
              title="Settings"
            >
              ⚙️ Settings
            </button>
          </div>

          <div className="user-badge">
            <span className="user-name">
              Logged in as: <strong>{displayName}</strong>{" "}
              <span style={{ opacity: 0.8, fontSize: "0.85rem" }}>({role})</span>
            </span>

            <button className="theme-btn danger" onClick={handleLogoutClick}>
              🚪 Logout
            </button>
          </div>
        </div>
      </header>

      <main className="content">
        {notice && <div className={`toast toast-${notice.type}`}>{notice.text}</div>}

        {error && (
          <div className="form-error" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        <ErrorBoundary>
          {/* Dashboard */}
          {activeTab === "Dashboard" && (
            <>
              <h2>Dashboard</h2>
              <p>Quick overview of your ICT assets.</p>

              <div className="cards">
                <div
                  className="card stat-card highlight clickable-card"
                  onClick={() => openAssetsWithFilter("ALL")}
                >
                  <h3>Total Asset Value</h3>
                  <p>{fmtZAR(totalValue)}</p>
                </div>

                <StatCard title="Total Assets" value={total} className="neutral" onClick={() => openAssetsWithFilter("ALL")} />
                <StatCard title="Active" value={inUseCount} className="success" onClick={() => openAssetsWithFilter("IN_USE")} />
                <StatCard title="Available" value={availableCount} className="info" onClick={() => openAssetsWithFilter("AVAILABLE")} />
                <StatCard title="Due for Disposal" value={dueForDisposalCount} className="danger" onClick={() => openAssetsWithFilter("DISPOSAL")} />
                <StatCard title="In Repair" value={inRepairCount} className="warn" onClick={() => openAssetsWithFilter("REPAIR")} />
                <StatCard title="Lost Assets" value={lostCount} className="danger" onClick={() => openAssetsWithFilter("LOST")} />
              </div>
            </>
          )}

          {/* Assets */}
          {activeTab === "Assets" && (
            <>
              <h2 style={{ marginTop: "2rem" }}>Assets</h2>
              <p>ICT assets connected to your backend database.</p>

              <div className="toolbar">
                <button
                  className="primary-btn"
                  onClick={() => {
                    setShowEdit(false);
                    setShowIssue(false);
                    setShowReceive(false);
                    setShowForm((s) => !s);
                  }}
                  disabled={!canCreateDeleteAssets}
                  title={canCreateDeleteAssets ? "Add asset" : "Admins only"}
                  style={{
                    opacity: canCreateDeleteAssets ? 1 : 0.5,
                    cursor: canCreateDeleteAssets ? "pointer" : "not-allowed",
                  }}
                >
                  {showForm ? "Close Form" : "+ Add Asset"}
                </button>

                <input
                  className="search-input"
                  type="text"
                  placeholder="Search by ID, description, user, department, location, status, or serial"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Add Form */}
              {showForm && (
                <div className="modal-backdrop" onClick={() => setShowForm(false)}>
                  <div className="modal" onClick={(e) => e.stopPropagation()}>
                    <h3>Add Asset</h3>
                    {error && <div className="form-error">{error}</div>}

                    <form onSubmit={handleAddAssetSubmit} className="asset-form">
                      <div className="form-row">
                        <label htmlFor="id">Asset ID *</label>
                        <input
                          id="id"
                          name="id"
                          value={form.id}
                          onChange={handleChange}
                          placeholder="e.g. 40001900"
                          required
                        />
                      </div>

                      <div className="form-row">
                        <label htmlFor="description">Description *</label>
                        <input
                          id="description"
                          name="description"
                          value={form.description}
                          onChange={handleChange}
                          placeholder="e.g. Dell Latitude 3440"
                          required
                        />
                      </div>

                      <div className="form-row">
                        <label htmlFor="type">Asset Type</label>
                        <select id="type" name="type" value={form.type} onChange={handleChange}>
                          <option>Laptop</option>
                          <option>Monitor</option>
                          <option>Phone</option>
                          <option>Tablet</option>
                          <option>Printer</option>
                          <option>Accessory</option>
                          <option>Other</option>
                        </select>
                      </div>

                      <div className="form-row">
                        <label htmlFor="serial">Serial Number</label>
                        <input
                          id="serial"
                          name="serial"
                          value={form.serial}
                          onChange={handleChange}
                          placeholder="e.g. SN12345678"
                        />
                      </div>

                      <div className="form-row">
                        <label htmlFor="value">Asset Value (ZAR)</label>
                        <input
                          id="value"
                          name="value"
                          type="number"
                          min="0"
                          step="1"
                          value={form.value}
                          onChange={handleChange}
                          placeholder="e.g. 15000"
                        />
                      </div>

                      <div className="form-row">
                        <label htmlFor="purchaseDate">Purchase Date</label>
                        <input
                          id="purchaseDate"
                          name="purchaseDate"
                          type="date"
                          value={form.purchaseDate}
                          onChange={handleChange}
                        />
                      </div>

                      <div className="form-row">
                        <label htmlFor="user">User / Owner</label>
                        <input
                          id="user"
                          name="user"
                          value={form.user}
                          onChange={handleChange}
                          placeholder="e.g. Sindisa M"
                        />
                      </div>

                      <div className="form-row">
                        <label htmlFor="department">Department</label>
                        <select id="department" name="department" value={form.department} onChange={handleChange}>
                          <option value="">— Select —</option>
                          {DEPARTMENTS.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-row">
                        <label htmlFor="location">Location</label>
                        <select id="location" name="location" value={form.location} onChange={handleChange}>
                          <option value="">— Select —</option>
                          {LOCATIONS.map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-row">
                        <label htmlFor="status">Status</label>
                        <select id="status" name="status" value={form.status} onChange={handleChange}>
                          <option>In Use</option>
                          <option>Available</option>
                          <option>Active</option>
                          <option>Due for Disposal</option>
                          <option>Repair</option>
                          <option>Lost Asset</option>
                        </select>
                      </div>

                      <div className="form-actions">
                        <button type="submit" className="primary-btn">
                          Save Asset
                        </button>
                        <button type="button" className="secondary-btn" onClick={() => setShowForm(false)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Edit Form */}
              {showEdit && (
                <div className="modal-backdrop" onClick={cancelEdit}>
                  <div className="modal" onClick={(e) => e.stopPropagation()}>
                    <h3>Edit Asset</h3>
                    {error && <div className="form-error">{error}</div>}

                    <form onSubmit={handleEditSubmit} className="asset-form">
                      <div className="form-row">
                        <label htmlFor="edit_id">Asset ID *</label>
                        <input id="edit_id" name="id" value={editForm.id} onChange={handleEditChange} required />
                      </div>

                      <div className="form-row">
                        <label htmlFor="edit_description">Description *</label>
                        <input
                          id="edit_description"
                          name="description"
                          value={editForm.description}
                          onChange={handleEditChange}
                          required
                        />
                      </div>

                      <div className="form-row">
                        <label htmlFor="edit_type">Asset Type</label>
                        <select id="edit_type" name="type" value={editForm.type} onChange={handleEditChange}>
                          <option>Laptop</option>
                          <option>Monitor</option>
                          <option>Phone</option>
                          <option>Tablet</option>
                          <option>Printer</option>
                          <option>Accessory</option>
                          <option>Other</option>
                        </select>
                      </div>

                      <div className="form-row">
                        <label htmlFor="edit_serial">Serial Number</label>
                        <input id="edit_serial" name="serial" value={editForm.serial} onChange={handleEditChange} />
                      </div>

                      <div className="form-row">
                        <label htmlFor="edit_value">Asset Value (ZAR)</label>
                        <input
                          id="edit_value"
                          name="value"
                          type="number"
                          min="0"
                          step="1"
                          value={editForm.value}
                          onChange={handleEditChange}
                        />
                      </div>

                      <div className="form-row">
                        <label htmlFor="edit_purchaseDate">Purchase Date</label>
                        <input
                          id="edit_purchaseDate"
                          name="purchaseDate"
                          type="date"
                          value={editForm.purchaseDate}
                          onChange={handleEditChange}
                        />
                      </div>

                      <div className="form-row">
                        <label htmlFor="edit_user">User / Owner</label>
                        <input id="edit_user" name="user" value={editForm.user} onChange={handleEditChange} />
                      </div>

                      <div className="form-row">
                        <label htmlFor="edit_department">Department</label>
                        <select
                          id="edit_department"
                          name="department"
                          value={editForm.department}
                          onChange={handleEditChange}
                        >
                          <option value="">— Select —</option>
                          {DEPARTMENTS.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-row">
                        <label htmlFor="edit_location">Location</label>
                        <select id="edit_location" name="location" value={editForm.location} onChange={handleEditChange}>
                          <option value="">— Select —</option>
                          {LOCATIONS.map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-row">
                        <label htmlFor="edit_status">Status</label>
                        <select id="edit_status" name="status" value={editForm.status} onChange={handleEditChange}>
                          <option>In Use</option>
                          <option>Available</option>
                          <option>Active</option>
                          <option>Due for Disposal</option>
                          <option>Repair</option>
                          <option>Lost Asset</option>
                        </select>
                      </div>

                      <div className="form-actions">
                        <button type="submit" className="primary-btn">
                          Save Changes
                        </button>
                        <button type="button" className="secondary-btn" onClick={cancelEdit}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Issue Form */}
              {showIssue && (
                <div className="modal-backdrop" onClick={cancelIssue}>
                  <div className="modal" onClick={(e) => e.stopPropagation()}>
                    <h3>Issue Asset: {issueId}</h3>
                    <form onSubmit={handleIssueSubmit} className="asset-form">
                      <div className="form-row">
                        <label htmlFor="issue_user">User *</label>
                        <input
                          id="issue_user"
                          name="user"
                          value={issueForm.user}
                          onChange={handleIssueChange}
                          required
                        />
                      </div>

                      <div className="form-row">
                        <label htmlFor="issue_department">Department *</label>
                        <select
                          id="issue_department"
                          name="department"
                          value={issueForm.department}
                          onChange={handleIssueChange}
                          required
                        >
                          <option value="">— Select —</option>
                          {DEPARTMENTS.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-row">
                        <label htmlFor="issue_location">Location</label>
                        <select
                          id="issue_location"
                          name="location"
                          value={issueForm.location}
                          onChange={handleIssueChange}
                        >
                          <option value="">— Select —</option>
                          {LOCATIONS.map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-row">
                        <label htmlFor="issue_date">Date</label>
                        <input id="issue_date" name="date" type="date" value={issueForm.date} onChange={handleIssueChange} />
                      </div>

                      <div className="form-row">
                        <label htmlFor="issue_notes">Notes</label>
                        <textarea
                          id="issue_notes"
                          name="notes"
                          value={issueForm.notes}
                          onChange={handleIssueChange}
                          rows={3}
                        />
                      </div>

                      <div className="form-actions">
                        <button
                          type="submit"
                          className="primary-btn"
                          style={{ background: "#ff8c00", borderColor: "#ff8c00" }}
                        >
                          Issue
                        </button>
                        <button type="button" className="secondary-btn" onClick={cancelIssue}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Receive Form */}
              {showReceive && (
                <div className="modal-backdrop" onClick={cancelReceive}>
                  <div className="modal" onClick={(e) => e.stopPropagation()}>
                    <h3>Receive Asset: {receiveId}</h3>
                    <form onSubmit={handleReceiveSubmit} className="asset-form">
                      <div className="form-row">
                        <label htmlFor="recv_location">Location</label>
                        <select
                          id="recv_location"
                          name="location"
                          value={receiveForm.location}
                          onChange={handleReceiveChange}
                        >
                          {LOCATIONS.map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-row">
                        <label htmlFor="recv_condition">Condition</label>
                        <select
                          id="recv_condition"
                          name="condition"
                          value={receiveForm.condition}
                          onChange={handleReceiveChange}
                        >
                          <option>Good</option>
                          <option>Faulty</option>
                          <option>Damaged</option>
                          <option>Lost</option>
                        </select>
                      </div>

                      <div className="form-row">
                        <label htmlFor="recv_reason">Reason</label>
                        <select id="recv_reason" name="reason" value={receiveForm.reason} onChange={handleReceiveChange}>
                          <option>Off Boarding</option>
                          <option>Repairs</option>
                          <option>Swap</option>
                          <option>Other</option>
                        </select>
                      </div>

                      <div className="form-row">
                        <label htmlFor="recv_date">Date</label>
                        <input id="recv_date" name="date" type="date" value={receiveForm.date} onChange={handleReceiveChange} />
                      </div>

                      <div className="form-row">
                        <label htmlFor="recv_notes">Notes</label>
                        <textarea id="recv_notes" name="notes" value={receiveForm.notes} onChange={handleReceiveChange} rows={3} />
                      </div>

                      <div className="form-actions">
                        <button
                          type="submit"
                          className="primary-btn"
                          style={{ background: "#2db56c", borderColor: "#2db56c" }}
                        >
                          Receive
                        </button>
                        <button type="button" className="secondary-btn" onClick={cancelReceive}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Asset table */}
              <div className="table-wrapper">
                <table className="asset-table">
                  <thead>
                    <tr>
                      <th>Asset ID</th>
                      <th>Description</th>
                      <th>User</th>
                      <th>Department</th>
                      <th>Region</th>
                      <th>Type</th>
                      <th>Serial</th>
                      <th>Value (ZAR)</th>
                      <th>Purchase Date</th>
                      <th>Life Remaining</th>
                      <th style={{ width: 260 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssets.map((asset) => {
                      const lifePct = calcLifeRemainingPercent(asset.purchaseDate || "");
                      const eol = getEndOfLifeDate(asset.purchaseDate || "");
                      const eolLabel = eol ? eol.toISOString().slice(0, 10) : "—";

                      return (
                        <tr key={asset.id} onClick={() => openAssetModal(asset)} className="asset-row">
                          <td>{asset.id}</td>
                          <td>{asset.description}</td>
                          <td>{asset.user}</td>
                          <td>{asset.location || "—"}</td>
                          <td>{asset.region || "—"}</td>
                          <td>{asset.type}</td>
                          <td>{asset.serial || "—"}</td>
                          <td>{fmtZAR(asset.value)}</td>
                          <td>{asset.purchaseDate || "—"}</td>
                          <td>
                            <div className="life-wrap">
                              <div className="life-bar">
                                <div className="life-fill" style={{ width: `${lifePct}%` }} />
                              </div>
                              <span className="life-label">{lifePct}%</span>
                            </div>
                            <div style={{ fontSize: ".75rem", opacity: 0.7, marginTop: ".15rem" }}>
                              EOL: {eolLabel}
                            </div>
                          </td>
                          <td>
                            <div className="actions-cell" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              <div style={{ display: "flex", gap: "12px" }}>
                                {canEditAssets && (
                                  <button
                                    className="table-btn"
                                    style={{ color: "#1769e0" }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEdit(asset);
                                    }}
                                    title="Edit"
                                  >
                                    Edit
                                  </button>
                                )}

                                {canIssueReceive && (
                                  <button
                                    className="table-btn"
                                    style={{ color: "#ff8c00" }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openIssue(asset);
                                    }}
                                    title="Issue to user"
                                  >
                                    Issue
                                  </button>
                                )}

                                <button
                                  className="table-btn"
                                  style={{
                                    color: canIssueReceive ? "#2db56c" : "#9aa4b5",
                                    opacity: canIssueReceive ? 1 : 0.45,
                                    cursor: canIssueReceive ? "pointer" : "not-allowed",
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!canIssueReceive) return;
                                    openReceive(asset);
                                  }}
                                  title={canIssueReceive ? "Receive" : "Not allowed (ICT/Admin only)"}
                                  disabled={!canIssueReceive}
                                >
                                  Receive
                                </button>
                              </div>

                              <div style={{ display: "flex", gap: "10px" }}>
                                {canCreateDeleteAssets && (
                                  <button
                                    className="table-btn"
                                    style={{ color: "#d93025" }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveAsset(asset);
                                    }}
                                    title="Delete asset"
                                  >
                                    Delete
                                  </button>
                                )}

                                {isAdmin && (
                                  <button
                                    className="table-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMarkForDisposal(asset.id);
                                    }}
                                    title="Mark for disposal"
                                  >
                                    Mark: Disposal
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredAssets.length === 0 && (
                      <tr>
                        <td colSpan={11} style={{ opacity: 0.7, padding: "1rem" }}>
                          {search ? (
                            <>No assets match your search.</>
                          ) : (
                            <>
                              No assets yet. Click <strong>+ Add Asset</strong> to create one.
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Reports */}
          {activeTab === "Reports" && (
            <>
              <h2>Reports</h2>
              <p>Starter summaries. We’ll add charts/exports as needed.</p>

              <div className="cards" style={{ marginTop: 12 }}>
                <div className="card">
                  <h3>Assets by Type</h3>
                  <table className="asset-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Count</th>
                        <th>Bar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byType.map(([type, count]) => (
                        <tr key={type}>
                          <td>{type}</td>
                          <td>{count}</td>
                          <td>
                            <div style={{ background: "#eee", height: 8, borderRadius: 6 }}>
                              <div
                                style={{
                                  width: `${(count / Math.max(1, total)) * 100}%`,
                                  height: 8,
                                  borderRadius: 6,
                                  background: "#1769e0",
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="card">
                  <h3>Assets by Location</h3>
                  <table className="asset-table">
                    <thead>
                      <tr>
                        <th>Location</th>
                        <th>Count</th>
                        <th>Bar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byLocation.map(([loc, count]) => (
                        <tr key={loc}>
                          <td>{loc}</td>
                          <td>{count}</td>
                          <td>
                            <div style={{ background: "#eee", height: 8, borderRadius: 6 }}>
                              <div
                                style={{
                                  width: `${(count / Math.max(1, total)) * 100}%`,
                                  height: 8,
                                  borderRadius: 6,
                                  background: "#2db56c",
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="card">
                  <h3>Status Breakdown</h3>
                  <table className="asset-table">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Count</th>
                        <th>Bar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byStatus.map(([st, count]) => (
                        <tr key={st}>
                          <td>{st}</td>
                          <td>{count}</td>
                          <td>
                            <div style={{ background: "#eee", height: 8, borderRadius: 6 }}>
                              <div
                                style={{
                                  width: `${(count / Math.max(1, total)) * 100}%`,
                                  height: 8,
                                  borderRadius: 6,
                                  background: "#ff8c00",
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="card">
                  <h3>Monthly Acquisitions (by Purchase Date)</h3>
                  <table className="asset-table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Count</th>
                        <th>Bar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byMonth.map(([label, count]) => (
                        <tr key={label}>
                          <td>{label}</td>
                          <td>{count}</td>
                          <td>
                            <div style={{ background: "#eee", height: 8, borderRadius: 6 }}>
                              <div
                                style={{
                                  width: `${(count / Math.max(1, total)) * 100}%`,
                                  height: 8,
                                  borderRadius: 6,
                                  background: "#6b5b95",
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </ErrorBoundary>
      </main>

      {/* Asset details + history modal */}
      {showAssetModal && selectedAsset && (
        <div className="modal-backdrop" onClick={closeAssetModal}>
          <div className="modal asset-modal" onClick={(e) => e.stopPropagation()}>
            <div className="asset-modal-header">
              <div>
                <h3>Asset Details</h3>
                <p className="asset-modal-sub">
                  {selectedAsset.id} • {selectedAsset.description || "No description"}
                </p>
              </div>
              <button type="button" className="modal-close-btn" onClick={closeAssetModal}>
                ✕
              </button>
            </div>

            <div className="asset-modal-body">
              <div className="asset-modal-section">
                <h4>Core Information</h4>
                <div className="asset-meta-grid">
                  <div className="meta-item">
                    <span className="meta-label">User / Owner</span>
                    <span className="meta-value">{selectedAsset.user || "—"}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Department</span>
                    <span className="meta-value">{selectedAsset.department || "—"}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Location</span>
                    <span className="meta-value">{selectedAsset.location || "—"}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Status</span>
                    <span className="meta-value status-chip">{selectedAsset.status || "—"}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Serial Number</span>
                    <span className="meta-value">{selectedAsset.serial || "—"}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Purchase Date</span>
                    <span className="meta-value">{selectedAsset.purchaseDate || "—"}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Asset Type</span>
                    <span className="meta-value">{selectedAsset.type || "—"}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Value (ZAR)</span>
                    <span className="meta-value">{fmtZAR(selectedAsset.value)}</span>
                  </div>
                </div>

                <div className="meta-notes-block">
                  <span className="meta-label">Notes / Condition</span>
                  <p className="meta-notes">{selectedAsset.notes || "—"}</p>
                </div>
              </div>

              <div className="asset-modal-section">
                <h4>Asset History</h4>

                {eventsError && <div className="history-error">{eventsError}</div>}

                {eventsLoading ? (
                  <div className="history-loading">Loading history…</div>
                ) : assetEvents.length === 0 ? (
                  <div className="history-empty">No history yet for this asset.</div>
                ) : (
                  <ul className="history-list">
                    {assetEvents.map((ev) => (
                      <li key={ev.id} className="history-item">
                        <div className="history-dot" />
                        <div className="history-content">
                          <div className="history-row">
                            <span className="history-type">{ev.event_type}</span>
                            <span className="history-date">
                              {ev.timestamp ? new Date(ev.timestamp).toLocaleString("en-ZA") : "—"}
                            </span>
                          </div>
                          <div className="history-details">{ev.details || "No details captured."}</div>
                          <div className="history-meta-line">
                            {ev.actor && <span className="history-meta">By: {ev.actor}</span>}
                            {(ev.from_status || ev.to_status) && (
                              <span className="history-meta">
                                {ev.from_status || "—"} → {ev.to_status || "—"}
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="asset-modal-footer">
              <button type="button" className="secondary-btn" onClick={closeAssetModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="modal-backdrop" onClick={() => setShowSettingsModal(false)}>
          <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h3>Settings</h3>
              <button type="button" className="modal-close-btn" onClick={() => setShowSettingsModal(false)}>
                ✕
              </button>
            </div>

            <div className="settings-tabs">
              <button
                className={`settings-tab-btn ${settingsTab === "GENERAL" ? "active" : ""}`}
                onClick={() => setSettingsTab("GENERAL")}
              >
                General
              </button>
              <button
                className={`settings-tab-btn ${settingsTab === "DATA" ? "active" : ""}`}
                onClick={() => setSettingsTab("DATA")}
              >
                Data & Import/Export
              </button>
              {isAdmin && (
                <button
                  className={`settings-tab-btn ${settingsTab === "USERS" ? "active" : ""}`}
                  onClick={() => setSettingsTab("USERS")}
                >
                  User Management
                </button>
              )}
            </div>

            <div className="settings-modal-body">
              {settingsTab === "GENERAL" && (
                <section className="settings-section">
                  <h4>Appearance</h4>
                  <p className="settings-help">Choose how Asset Desk looks on your screen.</p>

                  <button className="settings-primary-btn" onClick={toggleTheme}>
                    {darkMode ? "☀️ Switch to Light Mode" : "🌙 Switch to Dark Mode"}
                  </button>

                  <div className="settings-note">Theme preference is saved in your browser for this device.</div>
                </section>
              )}

              {settingsTab === "DATA" && (
                <section className="settings-section">
                  <h4>Data & Import / Export</h4>
                  <p className="settings-help">
                    Export your current register or import updates from Excel / CSV.
                  </p>

                  <div className="settings-group-row">
                    <div>
                      <h5>Excel (.xlsx)</h5>
                      <p className="settings-mini">Use this if you work mainly in Excel.</p>

                      <div className="settings-buttons-row">
                        <button className="settings-secondary-btn" onClick={exportXLSX}>
                          ⬇️ Export Excel
                        </button>

                        <label className="settings-secondary-btn file-label">
                          ⬆️ Import Excel
                          <input
                            type="file"
                            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) importXLSX(f);
                              e.target.value = "";
                            }}
                            style={{ display: "none" }}
                          />
                        </label>

                        <button className="settings-secondary-btn" onClick={downloadXlsxTemplate}>
                          📄 Download Template
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="settings-group-row">
                    <div>
                      <h5>CSV</h5>
                      <p className="settings-mini">Simple format for other tools or scripts.</p>

                      <div className="settings-buttons-row">
                        <button className="settings-secondary-btn" onClick={exportCSV}>
                          ⬇️ Export CSV
                        </button>

                        <label className="settings-secondary-btn file-label">
                          ⬆️ Import CSV
                          <input
                            type="file"
                            accept=".csv,text/csv"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) importCSV(f);
                              e.target.value = "";
                            }}
                            style={{ display: "none" }}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {settingsTab === "USERS" && isAdmin && (
                <section className="settings-section">
                  <h4>User Management</h4>
                  <p className="settings-help">
                    Manage Asset Desk login accounts. Users are stored on the backend and used for login and
                    authorization.
                  </p>

                  {usersError && (
                    <div className="form-error" style={{ marginBottom: "0.75rem" }}>
                      {usersError}
                    </div>
                  )}

                  <div className="settings-group-row">
                    <div style={{ width: "100%" }}>
                      <div
                        className="settings-users-header"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <div>
                          <h5 style={{ margin: 0 }}>Existing Users</h5>
                          <p className="settings-mini">
                            Loaded from <code>/users</code> on the backend.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="settings-secondary-btn"
                          onClick={loadUsers}
                          disabled={usersLoading}
                        >
                          {usersLoading ? "Refreshing…" : "↻ Refresh"}
                        </button>
                      </div>

                      <div className="settings-users-table-wrap">
                        {usersLoading && users.length === 0 ? (
                          <div className="settings-mini">Loading users…</div>
                        ) : users.length === 0 ? (
                          <div className="settings-mini">
                            No users loaded yet. Click <strong>Refresh</strong> to fetch from the backend.
                          </div>
                        ) : (
                          <table className="asset-table users-table">
                            <thead>
                              <tr>
                                <th>Username</th>
                                <th>Full Name</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {users.map((u) => (
                                <tr key={u.id || u.username}>
                                  <td>{u.username}</td>
                                  <td>{u.full_name || "—"}</td>
                                  <td>{u.email || "—"}</td>
                                  <td>{u.role || "AssetDeskUser"}</td>
                                  <td>{u.is_active ? "Active" : "Disabled"}</td>
                                  <td>
                                    {u.is_active ? (
                                      <button
                                        type="button"
                                        className="table-btn"
                                        style={{ color: "#d93025" }}
                                        onClick={() => handleDisableUser(u)}
                                      >
                                        Disable
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className="table-btn"
                                        style={{ color: "#2db56c" }}
                                        onClick={() => handleEnableUser(u)}
                                      >
                                        Enable
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>

                  <hr className="settings-divider" style={{ margin: "1rem 0" }} />

                  <div className="settings-group-row">
                    <div style={{ width: "100%" }}>
                      <h5>Create New User</h5>
                      <p className="settings-mini">Creates a new login account for Asset Desk.</p>

                      <form
                        onSubmit={handleCreateUserSubmit}
                        className="asset-form user-form"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "0.75rem 1.25rem",
                          marginTop: "0.5rem",
                        }}
                      >
                        <div className="form-row">
                          <label htmlFor="new_username">Username *</label>
                          <input
                            id="new_username"
                            name="username"
                            value={newUser.username}
                            onChange={handleNewUserChange}
                            required
                            placeholder="e.g. ict.tech1"
                          />
                        </div>

                        <div className="form-row">
                          <label htmlFor="new_full_name">Full Name</label>
                          <input
                            id="new_full_name"
                            name="full_name"
                            value={newUser.full_name}
                            onChange={handleNewUserChange}
                            placeholder="e.g. Sindisa Maluleke"
                          />
                        </div>

                        <div className="form-row">
                          <label htmlFor="new_email">Email</label>
                          <input
                            id="new_email"
                            name="email"
                            type="email"
                            value={newUser.email}
                            onChange={handleNewUserChange}
                            placeholder="e.g. sindisa.maluleke@rsr.org.za"
                          />
                        </div>

                        <div className="form-row">
                          <label htmlFor="new_role">Role</label>
                          <select id="new_role" name="role" value={newUser.role} onChange={handleNewUserChange}>
                            <option value="AssetDeskUser">AssetDeskUser</option>
                            <option value="AssetDeskAdmin">AssetDeskAdmin</option>
                            <option value="ReadOnly">ReadOnly</option>
                          </select>
                        </div>

                        <div className="form-row">
                          <label htmlFor="new_password">Password *</label>
                          <input
                            id="new_password"
                            name="password"
                            type="password"
                            value={newUser.password}
                            onChange={handleNewUserChange}
                            required
                            placeholder="Temporary password"
                          />
                        </div>

                        <div className="form-row">
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              name="is_active"
                              checked={newUser.is_active}
                              onChange={handleNewUserChange}
                            />
                            <span style={{ marginLeft: 8 }}>Active account</span>
                          </label>
                        </div>

                        <div className="form-actions" style={{ gridColumn: "1 / -1", marginTop: "0.5rem" }}>
                          <button type="submit" className="primary-btn">
                            ➕ Create User
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </section>
              )}
            </div>

            <div className="settings-modal-footer">
              <button type="button" className="secondary-btn" onClick={() => setShowSettingsModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        © {new Date().getFullYear()} RSR Asset Desk v1.0 — Developed by <span> — </span>{" "}
        <strong className="author">Sindisa Maluleke</strong>.
      </footer>
    </div>
  );
}
