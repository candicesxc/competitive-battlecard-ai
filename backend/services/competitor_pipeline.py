from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional

import httpx

from ..config import get_settings
from .analysis_service import AnalysisError, _json_completion
from .search_service import extract_domain, generic_company_search

logger = logging.getLogger(__name__)

settings = get_settings()

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.0.0 Safari/537.36"
)

_COMPANY_PROFILE_PROMPT = (
    "You are a market intelligence analyst. Read the provided homepage text and URL to "
    "extract a structured profile of the company. Use only the supplied information and "
    "common knowledge about the company if it is widely known. Populate every field with "
    "concise, factual language. When uncertain, respond with 'unknown'. Return valid JSON "
    "only. Never mention or request logos or images."
)

_COMPANY_PROFILE_SCHEMA: Dict[str, Any] = {
    "name": "company_profile",
    "schema": {
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "website": {"type": "string"},
            "industry": {"type": "string"},
            "sub_industry": {"type": "string"},
            "company_size": {
                "type": "string",
                "enum": ["startup", "midmarket", "enterprise", "unknown"],
            },
            "business_model": {
                "type": "string",
                "enum": [
                    "B2B SaaS",
                    "B2C",
                    "marketplace",
                    "hardware",
                    "services",
                    "other",
                    "unknown",
                ],
            },
            "target_audience": {"type": "string"},
            "geography_focus": {"type": "string"},
            "core_products": {
                "type": "array",
                "items": {"type": "string"},
            },
            "pricing_tier": {
                "type": "string",
                "enum": ["budget", "mid", "premium", "unknown"],
            },
            "keywords": {
                "type": "array",
                "items": {"type": "string"},
            },
            "summary": {"type": "string"},
        },
        "required": [
            "name",
            "website",
            "industry",
            "sub_industry",
            "company_size",
            "business_model",
            "target_audience",
            "geography_focus",
            "core_products",
            "pricing_tier",
            "keywords",
            "summary",
        ],
        "additionalProperties": False,
    },
}

_CANDIDATE_PROFILE_PROMPT = (
    "You are evaluating potential competitors. Using the provided homepage snippet, "
    "summarize the company in 2-3 short sentences and extract the key attributes. When "
    "information is missing, respond with 'unknown'. Return JSON only."
)

_CANDIDATE_PROFILE_SCHEMA: Dict[str, Any] = {
    "name": "candidate_profile",
    "schema": {
        "type": "object",
        "properties": {
            "industry": {"type": "string"},
            "company_size": {
                "type": "string",
                "enum": ["startup", "midmarket", "enterprise", "unknown"],
            },
            "business_model": {
                "type": "string",
                "enum": [
                    "B2B SaaS",
                    "B2C",
                    "marketplace",
                    "hardware",
                    "services",
                    "other",
                    "unknown",
                ],
            },
            "target_audience": {"type": "string"},
            "core_products": {
                "type": "array",
                "items": {"type": "string"},
            },
            "summary": {"type": "string"},
        },
        "required": [
            "industry",
            "company_size",
            "business_model",
            "target_audience",
            "core_products",
            "summary",
        ],
        "additionalProperties": False,
    },
}

_SCORING_PROMPT = (
    "You are a competitive intelligence strategist. Compare the target company to each "
    "candidate competitor and assign similarity scores from 0-100 across the requested "
    "dimensions. Classify each candidate as 'direct', 'adjacent', 'aspirational', or "
    "'irrelevant'. Provide a concise explanation for why the competitor is or is not a "
    "meaningful threat. Output a single JSON array with one object per competitor and no "
    "extra commentary."
)

_SCORING_SCHEMA: Dict[str, Any] = {
    "name": "competitor_similarity_scores",
    "schema": {
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "website": {"type": "string"},
                "similarity_score": {"type": "number"},
                "industry_similarity": {"type": "number"},
                "product_similarity": {"type": "number"},
                "audience_similarity": {"type": "number"},
                "size_similarity": {"type": "number"},
                "business_model_similarity": {"type": "number"},
                "competitor_type": {
                    "type": "string",
                    "enum": [
                        "direct",
                        "adjacent",
                        "aspirational",
                        "irrelevant",
                    ],
                },
                "why_similar": {"type": "string"},
            },
            "required": [
                "name",
                "website",
                "similarity_score",
                "industry_similarity",
                "product_similarity",
                "audience_similarity",
                "size_similarity",
                "business_model_similarity",
                "competitor_type",
                "why_similar",
            ],
            "additionalProperties": False,
        },
    },
}

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


