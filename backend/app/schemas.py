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
