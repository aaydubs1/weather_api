"""Async client for the AEMET OpenData API (two-step request flow)."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

# AEMET occasionally returns these transient statuses (overload / rate limiting); retry them.
_RETRY_STATUSES = {429, 500, 502, 503, 504}
_MAX_ATTEMPTS = 3


class AemetError(RuntimeError):
    """Raised when AEMET returns an unexpected state or stays unavailable."""


def _fmt(dt: datetime) -> str:
    # AEMET expects the UTC datetime with a trailing 'UTC'.
    return dt.strftime("%Y-%m-%dT%H:%M:%SUTC")


async def _get(client: httpx.AsyncClient, url: str, *, params: dict | None = None) -> httpx.Response:
    """GET with a short backoff on transient AEMET errors; a clean AemetError on failure.

    Never includes the api_key in raised messages or logs (it travels only in `params`)."""
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            response = await client.get(url, params=params)
        except httpx.RequestError as exc:
            if attempt < _MAX_ATTEMPTS:
                await asyncio.sleep(1.5 * attempt)
                continue
            raise AemetError(f"Could not reach AEMET: {exc.__class__.__name__}") from exc

        if response.status_code in _RETRY_STATUSES and attempt < _MAX_ATTEMPTS:
            logger.warning("AEMET HTTP %s — retry %s/%s", response.status_code, attempt, _MAX_ATTEMPTS)
            await asyncio.sleep(1.5 * attempt)
            continue

        if response.status_code >= 400:
            raise AemetError(f"AEMET source is unavailable (HTTP {response.status_code}). Please try again shortly.")
        return response


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
        envelope = (await _get(client, path, params={"api_key": settings.aemet_api_key})).json()

        estado = envelope.get("estado")
        if estado == 404:
            logger.warning("AEMET returned 404 (no data) for station=%s", station_id)
            return []
        if estado != 200 or "datos" not in envelope:
            raise AemetError(envelope.get("descripcion", f"Unexpected AEMET state: {estado}"))

        data_response = await _get(client, envelope["datos"])
        data_response.encoding = "ISO-8859-15"  # AEMET encoding
        return data_response.json()
