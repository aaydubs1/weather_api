"""Enums and field mappings shared across the app."""
from enum import Enum


class Aggregation(str, Enum):
    none = "None"
    hourly = "Hourly"
    daily = "Daily"
    monthly = "Monthly"


class Measurement(str, Enum):
    temperature = "temperature"
    pressure = "pressure"
    speed = "speed"


# our measurement -> AEMET source field
SOURCE_FIELD: dict[Measurement, str] = {
    Measurement.temperature: "temp",
    Measurement.pressure: "pres",
    Measurement.speed: "vel",
}

# our measurement -> output dataset label (as in the brief's table)
FIELD_LABEL: dict[Measurement, str] = {
    Measurement.temperature: "Temperature (ºC)",
    Measurement.pressure: "Pressure (hpa)",
    Measurement.speed: "Speed (m/s)",
}

# Wind extras (not user-selectable measurements): shown alongside wind speed. Direction is
# in degrees (0–360, meteorological: where the wind comes from); gust is in m/s.
WIND_DIR_LABEL = "Wind direction (°)"
GUST_LABEL = "Gust (m/s)"
# Environmental extras for the feasibility layer.
HUMIDITY_LABEL = "Humidity (%)"
DIR_STD_LABEL = "Direction variability (°)"
