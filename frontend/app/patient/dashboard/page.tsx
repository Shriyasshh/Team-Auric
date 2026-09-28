import PatientConnectQr from "@/components/PatientConnectQr";

export default function Dashboard() {
  return (
    <div className="p-4 md:p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Patient Dashboard</h1>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* New Primary QR Workflow */}
        <PatientConnectQr />
        
        <div className="flex flex-col gap-6">
          <div className="p-6 border rounded-lg bg-card shadow-sm">
            <h2 className="text-lg font-semibold mb-2">My Records</h2>
            <p className="text-3xl font-bold">0</p>
            <p className="text-sm text-slate-500 mt-4">Records will appear here once uploaded.</p>
          </div>
          
          <div className="p-6 border rounded-lg bg-card shadow-sm">
            <h2 className="text-lg font-semibold mb-2">Recent Audits</h2>
            <p className="text-sm text-slate-500 mt-4">No recent activity.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
