"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, usePathname } from "next/navigation";
import type { Session } from "@supabase/supabase-js";

export default function AuthButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (pathname === "/login" || pathname === "/register") {
    return null;
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    sessionStorage.removeItem("pending_qr_token");
    router.push("/login");
    router.refresh();
  };

  const handleLogin = () => {
    router.push("/login");
  };

  if (loading) {
    return <div className="h-9 w-14"></div>; // Placeholder to avoid layout shift
  }

  if (session) {
    return (
      <button
        onClick={handleLogout}
        className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
      >
        Logout
      </button>
    );
  }

  return (
    <button
      onClick={handleLogin}
      className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
    >
      Login
    </button>
  );
}
