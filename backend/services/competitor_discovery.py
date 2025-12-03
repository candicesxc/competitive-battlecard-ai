from __future__ import annotations

import asyncio
import json
import logging
from typing import Dict, List
from urllib.parse import urlparse

from ..models.company_profile import CompanyProfile, CompetitorStub
from .analysis_service import AnalysisError, _json_completion
from .exa_client import cached_search_and_contents
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


def _should_skip_domain(domain: str, target_domain: str | None) -> bool:
    """Check if a domain should be skipped."""
    if not domain:
        return True
    domain = domain.lower()
    if target_domain and domain == target_domain.lower():
        return True
    return any(keyword in domain for keyword in _SKIP_DOMAIN_KEYWORDS)


async def _collect_search_snippets_for_company(
    profile: CompanyProfile,
) -> List[Dict[str, str]]:
    """
    Use Exa search to fetch text snippets that mention competitors of the target company.

    Return a list of dicts with:
        - query: the search query used
        - source_url
        - source_title
        - excerpt_text
    """
    snippets: List[Dict[str, str]] = []
    name = profile.get("name", "")
    industry = profile.get("industry", "")
    target_audience = profile.get("target_audience", "")

    # Build search queries
    queries: List[str] = []
    if name:
        queries.append(f"{name} competitors")
        queries.append(f"{name} alternatives")
        queries.append(f"{name} similar platforms")

    if industry:
        queries.append(f"top {industry} tools")
        queries.append(f"best {industry} platforms")
        if target_audience:
            queries.append(f"best {industry} tools for {target_audience}")

    # Execute searches sequentially to respect rate limiting
    # The rate limiter will ensure proper spacing between calls
    search_results_list = []
    for query in queries[:6]:  # Limit to 6 queries
        try:
            result = await cached_search_and_contents(
                query,
                num_results=8,
                text={"max_characters": 2000},
            )
            search_results_list.append(result)
        except Exception as exc:
            logger.warning("Exa search failed for '%s': %s", query, exc)
            search_results_list.append(exc)

    try:
        for query, results in zip(queries[:6], search_results_list):
            if isinstance(results, Exception):
                logger.warning("Exa search failed for '%s': %s", query, results)
                continue

            for result in results.results:
                url = result.url or ""
                title = result.title or ""
                text = result.text or ""

                if not url or not text:
                    continue

                snippets.append(
                    {
                        "query": query,
                        "source_url": url,
                        "source_title": title,
                        "excerpt_text": text[:1500],  # Keep excerpts reasonable
                    }
                )
    except Exception as exc:
        logger.warning("Failed to collect search snippets: %s", exc)

    return snippets


async def _extract_competitor_stubs_from_snippets(
    profile: CompanyProfile,
    snippets: List[Dict[str, str]],
) -> List[CompetitorStub]:
    """
    Use OpenAI to read the snippets and identify competitor companies.

    For each competitor, return:
        - name
        - website if mentioned (can be empty if unknown)
        - description
        - evidence_strength: "high", "medium", or "low"
    """
    if not snippets:
        return []

    target_name = profile.get("name", "")
    target_industry = profile.get("industry", "")
    target_summary = profile.get("summary", "")[:500]

    system_prompt = (
        "You are an expert competitive intelligence analyst. "
        "Your job is to identify direct competitors and alternatives for software companies "
        "from web search excerpts. Focus on companies explicitly described as competitors, "
        "alternatives, or similar platforms. Ignore agencies, blogs, news outlets, and "
        "generic review domains as competitors themselves."
    )

    user_content = f"""Target Company Profile:
- Name: {target_name}
- Industry: {target_industry}
- Summary: {target_summary}

Web Search Excerpts:
{json.dumps(snippets, indent=2)}

Please analyze these excerpts and identify competitor companies. For each competitor found:
1. Extract the company name
2. Extract the website URL if mentioned (leave empty if unknown)
3. Write a brief description (1-2 sentences)
4. Assess evidence_strength: "high" if explicitly mentioned as a competitor/alternative, 
   "medium" if mentioned in a comparison list, "low" if only loosely related

Return a JSON array of competitor objects. Each object should have:
- name (string)
- website (string, can be empty)
- description (string)
- evidence_strength ("high" | "medium" | "low")

Return ONLY the JSON array, no other text or markdown."""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    try:
        from ..config import get_settings

        settings = get_settings()
        result = await _json_completion(
            messages,
            model=settings.analyst_model,
            response_format={"type": "json_object"},
        )

        # The model might return a dict with a "competitors" key, or directly an array
        if isinstance(result, dict):
            competitors = result.get("competitors", [])
            if not isinstance(competitors, list):
                competitors = [result] if result else []
        elif isinstance(result, list):
            competitors = result
        else:
            competitors = []

        # Validate and convert to CompetitorStub format
        stubs: List[CompetitorStub] = []
        for comp in competitors:
            if not isinstance(comp, dict):
                continue
            name = comp.get("name", "").strip()
            if not name:
                continue

            stub: CompetitorStub = {
                "name": name,
                "website": comp.get("website", "").strip(),
                "description": comp.get("description", "").strip() or f"Competitor in {target_industry}",
                "evidence_strength": comp.get("evidence_strength", "medium"),
            }
            stubs.append(stub)

        return stubs
    except AnalysisError as exc:
        logger.warning("Failed to extract competitor stubs: %s", exc)
        return []
    except Exception as exc:
        logger.warning("Unexpected error extracting competitor stubs: %s", exc)
        return []


