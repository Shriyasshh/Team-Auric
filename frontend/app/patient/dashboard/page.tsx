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
                    <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{rec.description}</p>
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
