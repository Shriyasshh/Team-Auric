# Security & Authorization Model

This document outlines the security architecture for MediVault, focusing on Supabase Authentication, Row Level Security (RLS), and route protection.

## Authentication Flow
1. Users register using Email/Password through Supabase Auth.
2. A database trigger (or frontend insertion) creates a corresponding `profiles` record linking the `auth.users(id)` to the profile's `id`.
3. The user's role (PATIENT, DOCTOR, ADMIN) is stored in the `profiles` table.
4. Next.js server-side middleware (`middleware.ts`) detects the user's session using `@supabase/ssr` cookies and enforces route boundaries.

## Route Protection (Next.js Middleware)
- `/login`, `/register`: Redirects authenticated users to their respective dashboards based on their role.
- `/patient/*`: Accessible ONLY to users with `role = 'PATIENT'`.
- `/doctor/*`: Accessible ONLY to users with `role = 'DOCTOR'`.
- `/admin/*`: Accessible ONLY to users with `role = 'ADMIN'`.
- Unauthenticated users attempting to access protected routes are redirected to `/login`.

## Row Level Security (RLS) Policies

All application tables have RLS enabled. Security is enforced at the database level, preventing unauthorized access even if the API or frontend is bypassed.

### `profiles`
- **SELECT**: Users can read their own profile. Doctors can only read profiles of Patients they are actively interacting with (via requests or permissions). Patients can only read profiles of Doctors they are actively interacting with. A separate `search_doctors` and `search_patients` SECURITY DEFINER function exists for directory lookups, returning ONLY `id` and `full_name`.
- **INSERT**: Handled strictly via a database trigger (`handle_new_user`) on `auth.users` creation.
- **UPDATE**: Users can only modify their own profile data (`auth.uid() = id`).
- **DELETE**: Users can only delete their own profile.

### `medical_records` (Metadata)
- **SELECT**: Patients can read their own records (`patient_id = auth.uid()`). Doctors can read records if an active `access_permissions` grant exists for them.
- **INSERT/UPDATE/DELETE**: Strictly restricted to the Patient who owns the record.

### `access_requests`
- **SELECT**: Requesting Doctors and target Patients can view requests.
- **INSERT**: Only Doctors can create requests.
- **UPDATE**: Only Patients can update the status of requests targeted at their records.

### `access_permissions`
- **SELECT**: Authorized Doctors and the granting Patient.
- **INSERT/UPDATE/DELETE**: Only the Patient can grant, extend, or revoke permissions.

### `audit_logs`
- **SELECT**: Patients can view logs related to their own records. Admins can view all logs.
- **INSERT**: Authenticated users can insert logs for actions they perform (`actor_id = auth.uid()`).

## RLS Negative Verification
We maintain reproducible verification procedures (e.g., `supabase/tests/rls_tests.sql`) to ensure:
1. Patient A cannot read Patient B's profile.
2. Patient A cannot read Patient B's medical record.
3. Doctor cannot read unauthorized patient records.
4. Doctor cannot modify another user's profile.
5. Doctor cannot grant themselves access.
6. Patient cannot modify another patient's record metadata.
7. Admin cannot automatically retrieve private medical files (metadata).