async def _resolve_official_website(name: str) -> str:
    """
    If a competitor stub is missing website, run a small Exa search such as
    "NAME official site" or "NAME software" and return the vendor homepage URL.

    Skip obvious review sites, social media, and domains that match _SKIP_DOMAIN_KEYWORDS.
    If nothing reliable is found, return an empty string.
    """
    if not name:
        return ""

    queries = [
        f"{name} official site",
        f"{name} software",
        f"{name} homepage",
    ]

    for query in queries[:2]:  # Try up to 2 queries
        try:
            results = await cached_search_and_contents(
                query,
                num_results=5,
                text={"max_characters": 500},
            )

            for result in results.results:
                url = result.url or ""
                if not url:
                    continue

                domain = extract_domain(url) or ""
                if not domain:
                    continue

                # Skip review sites and social media
                if _should_skip_domain(domain, None):
                    continue

                # Prefer .com domains and homepage-like URLs
                parsed = urlparse(url)
                path = parsed.path.strip("/")
                if not path or path in ("", "index.html", "home"):
                    return url

                # If we found a reasonable domain, use it
                if domain and "." in domain:
                    return url

        except Exception as exc:
            logger.debug("Failed to resolve website for %s with query '%s': %s", name, query, exc)
            continue

    return ""


def _normalize_name(name: str) -> str:
    """Normalize a company name for deduplication."""
    return name.lower().strip().replace(" ", "").replace(".", "").replace("-", "")


async def discover_competitors_via_search(
    target_profile: CompanyProfile,
) -> List[CompetitorStub]:
    """
    1) Collect search snippets via Exa.
    2) Ask OpenAI to extract competitor stubs.
    3) Resolve missing websites via Exa.
    4) Deduplicate by name and domain.
    5) Optionally drop stubs with very low evidence.
    """
    target_domain = extract_domain(target_profile.get("website", ""))

    # Step 1: Collect snippets
    snippets = await _collect_search_snippets_for_company(target_profile)
    if not snippets:
        logger.warning("No search snippets collected for competitor discovery")
        return []

    # Step 2: Extract competitor stubs
    stubs = await _extract_competitor_stubs_from_snippets(target_profile, snippets)
    if not stubs:
        logger.warning("No competitor stubs extracted from snippets")
        return []

    # Step 3: Resolve missing websites
    for stub in stubs:
        if not stub.get("website"):
            website = await _resolve_official_website(stub["name"])
            if website:
                stub["website"] = website

    # Step 4: Deduplicate and filter
    seen_names: set[str] = set()
    seen_domains: set[str] = set()
    unique_stubs: List[CompetitorStub] = []

    for stub in stubs:
        name = stub.get("name", "")
        website = stub.get("website", "")
        domain = extract_domain(website) or ""

        # Normalize for comparison
        normalized_name = _normalize_name(name)

        # Skip if duplicate name or domain
        if normalized_name in seen_names:
            continue
        if domain and domain.lower() in seen_domains:
            continue

        # Skip if domain matches skip list
        if domain and _should_skip_domain(domain, target_domain):
            continue

        # Skip if target domain matches
        if domain and target_domain and domain.lower() == target_domain.lower():
            continue

        # Filter out low evidence if desired (keep high and medium)
        evidence = stub.get("evidence_strength", "medium")
        if evidence == "low" and len(unique_stubs) >= 10:
            continue  # Only skip low evidence if we already have enough

        seen_names.add(normalized_name)
        if domain:
            seen_domains.add(domain.lower())
        unique_stubs.append(stub)

    # Limit to top 10
    return unique_stubs[:10]


__all__ = ["discover_competitors_via_search"]
