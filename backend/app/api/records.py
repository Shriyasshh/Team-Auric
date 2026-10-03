import os
import uuid
from typing import Annotated
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Header, status
from fastapi.responses import StreamingResponse
from supabase import create_client, Client
import io
import json
import hashlib
from mst_blockchain_sdk import Client

router = APIRouter(prefix="/records", tags=["Records"])

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY")
MST_CONTRACT_ADDRESS = os.getenv("MST_CONTRACT_ADDRESS")
BLOCKCHAIN_PRIVATE_KEY = os.getenv("BLOCKCHAIN_PRIVATE_KEY")

if not all([SUPABASE_URL, SUPABASE_SECRET_KEY]):
    raise RuntimeError("Missing required environment variables for Supabase")

# Initialize MST Blockchain Client
mst_client = None
if MST_CONTRACT_ADDRESS and BLOCKCHAIN_PRIVATE_KEY:
    try:
        mst_client = Client("testnet", BLOCKCHAIN_PRIVATE_KEY)
        with open(os.path.join(os.path.dirname(__file__), "anchor_abi.json"), "r") as f:
            anchor_abi = json.load(f)
    except Exception as e:
        print(f"MST Client Initialization Failed: {e}")
else:
    print("Warning: MST_CONTRACT_ADDRESS or BLOCKCHAIN_PRIVATE_KEY missing")


def get_supabase() -> Client:
    # Use the service role key to bypass RLS for internal operations like Storage uploads and metadata updates
    # We will strictly manually enforce RLS logic by impersonating the user's JWT or explicitly querying permissions
    return create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)

