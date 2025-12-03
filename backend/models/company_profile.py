from __future__ import annotations

from typing import List, Literal, Optional, TypedDict

CompetitorType = Literal["direct", "adjacent", "aspirational", "irrelevant"]


class CompanyProfile(TypedDict, total=False):
    """Structured profile of a company for competitor analysis."""

    name: str
    website: str
    industry: str  # e.g. "data analytics", "HR software"
    sub_industry: str  # optional, more granular
    product_summary: str  # 1 to 3 sentences
    target_audience: str  # e.g. "B2B midmarket", "enterprise dev teams"
    primary_use_cases: List[str]
    company_size: str  # e.g. "startup", "midmarket", "enterprise"
    business_model: str  # e.g. "B2B SaaS", "marketplace"
    core_products: List[str]
    summary: str
    keywords: List[str]
    geography_focus: str
    pricing_tier: str


class CompetitorStub(TypedDict, total=False):
    """A competitor candidate discovered from web search snippets."""

    name: str
    website: str
    description: str
    evidence_strength: Literal["high", "medium", "low"]


class ScoredCompetitor(TypedDict, total=False):
    """A competitor with similarity scores and classification."""

    name: str
    website: str
    industry_similarity: float
    product_similarity: float
    audience_similarity: float
    size_similarity: float
    business_model_similarity: float
    similarity_score: float
    competitor_type: CompetitorType
    reason_for_similarity: str


__all__ = ["CompanyProfile", "CompetitorStub", "ScoredCompetitor", "CompetitorType"]
