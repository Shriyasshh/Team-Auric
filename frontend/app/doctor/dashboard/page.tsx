"use client";

import { useEffect, useState, useCallback } from "react";
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

export default function DoctorDashboard() {
  const [activePatientId, setActivePatientId] = useState<string | null>(null);
  const [activePatientName, setActivePatientName] = useState<string | null>(null);
  const [activePatients, setActivePatients] = useState<{patient_id: string, full_name: string, claimed_at: string, session_expires_at: string}[]>([]);
  const [now, setNow] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [recordType, setRecordType] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [verifyStatus, setVerifyStatus] = useState<Record<string, { status: string, message: string }>>({});
  const [verifying, setVerifying] = useState<Record<string, boolean>>({});

  const fetchRecentRecords = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("medical_records")
      .select("*")
      .eq("created_by_doctor_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (data && !error) {
      setRecords(data as MedicalRecord[]);
    }
  }, []);

  const fetchActivePatients = async () => {
    try {
      const { data, error } = await supabase.rpc("get_active_doctor_patients");
      if (!error && data) {
        setActivePatients(data as {patient_id: string, full_name: string, claimed_at: string, session_expires_at: string}[]);
      }
    } catch (err) {
      console.error("Failed to fetch active patients", err);
    }
  };

  const handleSelectActivePatient = (patientId: string, patientName: string) => {
    setActivePatientId(patientId);
    setActivePatientName(patientName);
    sessionStorage.setItem("active_patient_id", patientId);
    sessionStorage.setItem("active_patient_name", patientName);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date().getTime());
    const interval = setInterval(() => setNow(new Date().getTime()), 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // 1. Always fetch recent records, even if no patient is connected
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRecentRecords();

    // 2. Validate the patient context from sessionStorage securely
    const validateSession = async () => {
      const pId = sessionStorage.getItem("active_patient_id");
      const pName = sessionStorage.getItem("active_patient_name");

      if (pId && pName) {
        const { data, error } = await supabase.rpc("get_active_patient_context", { target_patient_id: pId });
        if (data && data.length > 0 && !error) {
          setActivePatientId(pId);
          setActivePatientName(pName);
        } else {
          // Stale or expired session, clear it
          sessionStorage.removeItem("active_patient_id");
          sessionStorage.removeItem("active_patient_name");
          setActivePatientId(null);
          setActivePatientName(null);
          fetchActivePatients();
        }
      } else {
        fetchActivePatients();
      }
    };

    validateSession();
  }, [fetchRecentRecords]);

  const handleDownload = async (recordId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/api/records/${recordId}/download`, {
        headers: { "Authorization": `Bearer ${session.access_token}` }
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

  const handleCreateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg("");
    setErrorMsg("");

    if (!recordType.trim() || !notes.trim()) {
      setErrorMsg("Both Record Type and Description are required.");
      return;
    }

    if (recordType.length > 100 || notes.length > 2000) {
      setErrorMsg("Record type or description too long.");
      return;
    }

    if (file) {
      const MAX_SIZE = 10 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        setErrorMsg("File too large. Maximum allowed size is 10MB.");
        return;
      }
      const allowed = ["application/pdf", "image/jpeg", "image/png", "text/plain"];
      if (!allowed.includes(file.type)) {
        setErrorMsg("File type not supported. Please use PDF, JPG, PNG, or TXT.");
        return;
      }
    }

    setLoading(true);

    try {
      const { data: { session }, error: authError } = await supabase.auth.getSession();

      if (authError || !session?.user) {
        throw new Error("You must be logged in.");
      }

      const user = session.user;

      const { data: insertData, error: insertError } = await supabase
        .from("medical_records")
        .insert({
          patient_id: activePatientId,
          created_by_doctor_id: user.id,
          record_type: recordType,
          description: notes
        })
        .select();

      if (insertError || !insertData) {
        throw insertError || new Error("Failed to create record");
      }

      const newRecordId = insertData[0].id;

      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const response = await fetch(`${apiUrl}/api/records/${newRecordId}/upload`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${session.access_token}` },
          body: formData
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || "Failed to encrypt and upload medical file.");
        }
      }

      // Anchor the record to blockchain
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const anchorRes = await fetch(`${apiUrl}/api/records/${newRecordId}/anchor`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${session.access_token}` },
      });
      if (!anchorRes.ok) {
        console.error("Failed to anchor on MST Testnet");
      }

      setSuccessMsg("Medical record successfully created and anchored to MST Testnet.");
      setRecordType("");
      setNotes("");
      setFile(null);

      fetchRecentRecords();

    } catch (err: unknown) {
      console.error("Insert error:", err);
      const e = err as Error;
      setErrorMsg(e.message || "Failed to create medical record.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div className="flex justify-between items-center border-b pb-4">
        <h1 className="text-3xl font-bold">Doctor Dashboard</h1>
      </div>

      {!activePatientId ? (
        <div className="space-y-6">
          <div className="p-6 border rounded-lg bg-card shadow-sm text-center">
            <h2 className="text-xl font-semibold mb-2">ACTIVE PATIENTS</h2>
            {activePatients.length === 0 ? (
              <>
                <p className="text-slate-500 mb-2">No active patient sessions.</p>
                <p className="text-sm text-slate-400">Scan a patient&apos;s QR code to start a care session.</p>
              </>
            ) : (
              <div className="space-y-3 mt-4 text-left">
                {activePatients.map(p => {
                  // eslint-disable-next-line react-hooks/purity
                  const currentT = now || new Date().getTime();
                  const remaining = Math.max(0, Math.floor((new Date(p.session_expires_at).getTime() - currentT) / 60000));
                  const hours = Math.floor(remaining / 60);
                  const mins = remaining % 60;
                  return (
                    <div key={p.patient_id} className="p-4 border border-blue-200 rounded-md flex justify-between items-center bg-blue-50 cursor-pointer hover:bg-blue-100 transition-colors" onClick={() => handleSelectActivePatient(p.patient_id, p.full_name)}>
                      <div>
                        <h3 className="font-semibold text-blue-900">{p.full_name}</h3>
                        <p className="text-xs text-blue-700">Connected</p>
                      </div>
                      <span className="px-3 py-1 bg-white text-blue-700 text-xs rounded-full font-medium shadow-sm border border-blue-100">
                        {hours}h {mins}m remaining
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="p-6 border border-blue-200 rounded-lg bg-blue-50 shadow-sm">
            <h2 className="text-xl font-semibold text-blue-900 mb-2">Connected Patient</h2>
            <p className="text-blue-800 text-lg font-medium">{activePatientName}</p>
            <p className="text-blue-600 text-sm mt-1">Care session is active. You can now securely enter medical records.</p>
          </div>

          <div className="p-6 border rounded-lg bg-white shadow-sm">
            <h2 className="text-xl font-semibold mb-4">Add Medical Record</h2>

            {successMsg && (
              <div className="mb-4 p-4 bg-green-50 text-green-700 border border-green-200 rounded-md">
                {successMsg}
              </div>
            )}

            {errorMsg && (
              <div className="mb-4 p-4 bg-red-50 text-red-700 border border-red-200 rounded-md">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreateRecord} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Record Type</label>
                <input
                  type="text"
                  value={recordType}
                  onChange={e => setRecordType(e.target.value)}
                  placeholder="e.g. Diagnosis, Prescription, Lab Result"
                  className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  maxLength={100}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description / Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Enter medical notes..."
                  className="w-full px-4 py-2 border rounded-md h-32 focus:ring-2 focus:ring-blue-600 focus:outline-none resize-none"
                  maxLength={2000}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Medical File (Optional)</label>
                <input
                  type="file"
                  onChange={e => setFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full px-4 py-2 border rounded-md focus:outline-none"
                  accept="application/pdf,image/jpeg,image/png,text/plain"
                />
                <p className="text-xs text-slate-500 mt-1">Supported formats: PDF, JPG, PNG, TXT. Max size: 10MB.</p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Saving..." : "Save Record"}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="p-6 border rounded-lg bg-white shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Your Recent Records</h2>
        {records.length === 0 ? (
          <p className="text-slate-500 text-sm">No records created by you.</p>
        ) : (
          <div className="space-y-4">
            {records.map(rec => (
              <div key={rec.id} className="p-4 border rounded-md bg-slate-50">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold">{rec.record_type}</h3>
                  <span className="text-xs text-slate-400">
                    {rec.created_at ? new Date(rec.created_at).toLocaleDateString() : "Just now"}
                  </span>
                </div>
                <p className="text-sm text-slate-700 mt-2 mb-3 whitespace-pre-wrap">{rec.description}</p>
                <div className="flex gap-2">
                  {rec.patient_id === activePatientId && activePatientId !== null && (
                    <span className="inline-block text-xs bg-green-100 text-green-700 px-2 py-1 rounded">For Connected Patient</span>
                  )}
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
    </div>
  );
}