async def verify_auth(authorization: str = Header(...)):
    """Verifies the JWT and returns the user object from Supabase."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization header format")
    token = authorization.split(" ")[1]

    # We create a temporary client just to verify the token via get_user
    # Using the anon key is fine for auth verification if we had it, but we can just use the service role key
    # to decode, or the standard supabase client provides get_user(token).
    client = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)
    try:
        user_response = client.auth.get_user(token)
        if not user_response.user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return user_response.user
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))

@router.post("/{record_id}/upload")
async def upload_medical_file(
    record_id: str,
    file: UploadFile = File(...),
    user = Depends(verify_auth)
):
    supabase = get_supabase()

    # 1. Verify user is DOCTOR
    user_id = user.id

    # We query the profile to check role
    profile_res = supabase.table("profiles").select("role").eq("id", user_id).execute()
    if not profile_res.data or profile_res.data[0].get("role") != "DOCTOR":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only doctors can upload files")

    # 2. Verify record belongs to this doctor and get patient_id
    record_res = supabase.table("medical_records").select("created_by_doctor_id, patient_id").eq("id", record_id).execute()
    if not record_res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")

    record = record_res.data[0]
    if record.get("created_by_doctor_id") != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to modify this record")

    patient_id = record.get("patient_id")

    # Verify active care session
    # Call the database function to check if this doctor has an active session for this patient
    # We can query qr_sessions directly using the service key
    session_res = supabase.table("qr_sessions").select("token_id").eq("patient_id", patient_id).eq("claimed_by_doctor_id", user_id).eq("status", "claimed").execute()
    # Alternatively, the fact that the doctor created this record might be sufficient, but the prompt says:
    # "patient must be the patient associated with the currently active claimed QR session"

    # Since we need to run a time-based query, we can use the `get_active_patient_context` RPC or we can just fetch and verify in Python.
    # But wait, we can just impersonate the user to fetch the record, which would run through RLS!
    # No, wait, RLS on INSERT checks the QR session. RLS on UPDATE might not exist?
    # Let's check RLS policies on medical_records.
    # "Doctors can view created medical records" -> SELECT
    # "Doctors can insert medical records during active session" -> INSERT
    # There is NO UPDATE policy!
    # That means we HAVE to use the service role key to update the `storage_path` and `encryption_iv`,
    # and we must manually verify the session.

    # Let's just fetch qr_sessions and do the time check in Python
    from datetime import datetime, timezone, timedelta
    qr_res = supabase.table("qr_sessions").select("claimed_at").eq("patient_id", patient_id).eq("claimed_by_doctor_id", user_id).eq("status", "claimed").execute()

    has_active = False
    for session in qr_res.data:
        claimed_at_str = session.get("claimed_at")
        if claimed_at_str:
            # Parse ISO 8601 string
            claimed_at = datetime.fromisoformat(claimed_at_str.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) - claimed_at <= timedelta(hours=2):
                has_active = True
                break

    if not has_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No active care session for this patient")

    # 4. Read and validate file
    content = await file.read()

    # Simple validation (Max 10MB)
    MAX_SIZE = 10 * 1024 * 1024
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large. Max 10MB.")

    allowed_types = ["application/pdf", "image/jpeg", "image/png", "text/plain"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Unsupported file type")

    # 5. Upload to private Supabase Storage
    # Storage path: medical-records/{record_id}/{filename} (filename is randomized or standard)
    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    file_name = f"{uuid.uuid4().hex}.{ext}"
    storage_path = f"{record_id}/{file_name}"

    import tempfile
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        res = supabase.storage.from_("medical_records").upload(storage_path, tmp_path, {"content-type": "application/octet-stream"})
        if hasattr(res, "error") and res.error:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to upload file")
    finally:
        os.remove(tmp_path)

    # 6. Store metadata in medical_records
    update_res = supabase.table("medical_records").update({
        "storage_path": storage_path
    }).eq("id", record_id).execute()

    if not update_res.data:
        # Cleanup storage on DB fail
        supabase.storage.from_("medical_records").remove([storage_path])
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update record metadata")

    return {"status": "success", "message": "File uploaded successfully"}

@router.get("/{record_id}/download")
async def download_medical_file(record_id: str, user = Depends(verify_auth)):
    supabase = get_supabase()
    user_id = user.id

    # 1. Fetch record
    record_res = supabase.table("medical_records").select("*").eq("id", record_id).execute()
    if not record_res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")

    record = record_res.data[0]

    # 2. Verify authorization
    profile_res = supabase.table("profiles").select("role").eq("id", user_id).execute()
    role = profile_res.data[0].get("role") if profile_res.data else None

    if role == "PATIENT":
        # Patient can only download their own records
        if record.get("patient_id") != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    elif role == "DOCTOR":
        # Doctor can only download records they created
        if record.get("created_by_doctor_id") != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unknown role")

    storage_path = record.get("storage_path")

    if not storage_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No medical file attached to this record")

    # 3. Download file from storage
    file_bytes = supabase.storage.from_("medical_records").download(storage_path)

    # Try to guess mime type from extension
    ext = storage_path.split(".")[-1].lower() if "." in storage_path else ""
    mime_type = "application/octet-stream"
    if ext == "pdf":
        mime_type = "application/pdf"
    elif ext in ["jpg", "jpeg"]:
        mime_type = "image/jpeg"
    elif ext == "png":
        mime_type = "image/png"
    elif ext == "txt":
        mime_type = "text/plain"

    # Return file
    return StreamingResponse(io.BytesIO(file_bytes), media_type=mime_type, headers={
        "Content-Disposition": f"attachment; filename=\"medical_file_{record_id}.{ext}\""
    })

@router.post("/{record_id}/anchor")
async def anchor_medical_record(record_id: str, user = Depends(verify_auth)):
    supabase = get_supabase()
    user_id = user.id

    if not mst_client:
        raise HTTPException(status_code=500, detail="MST client not configured")

    # Fetch record
    record_res = supabase.table("medical_records").select("*").eq("id", record_id).execute()
    if not record_res.data:
        raise HTTPException(status_code=404, detail="Record not found")

    record = record_res.data[0]

    # Only doctor who created the record can anchor it
    if record.get("created_by_doctor_id") != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to anchor this record")

    if record.get("blockchain_status") == "ANCHORED":
        return {"status": "success", "message": "Already anchored", "tx_hash": record.get("blockchain_tx_hash")}

    storage_path = record.get("storage_path")
    record_hash = None

    if storage_path:
        # File-attached record: hash the raw file
        try:
            file_bytes = supabase.storage.from_("medical_records").download(storage_path)
            record_hash = "0x" + hashlib.sha256(file_bytes).hexdigest()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to download file for hashing: {str(e)}")
    else:
        # Text-only record: hash the canonical JSON representation
        description = record.get("description", "")
        record_type = record.get("record_type", "")
        canonical_json = json.dumps({"description": description, "record_type": record_type}, separators=(',', ':'), ensure_ascii=False)
        record_hash = "0x" + hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()

    try:
        # Deploy tx via mst-sdk client
        # mst-sdk signer.deploy deploys a contract. Wait, we want to call anchorRecord.
        # mst_blockchain_sdk exposes web3 via provider.
        w3 = mst_client.provider.web3
        account = mst_client.signer.account
        contract = w3.eth.contract(address=MST_CONTRACT_ADDRESS, abi=anchor_abi)

        print(f"[ANCHOR] Anchoring record_id='{record_id}' with hash='{record_hash}' to contract {MST_CONTRACT_ADDRESS}")
        tx = contract.functions.anchorRecord(record_id, record_hash).build_transaction({
            'from': account.address,
            'nonce': w3.eth.get_transaction_count(account.address, 'pending'),
            'gas': 2000000,
            'gasPrice': w3.eth.gas_price,
            'chainId': w3.eth.chain_id
        })
        signed_tx = account.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

        if receipt.status != 1:
            raise Exception("Blockchain transaction reverted on-chain")

        tx_hash_hex = tx_hash.hex()

        # Update DB
        supabase.table("medical_records").update({
            "blockchain_tx_hash": tx_hash_hex,
            "blockchain_status": "ANCHORED"
        }).eq("id", record_id).execute()

        return {"status": "success", "message": "Record anchored", "tx_hash": tx_hash_hex}
    except Exception as e:
        # Mark as FAILED
        supabase.table("medical_records").update({
            "blockchain_status": "FAILED"
        }).eq("id", record_id).execute()
        raise HTTPException(status_code=500, detail=f"Blockchain transaction failed: {str(e)}")

@router.get("/{record_id}/verify")
async def verify_medical_record(record_id: str, user = Depends(verify_auth)):
    supabase = get_supabase()

    print(f"[VERIFY] Starting verification for record_id={record_id}")

    if not mst_client:
        print("[VERIFY] ERROR: MST client not configured")
        raise HTTPException(status_code=500, detail="MST client not configured")

    record_res = supabase.table("medical_records").select("*").eq("id", record_id).execute()
    if not record_res.data:
        print(f"[VERIFY] ERROR: Record {record_id} not found in DB")
        raise HTTPException(status_code=404, detail="Record not found")

    record = record_res.data[0]
    print(f"[VERIFY] Record found. blockchain_status={record.get('blockchain_status')}, storage_path={record.get('storage_path')}")

    # Must be anchored
    if record.get("blockchain_status") != "ANCHORED":
        print(f"[VERIFY] Record not anchored. Returning unverified.")
        return {"status": "unverified", "message": "Record is not anchored on MST Testnet"}

    storage_path = record.get("storage_path")
    expected_hash = None

    if storage_path:
        # File-attached record: hash the raw file
        try:
            file_bytes = supabase.storage.from_("medical_records").download(storage_path)
            expected_hash = "0x" + hashlib.sha256(file_bytes).hexdigest()
            print(f"[VERIFY] File-based hash computed: {expected_hash}")
        except Exception as e:
            print(f"[VERIFY] ERROR downloading file: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to download file for verification: {str(e)}")
    else:
        # Text-only record
        description = record.get("description", "")
        record_type = record.get("record_type", "")
        canonical_json = json.dumps({"description": description, "record_type": record_type}, separators=(',', ':'), ensure_ascii=False)
        expected_hash = "0x" + hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()
        print(f"[VERIFY] Text-only record. canonical_json={canonical_json}")
        print(f"[VERIFY] Text-based hash computed: {expected_hash}")

    # Get from blockchain
    try:
        w3 = mst_client.provider.web3
        contract = w3.eth.contract(address=MST_CONTRACT_ADDRESS, abi=anchor_abi)
        print(f"[VERIFY] Calling getRecordAnchor({record_id}) on contract {MST_CONTRACT_ADDRESS}")
        on_chain_hash = contract.functions.getRecordAnchor(record_id).call()
        print(f"[VERIFY] On-chain hash returned: '{on_chain_hash}'")

        if not on_chain_hash:
            print("[VERIFY] On-chain hash is empty/falsy. Returning unverified.")
            return {"status": "unverified", "message": "Record not found on blockchain"}

        print(f"[VERIFY] Comparing on_chain='{on_chain_hash.lower()}' vs expected='{expected_hash.lower()}'")
        if on_chain_hash.lower() == expected_hash.lower():
            print("[VERIFY] MATCH! Returning verified.")
            return {"status": "verified", "message": "Integrity Verified", "tx_hash": record.get("blockchain_tx_hash")}
        else:
            print(f"[VERIFY] MISMATCH! on_chain='{on_chain_hash}' expected='{expected_hash}'")
            return {"status": "mismatch", "message": "Integrity Mismatch: Data has been altered!"}
    except Exception as e:
        error_msg = str(e)
        print(f"[VERIFY] Exception during blockchain call: {error_msg}")
        if "contract deployed correctly" in error_msg or "execution reverted" in error_msg.lower():
            return {"status": "unverified", "message": "Not found on this contract (likely older version)"}
        raise HTTPException(status_code=500, detail=f"Failed to verify on blockchain: {error_msg}")

