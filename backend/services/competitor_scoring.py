from __future__ import annotations

import asyncio
import json
import logging
from typing import List

from ..models.company_profile import CompanyProfile, CompetitorStub, ScoredCompetitor
from .analysis_service import AnalysisError, _json_completion
from .competitor_pipeline import fetch_page_text

logger = logging.getLogger(__name__)

COMPETITOR_SCORING_PROMPT = """You are a senior competitive intelligence analyst.

You will receive:
1) A JSON object describing a target company (target_profile).
2) A JSON array of competitor candidates, where each has:
   - name
   - website
   - description
   - text_excerpt (optional, from their homepage)

Your job is to compare each competitor to the target and evaluate:

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

For each competitor, return a JSON object with:
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

Return a single JSON array of these objects, with no extra text or markdown."""


async def score_competitors(
    target_profile: CompanyProfile,
    target_url: str,
    competitors: List[CompetitorStub],
) -> List[ScoredCompetitor]:
    """
    For each competitor stub:
      - Fetch basic page text from its website (if available).
      - Call OpenAI once with the target and all competitors to compute similarity scores.

    Return a list of ScoredCompetitor objects.
    """
    if not competitors:
        return []

    # Fetch page text for each competitor in parallel
    async def _fetch_competitor_data(competitor):
        name = competitor.get("name", "")
        website = competitor.get("website", "")
        description = competitor.get("description", "")

        text_excerpt = ""
        if website:
            try:
                page_text = await fetch_page_text(website)
                # 500 chars is sufficient for scoring — model already has name, website,
                # and description. Cuts the scoring prompt from ~22k to ~7k tokens.
                text_excerpt = page_text[:500] if page_text else ""
            except Exception as exc:
                logger.debug("Failed to fetch page text for %s: %s", website, exc)

        return {
            "name": name,
            "website": website,
            "description": description,
            "text_excerpt": text_excerpt,
        }

    competitor_data = await asyncio.gather(
        *[_fetch_competitor_data(comp) for comp in competitors],
        return_exceptions=True
    )
    
    # Filter out exceptions and convert to list
    competitor_data = [
        data for data in competitor_data
        if not isinstance(data, Exception)
    ]

    # Build the prompt
    system_prompt = "You are a competitive intelligence strategist and JSON expert."

    user_content = f"""{COMPETITOR_SCORING_PROMPT}

Target Company Profile:
{json.dumps(target_profile, indent=2)}

Target URL: {target_url}

Competitors to Score:
{json.dumps(competitor_data, indent=2)}

Return a JSON array of scored competitors matching the format described above."""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    try:
        from ..config import get_settings

        settings = get_settings()
        result = await _json_completion(
            messages,
            model=settings.strategist_model,
            response_format={"type": "json_object"},
        )

        # The model might return a dict with a "competitors" key, or directly an array
        if isinstance(result, dict):
            scored = result.get("competitors", [])
            if not isinstance(scored, list):
                scored = [result] if result else []
        elif isinstance(result, list):
            scored = result
        else:
            scored = []

        # Validate and convert to ScoredCompetitor format
        scored_competitors: List[ScoredCompetitor] = []
        for entry in scored:
            if not isinstance(entry, dict):
                continue

            def _safe_float(value, default: float = 0.0) -> float:
                try:
                    return float(value)
                except (TypeError, ValueError):
                    return default

            competitor_type = entry.get("competitor_type", "adjacent")
            if competitor_type not in ["direct", "adjacent", "aspirational", "irrelevant"]:
                competitor_type = "adjacent"

            scored_comp: ScoredCompetitor = {
                "name": entry.get("name", "").strip(),
                "website": entry.get("website", "").strip(),
                "industry_similarity": _safe_float(entry.get("industry_similarity"), 0.0),
                "product_similarity": _safe_float(entry.get("product_similarity"), 0.0),
                "audience_similarity": _safe_float(entry.get("audience_similarity"), 0.0),
                "size_similarity": _safe_float(entry.get("size_similarity"), 0.0),
                "business_model_similarity": _safe_float(entry.get("business_model_similarity"), 0.0),
                "similarity_score": _safe_float(entry.get("similarity_score"), 0.0),
                "competitor_type": competitor_type,
                "reason_for_similarity": entry.get("reason_for_similarity", "").strip() or "Competitor identified via web search.",
            }

            if scored_comp["name"]:
                scored_competitors.append(scored_comp)

        return scored_competitors
    except AnalysisError as exc:
        logger.warning("Competitor scoring failed: %s", exc)
        return []
    except Exception as exc:
        logger.warning("Unexpected error scoring competitors: %s", exc)
        return []


__all__ = ["score_competitors"]
