from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import time
from typing import Any, Dict, Tuple

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

# In-memory cache: {(method_name, cache_key): {"value": ..., "timestamp": ...}}
_EXA_CACHE: Dict[Tuple[str, str], Dict[str, Any]] = {}

# Rate limit config
# Exa allows 5 requests per second. Stay below that with 250ms between calls (4 rps max)
_EXA_MIN_INTERVAL = 0.25  # 250 ms between calls gives 4 rps max
_last_exa_call_time: float = 0.0
_rate_limit_lock = asyncio.Lock()


async def _respect_rate_limit() -> None:
    """
    Ensure at least _EXA_MIN_INTERVAL seconds between Exa calls.
    This prevents hitting the "5 requests per second" limit and getting 429s.
    """
    global _last_exa_call_time
    async with _rate_limit_lock:
        now = time.time()
        elapsed = now - _last_exa_call_time
        if elapsed < _EXA_MIN_INTERVAL:
            sleep_time = _EXA_MIN_INTERVAL - elapsed
            await asyncio.sleep(sleep_time)
        _last_exa_call_time = time.time()


def _make_cache_key(method: str, *args: Any, **kwargs: Any) -> str:
    """
    Create a stable cache key from method name and arguments.
    Normalizes kwargs by sorting keys and converting to JSON string.
    """
    # Create a deterministic key from args and kwargs
    key_parts = [method]
    
    # Add args (convert to strings)
    for arg in args:
        if isinstance(arg, str):
            key_parts.append(arg)
        else:
            key_parts.append(str(arg))
    
    # Add kwargs (sorted for consistency)
    if kwargs:
        # Convert kwargs dict to a stable string representation
        # Sort keys to ensure consistent cache keys regardless of argument order
        kwargs_str = json.dumps(kwargs, sort_keys=True, default=str)
        key_parts.append(kwargs_str)
    
    # Create a hash for long keys to keep them manageable
    key_string = "|".join(str(p) for p in key_parts)
    if len(key_string) > 200:
        # Use hash for very long keys
        return hashlib.md5(key_string.encode()).hexdigest()
    return key_string


def _get_from_cache(method: str, cache_key: str, max_age_seconds: int = 3600) -> Any:
    """Get a value from cache if it exists and hasn't expired."""
    cache_entry_key = (method, cache_key)
    entry = _EXA_CACHE.get(cache_entry_key)
    if not entry:
        return None
    if time.time() - entry["timestamp"] > max_age_seconds:
        # Expired, remove from cache
        del _EXA_CACHE[cache_entry_key]
        return None
    logger.debug("Cache hit for %s with key %s", method, cache_key[:100])
    return entry["value"]


def _set_cache(method: str, cache_key: str, value: Any) -> None:
    """Store a value in cache."""
    cache_entry_key = (method, cache_key)
    _EXA_CACHE[cache_entry_key] = {"value": value, "timestamp": time.time()}
    logger.debug("Cached result for %s with key %s", method, cache_key[:100])


async def cached_search_and_contents(
    query: str,
    num_results: int = 8,
    max_age_seconds: int = 3600,
    **kwargs: Any,
) -> Any:
    """
    Rate limited, cached wrapper around exa.search_and_contents.
    Cache key is based on query, num_results, and other kwargs.
    """
    cache_key = _make_cache_key("search_and_contents", query, num_results=num_results, **kwargs)
    cached = _get_from_cache("search_and_contents", cache_key, max_age_seconds)
    if cached is not None:
        return cached

    await _respect_rate_limit()
    try:
        result = await asyncio.to_thread(
            exa.search_and_contents,
            query,
            num_results=num_results,
            **kwargs
        )
        _set_cache("search_and_contents", cache_key, result)
        return result
    except Exception as exc:
        logger.error("Exa search_and_contents failed for query '%s': %s", query[:100], exc)
        raise


async def cached_find_similar_and_contents(
    url: str,
    num_results: int = 8,
    max_age_seconds: int = 3600,
    **kwargs: Any,
) -> Any:
    """
    Rate limited, cached wrapper around exa.find_similar_and_contents.
    Cache key is based on url, num_results, and other kwargs.
    """
    cache_key = _make_cache_key("find_similar_and_contents", url, num_results=num_results, **kwargs)
    cached = _get_from_cache("find_similar_and_contents", cache_key, max_age_seconds)
    if cached is not None:
        return cached

    await _respect_rate_limit()
    try:
        result = await asyncio.to_thread(
            exa.find_similar_and_contents,
            url,
            num_results=num_results,
            **kwargs
        )
        _set_cache("find_similar_and_contents", cache_key, result)
        return result
    except Exception as exc:
        logger.error("Exa find_similar_and_contents failed for url '%s': %s", url[:100], exc)
        raise


__all__ = [
    "exa",
    "EXA_API_KEY",
    "cached_search_and_contents",
    "cached_find_similar_and_contents",
]
