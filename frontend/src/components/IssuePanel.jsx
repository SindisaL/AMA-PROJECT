import { useState } from "react";
import { api } from "../services/api";

function IssuePanel({ asset, onActionDone }) {
  const [toUser, setToUser] = useState("");
  const [toLocation, setToLocation] = useState("");
  const [conditionNotes, setConditionNotes] = useState("");

  const issue = async () => {
    await api.post("/transactions/", {
      asset_id: asset.id,
      tx_type: "ISSUE",
      to_user: toUser,
      to_location: toLocation,
      condition_notes: conditionNotes,
      performed_by: "ICT Officer",
    });
    onActionDone && onActionDone();
  };

  const receive = async () => {
    await api.post("/transactions/", {
      asset_id: asset.id,
      tx_type: "RECEIVE",
      to_location: "Store",
      condition_notes: "Returned",
      performed_by: "ICT Officer",
    });
    onActionDone && onActionDone();
  };

  const verify = async () => {
    await api.post("/transactions/", {
      asset_id: asset.id,
      tx_type: "VERIFY",
      performed_by: "ICT Officer",
    });
    onActionDone && onActionDone();
  };

  return (
    <div className="bg-white rounded shadow p-3">
      <h2 className="font-semibold text-sm mb-2">Actions for: {asset.asset_tag}</h2>
      <p className="text-xs text-slate-500 mb-2">{asset.name}</p>

      <div className="space-y-2 mb-3">
        <input
          value={toUser}
          onChange={(e) => setToUser(e.target.value)}
          placeholder="Issue to (name/email)"
          className="w-full border rounded px-2 py-1 text-sm"
        />
        <input
          value={toLocation}
          onChange={(e) => setToLocation(e.target.value)}
          placeholder="To location"
          className="w-full border rounded px-2 py-1 text-sm"
        />
        <textarea
          value={conditionNotes}
          onChange={(e) => setConditionNotes(e.target.value)}
          placeholder="Condition / notes"
          className="w-full border rounded px-2 py-1 text-sm"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={issue}
          className="bg-amber-500 text-white text-sm px-3 py-1 rounded"
        >
          Issue
        </button>
        <button
          onClick={receive}
          className="bg-emerald-500 text-white text-sm px-3 py-1 rounded"
        >
          Receive
        </button>
        <button
          onClick={verify}
          className="bg-slate-500 text-white text-sm px-3 py-1 rounded"
        >
          Verify
        </button>
      </div>
    </div>
  );
}

export default IssuePanel;
