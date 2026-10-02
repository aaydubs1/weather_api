"""Verify the two-step AEMET flow: envelope with a 'datos' URL, then the payload."""
import asyncio
from datetime import datetime, timezone

import pytest
import respx

import app.services.aemet_client as client_module
from app.services.aemet_client import AemetError, fetch_timeseries

ROWS = [{"fhora": "2023-07-01T12:00:00+0000", "temp": "10.5", "pres": "980", "vel": "3", "nombre": "JC I"}]


@respx.mock
def test_two_step_request_flow():
    respx.route(method="GET", host="opendata.aemet.es").respond(
        json={"estado": 200, "datos": "https://fake.local/data"}
    )
    respx.get("https://fake.local/data").respond(json=ROWS)

    result = asyncio.run(
        fetch_timeseries(
            "89064",
            datetime(2023, 7, 1, tzinfo=timezone.utc),
            datetime(2023, 7, 2, tzinfo=timezone.utc),
        )
    )
    assert result == ROWS


@respx.mock
def test_no_data_returns_empty_list():
    respx.route(method="GET", host="opendata.aemet.es").respond(json={"estado": 404, "descripcion": "no data"})
    result = asyncio.run(
        fetch_timeseries("89064", datetime(2023, 7, 1, tzinfo=timezone.utc), datetime(2023, 7, 2, tzinfo=timezone.utc))
    )
    assert result == []


@respx.mock
def test_transient_503_is_retried_then_raises_clean_error(monkeypatch):
    # No real waiting between retries.
    async def _no_sleep(_):
        return None
    monkeypatch.setattr(client_module.asyncio, "sleep", _no_sleep)

    route = respx.route(method="GET", host="opendata.aemet.es").respond(status_code=503)
    with pytest.raises(AemetError):
        asyncio.run(
            fetch_timeseries("89064", datetime(2023, 7, 1, tzinfo=timezone.utc), datetime(2023, 7, 2, tzinfo=timezone.utc))
        )
    assert route.call_count == 3  # retried up to _MAX_ATTEMPTS before giving up
