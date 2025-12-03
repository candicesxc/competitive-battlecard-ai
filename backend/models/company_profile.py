from __future__ import annotations

from typing import List, Optional, TypedDict


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


__all__ = ["CompanyProfile"]
