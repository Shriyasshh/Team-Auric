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
  [key: string]: unknown;
};

export default function DoctorDashboard() {
  const [activePatientId, setActivePatientId] = useState<string | null>(null);
  const [activePatientName, setActivePatientName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [recordType, setRecordType] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [records, setRecords] = useState<MedicalRecord[]>([]);

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

  useEffect(() => {
    // 1. Get the patient context from sessionStorage
    const pId = sessionStorage.getItem("active_patient_id");
    const pName = sessionStorage.getItem("active_patient_name");

    if (pId && pName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActivePatientId(pId);
      setActivePatientName(pName);
      fetchRecentRecords();
    }
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

      setSuccessMsg("Medical record successfully created.");
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
        <div className="p-6 border rounded-lg bg-card shadow-sm text-center">
          <p className="text-slate-500">Scan a patient&apos;s QR code to begin a 2-hour care session.</p>
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
                      {rec.patient_id === activePatientId && (
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
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
