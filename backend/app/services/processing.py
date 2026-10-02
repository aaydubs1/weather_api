"""Time-zone handling and aggregation. This is the core analytical logic.

Internal source of truth is always UTC. See DESIGN.md section 4.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from ..schemas import (
    Aggregation, DIR_STD_LABEL, FIELD_LABEL, GUST_LABEL, HUMIDITY_LABEL, Measurement,
    SOLAR_LABEL, SOURCE_FIELD, WIND_DIR_LABEL,
)

_FREQ = {Aggregation.hourly: "h", Aggregation.daily: "D", Aggregation.monthly: "MS"}
_PEAK_GUST_LABEL = "Peak gust (m/s)"  # the bucket's strongest gust (aggregated views)


def _to_float(value) -> float | None:
    """AEMET numbers may arrive as strings, possibly with a decimal comma."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", ".")
    if text == "":
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _circular_mean_deg(values) -> float | None:
    """Vector (circular) mean of wind directions in degrees. The plain arithmetic mean is
    wrong for angles — 350° and 10° average to 0°, not 180° — so we average the unit vectors."""
    arr = np.asarray([v for v in values if v is not None and not pd.isna(v)], dtype=float)
    if arr.size == 0:
        return None
    rad = np.deg2rad(arr)
    angle = np.arctan2(np.sin(rad).mean(), np.cos(rad).mean())
    return float(np.degrees(angle) % 360)


def parse_user_datetime(value: str, location: str | None, offset: str | None) -> datetime:
    """Parse 'YYYY-MM-DDTHH:MM:SS' in the user's zone/offset and return it in UTC."""
    dt = datetime.strptime(value, "%Y-%m-%dT%H:%M:%S")
    if location:
        dt = dt.replace(tzinfo=ZoneInfo(location))
    elif offset:
        sign = 1 if offset[0] == "+" else -1
        hours, minutes = offset[1:].split(":")
        dt = dt.replace(tzinfo=timezone(sign * timedelta(hours=int(hours), minutes=int(minutes))))
    else:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def build_frame(rows: list[dict]) -> pd.DataFrame:
    """Turn raw AEMET rows into a UTC-indexed DataFrame with numeric columns."""
    cols = ["temp", "pres", "vel", "dir", "velmax", "solar", "humidity", "dir_std"]
    if not rows:
        empty_index = pd.DatetimeIndex([], tz="UTC", name="Datetime")
        return pd.DataFrame(columns=cols, index=empty_index)

    df = pd.DataFrame(rows)
    index = pd.to_datetime(df.get("fhora"), utc=True, errors="coerce")
    frame = pd.DataFrame({c: (df[c].map(_to_float) if c in df else pd.NA) for c in cols})
    frame.index = pd.DatetimeIndex(index, name="Datetime")
    frame = frame[~frame.index.isna()].sort_index()
    # Chunked fetches can repeat a boundary timestamp; keep each instant once.
    frame = frame[~frame.index.duplicated(keep="first")]
    return frame


def process(
    rows: list[dict],
    *,
    measurements: list[Measurement],
    aggregation: Aggregation,
    station_name: str,
    station_tz: str,
    output_tz: str,
) -> list[dict]:
    """Produce the output dataset (list of flat rows) from raw AEMET rows."""
    frame = build_frame(rows)
    out_zone = ZoneInfo(output_tz)
    result: list[dict] = []
    # Wind direction and gust are shown alongside wind speed (the feasibility layer needs
    # them); they are not independent user-selectable measurements.
    include_wind = Measurement.speed in measurements

    if aggregation is Aggregation.none:
        local_index = frame.index.tz_convert(out_zone)
        for i in range(len(frame)):
            row = {"Station": station_name, "Datetime": local_index[i].isoformat()}
            for m in measurements:
                value = frame.iloc[i][SOURCE_FIELD[m]]
                row[FIELD_LABEL[m]] = None if pd.isna(value) else float(value)
            if include_wind:
                r = frame.iloc[i]
                row[WIND_DIR_LABEL] = None if pd.isna(r["dir"]) else float(r["dir"])
                row[GUST_LABEL] = None if pd.isna(r["velmax"]) else float(r["velmax"])
                row[SOLAR_LABEL] = None if pd.isna(r["solar"]) else float(r["solar"])
                row[HUMIDITY_LABEL] = None if pd.isna(r["humidity"]) else float(r["humidity"])
                row[DIR_STD_LABEL] = None if pd.isna(r["dir_std"]) else float(r["dir_std"])
            result.append(row)
        return result

    # Aggregated. Daily/Monthly must bucket by the station's local calendar (DESIGN.md 4).
    columns = [SOURCE_FIELD[m] for m in measurements]
    work = frame[columns].copy()
    if aggregation in (Aggregation.daily, Aggregation.monthly):
        work.index = work.index.tz_convert(ZoneInfo(station_tz))

    grouped = work.resample(_FREQ[aggregation])
    stats = grouped.agg(["mean", "min", "max"])
    counts = grouped.size()
    local_index = stats.index.tz_convert(out_zone)

    # Wind extras need special aggregation: gust -> bucket maximum (the peak), direction ->
    # circular mean. They resample the same frame/freq, so buckets align positionally.
    gust_max = dir_mean = solar_mean = hum_mean = dirstd_mean = None
    if include_wind:
        wind = frame[["dir", "velmax", "solar", "humidity", "dir_std"]].copy()
        if aggregation in (Aggregation.daily, Aggregation.monthly):
            wind.index = wind.index.tz_convert(ZoneInfo(station_tz))
        wgrouped = wind.resample(_FREQ[aggregation])
        gust_max = wgrouped["velmax"].max()
        dir_mean = wgrouped["dir"].apply(lambda s: _circular_mean_deg(s.values))
        solar_mean = wgrouped["solar"].mean()
        hum_mean = wgrouped["humidity"].mean()
        dirstd_mean = wgrouped["dir_std"].mean()

    for i in range(len(stats)):
        if counts.iloc[i] == 0:
            continue  # skip empty buckets
        row = {"Station": station_name, "Datetime": local_index[i].isoformat(), "Samples": int(counts.iloc[i])}
        for m in measurements:
            src, label = SOURCE_FIELD[m], FIELD_LABEL[m]
            mean, low, high = stats[(src, "mean")].iloc[i], stats[(src, "min")].iloc[i], stats[(src, "max")].iloc[i]
            row[f"{label} mean"] = None if pd.isna(mean) else round(float(mean), 4)
            row[f"{label} min"] = None if pd.isna(low) else float(low)
            row[f"{label} max"] = None if pd.isna(high) else float(high)
        if include_wind:
            g, d = gust_max.iloc[i], dir_mean.iloc[i]
            s_, h_, ds_ = solar_mean.iloc[i], hum_mean.iloc[i], dirstd_mean.iloc[i]
            row[_PEAK_GUST_LABEL] = None if pd.isna(g) else float(g)
            row[WIND_DIR_LABEL] = None if (d is None or pd.isna(d)) else round(float(d), 1)
            row[SOLAR_LABEL] = None if pd.isna(s_) else round(float(s_), 1)
            row[HUMIDITY_LABEL] = None if pd.isna(h_) else round(float(h_), 1)
            row[DIR_STD_LABEL] = None if pd.isna(ds_) else round(float(ds_), 1)
        result.append(row)
    return result
