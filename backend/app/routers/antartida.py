"""Part 1 endpoint + a small supporting endpoint for the frontend."""
from __future__ import annotations

import logging
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Path, Query

from ..config import settings
from ..schemas import Aggregation, Measurement
from ..services.aemet_client import AemetError
from ..services.cache import get_or_fetch
from ..services.processing import parse_user_datetime, process
from ..stations import STATIONS, resolve_station

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/antartida", tags=["antartida"])

# AEMET rejects ranges longer than one month, so we fetch in <= 1-month chunks and
# concatenate. The cache makes repeated chunks cheap.
_MAX_CHUNK = timedelta(days=28)


@router.get("/estaciones", summary="List the selectable stations (for the UI)")
def list_stations():
    return [{"key": s.key, "id": s.aemet_id, "name": s.name} for s in STATIONS.values()]


@router.get(
    "/datos/fechaini/{fechaIniStr}/fechafin/{fechaFinStr}/estacion/{identificacion}",
    summary="Time series of measurements for a station and time range",
)
async def get_datos(
    fechaIniStr: str = Path(..., examples=["2023-07-01T00:00:00"]),
    fechaFinStr: str = Path(..., examples=["2023-07-02T00:00:00"]),
    identificacion: str = Path(..., description="Station key (e.g. juan_carlos_i) or AEMET id"),
    location: str | None = Query(None, description="IANA zone of the input datetimes, e.g. Europe/Berlin"),
    offset: str | None = Query(None, description="Alternative to location, e.g. +02:00"),
    aggregation: Aggregation = Query(Aggregation.none),
    measurements: list[Measurement] | None = Query(None, description="0-3 of temperature/pressure/speed; empty = all"),
):
    station = resolve_station(identificacion)
    if station is None:
        raise HTTPException(status_code=422, detail=f"Unknown station '{identificacion}'. Allowed: {list(STATIONS)}")

    try:
        start = parse_user_datetime(fechaIniStr, location, offset)
        end = parse_user_datetime(fechaFinStr, location, offset)
    except Exception as exc:  # noqa: BLE001 - surface a clean 422
        raise HTTPException(status_code=422, detail=f"Invalid datetime or zone: {exc}") from exc

    if start > end:
        raise HTTPException(status_code=422, detail="fechaIni must be earlier than or equal to fechaFin")

    selected = measurements or list(Measurement)  # empty -> all

    try:
        raw: list[dict] = []
        cursor = start
        while cursor < end:
            chunk_end = min(cursor + _MAX_CHUNK, end)
            raw.extend(await get_or_fetch(station.aemet_id, cursor, chunk_end))
            cursor = chunk_end
    except AemetError as exc:
        raise HTTPException(status_code=502, detail=f"AEMET source error: {exc}") from exc

    data = process(
        raw,
        measurements=selected,
        aggregation=aggregation,
        station_name=station.name,
        station_tz=settings.station_timezone,
        output_tz=settings.output_timezone,
    )
    return {
        "station": station.name,
        "aggregation": aggregation.value,
        "timezone": settings.output_timezone,
        "count": len(data),
        "data": data,
    }
