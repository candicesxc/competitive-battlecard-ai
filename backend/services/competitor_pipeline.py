from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

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

COMPANY_PROFILE_PROMPT = """
You are an expert B2B market analyst.

Task:
You will be given:
1) The URL of a company website.
2) Text scraped from that website.

Your job is to deeply understand what the company does and return a structured JSON object describing it.

Use these rules:
- Infer industry and sub_industry from the product and customer.
- Infer company_size roughly (startup, midmarket, enterprise) based on language, customer logos, and tone.
- Infer business_model (B2B SaaS, B2C, marketplace, hardware, services, other).
- Describe the target_audience in natural language (for example: "enterprise security teams" or "small ecommerce brands").
- core_products should list 1 to 5 product names or concise descriptions.
- pricing_tier is budget, mid, premium, or unknown.
- keywords should be 3 to 8 short phrases that capture what the company does.
- summary should be 2 to 3 sentences in plain English.

IMPORTANT:
- Return a single JSON object only.
- Do not include any explanation or commentary.
- Do not include markdown.
"""

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

MINI_COMPANY_PROFILE_PROMPT = """
You are an expert B2B market analyst.

Given a company homepage URL and text, extract a concise profile.

Return JSON with:
- industry
- company_size (startup | midmarket | enterprise | unknown)
- business_model (B2B SaaS | B2C | marketplace | hardware | services | other)
- target_audience (short description)
- core_products (1 to 5 brief items)
- summary (1 to 2 sentences)

Return JSON only, with no explanation or markdown.
"""

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

COMPETITOR_RANKING_PROMPT = """
You are a senior competitive intelligence analyst.

You will receive:
1) A JSON object describing a target company (target_profile).
2) A JSON array of candidate companies, where each has:
   - name
   - website
   - profile with: industry, company_size, business_model, target_audience, core_products, summary.

Your job is to compare each candidate to the target and evaluate:

1. industry_similarity (0 to 100):
   - 100 if same specific industry and sub-industry.
   - Lower if only loosely related.

2. product_similarity (0 to 100):
   - 100 if they sell very similar core products or solve the same problem.
   - Lower if products are different.

3. audience_similarity (0 to 100):
   - 100 if they target the same customer segment.
   - Lower if audience is different.

4. size_similarity (0 to 100):
   - 100 if similar company size (for example both midmarket or both enterprise).
   - Lower if very different in scale.

5. business_model_similarity (0 to 100):
   - 100 if they use the same business model (for example both B2B SaaS).
   - Lower otherwise.

Then compute an overall similarity_score (0 to 100) that reflects how directly this company competes with the target.

Also assign competitor_type:
- "direct" if product, industry, and audience are strongly similar.
- "adjacent" if they operate nearby in the market or serve a similar audience with a different product.
- "aspirational" if much larger but in essentially the same space.
- "irrelevant" if they are not a meaningful competitor.

For each candidate, return:

{
  "name": "...",
  "website": "...",
  "industry_similarity": <0-100>,
  "product_similarity": <0-100>,
  "audience_similarity": <0-100>,
  "size_similarity": <0-100>,
  "business_model_similarity": <0-100>,
  "similarity_score": <0-100>,
  "competitor_type": "direct" | "adjacent" | "aspirational" | "irrelevant",
  "reason_for_similarity": "1 to 3 sentences explaining why this company is or is not a strong competitor."
}

Rules:
- Only mark a company as "direct" if the product and target audience are clearly similar.
- Prefer companies that sell similar products, to similar customers, in the same industry and size band.
- If in doubt, lower the similarity_score instead of inflating it.

Return a single JSON array only, with no extra text or markdown.
"""

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
                "reason_for_similarity": {"type": "string"},
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
                "reason_for_similarity",
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


def _build_fallback_profile(page_text: str, url: str) -> Dict[str, Any]:
    """Return a minimal profile when the structured prompt cannot be parsed."""

    domain = extract_domain(url) or url or ""
    readable_domain = domain.replace("www.", "") if domain else ""
    name_hint = readable_domain.split(".")[0] if readable_domain else ""
    fallback_name = name_hint.title() if name_hint else (url or "Unknown Company")
    trimmed_text = re.sub(r"\s+", " ", page_text).strip()
    summary = trimmed_text[:400] if trimmed_text else "Limited public information is available."

    return {
        "name": fallback_name,
        "website": url,
        "industry": "",
        "sub_industry": "",
        "company_size": "unknown",
        "business_model": "unknown",
        "target_audience": "",
        "geography_focus": "",
        "core_products": [],
        "pricing_tier": "unknown",
        "keywords": [],
        "summary": summary,
    }


