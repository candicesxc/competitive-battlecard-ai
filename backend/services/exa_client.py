from __future__ import annotations

import logging
import os

from exa_py import Exa

from ..config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

EXA_API_KEY = os.getenv("EXA_API_KEY") or (
    settings.exa_api_key.get_secret_value() if settings.exa_api_key else None
)

if not EXA_API_KEY:
    error_msg = (
        "Missing EXA_API_KEY environment variable. "
        "Please set EXA_API_KEY in your environment or configuration."
    )
    logger.error(error_msg)
    raise RuntimeError(error_msg)

try:
    exa = Exa(EXA_API_KEY)
    logger.info("Exa client initialized successfully")
except Exception as exc:
    error_msg = f"Failed to initialize Exa client: {str(exc)}"
    logger.error(error_msg, exc_info=True)
    raise RuntimeError(error_msg) from exc

__all__ = ["exa", "EXA_API_KEY"]
