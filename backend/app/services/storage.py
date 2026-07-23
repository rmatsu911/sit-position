"""ファイルストレージ抽象化。

STORAGE_BACKEND=local … ローカルファイルシステム（開発・サンドボックス）
STORAGE_BACKEND=s3    … S3 / MinIO（本番）

原本は保存後に変更しない。サムネイルは原本から派生させる。
"""
from __future__ import annotations

import io
import os
from abc import ABC, abstractmethod

from app.core.config import settings


class Storage(ABC):
    @abstractmethod
    def save(self, key: str, data: bytes, content_type: str) -> None: ...

    @abstractmethod
    def url(self, key: str) -> str: ...


class LocalStorage(Storage):
    def __init__(self, base_dir: str, public_base_url: str):
        self.base_dir = os.path.abspath(base_dir)
        self.public_base_url = public_base_url.rstrip("/")
        os.makedirs(self.base_dir, exist_ok=True)

    def _path(self, key: str) -> str:
        p = os.path.join(self.base_dir, key)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        return p

    def save(self, key: str, data: bytes, content_type: str) -> None:
        with open(self._path(key), "wb") as f:
            f.write(data)

    def url(self, key: str) -> str:
        return f"{self.public_base_url}/files/{key}"


class S3Storage(Storage):
    def __init__(self):
        import boto3  # 遅延import

        self.bucket = settings.s3_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
        )

    def save(self, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=io.BytesIO(data), ContentType=content_type)

    def url(self, key: str) -> str:
        return f"{settings.s3_endpoint_url.rstrip('/')}/{self.bucket}/{key}"


def get_storage() -> Storage:
    if settings.storage_backend == "s3":
        return S3Storage()
    return LocalStorage(settings.local_storage_dir, settings.public_base_url)
