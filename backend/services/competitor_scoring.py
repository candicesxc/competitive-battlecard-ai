from __future__ import annotations

import asyncio
import json
import logging
from typing import List

from ..models.company_profile import CompanyProfile, CompetitorStub, ScoredCompetitor
from .analysis_service import AnalysisError, _json_completion
from .blacklist import NON_COMPETITOR_NAME_FRAGMENTS as _NON_COMPETITOR_NAME_FRAGMENTS
from .competitor_pipeline import fetch_page_text

logger = logging.getLogger(__name__)




def _is_non_competitor_name(name: str) -> bool:
    """Return True if the company name matches a known non-competitor (review/analyst) platform."""
    normalized = name.lower().strip().replace(" ", "").replace(".", "").replace("-", "")
    return any(frag in normalized for frag in _NON_COMPETITOR_NAME_FRAGMENTS)


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
   THIS IS THE MOST IMPORTANT DIMENSION.
   Score it high for ANY of the following four competition modes — all are real
   and common in B2B software:

   MODE A — Direct product competition (score 80-100):
     Both companies sell essentially the same standalone product to the same buyer.
     Example: Snyk vs Checkmarx (both are developer security / SCA / SAST tools).
     Example: Ramp vs Brex, BILL Spend & Expense, Expensify, Rippling Spend, Airbase
       (all are corporate card / spend management / expense management platforms for businesses).
     Example: Divvy vs Expensify (both offer corporate cards with expense reporting).
     The key test: would a buyer evaluating the target also seriously evaluate this competitor?

   MODE B — Feature / platform competition (score 65-85):
     A large platform company ships the SAME CAPABILITY as a built-in feature.
     The customer must choose: buy the specialist tool OR use the platform's built-in.
     Example: GitHub Advanced Security / GitLab Security Scanning competes with Snyk,
     even though GitHub's primary product is code hosting.
     Example: AWS Inspector competes with vulnerability-scanning vendors.
     Score this mode high; do NOT penalise it just because the competitor's primary
     label is "DevOps platform" or "cloud provider".

   MODE C — Managed-service / cloud-native competition (score 65-85):
     A cloud hyperscaler (AWS, Azure, GCP) offers the same technology as a fully
     managed cloud service, displacing the specialist vendor.
     Example: AWS RDS for PostgreSQL / Amazon Aurora competes with EnterpriseDB,
     even though AWS's primary label is "cloud infrastructure".
     Example: Azure Database for PostgreSQL competes with EDB.
     Score this mode high; do NOT penalise because the competitor is "too broad".

   MODE D — Open-source / community competition (score 55-75):
     The free, community version of the same technology that buyers can self-host
     instead of paying the target.
     Example: Community PostgreSQL competes with EnterpriseDB.
     Example: OpenSearch competes with Elasticsearch/Elastic.

   Score LOW (0-40) ONLY if the products solve fundamentally different problems for
   different buyers — e.g., an endpoint-security vendor vs. an application-security
   vendor are low similarity even though both are "security".
   Fintech examples of LOW similarity (do NOT score these high against each other):
   - A consumer personal finance app vs. a B2B corporate card platform.
   - A mortgage lender vs. a spend management tool.
   - A crypto exchange vs. an expense reporting SaaS.
   - A general ERP (SAP, Oracle NetSuite) vs. a spend management tool — only mark as
     competitor if the ERP's expense/card module directly displaces the target.

3. audience_similarity (0 to 100):
   - 100 if they target the same customer segment.
   - Lower if audience is different.

4. size_similarity (0 to 100):
   - 100 if the competitor is the same size OR larger than the target (a larger company
     that sells the same product or capability is always a meaningful competitor the
     target must defend against — e.g., Oracle competing with a smaller PostgreSQL vendor).
   - 70-90 if one tier smaller (e.g., target is enterprise, competitor is midmarket).
   - 30-60 if much smaller (tiny startup vs. established enterprise).
   - NEVER mark a large well-known company "irrelevant" purely because it is bigger.

5. business_model_similarity (0 to 100):
   - 100 if they use the same business model (for example both B2B SaaS).
   - Lower otherwise.

Then compute an overall similarity_score (0 to 100) that reflects how directly this
company competes with the target. Weight product_similarity the most heavily.

Also assign competitor_type:
- "direct" if product, industry, and audience are strongly similar (modes A or B/C with
  high product_similarity).
- "adjacent" if they operate nearby in the market or serve a similar audience with a
  partially overlapping product.
- "aspirational" if much larger and in the same space but the target rarely wins deals
  against them directly.
- "irrelevant" if they are not a meaningful competitor.

