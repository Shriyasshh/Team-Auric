export default function VerifyRecord({ params }: { params: { record_id: string } }) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <div className="w-full max-w-lg p-8 space-y-6 bg-white border rounded-xl shadow-sm dark:bg-slate-950 dark:border-slate-800">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight">Record Verification</h2>
          <p className="text-sm text-slate-500 mt-2">Checking blockchain integrity for record: {params.record_id}</p>
        </div>
        <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-lg border flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
          <p className="font-medium">Querying MST Testnet...</p>
        </div>
      </div>
    </div>
  );
}
