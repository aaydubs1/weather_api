"""Endpoint tests with the AEMET source mocked (respx) and the cache verified."""
import respx
from fastapi.testclient import TestClient

from app.main import app

ENVELOPE = {"estado": 200, "datos": "https://fake.local/data"}
ROWS = [{"fhora": "2023-07-01T12:00:00+0000", "temp": "10.5", "pres": "980", "vel": "3", "nombre": "Meteo Station Juan Carlos I"}]
URL = "/api/antartida/datos/fechaini/2023-07-01T00:00:00/fechafin/2023-07-01T23:59:59/estacion/juan_carlos_i"


@respx.mock(assert_all_mocked=False)
def test_endpoint_returns_processed_data():
    respx.route(method="GET", host="opendata.aemet.es").respond(json=ENVELOPE)
    respx.get("https://fake.local/data").respond(json=ROWS)

    with TestClient(app) as client:
        response = client.get(URL, params={"measurements": "temperature"})

    assert response.status_code == 200
    body = response.json()
    assert body["station"].endswith("Juan Carlos I")
    assert body["count"] == 1
    assert body["data"][0]["Temperature (ºC)"] == 10.5
    assert body["data"][0]["Datetime"] == "2023-07-01T14:00:00+02:00"


@respx.mock(assert_all_mocked=False)
def test_cache_avoids_a_second_source_call():
    source = respx.route(method="GET", host="opendata.aemet.es").respond(json=ENVELOPE)
    respx.get("https://fake.local/data").respond(json=ROWS)

    with TestClient(app) as client:
        client.get(URL)
        client.get(URL)  # identical range -> should be served from the cache

    assert source.call_count == 1


@respx.mock(assert_all_mocked=False)
def test_unknown_station_is_rejected():
    with TestClient(app) as client:
        response = client.get(URL.replace("juan_carlos_i", "unknown"))
    assert response.status_code == 422
