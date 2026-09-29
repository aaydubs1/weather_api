"""Async client for the AEMET OpenData API (two-step request flow)."""
from __future__ import annotations

import logging
from datetime import datetime

import httpx

from ..config import settings

logger = logging.getLogger(__name__)


class AemetError(RuntimeError):
    """Raised when AEMET returns an unexpected state."""


def _fmt(dt: datetime) -> str:
    # AEMET expects the UTC datetime with a trailing 'UTC'.
    return dt.strftime("%Y-%m-%dT%H:%M:%SUTC")


async def fetch_timeseries(station_id: str, start_utc: datetime, end_utc: datetime) -> list[dict]:
    """Return the raw 10-minute rows for a station and UTC range.

    AEMET responds with an envelope {estado, datos, ...} where `datos` is a second
    URL holding the real payload, so we chain the two requests.
    """
    path = (
        f"/api/antartida/datos/fechaini/{_fmt(start_utc)}"
        f"/fechafin/{_fmt(end_utc)}/estacion/{station_id}"
    )
    async with httpx.AsyncClient(base_url=settings.aemet_base_url, timeout=settings.request_timeout) as client:
        logger.info("AEMET request station=%s range=%s..%s", station_id, _fmt(start_utc), _fmt(end_utc))
        envelope = (await client.get(path, params={"api_key": settings.aemet_api_key})).raise_for_status().json()

        estado = envelope.get("estado")
        if estado == 404:
            logger.warning("AEMET returned 404 (no data) for station=%s", station_id)
            return []
        if estado != 200 or "datos" not in envelope:
            raise AemetError(envelope.get("descripcion", f"Unexpected AEMET state: {estado}"))

        data_response = await client.get(envelope["datos"])
        data_response.raise_for_status()
        data_response.encoding = "ISO-8859-15"  # AEMET encoding
        return data_response.json()
