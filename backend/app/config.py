"""Typed application configuration. Secrets come from the environment, never the code."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    aemet_api_key: str = ""
    aemet_base_url: str = "https://opendata.aemet.es/opendata"
    # Civil time zone assumed for the Antarctic stations (see DESIGN.md).
    station_timezone: str = "Antarctica/Palmer"
    # Output time zone required by the brief.
    output_timezone: str = "Europe/Madrid"
    database_url: str = "sqlite:///./aemet_cache.db"
    request_timeout: float = 30.0


settings = Settings()
