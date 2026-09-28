-- ==============================================================================
-- PHASE 3 LIVE VERIFICATION TEST SCRIPT
-- Paste this entire script into the Supabase Dashboard SQL Editor and hit "Run".
-- Review the output pane for 'OK' or 'FAILED' messages.
-- ==============================================================================

DO $$
DECLARE
    patient_a_auth_id UUID := gen_random_uuid();
    patient_b_auth_id UUID := gen_random_uuid();
    doctor_a_auth_id UUID := gen_random_uuid();
    admin_auth_id UUID := gen_random_uuid();
    
    patient_a_record UUID;
    
    test_result RECORD;
    error_msg TEXT;
BEGIN
    RAISE NOTICE '--- STARTING LIVE VERIFICATION ---';

    -- 1-4. Test Patient Registration & Trigger
    INSERT INTO auth.users (id, email, raw_user_meta_data) 
    VALUES (patient_a_auth_id, 'patient_a@test.com', '{"role": "PATIENT", "fullName": "Test Patient A"}');
    
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = patient_a_auth_id AND role = 'PATIENT') THEN
        RAISE NOTICE 'Test 1-4 (Patient Creation): OK';
    ELSE
        RAISE EXCEPTION 'Test 1-4 (Patient Creation): FAILED';
    END IF;

    -- Second Patient for isolation tests
    INSERT INTO auth.users (id, email, raw_user_meta_data) 
    VALUES (patient_b_auth_id, 'patient_b@test.com', '{"role": "PATIENT", "fullName": "Test Patient B"}');

    -- 5-8. Test Doctor Registration & Trigger
    INSERT INTO auth.users (id, email, raw_user_meta_data) 
    VALUES (doctor_a_auth_id, 'doctor_a@test.com', '{"role": "DOCTOR", "fullName": "Test Doctor A"}');
    
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = doctor_a_auth_id AND role = 'DOCTOR') THEN
        RAISE NOTICE 'Test 5-8 (Doctor Creation): OK';
    ELSE
        RAISE EXCEPTION 'Test 5-8 (Doctor Creation): FAILED';
    END IF;

    -- 9. Verify ADMIN cannot be created through public signup (fallback to PATIENT)
    INSERT INTO auth.users (id, email, raw_user_meta_data) 
    VALUES (admin_auth_id, 'fake_admin@test.com', '{"role": "ADMIN", "fullName": "Fake Admin"}');
    
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = admin_auth_id AND role = 'PATIENT') THEN
        RAISE NOTICE 'Test 9 (Public ADMIN fallback): OK';
    ELSE
        RAISE EXCEPTION 'Test 9 (Public ADMIN fallback): FAILED';
    END IF;

    -- 10. Verify manually assigned ADMIN works
    UPDATE public.profiles SET role = 'ADMIN' WHERE id = admin_auth_id;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = admin_auth_id AND role = 'ADMIN') THEN
        RAISE NOTICE 'Test 10 (Manual ADMIN): OK';
    ELSE
        RAISE EXCEPTION 'Test 10 (Manual ADMIN): FAILED';
    END IF;

    -- Create a private record for Patient A
    INSERT INTO public.medical_records (patient_id, record_type) 
    VALUES (patient_a_auth_id, 'TEST_RECORD') RETURNING id INTO patient_a_record;

    -- 11. Test Patient A cannot access Patient B records
    -- Impersonate Patient B
    EXECUTE 'SET LOCAL role = authenticated';
    EXECUTE format('SET LOCAL request.jwt.claims = ''{"sub": "%s", "role": "authenticated"}''', patient_b_auth_id);
    
    IF EXISTS (SELECT 1 FROM public.medical_records WHERE id = patient_a_record) THEN
        RAISE EXCEPTION 'Test 11 (Patient Isolation): FAILED - Patient B saw Patient A record';
    ELSE
        RAISE NOTICE 'Test 11 (Patient Isolation): OK';
    END IF;

    -- 12. Test unauthorized Doctor cannot access patient record
    -- Impersonate Doctor A (no permissions granted yet)
    EXECUTE format('SET LOCAL request.jwt.claims = ''{"sub": "%s", "role": "authenticated"}''', doctor_a_auth_id);
    
    IF EXISTS (SELECT 1 FROM public.medical_records WHERE id = patient_a_record) THEN
        RAISE EXCEPTION 'Test 12 (Unauthorized Doctor): FAILED - Doctor saw unauthorized record';
    ELSE
        RAISE NOTICE 'Test 12 (Unauthorized Doctor): OK';
    END IF;

    -- 13. Test authorized Doctor can access record
    -- Grant permission as Postgres admin
    EXECUTE 'SET LOCAL role = postgres';
    INSERT INTO public.access_permissions (doctor_id, patient_id, record_id)
    VALUES (doctor_a_auth_id, patient_a_auth_id, patient_a_record);
    
    -- Impersonate Doctor A again
    EXECUTE 'SET LOCAL role = authenticated';
    EXECUTE format('SET LOCAL request.jwt.claims = ''{"sub": "%s", "role": "authenticated"}''', doctor_a_auth_id);
    
    IF EXISTS (SELECT 1 FROM public.medical_records WHERE id = patient_a_record) THEN
        RAISE NOTICE 'Test 13 (Authorized Doctor): OK';
    ELSE
        RAISE EXCEPTION 'Test 13 (Authorized Doctor): FAILED - Doctor could not see authorized record';
    END IF;

    -- 14. Test Patient/Doctor profile-search functions enforce their roles
    -- Still impersonating Doctor A
    BEGIN
        PERFORM * FROM public.search_doctors('Doctor');
        RAISE EXCEPTION 'Test 14 (Search Doctor by Doctor): FAILED - Doctor successfully searched doctors';
    EXCEPTION WHEN OTHERS THEN
        -- Expected, function silently returns nothing or fails? Wait, it returns nothing, so PERFORM succeeds but returns 0 rows.
        -- Let's check row count.
    END;
    IF (SELECT count(*) FROM public.search_doctors('Doctor')) = 0 THEN
        RAISE NOTICE 'Test 14a (Doctor calling search_doctors): OK (0 rows returned)';
    ELSE
        RAISE EXCEPTION 'Test 14a (Doctor calling search_doctors): FAILED - rows returned';
    END IF;

    IF (SELECT count(*) FROM public.search_patients('Patient A')) = 1 THEN
        RAISE NOTICE 'Test 14b (Doctor calling search_patients): OK (1 row returned)';
    ELSE
        RAISE EXCEPTION 'Test 14b (Doctor calling search_patients): FAILED';
    END IF;

    -- 15. Test anonymous users cannot execute those functions
    EXECUTE 'SET LOCAL role = anon';
    EXECUTE 'SET LOCAL request.jwt.claims = ''{"role": "anon"}''';
    BEGIN
        PERFORM * FROM public.search_patients('Patient');
        RAISE EXCEPTION 'Test 15 (Anon Search): FAILED - Anon executed function';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'Test 15 (Anon Search): OK (Permission denied)';
    END;

    -- 16-18 are implicitly tested above (get_user_role, handle_new_user, RLS active).

    -- Cleanup test data
    EXECUTE 'SET LOCAL role = postgres';
    DELETE FROM auth.users WHERE id IN (patient_a_auth_id, patient_b_auth_id, doctor_a_auth_id, admin_auth_id);
    
    RAISE NOTICE '--- ALL TESTS PASSED ---';
END $$;
