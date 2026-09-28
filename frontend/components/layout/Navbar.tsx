import AuthButton from "@/components/AuthButton";

export default function Navbar() {
  return (
    <nav className="border-b bg-white dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white font-bold">
              M
            </div>
            <span className="font-bold text-xl tracking-tight">MediVault</span>
          </div>
          <div className="flex items-center gap-4">
            <AuthButton />
            <button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors">
              Connect Wallet
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
