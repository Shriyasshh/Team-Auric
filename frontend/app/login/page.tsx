"use client";
import { useState, Suspense } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const result = await supabase.auth.signInWithPassword({ email, password });
    const { data, error: authError } = result;
    
    if (authError) {
      setError(authError.message);
    } else {
      let finalTarget = data?.user?.user_metadata?.role === 'DOCTOR' ? "/doctor/dashboard" : "/patient/dashboard";
      if (redirectUrl && redirectUrl.startsWith("/") && !redirectUrl.startsWith("//") && !redirectUrl.startsWith("/\\")) {
        finalTarget = redirectUrl;
      }
      router.push(finalTarget);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <div className="w-full max-w-md p-8 space-y-6 bg-white border rounded-xl shadow-sm dark:bg-slate-950 dark:border-slate-800">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
          <p className="text-sm text-slate-500 mt-2">Enter your credentials to access your account</p>
        </div>
        <form className="space-y-4" onSubmit={handleLogin}>
          {error && <div className="text-red-500 text-sm font-medium">{error}</div>}
          <div>
            <label className="text-sm font-medium leading-none">Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
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
              onChange={e => setPassword(e.target.value)}
              className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent mt-1" 
            />
          </div>
          <button type="submit" className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-blue-600 text-white hover:bg-blue-700 h-10 py-2 px-4 w-full">
            Sign In
          </button>
        </form>
        <div className="text-center text-sm">
          Don&apos;t have an account?{" "}
          <a href={redirectUrl ? `/register?redirect=${encodeURIComponent(redirectUrl)}` : "/register"} className="font-medium text-blue-600 hover:underline">
            Register here
          </a>
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
