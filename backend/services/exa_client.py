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
    raise RuntimeError("Missing EXA_API_KEY environment variable")

exa = Exa(EXA_API_KEY)

__all__ = ["exa", "EXA_API_KEY"]
