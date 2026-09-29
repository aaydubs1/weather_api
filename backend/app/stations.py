"""The only two stations the brief allows, mapped to their AEMET id."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Station:
    key: str
    aemet_id: str
    name: str


STATIONS: dict[str, Station] = {
    "gabriel_de_castilla": Station("gabriel_de_castilla", "89070", "Meteo Station Gabriel de Castilla"),
    "juan_carlos_i": Station("juan_carlos_i", "89064", "Meteo Station Juan Carlos I"),
}


def resolve_station(identificacion: str) -> Station | None:
    """Accept the friendly key or the raw AEMET id."""
    if identificacion in STATIONS:
        return STATIONS[identificacion]
    for station in STATIONS.values():
        if station.aemet_id == identificacion:
            return station
    return None
