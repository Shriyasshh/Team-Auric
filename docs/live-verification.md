# Phase 3 Live Integration Verification

## Test Setup
To verify the Phase 3 security rules against the actual live Supabase project, I created a temporary Node.js script (`frontend/live-verification.ts`). 
It connects directly to the live project using `@supabase/supabase-js` and the provided environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`).

It provisions temporary test users (`patienta_test_*@gmail.com`, `doctora_test_*@gmail.com`, etc.) using the Supabase Admin API to bypass public signup rate limits and automatically confirm emails. It then generates valid Auth sessions by signing in via the public API, and executes database queries as those specific users to assert RLS behaviors.

## Exact Commands
```bash
# Executed from the frontend directory
npx tsx live-verification.ts
```

## Actual Results

```text
--- STARTING LIVE VERIFICATION ---
[PASS] Patient registration creates exactly one auth.users and profiles row with PATIENT role.
[PASS] Doctor registration creates exactly one auth.users and profiles row with DOCTOR role.
[PASS] Public ADMIN signup successfully defaults to PATIENT.
[PASS] Manually assigned ADMIN role works.
[PASS] Patient A can access own data.
[PASS] Patient B cannot access Patient A's private data.
[PASS] Unauthorized doctor cannot access a patient record.
[PASS] Authorized doctor can access the permitted record.
[PASS] Doctor can no longer access record after permission revoked.
[PASS] Doctor cannot call search_doctors successfully (returns empty).
[PASS] Patient cannot call search_patients successfully (returns empty).
[PASS] Doctor can successfully call search_patients and find patients.
[PASS] Patient can successfully call search_doctors and find doctors.
[FAIL] Anon search - Request succeeded anonymously. Data: [{"id":"64b274e1-ede3-439f-a76e-96416fa53c42","full_name":"Patient A"},{"id":"52136320-2097-46ac-bec3-09aa839b8937","full_name":"Patient B"}]
Cleanup performed successfully.
```

## Failure Analysis & Fix
**Failure:** The anonymous search test `[FAIL] Anon search` occurred because of how PostgreSQL handles `NULL` in `IF` statements. 

When an anonymous user calls `public.search_patients()`, the `public.get_user_role()` function returns `NULL` because there is no matching profile for an unauthenticated user. 
The condition `IF NULL != 'DOCTOR'` evaluates to `NULL` (which is falsy in SQL), causing it to completely bypass the `RETURN;` block and execute the search!

**Resolution:** I have created a new, forward migration `supabase/migrations/20260928165148_fix_search_anon.sql` to properly use a null-safe comparator (`IS DISTINCT FROM`) for these functions without modifying the old migration. 

*(**Note:** This migration could not be applied automatically because the local CLI lacks the database password and is not linked via `supabase link`. The test will continue to fail until this new SQL migration is manually executed in the Supabase Dashboard SQL Editor).*

## Cleanup Performed
The test script safely deleted all test users (`Patient A`, `Patient B`, `Doctor A`, `Admin`) from the live `auth.users` database using the Admin API at the end of the test run, which cascaded and deleted all related `profiles` and `medical_records`.
