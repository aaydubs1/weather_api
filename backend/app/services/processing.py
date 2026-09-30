"""Time-zone handling and aggregation. This is the core analytical logic.

Internal source of truth is always UTC. See DESIGN.md section 4.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pandas as pd

from ..schemas import Aggregation, FIELD_LABEL, Measurement, SOURCE_FIELD

_FREQ = {Aggregation.hourly: "h", Aggregation.daily: "D", Aggregation.monthly: "MS"}


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
    if not rows:
        empty_index = pd.DatetimeIndex([], tz="UTC", name="Datetime")
        return pd.DataFrame(columns=["temp", "pres", "vel"], index=empty_index)

    df = pd.DataFrame(rows)
    index = pd.to_datetime(df.get("fhora"), utc=True, errors="coerce")
    frame = pd.DataFrame(
        {
            "temp": df["temp"].map(_to_float) if "temp" in df else pd.NA,
            "pres": df["pres"].map(_to_float) if "pres" in df else pd.NA,
            "vel": df["vel"].map(_to_float) if "vel" in df else pd.NA,
        }
    )
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

    if aggregation is Aggregation.none:
        local_index = frame.index.tz_convert(out_zone)
        for i in range(len(frame)):
            row = {"Station": station_name, "Datetime": local_index[i].isoformat()}
            for m in measurements:
                value = frame.iloc[i][SOURCE_FIELD[m]]
                row[FIELD_LABEL[m]] = None if pd.isna(value) else float(value)
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
        result.append(row)
    return result
