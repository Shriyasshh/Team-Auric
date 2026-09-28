-- 20260928173000_fix_qr_rls.sql
-- Fix Medical Records INSERT RLS conflict

-- 1. Create the SECURITY DEFINER helper function
CREATE OR REPLACE FUNCTION public.has_active_qr_session(target_patient_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    IF public.get_user_role() IS DISTINCT FROM 'DOCTOR' THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.qr_sessions
        WHERE patient_id = target_patient_id
          AND claimed_by_doctor_id = auth.uid()
          AND status = 'claimed'
          AND claimed_at > NOW() - INTERVAL '2 hours'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Revoke public execution and grant only to authenticated users
REVOKE EXECUTE ON FUNCTION public.has_active_qr_session(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_active_qr_session(UUID) TO authenticated;

-- 2. Update the medical_records INSERT RLS Policy
DROP POLICY IF EXISTS "Doctors can insert medical records during active session" ON public.medical_records;

CREATE POLICY "Doctors can insert medical records during active session" 
ON public.medical_records FOR INSERT 
WITH CHECK (
    public.get_user_role() = 'DOCTOR' AND
    created_by_doctor_id = auth.uid() AND
    public.has_active_qr_session(medical_records.patient_id)
);
