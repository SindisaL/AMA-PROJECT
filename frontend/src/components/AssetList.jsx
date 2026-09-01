function AssetList({ assets, onSelect }) {
  return (
    <div className="bg-white rounded shadow">
      <div className="p-3 border-b flex justify-between items-center">
        <h2 className="font-semibold">Assets</h2>
        <span className="text-xs text-slate-500">{assets.length} items</span>
      </div>
      <ul className="divide-y max-h-[50vh] overflow-y-auto">
        {assets.map((asset) => (
          <li
            key={asset.id}
            className="p-3 hover:bg-slate-50 cursor-pointer"
            onClick={() => onSelect(asset)}
          >
            <div className="flex justify-between">
              <div>
                <p className="font-medium">
                  {asset.asset_tag} — {asset.name}
                </p>
                <p className="text-xs text-slate-500">
                  {asset.category || "Uncategorised"} • {asset.location || "No location"}
                </p>
              </div>
              <span
                className={
                  "text-xs px-2 py-1 rounded-full " +
                  (asset.status === "available"
                    ? "bg-emerald-100 text-emerald-700"
                    : asset.status === "issued"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-200 text-slate-700")
                }
              >
                {asset.status}
              </span>
            </div>
            {asset.current_holder && (
              <p className="text-xs text-slate-500 mt-1">
                Holder: {asset.current_holder}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default AssetList;
