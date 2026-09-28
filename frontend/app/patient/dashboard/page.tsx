export default function Dashboard() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Patient Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 border rounded-lg bg-card shadow-sm">
          <h2 className="text-lg font-semibold mb-2">My Records</h2>
          <p className="text-3xl font-bold">0</p>
          <a href="/patient/records" className="text-blue-500 text-sm mt-4 inline-block hover:underline">View all records &rarr;</a>
        </div>
        <div className="p-6 border rounded-lg bg-card shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Pending Requests</h2>
          <p className="text-3xl font-bold">0</p>
          <a href="/patient/access" className="text-blue-500 text-sm mt-4 inline-block hover:underline">Manage access &rarr;</a>
        </div>
        <div className="p-6 border rounded-lg bg-card shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Recent Audits</h2>
          <p className="text-sm text-slate-500">No recent activity.</p>
          <a href="/patient/audit" className="text-blue-500 text-sm mt-4 inline-block hover:underline">View audit log &rarr;</a>
        </div>
      </div>
    </div>
  );
}