async def build_company_profile(page_text: str, url: str) -> Dict[str, Any]:
    """Generate a structured profile for the target company homepage."""

    if not page_text.strip():
        raise AnalysisError("No content available to profile the target company.")

    messages = [
        {"role": "system", "content": "You are an expert B2B market analyst."},
        {
            "role": "user",
            "content": (
                f"{COMPANY_PROFILE_PROMPT}\n\n"
                f"Website URL: {url}\n"
                f"Homepage Text:\n{page_text}"
            ),
        },
    ]

    try:
        result = await _json_completion(
            messages,
            model=settings.analyst_model,
            response_format={
                "type": "json_schema",
                "json_schema": _COMPANY_PROFILE_SCHEMA,
            },
        )
        if not isinstance(result, dict):
            raise AnalysisError("Company profile response was not a JSON object.")
        return result
    except AnalysisError as exc:
        logger.warning("Falling back to minimal company profile for %s: %s", url, exc)
    except Exception as exc:  # noqa: BLE001 - unexpected parsing issues
        logger.warning("Unexpected error building company profile for %s: %s", url, exc)

    return _build_fallback_profile(page_text, url)


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


async def fetch_candidate_companies(profile: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Search the web for potential competitors given a target profile."""

    name = profile.get("name") or ""
    industry = profile.get("industry") or ""
    sub_industry = profile.get("sub_industry") or ""
    business_model = profile.get("business_model") or ""
    target_audience = profile.get("target_audience") or ""
    core_products = profile.get("core_products") or []

    queries_set = {
        f"{industry} {sub_industry} software competitors".strip(),
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
            snippet = item.get("snippet") or item.get("rich_snippet", "") or ""
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
                "snippet": snippet,
                "source_url": url,
                "query": query,
            }
            if result["name"] and result["website"]:
                results.append(result)
            if len(results) >= 20:
                return results

    return results


async def enrich_candidate_profiles(
    candidates: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Scrape candidate homepages and build concise profiles for ranking."""

    if not candidates:
        return []

    async def _enrich(candidate: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        homepage = candidate.get("website") or candidate.get("url")
        if not homepage:
            return None

        page_text = await fetch_page_text(homepage)
        if not page_text:
            return None

        messages = [
            {"role": "system", "content": "You are an expert B2B market analyst."},
            {
                "role": "user",
                "content": (
                    f"{MINI_COMPANY_PROFILE_PROMPT}\n\n"
                    f"Website URL: {homepage}\n"
                    f"Homepage Text:\n{page_text}"
                ),
            },
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
        "instructions": COMPETITOR_RANKING_PROMPT,
        "target_profile": target_profile,
        "candidates": simplified_candidates,
    }


async def score_and_label_competitors(
    target_profile: Dict[str, Any],
    candidates: List[Dict[str, Any]],
    *,
    limit: int = 5,
) -> Tuple[List[Dict[str, Any]], int]:
    """Score candidates against the target and compute competition intensity."""

    if not candidates:
        return [], 1

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
        return [], 1

    if not isinstance(result, list):
        logger.warning("Competitor scoring returned non-list payload")
        return [], 1

    ranking: List[Dict[str, Any]] = []
    by_domain: Dict[str, Dict[str, Any]] = {}
    for candidate in trimmed_candidates:
        website = candidate.get("website", "") or ""
        domain_key = extract_domain(website) or ""
        if domain_key and domain_key not in by_domain:
            by_domain[domain_key] = candidate
        if website and website not in by_domain:
            by_domain[website] = candidate

    def _safe_number(value: Any) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    for entry in result:
        if not isinstance(entry, dict):
            continue
        if entry.get("competitor_type") == "irrelevant":
            continue

        website = entry.get("website") or ""
        domain = extract_domain(website) or ""
        candidate = by_domain.get(domain) or by_domain.get(website) or {}
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
            "reason_for_similarity": entry.get("reason_for_similarity") or "",
        }

        competitor_payload["competitive_score"] = max(
            1, min(10, round(similarity_score / 10.0))
        )

        ranking.append(competitor_payload)

    ranking.sort(key=lambda item: item.get("similarity_score", 0), reverse=True)
    ranking = ranking[:limit]

    best_similarity = max(
        (item.get("similarity_score", 0) or 0 for item in ranking),
        default=0,
    )
    competitive_score_10 = max(1, min(10, round(best_similarity / 10.0)))

    return ranking, competitive_score_10


__all__ = [
    "fetch_page_text",
    "build_company_profile",
    "fetch_candidate_companies",
    "enrich_candidate_profiles",
    "score_and_label_competitors",
]


# Backwards compatibility exports for legacy imports.
fetch_candidate_competitors = fetch_candidate_companies
enrich_candidates_with_profile = enrich_candidate_profiles
score_and_rank_competitors = score_and_label_competitors
