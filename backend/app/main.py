"""FastAPI application entry point."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db
from .logging_config import configure_logging
from .routers import antartida

configure_logging()

app = FastAPI(
    title="AEMET Antartida Weather API",
    version="1.0.0",
    description="Retrieve and aggregate historical weather data from the AEMET Antarctic stations.",
)

# Open CORS for local development; restrict to the frontend origin in production (TODO).
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

app.include_router(antartida.router)


@app.on_event("startup")
def _on_startup() -> None:
    init_db()


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok"}
