import os
import uuid
from typing import Annotated
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Header, status
from fastapi.responses import StreamingResponse
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from supabase import create_client, Client
import io

router = APIRouter(prefix="/records", tags=["Records"])

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY")
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")

if not all([SUPABASE_URL, SUPABASE_SECRET_KEY, ENCRYPTION_KEY]):
    raise RuntimeError("Missing required environment variables for Supabase or Encryption")

# Ensure key is bytes (32 bytes for AES-256)
try:
    key_bytes = bytes.fromhex(ENCRYPTION_KEY)
    if len(key_bytes) != 32:
        raise ValueError("ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)")
except Exception as e:
    raise RuntimeError(f"Invalid ENCRYPTION_KEY: {str(e)}")

aesgcm = AESGCM(key_bytes)

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
        
    # 5. Encrypt file
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, content, None)
    
    # 6. Upload to private Supabase Storage
    # Storage path: medical-records/{record_id}/{filename} (filename is randomized or standard)
    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    file_name = f"{uuid.uuid4().hex}.{ext}"
    storage_path = f"{record_id}/{file_name}"
    
    # Supabase storage3 client expects a file path or file-like object in some versions
    import tempfile
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(ciphertext)
        tmp_path = tmp.name

    try:
        res = supabase.storage.from_("medical_records").upload(storage_path, tmp_path, {"content-type": "application/octet-stream"})
        if hasattr(res, "error") and res.error:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to upload encrypted file")
    finally:
        os.remove(tmp_path)

    # 7. Store metadata in medical_records
    update_res = supabase.table("medical_records").update({
        "storage_path": storage_path,
        "encryption_iv": nonce.hex()
    }).eq("id", record_id).execute()
    
    if not update_res.data:
        # Cleanup storage on DB fail
        supabase.storage.from_("medical_records").remove([storage_path])
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update record metadata")
        
    return {"status": "success", "message": "File encrypted and uploaded successfully"}

@router.get("/{record_id}/download")
async def download_medical_file(record_id: str, authorization: str = Header(...)):
    user = await verify_auth(authorization)
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
    nonce_hex = record.get("encryption_iv")
    
    if not storage_path or not nonce_hex:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No medical file attached to this record")
        
    # 3. Download encrypted file from storage
    # supabase.storage.from_("medical_records").download(storage_path) returns bytes in supabase-py v2
    file_bytes = supabase.storage.from_("medical_records").download(storage_path)
    
    # 4. Decrypt file
    try:
        nonce = bytes.fromhex(nonce_hex)
        plaintext = aesgcm.decrypt(nonce, file_bytes, None)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to decrypt medical file")
        
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
        
    # Return plaintext file
    return StreamingResponse(io.BytesIO(plaintext), media_type=mime_type, headers={
        "Content-Disposition": f"attachment; filename=\"medical_file_{record_id}.{ext}\""
    })
