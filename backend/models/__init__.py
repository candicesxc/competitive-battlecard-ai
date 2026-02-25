"""Data models for the competitive battlecard backend."""

from pydantic import BaseModel, HttpUrl
from typing import Literal

from .company_profile import CompanyProfile


class AnalyzeRequest(BaseModel):
    company_url: HttpUrl


class ResearchRequest(BaseModel):
    research_type: Literal["company", "persona"]
    query: str  # URL for company, or persona description for persona


__all__ = ["CompanyProfile", "AnalyzeRequest", "ResearchRequest"]
