from fastapi import APIRouter

from app.api import ai, assets, auth, daily_reports, masters, photos, projects, quality, sites, tasks

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(masters.router, prefix="/masters", tags=["masters"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(sites.router, prefix="/sites", tags=["sites"])
api_router.include_router(assets.router, prefix="/assets", tags=["assets"])
api_router.include_router(tasks.router, tags=["tasks"])
api_router.include_router(daily_reports.router, prefix="/daily-reports", tags=["daily-reports"])
api_router.include_router(quality.router, prefix="/quality-checks", tags=["quality"])
api_router.include_router(photos.router, prefix="/photos", tags=["photos"])
api_router.include_router(ai.router, prefix="/ai", tags=["ai"])
