"""Central logging configuration for troubleshooting (Part 2)."""
import logging


def configure_logging(level: int = logging.INFO) -> None:
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    )
    # httpx logs the full request URL at INFO, which would leak the AEMET api_key in the
    # query string. Raise its level so secrets never reach the logs.
    logging.getLogger("httpx").setLevel(logging.WARNING)
