import { useState } from "react";
import { api } from "../services/api";

function AssetForm({ onCreated }) {
  const [form, setForm] = useState({
    asset_tag: "",
    name: "",
    category: "",
    location: "",
  });

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await api.post("/assets/", form);
    setForm({ asset_tag: "", name: "", category: "", location: "" });
    onCreated && onCreated();
  };

  return (
    <div className="bg-white rounded shadow p-3">
      <h2 className="font-semibold mb-2 text-sm">Add Asset</h2>
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          name="asset_tag"
          value={form.asset_tag}
          onChange={handleChange}
          required
          placeholder="Asset tag"
          className="w-full border rounded px-2 py-1 text-sm"
        />
        <input
          name="name"
          value={form.name}
          onChange={handleChange}
          required
          placeholder="Asset name"
          className="w-full border rounded px-2 py-1 text-sm"
        />
        <input
          name="category"
          value={form.category}
          onChange={handleChange}
          placeholder="Category"
          className="w-full border rounded px-2 py-1 text-sm"
        />
        <input
          name="location"
          value={form.location}
          onChange={handleChange}
          placeholder="Location"
          className="w-full border rounded px-2 py-1 text-sm"
        />
        <button
          type="submit"
          className="bg-indigo-600 text-white text-sm px-3 py-1 rounded w-full"
        >
          Save
        </button>
      </form>
    </div>
  );
}

export default AssetForm;
