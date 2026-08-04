import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings

app = FastAPI(title="株式会社SYSKEN AI施工管理システム API", version=settings.app_version)

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
    """稼働確認と、動いているコード世代。秘密情報は含めない。"""
    from app.api.system import _built_at, _commit

    return {
        "status": "ok",
        "version": settings.app_version,
        "environment": settings.app_env,
        "backend_commit": _commit(),
        "backend_built_at": _built_at(),
    }


@app.get("/api/meta", tags=["system"])
def meta() -> dict:
    """実行環境・バージョン（環境変数由来）。フロントの環境表示の情報源。"""
    return {"app_env": settings.app_env, "version": settings.app_version}


# ルーター登録（api パッケージ側で集約）
from app.api import api_router  # noqa: E402

app.include_router(api_router, prefix="/api")
