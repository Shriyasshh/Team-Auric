export default function DoctorDashboard() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Doctor Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 border rounded-lg bg-card shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Patients</h2>
          <p className="text-3xl font-bold">0</p>
          <a href="/doctor/patients" className="text-blue-500 text-sm mt-4 inline-block hover:underline">Search patients &rarr;</a>
        </div>
        <div className="p-6 border rounded-lg bg-card shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Pending Requests</h2>
          <p className="text-3xl font-bold">0</p>
          <a href="/doctor/requests" className="text-blue-500 text-sm mt-4 inline-block hover:underline">View requests &rarr;</a>
        </div>
        <div className="p-6 border rounded-lg bg-card shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Authorized Records</h2>
          <p className="text-3xl font-bold">0</p>
          <a href="/doctor/records" className="text-blue-500 text-sm mt-4 inline-block hover:underline">View records &rarr;</a>
        </div>
      </div>
    </div>
  );
}
