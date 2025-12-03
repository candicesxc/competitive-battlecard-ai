from __future__ import annotations

import logging
from time import time
from typing import Any, Dict

logger = logging.getLogger(__name__)

_CACHE: Dict[str, Dict[str, Any]] = {}


def get_cached_result(key: str, max_age_seconds: int = 3600) -> Any:
    """Retrieve a cached result if it exists and hasn't expired."""
    entry = _CACHE.get(key)
    if not entry:
        return None
    if time() - entry["timestamp"] > max_age_seconds:
        del _CACHE[key]
        return None
    return entry["value"]


def set_cached_result(key: str, value: Any) -> None:
    """Store a value in the cache with the current timestamp."""
    _CACHE[key] = {"value": value, "timestamp": time()}


def clear_cache() -> None:
    """Clear all cached results."""
    _CACHE.clear()


__all__ = ["get_cached_result", "set_cached_result", "clear_cache"]
