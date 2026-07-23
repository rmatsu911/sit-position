import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings

app = FastAPI(title="株式会社SYSKEN AI施工管理システム API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ローカルストレージのファイル配信（STORAGE_BACKEND=local のとき）
if settings.storage_backend == "local":
    os.makedirs(settings.local_storage_dir, exist_ok=True)
    app.mount("/files", StaticFiles(directory=settings.local_storage_dir), name="files")


@app.get("/health", tags=["system"])
def health() -> dict:
    return {"status": "ok", "version": "0.1.0"}


# ルーター登録（api パッケージ側で集約）
from app.api import api_router  # noqa: E402

app.include_router(api_router, prefix="/api")
