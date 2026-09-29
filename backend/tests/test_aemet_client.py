"""Verify the two-step AEMET flow: envelope with a 'datos' URL, then the payload."""
import asyncio
from datetime import datetime, timezone

import respx

from app.services.aemet_client import fetch_timeseries

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
