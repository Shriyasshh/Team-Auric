# Database Schema & Data Model

This document outlines the Supabase database schema for MediVault, focusing on user identity, records metadata, access control, and auditing.

## 1. `profiles`
- **Purpose:** Store application-specific user information linked to Supabase Auth.
- **Primary Key:** `id` (uuid) - References `auth.users(id)`.
- **Foreign Keys:** None.
- **Relationships:** 1-to-1 with `auth.users`.
- **Important Fields:** 
  - `full_name` (text)
  - `role` (text/enum: PATIENT, DOCTOR, ADMIN)
  - `wallet_address` (text, nullable)
  - `created_at` (timestamp)
- **Constraints:** `id` must exist in `auth.users`.
- **Indexes:** None explicitly needed.
- **Who can read:** Authenticated users (Patients can see Doctors, Doctors can see Patients).
- **Who can insert:** Users can insert their own profile during registration.
- **Who can update:** Users can update their own profile.
- **Who can delete:** Users can delete their own profile.

## 2. `medical_records`
- **Purpose:** Store metadata for medical documents. (Actual files and encryption handled in later phases).
- **Primary Key:** `id` (uuid)
- **Foreign Keys:** `patient_id` (uuid) - References `profiles(id)`.
- **Relationships:** Belongs to a Patient.
- **Important Fields:**
  - `patient_id` (uuid)
  - `record_type` (text)
  - `description` (text)
  - `ipfs_hash` (text, nullable)
  - `encryption_key_hash` (text, nullable)
  - `blockchain_tx_hash` (text, nullable)
  - `created_at` (timestamp)
- **Constraints:** `patient_id` must exist.
- **Indexes:** `patient_id`.
- **Who can read:** The patient owner, and Doctors with an active `access_permissions` record.
- **Who can insert:** The patient owner.
- **Who can update:** The patient owner.
- **Who can delete:** The patient owner.

## 3. `access_requests`
- **Purpose:** Track doctor requests to access specific patient records.
- **Primary Key:** `id` (uuid)
- **Foreign Keys:** 
  - `doctor_id` (uuid) -> `profiles(id)`
  - `patient_id` (uuid) -> `profiles(id)`
  - `record_id` (uuid) -> `medical_records(id)`
- **Relationships:** Links a Doctor, a Patient, and a specific Medical Record.
- **Important Fields:**
  - `status` (text/enum: PENDING, APPROVED, REJECTED, REVOKED)
  - `created_at` (timestamp)
  - `updated_at` (timestamp)
- **Constraints:** None explicitly beyond FKs.
- **Indexes:** `doctor_id`, `patient_id`.
- **Who can read:** The requesting Doctor and the target Patient.
- **Who can insert:** Doctors.
- **Who can update:** Patients (to approve/reject/revoke).
- **Who can delete:** None (handled via status changes).

## 4. `access_permissions`
- **Purpose:** Track current, active access grants between a patient and a doctor for a record.
- **Primary Key:** `id` (uuid)
- **Foreign Keys:**
  - `doctor_id` (uuid) -> `profiles(id)`
  - `patient_id` (uuid) -> `profiles(id)`
  - `record_id` (uuid) -> `medical_records(id)`
- **Relationships:** Represents an active authorization.
- **Important Fields:**
  - `granted_at` (timestamp)
  - `expires_at` (timestamp, nullable)
- **Constraints:** Unique (`doctor_id`, `record_id`).
- **Indexes:** `doctor_id`, `record_id`.
- **Who can read:** The Doctor and the Patient.
- **Who can insert:** The Patient (upon approving a request).
- **Who can update:** The Patient (to modify expiry or revoke).
- **Who can delete:** The Patient (to revoke access).

## 5. `audit_logs`
- **Purpose:** Track application-level audit events (views, access changes).
- **Primary Key:** `id` (uuid)
- **Foreign Keys:**
  - `actor_id` (uuid) -> `profiles(id)`
  - `target_record_id` (uuid, nullable) -> `medical_records(id)`
- **Relationships:** Links an actor to an action and optionally a record.
- **Important Fields:**
  - `action` (text - e.g., 'RECORD_VIEWED', 'ACCESS_GRANTED')
  - `metadata` (jsonb)
  - `created_at` (timestamp)
- **Constraints:** None.
- **Indexes:** `actor_id`, `target_record_id`.
- **Who can read:** The Patient (for their records) and Admins.
- **Who can insert:** Authenticated users (recording their own actions).
- **Who can update:** No one (immutable).
- **Who can delete:** No one (immutable).
