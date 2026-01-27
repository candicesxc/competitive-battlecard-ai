from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from crewai import Agent

from .models.company_profile import CompanyProfile
from .services import (
    analysis_service,
    competitor_discovery,
    competitor_pipeline,
    competitor_scoring,
    layout_service,
    search_service,
)

logger = logging.getLogger(__name__)


@dataclass
class CompanyResearch:
    company_name: str
    website: Optional[str]
    overview: Optional[str]
    category: Optional[str]
    snippet: Optional[str]
    news: List[Dict[str, Any]] = field(default_factory=list)
    raw_context: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class BattlecardResult:
    target_company: Dict[str, Any]
    competitors: List[Dict[str, Any]]
    market_summary: Optional[str] = None


class BattlecardCrew:
    """CrewAI-powered orchestrator for the competitive battlecard workflow."""

    def __init__(self) -> None:
        self.research_agent = Agent(
            role="Competitive Research Analyst",
            goal="Identify the target company and its top competitors from a URL.",
            backstory=(
                "You specialize in mapping competitive landscapes for SaaS companies. "
                "Your focus is discovering relevant players and capturing crisp summaries."
            ),
        )
        self.data_agent = Agent(
            role="Market Data Curator",
            goal="Collect recent news, product, and pricing insights for each company.",
            backstory=(
                "You synthesize disparate web research into structured datasets used for enablement."
            ),
        )
        self.analyst_agent = Agent(
            role="Product Marketing Analyst",
            goal="Distill strengths and weaknesses from the curated data.",
            backstory="A former product marketer focused on positioning and messaging.",
        )
        self.strategist_agent = Agent(
            role="Competitive Strategist",
            goal="Create competitor-specific 'Key Differentiators' and anticipate unique objections.",
            backstory="A sales strategist crafting battle-tested talk tracks tailored to each competitor.",
        )
        self.designer_agent = Agent(
            role="Visual Storyteller",
            goal="Transform structured insights into a presentation-ready JSON layout.",
            backstory="A presentation expert translating research into polished enablement collateral.",
        )

    async def run(self, target_url: str) -> BattlecardResult:
        research = await self._run_research_agent(target_url)
        enriched = await self._run_data_agent(research)
        analyzed = await self._run_analyst_agent(enriched)
        strategized = await self._run_strategist_agent(analyzed)
        return await self._run_designer_agent(strategized)

    async def _run_research_agent(self, target_url: str) -> Dict[str, Any]:
        logger.info("ResearchAgent: starting discovery for %s", target_url)
        profile = await search_service.search_company_profile(target_url)
        overview = search_service.parse_company_overview(profile)

        if not overview.get("name"):
            raise RuntimeError("Unable to find company info for this URL.")

        if search_service.extract_domain(target_url):
            website = target_url
        else:
            website = overview.get("website") or target_url
        target_page_text = await competitor_pipeline.fetch_page_text(website)

        target_profile: Dict[str, Any] = {}
        ranked_competitors: List[Dict[str, Any]] = []
        competitive_score_10 = 1

        try:
            # Build target company profile
            if target_page_text:
                target_profile = await competitor_pipeline.build_company_profile(
                    target_page_text,
                    website,
                )
            else:
                logger.warning("No homepage content available for %s", website)

            if target_profile:
                # Convert to CompanyProfile format
                company_profile: CompanyProfile = {
                    "name": target_profile.get("name", ""),
                    "website": website,
                    "industry": target_profile.get("industry", ""),
                    "sub_industry": target_profile.get("sub_industry", ""),
                    "product_summary": target_profile.get("summary", ""),
                    "target_audience": target_profile.get("target_audience", ""),
                    "primary_use_cases": target_profile.get("core_products", []),
                    "company_size": target_profile.get("company_size", "unknown"),
                    "business_model": target_profile.get("business_model", "unknown"),
                    "core_products": target_profile.get("core_products", []),
                    "summary": target_profile.get("summary", ""),
                    "keywords": target_profile.get("keywords", []),
                    "geography_focus": target_profile.get("geography_focus", ""),
                    "pricing_tier": target_profile.get("pricing_tier", "unknown"),
                }

                # Discover competitors via new Gemini-style flow
                competitor_stubs = await competitor_discovery.discover_competitors_via_search(
                    company_profile
                )

                # Score competitors
                scored_competitors = await competitor_scoring.score_competitors(
                    target_profile=company_profile,
                    target_url=website,
                    competitors=competitor_stubs,
                )

                # Filter and sort
                scored_competitors = [
                    c for c in scored_competitors
                    if c.get("competitor_type") != "irrelevant"
                ]
                scored_competitors.sort(
                    key=lambda c: c.get("similarity_score", 0.0), reverse=True
                )

                # Convert to expected format
                ranked_competitors = []
                for scored in scored_competitors[:5]:
                    ranked_competitors.append({
                        "name": scored.get("name", ""),
                        "website": scored.get("website", ""),
                        "similarity_score": scored.get("similarity_score", 0.0),
                        "industry_similarity": scored.get("industry_similarity", 0.0),
                        "product_similarity": scored.get("product_similarity", 0.0),
                        "audience_similarity": scored.get("audience_similarity", 0.0),
                        "size_similarity": scored.get("size_similarity", 0.0),
                        "business_model_similarity": scored.get("business_model_similarity", 0.0),
                        "competitor_type": scored.get("competitor_type", "adjacent"),
                        "reason_for_similarity": scored.get("reason_for_similarity", ""),
                        "competitive_score": max(
                            1, min(10, round(scored.get("similarity_score", 0.0) / 10.0))
                        ),
                    })

                if ranked_competitors:
                    best_similarity = max(
                        (c.get("similarity_score", 0) or 0 for c in ranked_competitors),
                        default=0,
                    )
                    competitive_score_10 = max(1, min(10, round(best_similarity / 10.0)))
        except analysis_service.AnalysisError as exc:
            logger.warning("Target profiling failed: %s", exc)
        except Exception as exc:  # noqa: BLE001 - log unexpected pipeline issues
            logger.warning("Competitor pipeline encountered an error: %s", exc)

        if not target_profile:
            target_profile = {
                "name": overview.get("name") or "",
                "website": website,
                "industry": overview.get("category") or "",
                "sub_industry": "",
                "company_size": "unknown",
                "business_model": "unknown",
                "target_audience": "",
                "geography_focus": "",
                "core_products": [],
                "pricing_tier": "unknown",
                "keywords": [],
                "summary": overview.get("description") or "",
            }
        else:
            target_profile.setdefault("summary", overview.get("description") or target_profile.get("summary", ""))

        if not ranked_competitors:
            logger.warning("Falling back to basic Exa competitor discovery")
            try:
                competitors_raw = await search_service.search_company_competitors(
                    overview["name"]
                )
                target_domain = search_service.extract_domain(website)
                fallback_candidates = search_service.parse_competitor_candidates(
                    competitors_raw,
                    target_domain=target_domain,
                )
                ranked_competitors = [
                    {
                        "name": candidate.get("name"),
                        "website": candidate.get("url"),
                        "snippet": candidate.get("snippet"),
                        "source_url": candidate.get("url"),
                        "similarity_score": 0.0,
                        "industry_similarity": 0.0,
                        "product_similarity": 0.0,
                        "audience_similarity": 0.0,
                        "size_similarity": 0.0,
                        "business_model_similarity": 0.0,
                        "competitor_type": "adjacent",
                        "reason_for_similarity": candidate.get("snippet")
                        or "Identified via general search results.",
                        "competitive_score": 1,
                    }
                    for candidate in fallback_candidates
                ][:5]
                competitive_score_10 = max(competitive_score_10, 1)
            except Exception as exc:  # noqa: BLE001 - fallback should not fail request
                logger.warning("Fallback competitor discovery failed: %s", exc)
                ranked_competitors = []

        return {
            "target_overview": overview,
            "target_profile": target_profile,
            "target_search_payload": profile,
            "competitors": ranked_competitors,
            "target_url": target_url,
            "competitive_score_10": competitive_score_10,
        }

    async def _collect_company_research(
        self,
        name: str,
        url: Optional[str],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> CompanyResearch:
        # Fetch profile and news in parallel
        profile, news_payload = await asyncio.gather(
            search_service.search_company_profile(url or name),
            search_service.search_company_news(name),
        )
        overview = search_service.parse_company_overview(profile)

        knowledge_graph = (
            profile.get("knowledgeGraph")
            or profile.get("knowledge_graph", {})
        )
        organic_results = (
            profile.get("organic") or profile.get("organic_results", [])
        )

        news_items = [
            {
                "title": item.get("title"),
                "link": item.get("link"),
                "snippet": item.get("snippet"),
                "date": item.get("date"),
            }
            for item in news_payload.get("news", [])[:5]
        ]

        combined_context = {
            "profile": profile,
            "overview": overview,
            "news": news_items,
        }

        return CompanyResearch(
            company_name=overview.get("name") or name,
            website=overview.get("website") or url,
            overview=overview.get("description"),
            category=knowledge_graph.get("type"),
            snippet=organic_results[0].get("snippet") if organic_results else None,
            news=news_items,
            raw_context=combined_context,
            metadata=metadata or {},
        )

    async def _run_data_agent(self, research: Dict[str, Any]) -> Dict[str, Any]:
        logger.info("DataAgent: enriching research data")

        target_profile = research.get("target_profile", {})
        target_overview = research.get("target_overview", {})

        target_name = target_profile.get("name") or target_overview.get("name")
        target_website = (
            target_profile.get("website")
            or target_overview.get("website")
            or research.get("target_url")
        )

        if not target_name:
            raise RuntimeError("Unable to determine the target company name.")

        target_company = await self._collect_company_research(
            target_name,
            target_website,
            metadata={"pipeline_profile": target_profile},
        )
        target_company.raw_context.setdefault("pipeline_profile", target_profile)
        target_company.raw_context.setdefault(
            "search_payload", research.get("target_search_payload")
        )

        competitor_tasks = []
        competitor_metadata: List[Dict[str, Any]] = []
        for comp in research.get("competitors", []):
            comp_name = comp.get("name") or ""
            comp_url = comp.get("website") or comp.get("url")
            if not comp_name and comp_url:
                comp_name = search_service.extract_domain(comp_url) or comp_url
            if not comp_name and not comp_url:
                continue
            competitor_tasks.append(
                self._collect_company_research(comp_name, comp_url, metadata=comp)
            )
            competitor_metadata.append(comp)

        competitors_data: List[CompanyResearch] = []
        if competitor_tasks:
            results = await asyncio.gather(
                *competitor_tasks, return_exceptions=True
            )
            for meta, result in zip(competitor_metadata, results):
                if isinstance(result, Exception):
                    logger.warning(
                        "Failed to collect research for competitor %s: %s",
                        meta.get("name"),
                        result,
                    )
                    continue
                result.metadata.update(meta or {})
                result.raw_context.setdefault("pipeline_candidate", meta)
                competitors_data.append(result)

        return {
            "target": target_company,
            "target_profile": target_profile,
            "competitors": competitors_data,
            "competitive_score_10": research.get("competitive_score_10"),
        }

    async def _run_analyst_agent(self, enriched: Dict[str, Any]) -> Dict[str, Any]:
        logger.info("AnalystAgent: generating profiles and SWOT insights")

        target_company = enriched["target"]
        # Generate profile and strengths in parallel
        target_profile, target_strengths = await asyncio.gather(
            analysis_service.generate_company_profile(
                target_company.company_name, target_company.raw_context
            ),
            analysis_service.generate_strengths_weaknesses(
                target_company.company_name, target_company.raw_context
            ),
        )

        target_payload = {
            **target_profile,
            "strengths": target_strengths.get("strengths", []),
            "weaknesses": target_strengths.get("weaknesses", []),
            "news": target_company.news,
            "website": target_company.website,
            "summary": target_profile.get("summary")
            or (enriched.get("target_profile") or {}).get("summary")
            or target_company.overview
            or "",
        }

        pipeline_profile = enriched.get("target_profile") or {}
        target_payload.setdefault("industry", pipeline_profile.get("industry"))
        target_payload.setdefault("business_model", pipeline_profile.get("business_model"))
        target_payload.setdefault("company_size", pipeline_profile.get("company_size"))
        target_payload.setdefault("target_audience", pipeline_profile.get("target_audience"))
        target_payload.setdefault("geography_focus", pipeline_profile.get("geography_focus"))
        target_payload.setdefault("core_products", pipeline_profile.get("core_products"))
        if pipeline_profile.get("core_products") and not target_payload.get("products"):
            target_payload["products"] = pipeline_profile.get("core_products")
        target_payload.setdefault("pricing_tier", pipeline_profile.get("pricing_tier"))
        target_payload.setdefault("keywords", pipeline_profile.get("keywords", []))
        target_payload["profile_metadata"] = pipeline_profile
        competition_intensity = enriched.get("competitive_score_10")
        if competition_intensity is not None:
            try:
                target_payload["score_vs_target"] = max(
                    1, min(10, int(competition_intensity))
                )
            except (TypeError, ValueError):
                logger.debug(
                    "Unable to coerce competition intensity '%s' to int",
                    competition_intensity,
                )
        target_payload.setdefault("score_vs_target", 10)

        competitor_results: List[Dict[str, Any]] = []
        competitor_tasks = [
            self._analyze_competitor(company) for company in enriched["competitors"]
        ]

        for competitor in await asyncio.gather(
            *competitor_tasks, return_exceptions=True
        ):
            if isinstance(competitor, Exception):
                logger.warning("Competitor analysis failed: %s", competitor)
                continue
            competitor_results.append(competitor)

        return {
            "target": target_payload,
            "target_profile": pipeline_profile,
            "competitors": competitor_results,
        }

    async def _analyze_competitor(self, company_research: CompanyResearch) -> Dict[str, Any]:
        profile, strengths = await asyncio.gather(
            analysis_service.generate_company_profile(
                company_research.company_name, company_research.raw_context
            ),
            analysis_service.generate_strengths_weaknesses(
                company_research.company_name, company_research.raw_context
            ),
        )

        profile.pop("logo_url", None)

        metadata = company_research.metadata or {}
        pipeline_profile = metadata.get("profile") or metadata.get("pipeline_profile") or {}

        result: Dict[str, Any] = {
            **profile,
            "strengths": strengths.get("strengths", []),
            "weaknesses": strengths.get("weaknesses", []),
            "news": company_research.news,
            "website": company_research.website,
            "summary": profile.get("summary")
            or pipeline_profile.get("summary")
            or company_research.overview,
            "snippet": metadata.get("snippet") or company_research.snippet,
            "source_url": metadata.get("source_url") or company_research.website,
            "profile_metadata": pipeline_profile,
        }

        result["competitor_type"] = metadata.get("competitor_type") or ""
        reason = (
            metadata.get("reason_for_similarity")
            or metadata.get("why_similar")
            or ""
        )
        result["reason_for_similarity"] = reason
        result["why_similar"] = reason
        result["similarity_score"] = metadata.get("similarity_score")
        result["industry_similarity"] = metadata.get("industry_similarity")
        result["product_similarity"] = metadata.get("product_similarity")
        result["audience_similarity"] = metadata.get("audience_similarity")
        result["size_similarity"] = metadata.get("size_similarity")
        result["business_model_similarity"] = metadata.get("business_model_similarity")

        if pipeline_profile.get("core_products") and not result.get("products"):
            result["products"] = pipeline_profile.get("core_products")

        similarity_score = metadata.get("similarity_score")
        competitive_score = metadata.get("competitive_score")
        if competitive_score is None and similarity_score is not None:
            try:
                competitive_score = max(
                    1, min(10, round(float(similarity_score) / 10.0))
                )
            except (TypeError, ValueError):
                competitive_score = None

        if competitive_score is not None:
            result["score_vs_target"] = competitive_score
            result["competitive_score"] = competitive_score

        return result

    async def _run_strategist_agent(self, analyzed: Dict[str, Any]) -> Dict[str, Any]:
        logger.info("StrategistAgent: creating messaging playbooks")
        target_company = analyzed["target"]
        competitors = analyzed["competitors"]
        target_profile = analyzed.get("target_profile", {})

        strategy_tasks = [
            analysis_service.generate_strategy_summary(
                target_company.get("company_name", "Target Company"),
                competitor.get("company_name", "Competitor"),
                {
                    "target": target_company,
                    "target_profile": target_profile,
                    "competitor": competitor,
                },
            )
            for competitor in competitors
        ]

        strategies = await asyncio.gather(*strategy_tasks)

        for competitor, strategy in zip(competitors, strategies):
            competitor["how_we_win"] = strategy.get("how_we_win", [])
            competitor["potential_landmines"] = strategy.get("potential_landmines", [])

        market_summary = await analysis_service.generate_market_summary(
            target_company.get("company_name", ""), competitors
        )

        return {
            "target": target_company,
            "competitors": competitors,
            "market_summary": market_summary,
        }

    async def _run_designer_agent(self, strategized: Dict[str, Any]) -> BattlecardResult:
        logger.info("DesignerAgent: assembling final payload")

        payload = layout_service.build_battlecard_payload(
            strategized["target"],
            strategized["competitors"],
            strategized.get("market_summary", ""),
        )

        return BattlecardResult(
            target_company=payload["target_company"],
            competitors=payload["competitors"],
            market_summary=payload.get("market_summary"),
        )


