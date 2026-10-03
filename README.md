# MediVault 🏥🔒

> Your Medical Records. Your Consent. Verifiable on MST Blockchain.

MediVault is a privacy-first, cryptographic medical record management platform. It gives patients ultimate control over who can access their medical history, while using blockchain technology to ensure absolute data integrity. 

**Built for the MST Blockchain Hackathon.**

---

## 🌟 Key Features

* **Patient-Controlled QR Care Sessions:** Doctors cannot search or browse for patients. A patient must generate a one-time, 5-minute expiring QR code. When the doctor scans it, it initiates a secure, 2-hour "Care Session" enforced strictly by Database Row Level Security (RLS).
* **Zero-Knowledge Encryption:** Medical files are encrypted at rest using AES-256-GCM before they ever hit the database storage.
* **MST Blockchain Notary:** Medical data is **never** stored on the blockchain. Instead, a cryptographic SHA-256 hash of the **raw, unencrypted file** is anchored directly to the MST Testnet, bypassing the app's encryption layer for the integrity proof.
* **1-Click Integrity Verification:** Anyone can click "Verify on MST" in the dashboard. The system will decrypt the file, re-hash the raw data, check the immutable blockchain record, and verify the record has not been tampered with.

---

## ⛓️ MST Blockchain Integration

The blockchain acts as an immutable notary for medical records.

1. **Hash & Encrypt:** When a doctor saves a record, the backend generates a SHA-256 hash of the **raw plaintext file**. It then encrypts the file (AES-256-GCM) for private storage.
2. **Anchor:** This hash, along with the record's UUID, is submitted to the `MediVaultAnchor` smart contract on the MST Testnet.
3. **Idempotency Guard:** The smart contract ensures a record can only be anchored once, preventing tampering or overwriting of the original hash.
4. **Transparency:** Every anchored record provides a transaction hash that can be viewed on [MSTScan](https://mstscan.com).

### Smart Contract Details
* **Network:** MST Testnet
* **Contract Address:** `0x69b17e933F6531E64eC270959EB6ea47B29400fE`
* **Verified Transactions:** Viewable directly in the Patient and Doctor dashboards.

### 🔗 MST Developer Resources
* **BridgeKey Wallet Extension:** [Chrome Web Store](https://chromewebstore.google.com/detail/bridgekey/bfjojdcfenehemjgjlepdjomkpginlkg)
* **Faucet – Claim $MSTC Tokens:** [faucet.masterstroke.academy](https://faucet.masterstroke.academy)
* **TypeScript SDK:** [@mstblockchain/mst-sdk](https://www.npmjs.com/package/@mstblockchain/mst-sdk)
* **Python SDK:** [mst-sdk-python](https://pypi.org/project/mst-sdk-python/)
* **VibeKit SDK:** [@mstblockchain/mst-vibe-kit](https://www.npmjs.com/package/@mstblockchain/mst-vibe-kit)
* **MCP Endpoint:** [mcp.mstblockchain.com/sse](https://mcp.mstblockchain.com/sse)
* **Official Documentation:** [docs.mstblockchain.com](https://docs.mstblockchain.com)
* **MSTScan Explorer:** [mstscan.com](https://mstscan.com)
* **BridgeKey Website:** [bridgekey.io](https://bridgekey.io)

---

## 🛠️ Technology Stack

* **Frontend:** Next.js 16, React, TailwindCSS, TypeScript
* **Backend:** FastAPI (Python), PyCryptodome (AES-256)
* **Database & Auth:** Supabase (PostgreSQL, Row Level Security, Realtime, Storage)
* **Blockchain:** `mst-blockchain-sdk`, Web3.py, Solidity

---

## 🚀 Setup & Installation

### Prerequisites
* Node.js (v18+)
* Python 3.10+
* Supabase project
* BridgeKey Wallet (for MST Testnet)

### 1. Supabase Setup
Run the SQL migrations located in `supabase/migrations/` in your Supabase SQL Editor to create the necessary tables, RLS policies, and RPC functions. Ensure Supabase Realtime is enabled for the `medical_records` table.

### 2. Backend Setup (FastAPI)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```
Create a `.env` file in the `backend/` directory:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_SECRET_KEY=your_service_role_key
ENCRYPTION_KEY=your_32_byte_hex_key
BLOCKCHAIN_PRIVATE_KEY=your_mst_wallet_private_key
MST_CONTRACT_ADDRESS=0x69b17e933F6531E64eC270959EB6ea47B29400fE
```
Run the server:
```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 3. Frontend Setup (Next.js)
```bash
cd frontend
npm install
```
Create a `.env.local` file in the `frontend/` directory:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_API_URL=http://localhost:8000
```
Run the development server:
```bash
npm run dev
```

---

## 👥 The Team
**Team Auric**
Developed with ❤️ during the MST Blockchain Hackathon.
