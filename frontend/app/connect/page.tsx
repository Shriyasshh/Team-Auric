"use client";

import { useEffect, useState, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function ConnectFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlToken = searchParams.get("token");
  
  const [status, setStatus] = useState<"LOADING" | "ERROR" | "SUCCESS">("LOADING");
  const [errorMessage, setErrorMessage] = useState("");
  const [patientName, setPatientName] = useState("");
  const hasProcessed = useRef(false);

  useEffect(() => {
    const processConnection = async () => {
      if (hasProcessed.current) return;
      hasProcessed.current = true;

      try {
        // 1. Get token
        let token = urlToken;
        if (!token) {
          token = sessionStorage.getItem("pending_qr_token");
        }
        
        if (!token) {
          throw new Error("Connection QR is invalid or expired.");
        }

        // 2. Check Auth
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          // Not authenticated
          sessionStorage.setItem("pending_qr_token", token);
          router.push("/login?redirect=/connect");
          return;
        }

        // 3. Verify Role via public.profiles
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (profileError || profile?.role !== "DOCTOR") {
          throw new Error("Only authorized doctors can claim a connection.");
        }

        // 4. Claim QR Session
        const { data: patientId, error: claimError } = await supabase.rpc("claim_qr_session", { token });
        
        if (claimError || !patientId) {
          throw new Error("Connection QR is invalid or expired.");
        }

        // 5. Get Patient Context
        const { data: patientContext, error: contextError } = await supabase.rpc("get_active_patient_context", {
          target_patient_id: patientId
        });

        if (contextError || !patientContext || patientContext.length === 0) {
          throw new Error("Unable to retrieve patient context.");
        }

        // Success!
        sessionStorage.removeItem("pending_qr_token");
        sessionStorage.setItem("active_patient_id", patientId);
        sessionStorage.setItem("active_patient_name", patientContext[0].full_name);
        setPatientName(patientContext[0].full_name);
        setStatus("SUCCESS");

      } catch (err) {
        console.error(err);
        const e = err as Error;
        setErrorMessage(e.message || "Connection QR is invalid or expired.");
        setStatus("ERROR");
        sessionStorage.removeItem("pending_qr_token");
      }
    };

    processConnection();
  }, [urlToken, router]);

  if (status === "LOADING") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-slate-500">Establishing secure connection...</p>
        </div>
      </div>
    );
  }

  if (status === "ERROR") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-sm border border-slate-200 text-center space-y-6">
          <div className="h-16 w-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Connection Failed</h1>
          <p className="text-slate-500">{errorMessage}</p>
          <button onClick={() => router.push("/doctor/dashboard")} className="w-full bg-slate-900 text-white rounded-md py-2 px-4 hover:bg-slate-800 transition-colors">
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-sm border border-slate-200 text-center space-y-6">
        <div className="h-16 w-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Patient Connected</h1>
          <p className="text-lg font-medium text-blue-600 mt-2">{patientName}</p>
        </div>
        <div className="bg-slate-50 p-4 rounded-md border border-slate-100 text-sm text-slate-600">
          The 2-hour care session is now active. You have authorized access to view and manage this patient&apos;s medical records.
        </div>
        <button onClick={() => router.push("/doctor/dashboard")} className="w-full bg-blue-600 text-white rounded-md py-2 px-4 hover:bg-blue-700 transition-colors">
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}

export default function ConnectPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>}>
      <ConnectFlow />
    </Suspense>
  );
}
