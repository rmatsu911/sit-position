from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # 実行環境（development / staging / production）
    app_env: str = "development"
    app_version: str = "1.0.0"

    # DB
    database_url: str = "postgresql+psycopg2://sysken:sysken@localhost:5432/sysken"

    @field_validator("database_url")
    @classmethod
    def _normalize_database_url(cls, v: str) -> str:
        """クラウド(Render/Heroku等)が渡す postgres:// / postgresql:// を
        SQLAlchemy が使う postgresql+psycopg2:// へ正規化する。"""
        if v.startswith("postgres://"):
            return "postgresql+psycopg2://" + v[len("postgres://"):]
        if v.startswith("postgresql://") and "+psycopg2" not in v:
            return "postgresql+psycopg2://" + v[len("postgresql://"):]
        return v

    # Auth
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    # CORS
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # サブパス配信（例: https://example.com/sysken/api）。
    # リバースプロキシがパスを切り落とす構成で、APIが自分の公開パスを知るために使う。
    # 画面のベースパス（VITE_BASE_PATH）と食い違うと、URLが解決できない事故になる。
    api_root_path: str = ""

    # Storage
    storage_backend: str = "local"  # local | s3
    local_storage_dir: str = "./storage"
    public_base_url: str = "http://localhost:8000"

    # S3 / MinIO
    s3_endpoint_url: str = "http://localhost:9000"
    s3_region: str = "us-east-1"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "sysken"

    # Seed
    seed_admin_email: str = "admin@example.co.jp"
    seed_admin_password: str = "Passw0rd!"

    # AI（YOLO 施工写真認識 PoC）— weights はコードに埋め込まず設定で指定
    ai_predictor: str = "yolo"  # yolo（実推論）| fake（テスト専用・実結果としては保存しない）
    ai_model_path: str = ""      # 学習済みweights(.pt)への絶対/相対パス。空=未配置(MODEL_NOT_AVAILABLE)
    ai_model_name: str = "SYSKEN 設備検出モデル"
    ai_model_version: str = "poc-v0"
    ai_dataset_version: str = "dataset_v001"
    ai_data_yaml: str = "datasets/data.yaml"  # クラス体系の正（YOLO data.yaml）
    ai_confidence_threshold: float = 0.25
    ai_worker_poll_seconds: float = 3.0
    ai_max_retries: int = 3

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
