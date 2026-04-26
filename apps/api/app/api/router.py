from fastapi import APIRouter

from app.api.routes import admin, auth, catalog, integrations, library, torrent, watch

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(catalog.router, prefix="/catalog", tags=["catalog"])
api_router.include_router(library.router, prefix="/library", tags=["library"])
api_router.include_router(torrent.router, prefix="/torrent", tags=["torrent"])
api_router.include_router(watch.router, prefix="/watch", tags=["watch"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(integrations.router, prefix="/integrations", tags=["integrations"])

