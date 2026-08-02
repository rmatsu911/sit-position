import os
import tempfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.db import Base, get_db
from app.core.security import hash_password
from app.main import app
from app.models import Project, ProjectMember, User

# 一時ファイルのSQLite（スレッド間で同一DBを共有）
_DB_FD, _DB_PATH = tempfile.mkstemp(suffix=".db")
os.close(_DB_FD)
engine = create_engine(f"sqlite:///{_DB_PATH}", connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def _override_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _override_db

# スキーマ作成＋初期データ（import時に確定させる）
Base.metadata.create_all(engine)
with TestingSessionLocal() as _s:
    _s.add_all([
        User(email="admin@test.jp", hashed_password=hash_password("pass"), name="管理者", role="ADMIN"),
        User(email="pm@test.jp", hashed_password=hash_password("pass"), name="PM", role="PROJECT_MANAGER"),
        User(email="partner@test.jp", hashed_password=hash_password("pass"), name="協力", role="FIELD_WORKER"),
    ])
    _s.flush()
    _s.add_all([
        Project(construction_number="T-001", name="テスト案件1", status="施工中"),
        Project(construction_number="T-002", name="テスト案件2", status="施工中"),
    ])
    _s.flush()
    partner = _s.query(User).filter_by(email="partner@test.jp").one()
    p1 = _s.query(Project).filter_by(construction_number="T-001").one()
    _s.add(ProjectMember(project_id=p1.id, user_id=partner.id, role="FIELD_WORKER"))
    _s.commit()


@pytest.fixture(scope="session", autouse=True)
def _cleanup():
    yield
    Base.metadata.drop_all(engine)
    try:
        os.remove(_DB_PATH)
    except OSError:
        pass


@pytest.fixture
def client():
    return TestClient(app)


def token(client: TestClient, email: str) -> str:
    r = client.post("/api/auth/login", json={"email": email, "password": "pass"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]