AUTOMATIC "irrelevant" CASES — mark these as irrelevant immediately without scoring:
- The target company itself — if a candidate's name matches the target company name, it is
  not a competitor of itself; mark it irrelevant immediately.
- Software review / comparison platforms (G2, Capterra, TrustRadius, PeerSpot, GetApp, SoftwareAdvice, Comparably, etc.)
- Market research and analyst firms (Gartner, Forrester, IDC, CB Insights, PitchBook, McKinsey, Deloitte, etc.)
- News outlets, blogs, or media companies (TechCrunch, VentureBeat, SecurityWeek, Dark Reading, etc.)
- Social networks, job boards, or directory sites (LinkedIn, Glassdoor, Indeed, Crunchbase, etc.)
- Any company whose primary business is reviewing, ranking, or analysing other companies.
- Obscure micro-startups with no established market presence or brand recognition: if you
  have never encountered the company name in the context of this market, or you cannot
  confirm it is a real, funded, operating business, assign similarity_score < 30 and mark
  it "irrelevant". Do not guess or assume legitimacy.

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
  "competition_mode": "direct_product" | "platform_feature" | "managed_service" | "open_source" | "irrelevant",
  "reason_for_similarity": "1 to 3 sentences explaining why this company is or is not a strong competitor, and which competition mode applies."
}

Rules:
- Use all four competition modes (A/B/C/D) to determine product_similarity; do not
  default to "different category" just because the competitor is a large platform or
  cloud provider.
- Only mark a company as "direct" if the product_similarity is clearly high (≥ 65).
- If in doubt, lower the similarity_score instead of inflating it.
- HARD FILTER — assign competitor_type "irrelevant" if EITHER of these is true:
    (a) industry_similarity < 40  (clearly different market vertical)
    (b) product_similarity < 50   (does not compete on any of the four modes above)
  Exception: for MODE C (cloud hyperscaler managed service) and MODE B (platform feature),
  industry_similarity may be lower because the competitor is broader — in these cases,
  use product_similarity ≥ 60 as the deciding factor, not industry_similarity.
- SIZE PREFERENCE — prefer competitors that are at least as large as the target; a
  well-known larger player in the same space is more relevant than a tiny startup.

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

    # Normalised target name used to hard-block the target company from scoring itself
    _target_name_norm = (
        target_profile.get("name", "").lower()
        .strip().replace(" ", "").replace(".", "").replace("-", "")
    )

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

            competition_mode = entry.get("competition_mode", "direct_product")
            if competition_mode not in ["direct_product", "platform_feature", "managed_service", "open_source", "irrelevant"]:
                competition_mode = "direct_product"

            industry_sim = _safe_float(entry.get("industry_similarity"), 0.0)
            product_sim = _safe_float(entry.get("product_similarity"), 0.0)
            comp_name = entry.get("name", "").strip()

            # Enforce hard filter in code — the LLM may return a non-"irrelevant" type
            # even when scores are clearly too low.
            #
            # For Mode B (platform_feature) and Mode C (managed_service), the competitor
            # is intentionally broader than the target so industry_similarity is naturally
            # lower. In those cases we rely on product_similarity alone (≥ 60) rather
            # than requiring both dimensions to be high.
            is_broad_mode = competition_mode in ("platform_feature", "managed_service")
            if is_broad_mode:
                if product_sim < 60:
                    competitor_type = "irrelevant"
            else:
                if industry_sim < 40 or product_sim < 50:
                    competitor_type = "irrelevant"

            # Name-based blocklist: review platforms, analyst firms, media outlets, etc.
            # are never real competitors regardless of what the LLM returns.
            if _is_non_competitor_name(comp_name):
                competitor_type = "irrelevant"
                competition_mode = "irrelevant"

            # Hard-block the target company from appearing as its own competitor.
            comp_name_norm = (
                comp_name.lower().replace(" ", "").replace(".", "").replace("-", "")
            )
            if _target_name_norm and comp_name_norm == _target_name_norm:
                competitor_type = "irrelevant"
                competition_mode = "irrelevant"

            scored_comp: ScoredCompetitor = {
                "name": entry.get("name", "").strip(),
                "website": entry.get("website", "").strip(),
                "industry_similarity": industry_sim,
                "product_similarity": product_sim,
                "audience_similarity": _safe_float(entry.get("audience_similarity"), 0.0),
                "size_similarity": _safe_float(entry.get("size_similarity"), 0.0),
                "business_model_similarity": _safe_float(entry.get("business_model_similarity"), 0.0),
                "similarity_score": _safe_float(entry.get("similarity_score"), 0.0),
                "competitor_type": competitor_type,
                "competition_mode": competition_mode,
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
