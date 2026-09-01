function Dashboard({ data }) {
  if (!data) return null;
  return (
    <div className="grid grid-cols-5 gap-3">
      <div className="bg-white rounded shadow p-3">
        <p className="text-sm text-slate-500">Total Assets</p>
        <p className="text-2xl font-bold">{data.total_assets}</p>
      </div>
      <div className="bg-white rounded shadow p-3">
        <p className="text-sm text-slate-500">Available</p>
        <p className="text-2xl font-bold text-emerald-600">{data.available}</p>
      </div>
      <div className="bg-white rounded shadow p-3">
        <p className="text-sm text-slate-500">Issued</p>
        <p className="text-2xl font-bold text-amber-600">{data.issued}</p>
      </div>
      <div className="bg-white rounded shadow p-3">
        <p className="text-sm text-slate-500">In Repair</p>
        <p className="text-2xl font-bold text-rose-600">{data.in_repair}</p>
      </div>
      <div className="bg-white rounded shadow p-3">
        <p className="text-sm text-slate-500">Disposed</p>
        <p className="text-2xl font-bold text-slate-700">{data.disposed}</p>
      </div>
    </div>
  );
}

export default Dashboard;
