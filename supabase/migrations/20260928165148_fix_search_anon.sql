-- Fix search functions to properly block anonymous users by handling NULL role

CREATE OR REPLACE FUNCTION public.search_doctors(search_term TEXT)
RETURNS TABLE (id UUID, full_name TEXT) AS $$
BEGIN
    -- Fix: Use IS DISTINCT FROM to handle NULL if unauthenticated
    IF public.get_user_role() IS DISTINCT FROM 'PATIENT' THEN
        RETURN;
    END IF;

    RETURN QUERY 
    SELECT p.id, p.full_name 
    FROM public.profiles p 
    WHERE p.role = 'DOCTOR' 
      AND p.full_name ILIKE '%' || search_term || '%';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.search_patients(search_term TEXT)
RETURNS TABLE (id UUID, full_name TEXT) AS $$
BEGIN
    -- Fix: Use IS DISTINCT FROM to handle NULL if unauthenticated
    IF public.get_user_role() IS DISTINCT FROM 'DOCTOR' THEN
        RETURN;
    END IF;

    RETURN QUERY 
    SELECT p.id, p.full_name 
    FROM public.profiles p 
    WHERE p.role = 'PATIENT' 
      AND p.full_name ILIKE '%' || search_term || '%';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
