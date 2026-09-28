-- 20260928170000_qr_redesign.sql
-- Phase 3 QR Redesign Migration

-- 1. DROP OBSOLETE POLICIES FIRST (Dependencies on access_requests/permissions)
-- Drop all existing policies on profiles and medical_records
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Doctors can view interacting patient profiles" ON public.profiles;
DROP POLICY IF EXISTS "Patients can view interacting doctor profiles" ON public.profiles;
DROP POLICY IF EXISTS "Doctors can view patient profiles" ON public.profiles;
DROP POLICY IF EXISTS "Patients can view doctor profiles" ON public.profiles;

DROP POLICY IF EXISTS "Patients can view own records" ON public.medical_records;
DROP POLICY IF EXISTS "Doctors can view authorized records" ON public.medical_records;
DROP POLICY IF EXISTS "Patients can insert own records" ON public.medical_records;
DROP POLICY IF EXISTS "Patients can update own records" ON public.medical_records;
DROP POLICY IF EXISTS "Patients can delete own records" ON public.medical_records;

-- 1b. DROP OBSOLETE FUNCTIONS & TABLES
DROP FUNCTION IF EXISTS public.search_doctors(TEXT);
DROP FUNCTION IF EXISTS public.search_patients(TEXT);
DROP TABLE IF EXISTS public.access_requests;
DROP TABLE IF EXISTS public.access_permissions;

-- 2. CREATE QR_SESSIONS TABLE
CREATE TABLE public.qr_sessions (
    token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '5 minutes',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed')),
    claimed_by_doctor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    claimed_at TIMESTAMPTZ
);

ALTER TABLE public.qr_sessions ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX qr_sessions_one_pending_per_patient
ON public.qr_sessions (patient_id)
WHERE status = 'pending';

-- 2b. PROFILES RLS
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
USING (id = auth.uid());

-- 3. UPDATE MEDICAL_RECORDS TABLE
ALTER TABLE public.medical_records
ADD COLUMN created_by_doctor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN blockchain_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (blockchain_status IN ('LEGACY', 'PENDING', 'ANCHORED', 'FAILED'));

UPDATE public.medical_records
SET blockchain_status = 'LEGACY'
WHERE created_by_doctor_id IS NULL;

-- 4. RLS POLICIES FOR QR_SESSIONS
CREATE POLICY "Patients can view own qr sessions" 
ON public.qr_sessions FOR SELECT 
USING (patient_id = auth.uid());


-- 5. RLS POLICIES FOR MEDICAL_RECORDS
CREATE POLICY "Patients can view own medical records" 
ON public.medical_records FOR SELECT 
USING (patient_id = auth.uid());

CREATE POLICY "Doctors can view created medical records" 
ON public.medical_records FOR SELECT 
USING (created_by_doctor_id = auth.uid());

CREATE POLICY "Doctors can insert medical records during active session" 
ON public.medical_records FOR INSERT 
WITH CHECK (
    public.get_user_role() = 'DOCTOR' AND
    created_by_doctor_id = auth.uid() AND
    EXISTS (
        SELECT 1 FROM public.qr_sessions
        WHERE qr_sessions.patient_id = medical_records.patient_id 
          AND qr_sessions.claimed_by_doctor_id = auth.uid() 
          AND qr_sessions.status = 'claimed' 
          AND qr_sessions.claimed_at > NOW() - INTERVAL '2 hours'
    )
);

-- Note: Patients don't insert records anymore; doctors do.
-- Legacy records will have created_by_doctor_id = NULL but can still be read by patients.

-- 6. QR SESSION RPCs

-- RPC: generate_qr_session
-- Expires any pending sessions for the patient, then creates a new one.
CREATE OR REPLACE FUNCTION public.generate_qr_session()
RETURNS UUID AS $$
DECLARE
    new_token UUID;
BEGIN
    IF public.get_user_role() IS DISTINCT FROM 'PATIENT' THEN
        RAISE EXCEPTION 'Only patients can generate QR sessions';
    END IF;

    PERFORM 1
    FROM public.profiles
    WHERE id = auth.uid()
    FOR UPDATE;

    -- Delete existing pending sessions for this patient to maintain the unique index
    DELETE FROM public.qr_sessions
    WHERE patient_id = auth.uid() AND status = 'pending';

    -- Create new session
    INSERT INTO public.qr_sessions (patient_id)
    VALUES (auth.uid())
    RETURNING token_id INTO new_token;

    RETURN new_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.generate_qr_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_qr_session() TO authenticated;

-- RPC: claim_qr_session
CREATE OR REPLACE FUNCTION public.claim_qr_session(token UUID)
RETURNS UUID AS $$
DECLARE
    target_patient_id UUID;
BEGIN
    IF public.get_user_role() IS DISTINCT FROM 'DOCTOR' THEN
        RAISE EXCEPTION 'Only doctors can claim QR sessions';
    END IF;

    UPDATE public.qr_sessions
    SET status = 'claimed', 
        claimed_by_doctor_id = auth.uid(), 
        claimed_at = NOW()
    WHERE token_id = token 
      AND status = 'pending' 
      AND expires_at > NOW()
    RETURNING patient_id INTO target_patient_id;
    
    IF target_patient_id IS NULL THEN
        RAISE EXCEPTION 'Invalid, expired, or already claimed token';
    END IF;
    
    RETURN target_patient_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.claim_qr_session(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_qr_session(UUID) TO authenticated;

-- 7. PATIENT/DOCTOR CONTEXT RPCs

-- RPC: get_active_patient_context
CREATE OR REPLACE FUNCTION public.get_active_patient_context(target_patient_id UUID)
RETURNS TABLE (id UUID, full_name TEXT) AS $$
BEGIN
    IF public.get_user_role() IS DISTINCT FROM 'DOCTOR' THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT p.id, p.full_name
    FROM public.profiles p
    WHERE p.id = target_patient_id
      AND p.role = 'PATIENT'
      AND EXISTS (
          SELECT 1 FROM public.qr_sessions
          WHERE qr_sessions.patient_id = p.id
            AND claimed_by_doctor_id = auth.uid()
            AND status = 'claimed'
            AND claimed_at > NOW() - INTERVAL '2 hours'
      );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.get_active_patient_context(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_patient_context(UUID) TO authenticated;

-- RPC: get_doctor_context
CREATE OR REPLACE FUNCTION public.get_doctor_context(target_doctor_id UUID)
RETURNS TABLE (id UUID, full_name TEXT) AS $$
BEGIN
    IF public.get_user_role() IS DISTINCT FROM 'PATIENT' THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT p.id, p.full_name
    FROM public.profiles p
    WHERE p.id = target_doctor_id
      AND p.role = 'DOCTOR'
      AND EXISTS (
          SELECT 1 FROM public.medical_records m
          WHERE m.created_by_doctor_id = p.id
            AND m.patient_id = auth.uid()
      );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.get_doctor_context(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_doctor_context(UUID) TO authenticated;
