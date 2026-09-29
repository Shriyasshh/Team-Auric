"use client";

import { useEffect, useState, useRef } from "react";
import PatientConnectQr from "@/components/PatientConnectQr";
import { supabase } from "@/lib/supabaseClient";

type MedicalRecord = {
  id: string;
  record_type: string;
  description: string;
  created_at: string;
  patient_id: string;
  storage_path?: string;
  blockchain_status?: string;
  blockchain_tx_hash?: string;
  [key: string]: unknown;
};

export default function Dashboard() {
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyStatus, setVerifyStatus] = useState<Record<string, { status: string, message: string }>>({});
  const [verifying, setVerifying] = useState<Record<string, boolean>>({});
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const fetchAndSubscribe = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Initial fetch
      const { data, error } = await supabase
        .from("medical_records")
        .select("*")
        .eq("patient_id", user.id)
        .order("created_at", { ascending: false });

      if (data && !error) {
        setRecords(data);
      }
      setLoading(false);

      // Subscribe to live updates (new records from doctor, blockchain_status changes)
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }

      const channel = supabase
        .channel(`patient-records-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'medical_records',
            filter: `patient_id=eq.${user.id}`,
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setRecords(prev => {
                const exists = prev.some(r => r.id === (payload.new as MedicalRecord).id);
                if (exists) return prev;
                return [payload.new as MedicalRecord, ...prev];
              });
            } else if (payload.eventType === 'UPDATE') {
              setRecords(prev =>
                prev.map(r => r.id === (payload.new as MedicalRecord).id ? (payload.new as MedicalRecord) : r)
              );
            }
          }
        )
        .subscribe();

      realtimeChannelRef.current = channel;
    };

    fetchAndSubscribe();

    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
    };
  }, []);

  // Poll PENDING records every 5s as fallback for Realtime
  useEffect(() => {
    const hasPending = records.some(r => r.blockchain_status === 'PENDING');
    if (!hasPending) return;

    const pollTimer = setInterval(async () => {
      const pendingIds = records.filter(r => r.blockchain_status === 'PENDING').map(r => r.id);
      if (pendingIds.length === 0) { clearInterval(pollTimer); return; }

      const { data } = await supabase
        .from('medical_records')
        .select('id, blockchain_status, blockchain_tx_hash')
        .in('id', pendingIds);

      if (data) {
        setRecords(prev => prev.map(r => {
          const updated = data.find((d: {id: string}) => d.id === r.id);
          return updated ? { ...r, ...updated } : r;
        }));
      }
    }, 5000);

    return () => clearInterval(pollTimer);
  }, [records]);

  const handleDownload = async (recordId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/api/records/${recordId}/download`, {
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Download failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const disposition = response.headers.get('content-disposition');
      let filename = `medical_file_${recordId}`;
      if (disposition && disposition.indexOf('filename=') !== -1) {
        const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
        if (matches != null && matches[1]) {
          filename = matches[1].replace(/['"]/g, '');
        }
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: unknown) {
      const e = err as Error;
      alert(`Error downloading file: ${e.message}`);
    }
  };

  const handleVerify = async (recordId: string) => {
    try {
      setVerifying(prev => ({ ...prev, [recordId]: true }));
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/api/records/${recordId}/verify`, {
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      if (!response.ok) {
        throw new Error("Verification failed");
      }
      const data = await response.json();
      setVerifyStatus(prev => ({ ...prev, [recordId]: { status: data.status, message: data.message } }));
    } catch (err: unknown) {
      const e = err as Error;
      setVerifyStatus(prev => ({ ...prev, [recordId]: { status: "error", message: e.message } }));
    } finally {
      setVerifying(prev => ({ ...prev, [recordId]: false }));
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Patient Dashboard</h1>
        <div className="flex items-center gap-2 text-xs text-green-600 font-medium">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Live updates on
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* New Primary QR Workflow */}
        <PatientConnectQr />

        <div className="flex flex-col gap-6">
          <div className="p-6 border rounded-lg bg-card shadow-sm">
            <h2 className="text-lg font-semibold mb-4">My Records</h2>
            {loading ? (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            ) : records.length === 0 ? (
              <p className="text-sm text-slate-500">No records found.</p>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                {records.map(rec => (
                  <div key={rec.id} className="p-3 border rounded-md bg-slate-50">
                    <div className="flex justify-between items-start">
                      <h3 className="font-semibold text-sm">{rec.record_type}</h3>
                      <span className="text-xs text-slate-400">
                        {rec.created_at ? new Date(rec.created_at).toLocaleDateString() : ""}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 mt-1 mb-2 whitespace-pre-wrap">{rec.description}</p>
                    <div className="flex gap-2 mt-2">
                      {rec.storage_path && (
                        <button
                          onClick={() => handleDownload(rec.id)}
                          className="inline-block text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200 transition-colors"
                        >
                          Download File
                        </button>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="text-xs text-slate-600">
                          <span className="font-semibold">MST Status:</span>{" "}
                          <span className={`px-2 py-0.5 rounded-full font-medium ${
                            rec.blockchain_status === 'ANCHORED' ? 'bg-green-100 text-green-700' :
                            rec.blockchain_status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                            rec.blockchain_status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {rec.blockchain_status || 'UNKNOWN'}
                          </span>
                          {rec.blockchain_tx_hash && (
                            <div className="mt-1 font-mono text-[10px] break-all text-slate-500 max-w-[200px] sm:max-w-[300px]">
                              Tx: {rec.blockchain_tx_hash}
                            </div>
                          )}
                        </div>

                        {rec.blockchain_status === "ANCHORED" && (
                          <div className="flex items-center gap-2 mt-2 sm:mt-0">
                             {verifyStatus[rec.id] && (
                               <span className={`text-xs font-semibold ${
                                 verifyStatus[rec.id].status === 'verified' ? 'text-green-600' :
                                 verifyStatus[rec.id].status === 'mismatch' ? 'text-red-600' : 'text-orange-600'
                               }`}>
                                 {verifyStatus[rec.id].status === 'verified' ? '✅ Integrity Verified' :
                                  verifyStatus[rec.id].status === 'mismatch' ? '❌ Integrity Mismatch' :
                                  verifyStatus[rec.id].message}
                               </span>
                             )}
                             <button
                               onClick={() => handleVerify(rec.id)}
                               disabled={verifying[rec.id]}
                               className="inline-block text-xs bg-purple-100 text-purple-700 px-3 py-1.5 rounded hover:bg-purple-200 transition-colors disabled:opacity-50 font-medium whitespace-nowrap"
                             >
                               {verifying[rec.id] ? "Verifying..." : "Verify on MST"}
                             </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-6 border rounded-lg bg-card shadow-sm">
            <h2 className="text-lg font-semibold mb-2">Recent Audits</h2>
            <p className="text-sm text-slate-500 mt-4">No recent activity.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
