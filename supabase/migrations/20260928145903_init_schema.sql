-- MediVault Schema Migration

-- Enable pgcrypto for UUIDs if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Profiles Table
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('PATIENT', 'DOCTOR', 'ADMIN')),
    wallet_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. Medical Records Table
CREATE TABLE medical_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    record_type TEXT NOT NULL,
    description TEXT,
    ipfs_hash TEXT,
    encryption_key_hash TEXT,
    blockchain_tx_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. Access Requests Table
CREATE TABLE access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    record_id UUID NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 4. Access Permissions Table
CREATE TABLE access_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    record_id UUID NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMPTZ,
    UNIQUE (doctor_id, record_id)
);

-- 5. Audit Logs Table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    target_record_id UUID REFERENCES medical_records(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Security Definer Function to get user role (avoids RLS recursion)
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role FROM profiles WHERE id = auth.uid();
    RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Users can view their own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Doctors can view patient profiles" ON profiles
    FOR SELECT USING (get_user_role() = 'DOCTOR' AND role = 'PATIENT');

CREATE POLICY "Patients can view doctor profiles" ON profiles
    FOR SELECT USING (get_user_role() = 'PATIENT' AND role = 'DOCTOR');

CREATE POLICY "Admins can view all profiles" ON profiles
    FOR SELECT USING (get_user_role() = 'ADMIN');

CREATE POLICY "Users can insert their own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Medical Records Policies
CREATE POLICY "Patients can view own records" ON medical_records
    FOR SELECT USING (patient_id = auth.uid());

CREATE POLICY "Doctors can view authorized records" ON medical_records
    FOR SELECT USING (
        get_user_role() = 'DOCTOR' AND 
        EXISTS (
            SELECT 1 FROM access_permissions 
            WHERE doctor_id = auth.uid() 
            AND record_id = medical_records.id 
            AND (expires_at IS NULL OR expires_at > NOW())
        )
    );

CREATE POLICY "Patients can insert own records" ON medical_records
    FOR INSERT WITH CHECK (patient_id = auth.uid());

CREATE POLICY "Patients can update own records" ON medical_records
    FOR UPDATE USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());

CREATE POLICY "Patients can delete own records" ON medical_records
    FOR DELETE USING (patient_id = auth.uid());

-- Access Requests Policies
CREATE POLICY "Doctors can view their requests" ON access_requests
    FOR SELECT USING (doctor_id = auth.uid());

CREATE POLICY "Patients can view requests for their records" ON access_requests
    FOR SELECT USING (patient_id = auth.uid());

CREATE POLICY "Doctors can create requests" ON access_requests
    FOR INSERT WITH CHECK (doctor_id = auth.uid());

CREATE POLICY "Patients can update requests for their records" ON access_requests
    FOR UPDATE USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());

-- Access Permissions Policies
CREATE POLICY "Doctors can view their permissions" ON access_permissions
    FOR SELECT USING (doctor_id = auth.uid());

CREATE POLICY "Patients can view permissions for their records" ON access_permissions
    FOR SELECT USING (patient_id = auth.uid());

CREATE POLICY "Patients can insert permissions" ON access_permissions
    FOR INSERT WITH CHECK (patient_id = auth.uid());

CREATE POLICY "Patients can update permissions" ON access_permissions
    FOR UPDATE USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());

CREATE POLICY "Patients can delete permissions" ON access_permissions
    FOR DELETE USING (patient_id = auth.uid());

-- Audit Logs Policies
CREATE POLICY "Users can view their own audit logs" ON audit_logs
    FOR SELECT USING (actor_id = auth.uid());

CREATE POLICY "Patients can view logs for their records" ON audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM medical_records 
            WHERE id = audit_logs.target_record_id AND patient_id = auth.uid()
        )
    );

CREATE POLICY "Admins can view all logs" ON audit_logs
    FOR SELECT USING (get_user_role() = 'ADMIN');

CREATE POLICY "Users can insert their own logs" ON audit_logs
    FOR INSERT WITH CHECK (actor_id = auth.uid());
