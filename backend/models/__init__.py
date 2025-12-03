"""Data models for the competitive battlecard backend."""

from pydantic import BaseModel, HttpUrl

from .company_profile import CompanyProfile


class AnalyzeRequest(BaseModel):
    company_url: HttpUrl


__all__ = ["CompanyProfile", "AnalyzeRequest"]
