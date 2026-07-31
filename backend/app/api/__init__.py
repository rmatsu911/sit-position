from fastapi import APIRouter

from app.api import (
    ai,
    assets,
    auth,
    daily_reports,
    dashboard,
    documents,
    ledger,
    masters,
    materials,
    notifications,
    personnel,
    photos,
    projects,
    quality,
    reports,
    schedule,
    sites,
    tasks,
    test_records,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(masters.router, prefix="/masters", tags=["masters"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(sites.router, prefix="/sites", tags=["sites"])
api_router.include_router(assets.router, prefix="/assets", tags=["assets"])
api_router.include_router(tasks.router, tags=["tasks"])
api_router.include_router(schedule.router, prefix="/schedule", tags=["schedule"])
api_router.include_router(daily_reports.router, prefix="/daily-reports", tags=["daily-reports"])
api_router.include_router(quality.router, prefix="/quality-checks", tags=["quality"])
api_router.include_router(photos.router, prefix="/photos", tags=["photos"])
api_router.include_router(ai.router, prefix="/ai", tags=["ai"])
api_router.include_router(personnel.router, prefix="/workers", tags=["personnel"])
api_router.include_router(ledger.router, prefix="/ledger", tags=["ledger"])
api_router.include_router(documents.router, prefix="/documents", tags=["documents"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(materials.router, prefix="/materials", tags=["materials"])
api_router.include_router(test_records.router, prefix="/test-records", tags=["test-records"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
