export default function DoctorDashboard() {
  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Doctor Dashboard</h1>
      </div>
      <div className="p-6 border rounded-lg bg-card shadow-sm text-center">
        <p className="text-slate-500">Scan a patient&apos;s QR code to begin a 2-hour care session.</p>
      </div>
    </div>
  );
}
