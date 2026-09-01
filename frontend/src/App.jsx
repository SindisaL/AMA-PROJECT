import { useState, useEffect } from "react";
import { api } from "./services/api";
import AssetList from "./components/AssetList";
import AssetForm from "./components/AssetForm";
import IssuePanel from "./components/IssuePanel";
import Dashboard from "./components/Dashboard";

function App() {
  const [assets, setAssets] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [dashboard, setDashboard] = useState(null);

  const loadAssets = async () => {
    const res = await api.get("/assets/", { params: { search } });
    setAssets(res.data);
  };

  const loadDashboard = async () => {
    const res = await api.get("/dashboard/");
    setDashboard(res.data);
  };

  useEffect(() => {
    loadAssets();
    loadDashboard();
  }, [search]);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-indigo-600 text-white px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-semibold">Asset Management</h1>
        <input
          className="rounded px-3 py-1 text-black"
          placeholder="Search asset tag, serial, user..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </header>

      <main className="flex-1 p-6 grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <Dashboard data={dashboard} />
          <AssetList assets={assets} onSelect={(asset) => setSelectedAsset(asset)} />
        </div>
        <div className="space-y-4">
          <AssetForm onCreated={loadAssets} />
          {selectedAsset && (
            <IssuePanel
              asset={selectedAsset}
              onActionDone={() => {
                loadAssets();
                loadDashboard();
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
