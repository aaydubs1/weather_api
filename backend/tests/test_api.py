"""Endpoint + cache behaviour. The AEMET source is replaced by a fake so these
tests are deterministic and need no network (the real two-step client is tested
separately in test_aemet_client.py)."""
from fastapi.testclient import TestClient

import app.services.cache as cache_module
from app.main import app

ROWS = [
    {"fhora": "2023-07-01T12:00:00+0000", "temp": "10.5", "pres": "980", "vel": "3",
     "ddd": "180", "velx": "7", "hr": "85", "dddstd": "5",
     "nombre": "Meteo Station Juan Carlos I"}
]
URL = "/api/antartida/datos/fechaini/2023-07-01T00:00:00/fechafin/2023-07-01T23:59:59/estacion/juan_carlos_i"


def _fake_source(counter):
    async def _fetch(station_id, start_utc, end_utc):
        counter["calls"] += 1
        return ROWS
    return _fetch


def test_endpoint_returns_processed_data(monkeypatch):
    counter = {"calls": 0}
    monkeypatch.setattr(cache_module, "fetch_timeseries", _fake_source(counter))

    with TestClient(app) as client:
        response = client.get(URL, params={"measurements": "temperature"})

    assert response.status_code == 200
    body = response.json()
    assert body["station"].endswith("Juan Carlos I")
    assert body["count"] == 1
    assert body["data"][0]["Temperature (ºC)"] == 10.5
    assert body["data"][0]["Datetime"] == "2023-07-01T14:00:00+02:00"
    assert counter["calls"] == 1


def test_cache_miss_fetches_from_source_once(monkeypatch):
    """First query for an uncached range is a cache MISS: the source is hit exactly
    once and the data is returned. (Its pair, the cache HIT, is the next test.)"""
    counter = {"calls": 0}
    monkeypatch.setattr(cache_module, "fetch_timeseries", _fake_source(counter))

    with TestClient(app) as client:
        response = client.get(URL)  # empty cache -> must go to the source

    assert response.status_code == 200
    assert response.json()["count"] == 1
    assert counter["calls"] == 1


def test_cache_avoids_a_second_source_call(monkeypatch):
    """Cache HIT: a second identical query is served from SQLite, so the source is
    not called again (calls stay at 1 across both requests)."""
    counter = {"calls": 0}
    monkeypatch.setattr(cache_module, "fetch_timeseries", _fake_source(counter))

    with TestClient(app) as client:
        client.get(URL)  # miss -> 1 source call
        client.get(URL)  # identical range -> served from cache, no new call

    assert counter["calls"] == 1


def test_wind_direction_and_gust_flow_through(monkeypatch):
    """An all-measurements query carries wind direction and gust end to end — which also
    exercises the new cache columns (store wind_dir/gust -> read dir/velmax)."""
    counter = {"calls": 0}
    monkeypatch.setattr(cache_module, "fetch_timeseries", _fake_source(counter))
    with TestClient(app) as client:
        response = client.get(URL)  # no measurements filter -> all, so wind extras are included
    row = response.json()["data"][0]
    assert row["Wind direction (°)"] == 180.0
    assert row["Gust (m/s)"] == 7.0
    assert row["Humidity (%)"] == 85.0


def test_unknown_station_is_rejected():
    with TestClient(app) as client:
        response = client.get(URL.replace("juan_carlos_i", "unknown"))
    assert response.status_code == 422


def test_long_range_is_split_into_monthly_chunks(monkeypatch):
    counter = {"calls": 0}
    monkeypatch.setattr(cache_module, "fetch_timeseries", _fake_source(counter))
    long_url = (
        "/api/antartida/datos/fechaini/2023-01-01T00:00:00"
        "/fechafin/2023-03-01T00:00:00/estacion/juan_carlos_i"
    )
    with TestClient(app) as client:
        response = client.get(long_url)
    assert response.status_code == 200
    assert counter["calls"] >= 2  # a 2-month range must hit AEMET in several <=1-month chunks
