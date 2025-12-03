from __future__ import annotations

import asyncio
import logging
from typing import List, Optional, TypedDict
from urllib.parse import urlparse

import httpx

from ..models.company_profile import CompanyProfile
from .exa_client import exa
from .search_service import extract_domain

logger = logging.getLogger(__name__)

_SKIP_DOMAIN_KEYWORDS = (
    "g2.com",
    "capterra",
    "getapp",
    "softwareadvice",
    "glassdoor",
    "indeed",
    "builtin",
    "linkedin",
    "facebook",
    "twitter",
    "x.com",
    "youtube",
    "pinterest",
    "reddit",
    "medium.com",
    "crunchbase",
    "wikipedia",
)

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.0.0 Safari/537.36"
)


def _should_skip_domain(domain: str, target_domain: Optional[str]) -> bool:
    """Check if a domain should be skipped (junk sites, target itself, etc.)."""
    if not domain:
        return True
    domain = domain.lower()
    if target_domain and domain == target_domain.lower():
        return True
    return any(keyword in domain for keyword in _SKIP_DOMAIN_KEYWORDS)


async def _fetch_page_text(url: str) -> str:
    """Fetch and strip HTML from a URL."""
    if not url:
        return ""

    try:
        async with httpx.AsyncClient(
            headers={"User-Agent": _USER_AGENT},
            timeout=httpx.Timeout(15.0),
        ) as client:
            response = await client.get(url)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Failed to fetch page text for %s: %s", url, exc)
        return ""

    import re

    text = response.text
    cleaned = re.sub(r"(?is)<(script|style)[^>]*>.*?</\\1>", " ", text)
    cleaned = re.sub(r"(?is)<!--.*?-->", " ", cleaned)
    cleaned = re.sub(r"(?is)<[^>]+>", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()[:6000]


class CompetitorCandidate(TypedDict, total=False):
    """A candidate competitor discovered via Exa search."""

    name: str
    website: str
    snippet: str
    source: str  # e.g. "find_similar" or "search"
    raw_text: str  # page text from Exa, if available


def _normalize_domain(url: str) -> str:
    """Normalize a URL to a domain for deduplication."""
    parsed = urlparse(url)
    domain = parsed.netloc or ""
    domain = domain.lower().replace("www.", "")
    return domain


async def find_competitor_candidates_with_exa(
    target_url: str,
    target_profile: CompanyProfile,
    max_results: int = 20,
) -> List[CompetitorCandidate]:
    """Discover competitor candidates using Exa similarity search and keyword queries."""

    target_domain = extract_domain(target_url)
    candidates: List[CompetitorCandidate] = []
    seen_domains: set[str] = set()

    # Step 1: Use Exa "find_similar" search
    try:
        logger.info("Using Exa find_similar for %s", target_url)
        similar_results = await exa.find_similar_and_contents(
            target_url,
            num_results=10,
            use_autoprompt=True,
            text={"max_characters": 2000},
        )

        for result in similar_results.results:
            url = result.url or ""
            domain = _normalize_domain(url)
            if not url or not domain or domain in seen_domains:
                continue
            if _should_skip_domain(domain, target_domain):
                continue

            seen_domains.add(domain)
            text_content = result.text or ""
            title = result.title or domain.split(".")[0].replace("-", " ").title()

            candidates.append(
                CompetitorCandidate(
                    name=title,
                    website=url,
                    snippet=result.text[:300] if result.text else "",
                    source="find_similar",
                    raw_text=text_content,
                )
            )
            if len(candidates) >= max_results:
                return candidates
    except Exception as exc:
        logger.warning("Exa find_similar failed: %s", exc)

    # Step 2: Build keyword queries from target profile
    name = target_profile.get("name") or ""
    industry = target_profile.get("industry") or ""
    sub_industry = target_profile.get("sub_industry") or ""
    target_audience = target_profile.get("target_audience") or ""
    core_products = target_profile.get("core_products") or []

    queries: List[str] = []

    if name:
        queries.append(f"{name} alternatives")
        queries.append(f"alternatives to {name} software")

    if industry and target_audience:
        queries.append(f"top {industry} tools for {target_audience}")

    if industry:
        queries.append(f"best {industry} platforms")

    if core_products and len(core_products) > 0:
        queries.append(f"{core_products[0]} competitors")

    # Step 3: Execute keyword searches
    search_tasks = []
    for query in queries[:4]:  # Limit to 4 queries to control costs
        # Create coroutine for each query
        search_tasks.append(
            exa.search_and_contents(
                query,
                num_results=5,
                text={"max_characters": 2000},
            )
        )

    try:
        search_results_list = await asyncio.gather(
            *search_tasks, return_exceptions=True
        )

        for query, results in zip(queries, search_results_list):
            if isinstance(results, Exception):
                logger.warning("Exa search failed for '%s': %s", query, results)
                continue

            for result in results.results:
                url = result.url or ""
                domain = _normalize_domain(url)
                if not url or not domain or domain in seen_domains:
                    continue
                if _should_skip_domain(domain, target_domain):
                    continue

                seen_domains.add(domain)
                text_content = result.text or ""
                title = result.title or domain.split(".")[0].replace("-", " ").title()

                candidates.append(
                    CompetitorCandidate(
                        name=title,
                        website=url,
                        snippet=result.text[:300] if result.text else "",
                        source="search",
                        raw_text=text_content,
                    )
                )
                if len(candidates) >= max_results:
                    return candidates
    except Exception as exc:
        logger.warning("Exa keyword searches failed: %s", exc)

    # Step 4: Fill in missing raw_text for candidates that don't have it
    for candidate in candidates:
        if not candidate.get("raw_text"):
            try:
                page_text = await _fetch_page_text(candidate["website"])
                if page_text:
                    candidate["raw_text"] = page_text
            except Exception as exc:
                logger.debug("Failed to fetch page text for %s: %s", candidate["website"], exc)

    return candidates[:max_results]


__all__ = ["find_competitor_candidates_with_exa", "CompetitorCandidate"]
