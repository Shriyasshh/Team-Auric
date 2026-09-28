-- Phase 3 Security Fixes Migration

-- 1. FIX: get_user_role() SECURITY DEFINER
-- Added `SET search_path = ''` and schema-qualified `public.profiles`.
-- Restricted EXECUTE to `authenticated`.

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role FROM public.profiles WHERE id = auth.uid();
    RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;


-- 2. FIX: ATOMIC PROFILE CREATION
-- Database trigger on auth.users to automatically create profile

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    role_val TEXT;
    name_val TEXT;
BEGIN
    -- Extract and validate role from raw_user_meta_data
    role_val := UPPER(NEW.raw_user_meta_data->>'role');
    IF role_val NOT IN ('PATIENT', 'DOCTOR') THEN
        role_val := 'PATIENT'; -- Default fallback (ADMIN must be manually provisioned)
    END IF;

    -- Extract full_name
    name_val := NEW.raw_user_meta_data->>'fullName';
    IF name_val IS NULL OR name_val = '' THEN
        name_val := 'Unknown';
    END IF;

    INSERT INTO public.profiles (id, full_name, role)
    VALUES (NEW.id, name_val, role_val);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 3. FIX: PROFILE VISIBILITY (RLS)
-- Drop the overly broad policies
DROP POLICY IF EXISTS "Doctors can view patient profiles" ON public.profiles;
DROP POLICY IF EXISTS "Patients can view doctor profiles" ON public.profiles;

-- Create safe directory search functions for finding IDs and names
CREATE OR REPLACE FUNCTION public.search_doctors(search_term TEXT)
RETURNS TABLE (id UUID, full_name TEXT) AS $$
BEGIN
    IF public.get_user_role() != 'PATIENT' THEN
        RETURN;
    END IF;

    RETURN QUERY 
    SELECT p.id, p.full_name 
    FROM public.profiles p 
    WHERE p.role = 'DOCTOR' 
      AND p.full_name ILIKE '%' || search_term || '%';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.search_doctors(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_doctors(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_patients(search_term TEXT)
RETURNS TABLE (id UUID, full_name TEXT) AS $$
BEGIN
    IF public.get_user_role() != 'DOCTOR' THEN
        RETURN;
    END IF;

    RETURN QUERY 
    SELECT p.id, p.full_name 
    FROM public.profiles p 
    WHERE p.role = 'PATIENT' 
      AND p.full_name ILIKE '%' || search_term || '%';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.search_patients(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_patients(TEXT) TO authenticated;

-- Update RLS so Doctors can only select full profiles of Patients they interact with
DROP POLICY IF EXISTS "Doctors can view interacting patient profiles" ON public.profiles;
CREATE POLICY "Doctors can view interacting patient profiles" ON public.profiles
    FOR SELECT USING (
        public.get_user_role() = 'DOCTOR' AND role = 'PATIENT' AND (
            EXISTS (SELECT 1 FROM public.access_requests WHERE doctor_id = auth.uid() AND patient_id = profiles.id) OR
            EXISTS (SELECT 1 FROM public.access_permissions WHERE doctor_id = auth.uid() AND patient_id = profiles.id)
        )
    );

-- Update RLS so Patients can only select full profiles of Doctors they interact with
DROP POLICY IF EXISTS "Patients can view interacting doctor profiles" ON public.profiles;
CREATE POLICY "Patients can view interacting doctor profiles" ON public.profiles
    FOR SELECT USING (
        public.get_user_role() = 'PATIENT' AND role = 'DOCTOR' AND (
            EXISTS (SELECT 1 FROM public.access_requests WHERE patient_id = auth.uid() AND doctor_id = profiles.id) OR
            EXISTS (SELECT 1 FROM public.access_permissions WHERE patient_id = auth.uid() AND doctor_id = profiles.id)
        )
    );

