from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(
    title="MediVault API",
    description="Privacy-first medical record management platform",
    version="1.0.0",
)

# CORS configuration
origins = [
    "http://localhost:3000",
    # Add production URL later
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api import health, records

app.include_router(health.router, prefix="/api")
app.include_router(records.router, prefix="/api")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "MediVault API running"}
