"use client";
import { useState, Suspense } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";

function RegisterForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("PATIENT");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!email || !password || !fullName) {
      setError("Please fill all fields.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          fullName: fullName,
          role: role
        }
      }
    });

    if (error) {
      setError(error.message);
      return;
    }

    if (data.session) {
      let finalTarget = role === "PATIENT" ? "/patient/dashboard" : "/doctor/dashboard";
      if (redirectUrl && redirectUrl.startsWith("/") && !redirectUrl.startsWith("//") && !redirectUrl.startsWith("/\\")) {
        finalTarget = redirectUrl;
      }
      router.push(finalTarget);
    } else {
      setSuccess(true);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <div className="w-full max-w-md p-8 space-y-6 bg-white border rounded-xl shadow-sm dark:bg-slate-950 dark:border-slate-800">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight">Create an account</h2>
          <p className="text-sm text-slate-500 mt-2">Join MediVault to securely manage medical records</p>
        </div>
        {success ? (
          <div className="p-4 bg-green-50 text-green-700 rounded-md border border-green-200">
            Account created. Please confirm your email, then sign in.
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleRegister}>
            {error && <div className="text-red-500 text-sm font-medium">{error}</div>}
            <div>
              <label className="text-sm font-medium leading-none">Full Name</label>
              <input 
                type="text" 
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent mt-1" 
                placeholder="John Doe" 
              />
            </div>
            <div>
              <label className="text-sm font-medium leading-none">Email</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent mt-1" 
                placeholder="name@example.com" 
              />
            </div>
            <div>
              <label className="text-sm font-medium leading-none">Password</label>
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent mt-1" 
              />
            </div>
            <div>
              <label className="text-sm font-medium leading-none">Role</label>
              <select 
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent mt-1 bg-white"
              >
                <option value="PATIENT">Patient</option>
                <option value="DOCTOR">Doctor</option>
              </select>
            </div>
            <button type="submit" className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-blue-600 text-white hover:bg-blue-700 h-10 py-2 px-4 w-full">
              Create Account
            </button>
          </form>
        )}
        <div className="text-center text-sm">
          Already have an account?{" "}
          <a href={redirectUrl ? `/login?redirect=${encodeURIComponent(redirectUrl)}` : "/login"} className="font-medium text-blue-600 hover:underline">
            Sign In
          </a>
        </div>
      </div>
    </div>
  );
}

export default function Register() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
