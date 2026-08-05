FROM python:3.11-slim

WORKDIR /app

# ビルドに必要な最小限のみ
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --no-cache-dir \
    "fastapi>=0.115" "uvicorn[standard]>=0.30" "sqlalchemy>=2.0" "alembic>=1.13" \
    "psycopg2-binary>=2.9" "pydantic[email]>=2.7" "pydantic-settings>=2.3" \
    "python-jose[cryptography]>=3.3" "bcrypt>=4.1" "python-multipart>=0.0.9" \
    "pillow>=10.3" "boto3>=1.34" "openpyxl>=3.1" "reportlab>=4.0" "pyyaml>=6.0"

COPY . .

# イメージを焼いた時刻を残す。環境変数 BUILD_TIME が無いホストでも、
# 画面の「システム情報」で稼働中のビルドがいつのものか分かるようにする。
RUN date -u +%Y-%m-%dT%H:%M:%SZ > /app/BUILD_TIME

# クラウド(Render等)は待受ポートを $PORT で渡す。未指定時は 8000。
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
