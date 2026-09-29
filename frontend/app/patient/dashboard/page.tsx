"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    const fetchRecords = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("medical_records")
        .select("*")
        .eq("patient_id", user.id)
        .order("created_at", { ascending: false });

      if (data && !error) {
        setRecords(data);
      }
      setLoading(false);
    };

    fetchRecords();
  }, []);

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
      alert(`Status: ${data.status}\nMessage: ${data.message}\nTx Hash: ${data.tx_hash || 'N/A'}`);
    } catch (err: unknown) {
      const e = err as Error;
      alert(`Error verifying record: ${e.message}`);
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Patient Dashboard</h1>
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
                      {rec.blockchain_status === "ANCHORED" && (
                        <button
                          onClick={() => handleVerify(rec.id)}
                          className="inline-block text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded hover:bg-purple-200 transition-colors"
                        >
                          Verify Integrity
                        </button>
                      )}
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
