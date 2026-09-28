"use client";

import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabaseClient";

export default function PatientConnectQr() {
  const [status, setStatus] = useState<"READY" | "GENERATING" | "ACTIVE" | "CLAIMED" | "EXPIRED" | "ERROR">("READY");
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("05:00");
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const generateQr = async () => {
    setStatus("GENERATING");
    try {
      const { data: newToken, error: rpcError } = await supabase.rpc("generate_qr_session");
      if (rpcError) throw rpcError;
      
      const { data: sessionData, error: selectError } = await supabase
        .from("qr_sessions")
        .select("*")
        .eq("token_id", newToken)
        .single();
        
      if (selectError) throw selectError;
      
      setToken(newToken);
      setExpiresAt(new Date(sessionData.expires_at));
      setStatus("ACTIVE");
      
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = setInterval(async () => {
        const { data } = await supabase
          .from("qr_sessions")
          .select("status")
          .eq("token_id", newToken)
          .single();
          
        if (data && data.status === "claimed") {
          setStatus("CLAIMED");
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        }
      }, 3000);
      
    } catch (error) {
      console.error(error);
      setStatus("ERROR");
    }
  };

  useEffect(() => {
    if (status !== "ACTIVE" || !expiresAt) return;
    
    const tick = () => {
      const now = new Date().getTime();
      const distance = expiresAt.getTime() - now;
      
      if (distance <= 0) {
        setStatus("EXPIRED");
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        return;
      }
      
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);
      setTimeLeft(
        `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      );
    };
    
    tick(); // initial call
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [status, expiresAt]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  return (
    <div className="p-6 border rounded-lg bg-card shadow-sm flex flex-col items-center justify-center text-center space-y-4">
      {status === "READY" && (
        <>
          <h2 className="text-xl font-semibold">Connect with Doctor</h2>
          <p className="text-sm text-slate-500">Generate a temporary QR code for a doctor to scan.</p>
          <button 
            onClick={generateQr}
            className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Generate Connect QR
          </button>
        </>
      )}

      {status === "GENERATING" && (
        <div className="flex flex-col items-center p-8 space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-slate-500">Generating secure connection...</p>
        </div>
      )}

      {status === "ACTIVE" && token && (
        <>
          <h2 className="text-xl font-semibold">Scan to Connect</h2>
          <p className="text-sm text-slate-500">Scan this QR with the doctor&apos;s MediVault account</p>
          <div className="p-4 bg-white rounded-xl shadow-inner border inline-block">
            <QRCodeSVG value={`medivault://connect?token=${token}`} size={200} />
          </div>
          <p className="font-mono text-lg font-medium text-red-500">Expires in {timeLeft}</p>
          <button 
            onClick={generateQr}
            className="mt-2 text-blue-600 text-sm hover:underline"
          >
            Generate New QR
          </button>
        </>
      )}

      {status === "CLAIMED" && (
        <div className="flex flex-col items-center space-y-4 py-6">
          <div className="h-16 w-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
          </div>
          <h2 className="text-xl font-semibold text-green-700">Doctor connected successfully</h2>
          <p className="text-sm text-slate-500">The 2-hour care session is now active.</p>
        </div>
      )}

      {status === "EXPIRED" && (
        <div className="flex flex-col items-center space-y-4 py-6">
          <div className="h-16 w-16 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
          <h2 className="text-xl font-semibold">This QR has expired</h2>
          <button 
            onClick={generateQr}
            className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Generate New QR
          </button>
        </div>
      )}

      {status === "ERROR" && (
        <div className="flex flex-col items-center space-y-4 py-6">
          <div className="h-16 w-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          </div>
          <h2 className="text-xl font-semibold text-red-700">Unable to generate QR</h2>
          <p className="text-sm text-slate-500">Please try again.</p>
          <button 
            onClick={generateQr}
            className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
