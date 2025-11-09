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


class SerperError(RuntimeError):
    """Custom exception raised when Serper API calls fail."""


def extract_domain(url: str) -> Optional[str]:
    try:
        parsed = urlparse(url)
        if parsed.netloc:
            return parsed.netloc
    except ValueError:
        logger.debug("Failed to parse URL for domain extraction: %s", url)
    return None


async def _serper_request(endpoint: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Perform a POST request to the Serper API and return the JSON body."""

    settings = get_settings()
    headers = {
        "X-API-KEY": settings.serper_api_key.get_secret_value(),
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
        try:
            response = await client.post(endpoint, headers=headers, json=payload)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            body = exc.response.text
            logger.error("Serper API returned error %s: %s", exc.response.status_code, body)
            raise SerperError(f"Serper API error: {exc.response.status_code}") from exc
        except httpx.HTTPError as exc:
            logger.exception("Serper API request failed")
            raise SerperError("Serper API request failed") from exc

    return response.json()


async def search_company_profile(target_url: str) -> Dict[str, Any]:
    """Retrieve general information about the company behind the given URL."""

    domain = extract_domain(target_url)
    query = f"About {domain or target_url}"
    payload = {"q": query, "num": 10}
    return await _serper_request(SERPER_ENDPOINTS["search"], payload)


async def search_company_competitors(company_name: str) -> Dict[str, Any]:
    """Retrieve competitor information for the given company name."""

    query = f"Top competitors of {company_name}"
    payload = {"q": query, "num": 10}
    return await _serper_request(SERPER_ENDPOINTS["search"], payload)


async def search_company_news(company_name: str, limit: int = 5) -> Dict[str, Any]:
    """Retrieve recent news for the given company name."""

    query = f"Latest news about {company_name}"
    payload = {"q": query, "num": limit}
    return await _serper_request(SERPER_ENDPOINTS["news"], payload)


def parse_competitor_candidates(
    search_results: Dict[str, Any],
    *,
    target_domain: Optional[str] = None,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """Extract competitor candidates from Serper search results."""

    organic_results = search_results.get("organic", [])
    knowledge_graph = search_results.get("knowledgeGraph", {})
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
    """Extract company overview data from Serper search results."""

    knowledge_graph = search_results.get("knowledgeGraph", {})
    organic = search_results.get("organic", [])
    people_search = knowledge_graph.get("peopleAlsoSearchFor", [])

    overview = {
        "name": knowledge_graph.get("title") or (organic[0].get("title") if organic else None),
        "description": knowledge_graph.get("description")
        or (organic[0].get("snippet") if organic else None),
        "website": knowledge_graph.get("website") or (organic[0].get("link") if organic else None),
        "profiles": knowledge_graph.get("profiles", []),
        "related": people_search,
    }

    return overview


__all__ = [
    "SerperError",
    "search_company_profile",
    "search_company_competitors",
    "search_company_news",
    "parse_competitor_candidates",
    "parse_company_overview",
    "extract_domain",
]


