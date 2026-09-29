import os

# Configure the app for tests BEFORE importing anything that reads settings.
# Use a temp DB outside the project tree so tests never touch real data.
os.environ.setdefault("AEMET_API_KEY", "test-key")
os.environ["DATABASE_URL"] = "sqlite:////tmp/weather_api_test.db"

import pytest  # noqa: E402
from app.db import Base, engine  # noqa: E402


@pytest.fixture(autouse=True)
def clean_db():
    """Give every test a clean database."""
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)
