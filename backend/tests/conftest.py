import os

# Configure the app for tests BEFORE importing anything that reads settings.
os.environ.setdefault("AEMET_API_KEY", "test-key")
os.environ["DATABASE_URL"] = "sqlite:///./test_cache.db"

import pytest  # noqa: E402
from app.db import Base, engine  # noqa: E402


@pytest.fixture(autouse=True)
def clean_db():
    """Give every test a clean database."""
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)
