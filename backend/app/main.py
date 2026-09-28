from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import health

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

app.include_router(health.router, prefix="/api")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "MediVault API running"}
