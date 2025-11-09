from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)

SERPER_ENDPOINTS = {
    "search": "https://google.serper.dev/search",
    "news": "https://google.serper.dev/news",
}

SERPAPI_ENDPOINT = "https://serpapi.com/search"
SERPAPI_ENGINES = {
    "search": "google",
    "news": "google_news",
}


class SearchProviderError(RuntimeError):
    """Custom exception raised when external search API calls fail."""


def extract_domain(url: str) -> Optional[str]:
    try:
        parsed = urlparse(url)
        if parsed.netloc:
            return parsed.netloc
    except ValueError:
        logger.debug("Failed to parse URL for domain extraction: %s", url)
    return None


async def _serper_request(kind: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Perform a POST request to the Serper API and return the JSON body."""

    settings = get_settings()
    if not settings.serper_api_key:
        raise SearchProviderError("Serper API key is not configured.")

    endpoint = SERPER_ENDPOINTS.get(kind)
    if not endpoint:
        raise SearchProviderError(f"Unsupported Serper request type: {kind}")

    headers = {
        "X-API-KEY": settings.serper_api_key.get_secret_value(),
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
        try:
            response = await client.post(endpoint, json=payload, headers=headers)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            body = exc.response.text
            logger.error(
                "Serper API returned error %s: %s", exc.response.status_code, body
            )
            raise SearchProviderError(
                f"Search provider 'serper' returned error {exc.response.status_code}"
            ) from exc
        except httpx.HTTPError as exc:
            logger.exception("Serper API request failed")
            raise SearchProviderError("Search provider 'serper' request failed") from exc

    return response.json()


async def _serpapi_request(kind: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Perform a GET request to the SerpAPI service and return the JSON body."""

    settings = get_settings()
    if not settings.serpapi_api_key:
        raise SearchProviderError("SerpAPI key is not configured.")

    engine = SERPAPI_ENGINES.get(kind)
    if not engine:
        raise SearchProviderError(f"Unsupported SerpAPI request type: {kind}")

    params = {
        "api_key": settings.serpapi_api_key.get_secret_value(),
        "engine": engine,
        **payload,
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
        try:
            response = await client.get(SERPAPI_ENDPOINT, params=params)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            body = exc.response.text
            logger.error(
                "SerpAPI returned error %s: %s", exc.response.status_code, body
            )
            raise SearchProviderError(
                f"Search provider 'serpapi' returned error {exc.response.status_code}"
            ) from exc
        except httpx.HTTPError as exc:
            logger.exception("SerpAPI request failed")
            raise SearchProviderError("Search provider 'serpapi' request failed") from exc

    return response.json()


def _normalize_search_results(
    provider: str, kind: str, response: Dict[str, Any]
) -> Dict[str, Any]:
    """Normalize provider-specific payload differences."""

    if provider != "serpapi":
        return response

    normalized: Dict[str, Any] = dict(response)

    organic_results = response.get("organic_results")
    if organic_results is not None and "organic" not in normalized:
        normalized["organic"] = organic_results

    knowledge_graph = response.get("knowledge_graph")
    if knowledge_graph is not None:
        normalized_kg = dict(knowledge_graph)
        if (
            "people_also_search_for" in knowledge_graph
            and "peopleAlsoSearchFor" not in normalized_kg
        ):
            normalized_kg["peopleAlsoSearchFor"] = knowledge_graph[
                "people_also_search_for"
            ]
        normalized.setdefault("knowledgeGraph", normalized_kg)

    if kind == "news":
        news_items = response.get("news_results")
        if news_items is not None:
            normalized["news"] = [
                {
                    "title": item.get("title"),
                    "link": item.get("link"),
                    "snippet": item.get("snippet") or item.get("summary"),
                    "date": item.get("date"),
                }
                for item in news_items
            ]

    return normalized


async def _search_request(kind: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Route search requests to the configured provider and normalize the result."""

    settings = get_settings()
    try:
        provider = settings.determine_search_provider()
    except ValueError as exc:
        raise SearchProviderError(str(exc)) from exc

    if provider == "serper":
        response = await _serper_request(kind, payload)
    elif provider == "serpapi":
        response = await _serpapi_request(kind, payload)
    else:
        raise SearchProviderError(f"Unsupported search provider: {provider}")

    return _normalize_search_results(provider, kind, response)


async def search_company_profile(target_url: str) -> Dict[str, Any]:
    """Retrieve general information about the company behind the given URL."""

    domain = extract_domain(target_url)
    query = f"About {domain or target_url}"
    payload = {"q": query, "num": 10}
    return await _search_request("search", payload)


async def search_company_competitors(company_name: str) -> Dict[str, Any]:
    """Retrieve competitor information for the given company name."""

    query = f"Top competitors of {company_name}"
    payload = {"q": query, "num": 10}
    return await _search_request("search", payload)


async def search_company_news(company_name: str, limit: int = 5) -> Dict[str, Any]:
    """Retrieve recent news for the given company name."""

    query = f"Latest news about {company_name}"
    payload = {"q": query, "num": limit}
    return await _search_request("news", payload)


def parse_competitor_candidates(
    search_results: Dict[str, Any],
    *,
    target_domain: Optional[str] = None,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """Extract competitor candidates from provider-agnostic search results."""

    organic_results = search_results.get("organic") or search_results.get(
        "organic_results", []
    )
    knowledge_graph = search_results.get("knowledgeGraph") or search_results.get(
        "knowledge_graph", {}
    )
    competitors: List[Dict[str, Any]] = []

    def _is_duplicate(url: Optional[str]) -> bool:
        if not url:
            return False
        return any(comp.get("url") == url for comp in competitors)

    def _is_target_domain(url: Optional[str]) -> bool:
        if not url or not target_domain:
            return False
        parsed = urlparse(url)
        return parsed.netloc == target_domain

    # First, leverage knowledge graph "people also search for"
    for related in knowledge_graph.get("peopleAlsoSearchFor", []):
        url = related.get("link")
        if _is_duplicate(url) or _is_target_domain(url):
            continue
        competitors.append(
            {
                "name": related.get("title"),
                "url": url,
                "snippet": related.get("snippet") or related.get("description"),
            }
        )
        if len(competitors) >= limit:
            return competitors

    for result in organic_results:
        url = result.get("link")
        if _is_duplicate(url) or _is_target_domain(url):
            continue
        competitor = {
            "name": result.get("title"),
            "url": url,
            "snippet": result.get("snippet"),
        }
        if competitor["name"] and competitor["url"]:
            competitors.append(competitor)
        if len(competitors) >= limit:
            break

    return competitors


def parse_company_overview(search_results: Dict[str, Any]) -> Dict[str, Any]:
    """Extract company overview data from provider-agnostic search results."""

    knowledge_graph = search_results.get("knowledgeGraph") or search_results.get(
        "knowledge_graph", {}
    )
    organic = search_results.get("organic") or search_results.get(
        "organic_results", []
    )

    overview = {
        "name": knowledge_graph.get("title")
        or (organic[0].get("title") if organic else None),
        "description": knowledge_graph.get("description")
        or (organic[0].get("snippet") if organic else None),
        "website": knowledge_graph.get("website")
        or (organic[0].get("link") if organic else None),
        "profiles": knowledge_graph.get("profiles", []),
        "related": knowledge_graph.get("peopleAlsoSearchFor", []),
    }

    return overview


__all__ = [
    "SearchProviderError",
    "search_company_profile",
    "search_company_competitors",
    "search_company_news",
    "parse_competitor_candidates",
    "parse_company_overview",
    "extract_domain",
]
