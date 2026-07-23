from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # DB
    database_url: str = "postgresql+psycopg2://sysken:sysken@localhost:5432/sysken"

    # Auth
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    # CORS
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

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

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
