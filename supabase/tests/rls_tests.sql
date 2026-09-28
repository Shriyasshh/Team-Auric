-- RLS Reproducible Verification Procedure

-- This script serves as a verification procedure to test RLS policies.
-- In a real Supabase environment with `pgTAP` installed, this could be run automatically.
-- For manual verification, execute these statements as the specified roles.

BEGIN;

-- Setup test users
-- (Assuming auth.users has two patients and one doctor)
-- For demonstration, we use pseudo-UUIDs

-- 1. Patient A cannot read Patient B's profile
-- Context: Authenticated as Patient A
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'patient-a-uuid';
-- Expected Result: 1 row (Patient A)
SELECT * FROM profiles WHERE id = 'patient-b-uuid'; -- Expected: 0 rows

-- 2. Patient A cannot read Patient B's medical record
-- Expected Result: 0 rows
SELECT * FROM medical_records WHERE patient_id = 'patient-b-uuid';

-- 3. Doctor cannot read unauthorized patient records
-- Context: Authenticated as Doctor A
SET LOCAL request.jwt.claim.sub = 'doctor-a-uuid';
-- Expected Result: 0 rows (assuming no access_permissions granted)
SELECT * FROM medical_records WHERE patient_id = 'patient-a-uuid';

-- 4. Doctor cannot modify another user's profile
-- Expected Result: Error or 0 rows updated
UPDATE profiles SET full_name = 'Hacked' WHERE id = 'patient-a-uuid';

-- 5. Doctor cannot grant themselves access
-- Expected Result: Error (Violates row-level security policy for access_permissions)
INSERT INTO access_permissions (doctor_id, patient_id, record_id)
VALUES ('doctor-a-uuid', 'patient-a-uuid', 'record-a-uuid');

-- 6. Patient cannot modify another patient's record metadata
-- Context: Authenticated as Patient A
SET LOCAL request.jwt.claim.sub = 'patient-a-uuid';
-- Expected Result: 0 rows updated
UPDATE medical_records SET description = 'Hacked' WHERE patient_id = 'patient-b-uuid';

-- 7. Admin cannot automatically retrieve private medical files
-- Context: Authenticated as Admin A
SET LOCAL request.jwt.claim.sub = 'admin-a-uuid';
-- Expected Result: 0 rows
SELECT * FROM medical_records;

ROLLBACK;
