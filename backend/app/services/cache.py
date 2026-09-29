"""Read-through cache backed by SQLite (Part 2).

Strategy: cache the RAW 10-minute rows so any aggregation can be served from cache.
A `FetchedInterval` records which ranges we already have, so AEMET is only called
for data we have never fetched. See DESIGN.md sections 2 & 8.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import pandas as pd
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from ..db import FetchedInterval, MeasurementRow, SessionLocal
from .aemet_client import fetch_timeseries

logger = logging.getLogger(__name__)


def _naive_utc(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def _is_covered(session, station_id: str, start: datetime, end: datetime) -> bool:
    stmt = select(FetchedInterval.id).where(
        FetchedInterval.station_id == station_id,
        FetchedInterval.start_utc <= start,
        FetchedInterval.end_utc >= end,
    )
    return session.execute(stmt).first() is not None


def _read(session, station_id: str, start: datetime, end: datetime) -> list[dict]:
    stmt = (
        select(MeasurementRow)
        .where(
            MeasurementRow.station_id == station_id,
            MeasurementRow.fhora_utc >= start,
            MeasurementRow.fhora_utc <= end,
        )
        .order_by(MeasurementRow.fhora_utc)
    )
    return [
        {"fhora": r.fhora_utc.isoformat(), "temp": r.temp, "pres": r.pres, "vel": r.vel, "nombre": r.nombre}
        for r in session.execute(stmt).scalars().all()
    ]


def _store(session, station_id: str, raw_rows: list[dict]) -> None:
    for row in raw_rows:
        ts = pd.to_datetime(row.get("fhora"), utc=True, errors="coerce")
        if pd.isna(ts):
            continue
        values = {
            "station_id": station_id,
            "fhora_utc": ts.to_pydatetime().replace(tzinfo=None),
            "temp": _num(row.get("temp")),
            "pres": _num(row.get("pres")),
            "vel": _num(row.get("vel")),
            "nombre": row.get("nombre"),
        }
        # INSERT OR IGNORE on the (station, datetime) unique key -> idempotent.
        session.execute(sqlite_insert(MeasurementRow).values(**values).on_conflict_do_nothing())


def _num(value):
    if value is None:
        return None
    try:
        return float(str(value).replace(",", "."))
    except (ValueError, TypeError):
        return None


async def get_or_fetch(station_id: str, start_utc: datetime, end_utc: datetime) -> list[dict]:
    start, end = _naive_utc(start_utc), _naive_utc(end_utc)

    with SessionLocal() as session:
        if _is_covered(session, station_id, start, end):
            logger.info("Cache HIT station=%s %s..%s", station_id, start, end)
            return _read(session, station_id, start, end)

    logger.info("Cache MISS station=%s %s..%s -> calling AEMET", station_id, start, end)
    raw = await fetch_timeseries(station_id, start_utc, end_utc)

    with SessionLocal() as session:
        _store(session, station_id, raw)
        session.add(
            FetchedInterval(station_id=station_id, start_utc=start, end_utc=end, fetched_at=datetime.utcnow())
        )
        session.commit()
        return _read(session, station_id, start, end)
