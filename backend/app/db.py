"""SQLite storage layer (SQLAlchemy). Datetimes are stored as naive UTC on purpose
to keep SQLite comparisons unambiguous; everything is UTC internally."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, String, UniqueConstraint, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


class MeasurementRow(Base):
    __tablename__ = "measurements"
    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[str] = mapped_column(String(16), index=True)
    fhora_utc: Mapped[datetime] = mapped_column(DateTime, index=True)
    temp: Mapped[float | None] = mapped_column(Float, nullable=True)
    pres: Mapped[float | None] = mapped_column(Float, nullable=True)
    vel: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Feasibility extras: wind direction (°), gust (m/s), relative humidity (%) and
    # wind-direction variability (°).
    wind_dir: Mapped[float | None] = mapped_column(Float, nullable=True)
    gust: Mapped[float | None] = mapped_column(Float, nullable=True)
    humidity: Mapped[float | None] = mapped_column(Float, nullable=True)
    dir_std: Mapped[float | None] = mapped_column(Float, nullable=True)
    nombre: Mapped[str | None] = mapped_column(String(128), nullable=True)
    __table_args__ = (UniqueConstraint("station_id", "fhora_utc", name="uix_station_time"),)


class FetchedInterval(Base):
    """Record of which [start, end] UTC ranges we have already pulled from AEMET."""
    __tablename__ = "fetched_intervals"
    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[str] = mapped_column(String(16), index=True)
    start_utc: Mapped[datetime] = mapped_column(DateTime)
    end_utc: Mapped[datetime] = mapped_column(DateTime)
    fetched_at: Mapped[datetime] = mapped_column(DateTime)


_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def init_db() -> None:
    Base.metadata.create_all(engine)
