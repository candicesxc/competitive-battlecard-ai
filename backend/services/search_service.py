from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from .exa_client import cached_search_and_contents

logger = logging.getLogger(__name__)


class SearchProviderError(RuntimeError):
    """Custom exception raised when external search API calls fail."""


_SKIP_DOMAINS = {
    "linkedin.com",
    "facebook.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "crunchbase.com",
    "wikipedia.org",
    "g2.com",
    "capterra.com",
    "glassdoor.com",
    "indeed.com",
    "youtube.com",
    "pinterest.com",
    "reddit.com",
    "medium.com",
    "zoominfo.com",
}


def extract_domain(url: str) -> Optional[str]:
    try:
        parsed = urlparse(url)
        if parsed.netloc:
            return parsed.netloc
    except ValueError:
        logger.debug("Failed to parse URL for domain extraction: %s", url)
    return None


def _is_social_or_directory(url: Optional[str]) -> bool:
    if not url:
        return True
    domain = extract_domain(url)
    if not domain:
        return True
    domain = domain.lower()
    # Check if the domain ends with or contains any of the skipped domains
    # We check containment to handle subdomains like www.linkedin.com
    return any(skip in domain for skip in _SKIP_DOMAINS)


async def _exa_search_request(query: str, num_results: int = 10) -> Dict[str, Any]:
    """Perform an Exa search and return results in the expected format."""

    try:
        results = await cached_search_and_contents(
            query,
            num_results=num_results,
            text={"max_characters": 500},
        )

        # Convert Exa results to the expected format
        organic_results = []
        for result in results.results:
            organic_results.append(
                {
                    "title": result.title or "",
                    "link": result.url or "",
                    "snippet": result.text[:300] if result.text else "",
                }
            )

        return {
            "organic": organic_results,
            "organic_results": organic_results,
            "knowledgeGraph": {},
            "knowledge_graph": {},
        }
    except Exception as exc:
        # Extract more detailed error information
        exc_type = type(exc).__name__
        exc_msg = str(exc)
        
        # Provide more specific error messages based on exception type
        if "401" in exc_msg or "unauthorized" in exc_msg.lower() or "api key" in exc_msg.lower():
            error_msg = "Search provider authentication failed. Please check API key configuration."
        elif "429" in exc_msg or "rate limit" in exc_msg.lower():
            error_msg = "Search provider rate limit exceeded. Please try again later."
        elif "timeout" in exc_msg.lower() or "timed out" in exc_msg.lower():
            error_msg = "Search provider request timed out. Please try again."
        elif "connection" in exc_msg.lower() or "network" in exc_msg.lower():
            error_msg = f"Search provider connection error: {exc_msg}"
        else:
            error_msg = f"Search provider request failed: {exc_msg}"
        
        logger.error(
            "Exa search failed [type=%s, query=%s]: %s",
            exc_type,
            query[:100] if query else "N/A",
            exc_msg,
            exc_info=True,
        )
        raise SearchProviderError(error_msg) from exc


async def _search_request(kind: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Route search requests to Exa and normalize the result."""

    query = payload.get("q", "")
    num = payload.get("num", 10)

    if kind == "news":
        # Exa doesn't have a dedicated news endpoint, so we'll search with "news" in the query
        query = f"{query} news"
        results = await _exa_search_request(query, num_results=num)
        # Convert organic results to news format
        news_items = [
            {
                "title": item.get("title", ""),
                "link": item.get("link", ""),
                "snippet": item.get("snippet", ""),
                "date": None,
            }
            for item in results.get("organic", [])
        ]
        results["news"] = news_items
        results["news_results"] = news_items
        return results

    return await _exa_search_request(query, num_results=num)


async def search_company_profile(target_url: str) -> Dict[str, Any]:
    """Retrieve general information about the company behind the given URL."""

    domain = extract_domain(target_url)
    query = f"About {domain or target_url}"
    payload = {"q": query, "num": 10}
    return await _search_request("search", payload)


async def generic_company_search(query: str, *, num: int = 10) -> Dict[str, Any]:
    """Run a generic search query using Exa."""

    payload = {"q": query, "num": num}
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

    # Find the first result that is not a social/directory link
    best_result = None
    for result in organic:
        if not _is_social_or_directory(result.get("link")):
            best_result = result
            break
    
    # Fallback to first result if all are skipped or list is empty
    if not best_result and organic:
        best_result = organic[0]

    overview = {
        "name": knowledge_graph.get("title")
        or (best_result.get("title") if best_result else None),
        "description": knowledge_graph.get("description")
        or (best_result.get("snippet") if best_result else None),
        "website": knowledge_graph.get("website")
        or (best_result.get("link") if best_result else None),
        "profiles": knowledge_graph.get("profiles", []),
        "related": knowledge_graph.get("peopleAlsoSearchFor", []),
    }

    return overview


__all__ = [
    "SearchProviderError",
    "search_company_profile",
    "generic_company_search",
    "search_company_competitors",
    "search_company_news",
    "parse_competitor_candidates",
    "parse_company_overview",
    "extract_domain",
]
