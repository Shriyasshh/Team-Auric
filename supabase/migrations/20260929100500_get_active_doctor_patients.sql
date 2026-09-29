-- 20260929100500_get_active_doctor_patients.sql
-- Create RPC to get active claimed patients for the doctor dashboard

CREATE OR REPLACE FUNCTION public.get_active_doctor_patients()
RETURNS TABLE (
    patient_id UUID, 
    full_name TEXT, 
    claimed_at TIMESTAMPTZ, 
    session_expires_at TIMESTAMPTZ
) AS $$
BEGIN
    IF public.get_user_role() IS DISTINCT FROM 'DOCTOR' THEN
        RETURN;
    END IF;

    -- Return only the active sessions within the 2-hour care window
    RETURN QUERY
    SELECT p.id, p.full_name, q.claimed_at, (q.claimed_at + INTERVAL '2 hours') AS session_expires_at
    FROM public.profiles p
    JOIN public.qr_sessions q ON p.id = q.patient_id
    WHERE q.status = 'claimed' 
      AND q.claimed_by_doctor_id = auth.uid()
      AND q.claimed_at > NOW() - INTERVAL '2 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.get_active_doctor_patients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_doctor_patients() TO authenticated;
