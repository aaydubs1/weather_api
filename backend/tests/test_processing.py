"""Unit tests for the core logic: time zones, DST and aggregation."""
from app.schemas import Aggregation, Measurement
from app.services.processing import parse_user_datetime, process

T = Measurement.temperature


def _raw(fhora, temp=None):
    return {"fhora": fhora, "temp": temp, "pres": None, "vel": None, "nombre": "Station"}


def _process(rows, aggregation):
    return process(
        rows,
        measurements=[T],
        aggregation=aggregation,
        station_name="Station",
        station_tz="Antarctica/Palmer",
        output_tz="Europe/Madrid",
    )


def test_parse_input_with_offset_to_utc():
    dt = parse_user_datetime("2023-07-01T02:00:00", None, "+02:00")
    assert dt.isoformat() == "2023-07-01T00:00:00+00:00"


def test_parse_input_with_location_to_utc():
    dt = parse_user_datetime("2023-07-01T02:00:00", "Europe/Madrid", None)  # summer +02:00
    assert dt.isoformat() == "2023-07-01T00:00:00+00:00"


def test_output_offset_is_plus_two_in_summer():
    out = _process([_raw("2023-07-01T12:00:00+0000", "10.5")], Aggregation.none)
    assert out[0]["Datetime"] == "2023-07-01T14:00:00+02:00"  # CEST
    assert out[0]["Temperature (ºC)"] == 10.5


def test_output_offset_is_plus_one_in_winter():
    out = _process([_raw("2023-01-01T12:00:00+0000", "1")], Aggregation.none)
    assert out[0]["Datetime"] == "2023-01-01T13:00:00+01:00"  # CET (DST off)


def test_hourly_aggregation_mean_min_max():
    rows = [
        _raw("2023-07-01T12:00:00+0000", "10"),
        _raw("2023-07-01T12:10:00+0000", "20"),
        _raw("2023-07-01T12:50:00+0000", "30"),
    ]
    out = _process(rows, Aggregation.hourly)
    assert len(out) == 1
    row = out[0]
    assert row["Datetime"] == "2023-07-01T14:00:00+02:00"
    assert row["Temperature (ºC) mean"] == 20.0
    assert row["Temperature (ºC) min"] == 10.0
    assert row["Temperature (ºC) max"] == 30.0
    assert row["Samples"] == 3


def test_daily_aggregation_buckets_by_station_local_day():
    # In Antarctica/Palmer (UTC-3): 01:00Z -> 22:00 previous day; 05:00Z -> 02:00 same day.
    # So these two points fall on DIFFERENT local days -> two daily buckets.
    rows = [_raw("2023-07-01T01:00:00+0000", "5"), _raw("2023-07-01T05:00:00+0000", "7")]
    out = _process(rows, Aggregation.daily)
    assert len(out) == 2
