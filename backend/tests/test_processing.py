"""Unit tests for the core logic: time zones, DST and aggregation."""
from app.schemas import Aggregation, Measurement
from app.services.processing import parse_user_datetime, process

T = Measurement.temperature
S = Measurement.speed


def _raw(fhora, temp=None):
    return {"fhora": fhora, "temp": temp, "pres": None, "vel": None, "nombre": "Station"}


def _wind(fhora, vel=None, direction=None, velmax=None, solar=None, humidity=None, dir_std=None):
    return {"fhora": fhora, "temp": None, "pres": None, "vel": vel,
            "dir": direction, "velmax": velmax, "solar": solar, "humidity": humidity,
            "dir_std": dir_std, "nombre": "Station"}


def _process_speed(rows, aggregation):
    return process(rows, measurements=[S], aggregation=aggregation,
                   station_name="Station", station_tz="Antarctica/Palmer", output_tz="Europe/Madrid")


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


def test_raw_includes_wind_direction_and_gust():
    out = _process_speed([_wind("2023-07-01T12:00:00+0000", "5", "90", "8")], Aggregation.none)
    assert out[0]["Speed (m/s)"] == 5.0
    assert out[0]["Wind direction (°)"] == 90.0
    assert out[0]["Gust (m/s)"] == 8.0


def test_raw_includes_solar_humidity_dirstd():
    row = _wind("2023-07-01T12:00:00+0000", "5", "90", "8", solar="420", humidity="88", dir_std="6")
    out = _process_speed([row], Aggregation.none)
    assert out[0]["Solar irradiance (W/m²)"] == 420.0
    assert out[0]["Humidity (%)"] == 88.0
    assert out[0]["Direction variability (°)"] == 6.0


def test_aggregation_uses_circular_mean_and_peak_gust():
    # Directions 350° and 10° must average to ~0°/360° (circular), NOT 180° (arithmetic).
    # Gust aggregates to the bucket maximum.
    rows = [
        _wind("2023-07-01T12:00:00+0000", "4", "350", "6"),
        _wind("2023-07-01T12:10:00+0000", "6", "10", "9"),
    ]
    out = _process_speed(rows, Aggregation.hourly)
    assert len(out) == 1
    assert out[0]["Peak gust (m/s)"] == 9.0
    d = out[0]["Wind direction (°)"]
    assert d == 0.0 or abs(d - 360.0) < 0.1  # ~0°, proving the circular mean is used
