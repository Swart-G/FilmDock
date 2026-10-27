import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.db import init_db

logger = logging.getLogger("filmdock")

app = FastAPI(
    title="FilmDock API",
    version="0.1.0",
    description="FilmDock home media server API.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.on_event("startup")
def on_startup() -> None:
    if settings.env != "development" and settings.auth_secret in {"change-me", "change-this-secret"}:
        # Not fatal: legacy password hashes depend on the secret, so changing it must be deliberate.
        logger.warning("SWARTTUBE_AUTH_SECRET uses a default value; tokens can be forged. Set a random secret.")
    init_db()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
