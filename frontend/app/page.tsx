export default function LandingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] text-center px-4">
      <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl text-slate-900 dark:text-slate-100 mb-6">
        Secure Medical Records <br className="hidden sm:block" />
        <span className="text-blue-600 dark:text-blue-400">Powered by MST Blockchain</span>
      </h1>
      <p className="max-w-2xl text-lg text-slate-600 dark:text-slate-300 mb-10">
        MediVault is a privacy-first platform that empowers patients to manage encrypted medical records and control access, all verified with tamper-proof blockchain technology.
      </p>
      <div className="flex gap-4">
        <a href="/login" className="px-8 py-3 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors">
          Patient Login
        </a>
        <a href="/login?role=doctor" className="px-8 py-3 text-sm font-medium text-blue-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800">
          Doctor Portal
        </a>
      </div>
    </div>
  );
}