def _strip_html(value: str) -> str:
    cleaned = re.sub(r"(?is)<(script|style)[^>]*>.*?</\\1>", " ", value)
    cleaned = re.sub(r"(?is)<!--.*?-->", " ", cleaned)
    cleaned = re.sub(r"(?is)<[^>]+>", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


async def fetch_page_text(url: str) -> str:
    if not url:
        return ""

    try:
        async with httpx.AsyncClient(
            headers={"User-Agent": _USER_AGENT},
            timeout=httpx.Timeout(15.0),
        ) as client:
            response = await client.get(url)
            response.raise_for_status()
    except httpx.HTTPError as exc:  # noqa: BLE001
        logger.warning("Failed to fetch page text for %s: %s", url, exc)
        return ""

    text = _strip_html(response.text)
    return text[:6000]


async def build_company_profile(page_text: str, url: str) -> Dict[str, Any]:
    if not page_text.strip():
        raise AnalysisError("No content available to profile the target company.")

    payload = {
        "instructions": _COMPANY_PROFILE_PROMPT,
        "url": url,
        "homepage_text": page_text,
    }

    messages = [
        {"role": "system", "content": "You analyze company positioning."},
        {"role": "user", "content": json.dumps(payload)},
    ]

    result = await _json_completion(
        messages,
        model=settings.analyst_model,
        response_format={"type": "json_schema", "json_schema": _COMPANY_PROFILE_SCHEMA},
    )

    if not isinstance(result, dict):
        raise AnalysisError("Company profile response was not a JSON object.")

    return result


def _should_skip_domain(domain: str, target_domain: Optional[str]) -> bool:
    if not domain:
        return True
    domain = domain.lower()
    if target_domain and domain == target_domain.lower():
        return True
    return any(keyword in domain for keyword in _SKIP_DOMAIN_KEYWORDS)


def _clean_result_title(title: Optional[str]) -> str:
    if not title:
        return ""
    separators = ["|", "-", " – "]
    for sep in separators:
        if sep in title:
            title = title.split(sep)[0]
            break
    return title.strip()


async def fetch_candidate_competitors(profile: Dict[str, Any]) -> List[Dict[str, Any]]:
    name = profile.get("name") or ""
    industry = profile.get("industry") or ""
    sub_industry = profile.get("sub_industry") or ""
    business_model = profile.get("business_model") or ""
    target_audience = profile.get("target_audience") or ""
    core_products = profile.get("core_products") or []

    queries_set = {
        f"{industry} {sub_industry} competitors".strip(),
        f"{name} alternatives".strip(),
    }

    if core_products:
        queries_set.add(f"{core_products[0]} competitors")
    if business_model and target_audience:
        queries_set.add(f"{business_model} vendors for {target_audience}")

    queries = [q for q in queries_set if q]
    if not queries:
        return []

    search_tasks = [generic_company_search(query, num=10) for query in queries]
    results: List[Dict[str, Any]] = []
    target_domain = extract_domain(profile.get("website", ""))
    seen_domains: set[str] = set()

    for query, payload in zip(
        queries,
        await asyncio.gather(*search_tasks, return_exceptions=True),
    ):
        if isinstance(payload, Exception):
            logger.warning("Search failed for '%s': %s", query, payload)
            continue

        organic = payload.get("organic") or payload.get("organic_results", [])
        for item in organic:
            url = item.get("link") or ""
            domain = extract_domain(url or "") or ""
            if (
                not url
                or domain in seen_domains
                or _should_skip_domain(domain, target_domain)
            ):
                continue

            seen_domains.add(domain)
            result = {
                "name": _clean_result_title(item.get("title")),
                "website": url,
                "snippet": item.get("snippet") or item.get("rich_snippet", ""),
                "source_url": url,
                "query": query,
            }
            if result["name"] and result["website"]:
                results.append(result)
            if len(results) >= 12:
                return results

    return results


async def enrich_candidates_with_profile(
    candidates: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    if not candidates:
        return []

    async def _enrich(candidate: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        homepage = candidate.get("website") or candidate.get("url")
        if not homepage:
            return None

        page_text = await fetch_page_text(homepage)
        if not page_text:
            return None

        payload = {
            "instructions": _CANDIDATE_PROFILE_PROMPT,
            "url": homepage,
            "homepage_text": page_text,
        }

        messages = [
            {"role": "system", "content": "You summarize B2B software companies."},
            {"role": "user", "content": json.dumps(payload)},
        ]

        try:
            profile = await _json_completion(
                messages,
                model=settings.analyst_model,
                response_format={
                    "type": "json_schema",
                    "json_schema": _CANDIDATE_PROFILE_SCHEMA,
                },
            )
        except AnalysisError as exc:
            logger.warning(
                "Candidate profiling failed for %s: %s", homepage, exc
            )
            return None

        if not isinstance(profile, dict):
            return None

        enriched = {**candidate, "profile": profile, "website": homepage}
        return enriched

    enriched_candidates: List[Dict[str, Any]] = []
    for result in await asyncio.gather(
        *[_enrich(candidate) for candidate in candidates],
        return_exceptions=True,
    ):
        if isinstance(result, Exception):
            logger.warning("Candidate enrichment raised an error: %s", result)
            continue
        if result:
            enriched_candidates.append(result)

    return enriched_candidates


def _prepare_ranking_payload(target_profile: Dict[str, Any], candidates: List[Dict[str, Any]]):
    simplified_candidates = []
    for candidate in candidates:
        simplified_candidates.append(
            {
                "name": candidate.get("name"),
                "website": candidate.get("website"),
                "profile": candidate.get("profile", {}),
            }
        )
    return {
        "instructions": _SCORING_PROMPT,
        "target_profile": target_profile,
        "candidates": simplified_candidates,
    }


async def score_and_rank_competitors(
    target_profile: Dict[str, Any],
    candidates: List[Dict[str, Any]],
    *,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    if not candidates:
        return []

    trimmed_candidates = candidates[:8]
    payload = _prepare_ranking_payload(target_profile, trimmed_candidates)
    messages = [
        {
            "role": "system",
            "content": "You are a competitive intelligence strategist and JSON expert.",
        },
        {"role": "user", "content": json.dumps(payload)},
    ]

    try:
        result = await _json_completion(
            messages,
            model=settings.strategist_model,
            response_format={"type": "json_schema", "json_schema": _SCORING_SCHEMA},
        )
    except AnalysisError as exc:
        logger.warning("Competitor scoring failed: %s", exc)
        return []

    if not isinstance(result, list):
        logger.warning("Competitor scoring returned non-list payload")
        return []

    ranking: List[Dict[str, Any]] = []
    by_domain: Dict[str, Dict[str, Any]] = {}
    for candidate in trimmed_candidates:
        website = candidate.get("website", "") or ""
        domain_key = extract_domain(website) or ""
        if domain_key and domain_key not in by_domain:
            by_domain[domain_key] = candidate
        if website and website not in by_domain:
            by_domain[website] = candidate

    for entry in result:
        if not isinstance(entry, dict):
            continue
        if entry.get("competitor_type") == "irrelevant":
            continue

        website = entry.get("website") or ""
        domain = extract_domain(website) or ""
        candidate = by_domain.get(domain) or by_domain.get(website) or {}

        def _safe_number(value: Any) -> float:
            try:
                return float(value)
            except (TypeError, ValueError):
                return 0.0

        similarity_score = _safe_number(entry.get("similarity_score"))
        competitor_payload = {
            **candidate,
            "name": entry.get("name") or candidate.get("name"),
            "website": website or candidate.get("website"),
            "similarity_score": similarity_score,
            "industry_similarity": _safe_number(entry.get("industry_similarity")),
            "product_similarity": _safe_number(entry.get("product_similarity")),
            "audience_similarity": _safe_number(entry.get("audience_similarity")),
            "size_similarity": _safe_number(entry.get("size_similarity")),
            "business_model_similarity": _safe_number(
                entry.get("business_model_similarity")
            ),
            "competitor_type": entry.get("competitor_type"),
            "why_similar": entry.get("why_similar") or "",
        }

        competitor_payload["competitive_score"] = max(
            1, min(10, round(similarity_score / 10.0))
        )

        ranking.append(competitor_payload)

    ranking.sort(key=lambda item: item.get("similarity_score", 0), reverse=True)
    return ranking[:limit]


__all__ = [
    "fetch_page_text",
    "build_company_profile",
    "fetch_candidate_competitors",
    "enrich_candidates_with_profile",
    "score_and_rank_competitors",
]

