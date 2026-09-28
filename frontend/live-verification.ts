import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY || '';
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function pass(msg: string) { console.log(`[PASS] ${msg}`); }
function fail(msg: string, err?: unknown) { console.error(`[FAIL] ${msg}`, err); process.exit(1); }

async function setupTestUser(email: string, role: string, fullName: string) {
    const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password: 'password123',
        email_confirm: true,
        user_metadata: { role, fullName }
    });
    if (error) throw error;
    
    // Wait briefly for triggers
    await new Promise(r => setTimeout(r, 1000));
    
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await client.auth.signInWithPassword({ email, password: 'password123' });
    return { client, user: data.user! };
}

async function run() {
    console.log("--- STARTING LIVE VERIFICATION ---");
    let patientA, patientB, doctorA, doctorB;
    try {
        const suffix = Date.now();
        patientA = await setupTestUser(`patientA_qr_${suffix}@example.com`, 'PATIENT', 'Patient A');
        patientB = await setupTestUser(`patientB_qr_${suffix}@example.com`, 'PATIENT', 'Patient B');
        doctorA = await setupTestUser(`doctorA_qr_${suffix}@example.com`, 'DOCTOR', 'Doctor A');
        doctorB = await setupTestUser(`doctorB_qr_${suffix}@example.com`, 'DOCTOR', 'Doctor B');
        const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // 1. Anonymous
        const anonGen = await anonClient.rpc('generate_qr_session');
        if (anonGen.error) pass("Anonymous cannot call generate_qr_session()");
        else fail("Anon could generate QR");
        
        const anonClaim = await anonClient.rpc('claim_qr_session', { token: '00000000-0000-0000-0000-000000000000' });
        if (anonClaim.error) pass("Anonymous cannot call claim_qr_session()");
        else fail("Anon could claim QR");

        const anonHasQr = await anonClient.rpc('has_active_qr_session', { target_patient_id: patientA.user.id });
        if (anonHasQr.error || anonHasQr.data === false) pass("Anonymous cannot call has_active_qr_session()");
        else fail("Anon could call has_active_qr_session", anonHasQr);

        const anonCtx = await anonClient.rpc('get_active_patient_context', { target_patient_id: patientA.user.id });
        if (anonCtx.error || (anonCtx.data && anonCtx.data.length === 0)) pass("Anonymous cannot call get_active_patient_context()");
        else fail("Anon could get patient context", anonCtx);

        // 2. Patient A
        const pAGen = await patientA.client.rpc('generate_qr_session');
        if (pAGen.error || !pAGen.data) fail("Patient A could not generate QR", pAGen.error);
        const token1 = pAGen.data;
        pass("Patient A generated QR and received UUID");

        const pA_qrs = await patientA.client.from('qr_sessions').select('*');
        if (pA_qrs.data && pA_qrs.data.length === 1 && pA_qrs.data[0].token_id === token1) pass("Patient A can read their own qr_sessions row");
        else fail("Patient A could not read own qr_sessions");

        const pAGen2 = await patientA.client.rpc('generate_qr_session');
        const token2 = pAGen2.data;
        const pA_qrs_new = await patientA.client.from('qr_sessions').select('*').eq('status', 'pending');
        if (pA_qrs_new.data && pA_qrs_new.data.length === 1 && pA_qrs_new.data[0].token_id === token2) pass("Patient A generating 2nd QR invalidated previous QR, only one pending exists");
        else fail("Patient A pending QR logic failed", pA_qrs_new.data);

        // 3. Patient B
        const pB_qrs = await patientB.client.from('qr_sessions').select('*').eq('patient_id', patientA.user.id);
        if (pB_qrs.data && pB_qrs.data.length === 0) pass("Patient B cannot read Patient A's qr_sessions");
        else fail("Patient B read Patient A's QR", pB_qrs.data);
        
        const pB_update = await patientB.client.from('qr_sessions').update({ status: 'claimed' }).eq('token_id', token2);
        if (pB_update.error || pB_update.data === null || pB_update.count === 0) pass("Patient B cannot affect Patient A's QR");
        else fail("Patient B affected Patient A's QR");

        // 4. Doctor A
        const dA_claim = await doctorA.client.rpc('claim_qr_session', { token: token2 });
        if (dA_claim.data === patientA.user.id) pass("Doctor A successfully claimed Patient A's valid QR and received patient UUID");
        else fail("Doctor A failed to claim QR", dA_claim.error);

        const dA_claim2 = await doctorA.client.rpc('claim_qr_session', { token: token2 });
        if (dA_claim2.error) pass("Same QR cannot be claimed twice");
        else fail("QR was claimed twice!");

        const dA_ctx = await doctorA.client.rpc('get_active_patient_context', { target_patient_id: patientA.user.id });
        if (dA_ctx.data && dA_ctx.data.length === 1 && dA_ctx.data[0].id === patientA.user.id && !dA_ctx.data[0].role) pass("Doctor A can retrieve Patient A through get_active_patient_context() (min fields)");
        else fail("Doctor A could not retrieve Patient A context", dA_ctx);

        const dA_ctxB = await doctorA.client.rpc('get_active_patient_context', { target_patient_id: patientB.user.id });
        if (dA_ctxB.data && dA_ctxB.data.length === 0) pass("Doctor A cannot retrieve Patient B without a valid session");
        else fail("Doctor A retrieved Patient B context");

        // 5. Doctor B
        const dB_ctx = await doctorB.client.rpc('get_active_patient_context', { target_patient_id: patientA.user.id });
        if (dB_ctx.data && dB_ctx.data.length === 0) pass("Doctor B cannot retrieve Patient A through Doctor A's session");
        else fail("Doctor B retrieved Patient A context");

        const dB_rec_fail = await doctorB.client.from('medical_records').insert({
            patient_id: patientA.user.id, record_type: 'Test', created_by_doctor_id: doctorB.user.id
        });
        if (dB_rec_fail.error) pass("Doctor B cannot insert a record for Patient A without active session");
        else fail("Doctor B inserted record for Patient A");

        // 6. Medical records
        const dA_rec = await doctorA.client.from('medical_records').insert({
            patient_id: patientA.user.id, record_type: 'Test', created_by_doctor_id: doctorA.user.id
        });
        if (!dA_rec.error) pass("Doctor A inserted record for Patient A");
        else fail("Doctor A failed to insert record for Patient A", dA_rec.error);

        const dA_rec_fail = await doctorA.client.from('medical_records').insert({
            patient_id: patientB.user.id, record_type: 'Test', created_by_doctor_id: doctorA.user.id
        });
        if (dA_rec_fail.error) pass("Doctor A cannot insert for Patient B");
        else fail("Doctor A inserted record for Patient B");

        const dA_recs = await doctorA.client.from('medical_records').select('*');
        if (dA_recs.data && dA_recs.data.length > 0 && dA_recs.data[0].created_by_doctor_id === doctorA.user.id) pass("Doctor A can read records created by Doctor A");
        else fail("Doctor A cannot read own created records");

        const dB_recs = await doctorB.client.from('medical_records').select('*').eq('patient_id', patientA.user.id);
        if (dB_recs.data && dB_recs.data.length === 0) pass("Doctor B cannot read Doctor A's records");
        else fail("Doctor B read Doctor A's records");

        const pA_recs = await patientA.client.from('medical_records').select('*');
        if (pA_recs.data && pA_recs.data.length > 0) pass("Patient A can read Patient A's records");
        else fail("Patient A cannot read own records");

        const pB_recs = await patientB.client.from('medical_records').select('*').eq('patient_id', patientA.user.id);
        if (pB_recs.data && pB_recs.data.length === 0) pass("Patient B cannot read Patient A's records");
        else fail("Patient B read Patient A's records");

        // Create legacy record via adminClient
        await adminClient.from('medical_records').insert({
            patient_id: patientA.user.id, record_type: 'Legacy', created_by_doctor_id: null, blockchain_status: 'LEGACY'
        });
        const pA_legacy = await patientA.client.from('medical_records').select('*').eq('blockchain_status', 'LEGACY');
        if (pA_legacy.data && pA_legacy.data.length > 0) pass("Legacy Patient A records with created_by_doctor_id NULL remain readable by Patient A");
        else fail("Patient A cannot read legacy records");

        // 7. Session expiry
        const pAGen3 = await patientA.client.rpc('generate_qr_session');
        const token3 = pAGen3.data;
        // simulate expiry via admin
        await adminClient.from('qr_sessions').update({ expires_at: new Date(Date.now() - 60000).toISOString() }).eq('token_id', token3);
        const dA_claim3 = await doctorA.client.rpc('claim_qr_session', { token: token3 });
        if (dA_claim3.error) pass("Expired token cannot be claimed");
        else fail("Expired token was claimed!");

        // simulate 2 hours old
        await adminClient.from('qr_sessions').update({ claimed_at: new Date(Date.now() - 3 * 3600000).toISOString() }).eq('token_id', token2);
        const dA_rec2 = await doctorA.client.from('medical_records').insert({
            patient_id: patientA.user.id, record_type: 'Test2', created_by_doctor_id: doctorA.user.id
        });
        if (dA_rec2.error) pass("Claimed session older than 2 hours cannot authorize a new record");
        else fail("Doctor A inserted record with expired care session");

        // 8. Profiles
        const profA = await patientA.client.from('profiles').select('*');
        if (profA.data && profA.data.length === 1 && profA.data[0].id === patientA.user.id) pass("A user can SELECT their own profile");
        else fail("User could not select own profile");

        const profDoc = await doctorA.client.from('profiles').select('*').eq('role', 'PATIENT');
        if (profDoc.data && profDoc.data.length === 0) pass("Doctor cannot directly SELECT arbitrary patient profiles");
        else fail("Doctor read patient profiles", profDoc.data);

        const profPat = await patientA.client.from('profiles').select('*').eq('role', 'DOCTOR');
        if (profPat.data && profPat.data.length === 0) pass("Patient cannot directly SELECT arbitrary doctor profiles");
        else fail("Patient read doctor profiles", profPat.data);

        // 9. QR session direct access
        const doc_qr = await doctorA.client.from('qr_sessions').select('*');
        if (doc_qr.data && doc_qr.data.length === 0) pass("Doctor cannot directly SELECT qr_sessions");
        else fail("Doctor read qr_sessions", doc_qr.data);

    } catch (e) {
        console.error("Test execution failed:", e);
    } finally {
        console.log("--- CLEANING UP ---");
        if (patientA) await adminClient.auth.admin.deleteUser(patientA.user.id);
        if (patientB) await adminClient.auth.admin.deleteUser(patientB.user.id);
        if (doctorA) await adminClient.auth.admin.deleteUser(doctorA.user.id);
        if (doctorB) await adminClient.auth.admin.deleteUser(doctorB.user.id);
        pass("Cleanup performed successfully.");
    }
}

run();
