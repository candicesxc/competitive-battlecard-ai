from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from crewai import Agent

from .services import analysis_service, layout_service, search_service

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


@dataclass
class BattlecardResult:
    target_company: Dict[str, Any]
    competitors: List[Dict[str, Any]]
    market_summary: Optional[str] = None
    html: str = ""


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
            goal="Create persuasive 'How We Win' points and anticipate objections.",
            backstory="A sales strategist crafting battle-tested talk tracks.",
        )
        self.designer_agent = Agent(
            role="Visual Storyteller",
            goal="Deliver Zendesk-style battlecard HTML with Tailwind.",
            backstory="A presentation expert turning research into polished enablement collateral.",
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

        competitors_raw = await search_service.search_company_competitors(overview["name"])
        target_domain = search_service.extract_domain(overview.get("website") or target_url)
        competitors = search_service.parse_competitor_candidates(
            competitors_raw,
            target_domain=target_domain,
        )

        if not competitors:
            raise RuntimeError("No close competitors found. Try another company.")

        return {
            "target": overview,
            "target_profile_raw": profile,
            "competitors": competitors,
        }

    async def _collect_company_research(self, name: str, url: Optional[str]) -> CompanyResearch:
        profile = await search_service.search_company_profile(url or name)
        overview = search_service.parse_company_overview(profile)
        news_payload = await search_service.search_company_news(name)

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
            category=profile.get("knowledgeGraph", {}).get("type"),
            snippet=profile.get("organic", [{}])[0].get("snippet") if profile.get("organic") else None,
            news=news_items,
            raw_context=combined_context,
        )

    async def _run_data_agent(self, research: Dict[str, Any]) -> Dict[str, Any]:
        logger.info("DataAgent: enriching research data")

        target_overview = research["target"]
        target_company = await self._collect_company_research(
            target_overview.get("name"), target_overview.get("website")
        )

        competitor_tasks = [
            self._collect_company_research(comp.get("name") or "", comp.get("url"))
            for comp in research["competitors"]
        ]

        competitors_data = await asyncio.gather(*competitor_tasks)

        return {
            "target": target_company,
            "competitors": competitors_data,
        }

    async def _run_analyst_agent(self, enriched: Dict[str, Any]) -> Dict[str, Any]:
        logger.info("AnalystAgent: generating profiles and SWOT insights")

        target_company = enriched["target"]
        target_profile = await analysis_service.generate_company_profile(
            target_company.company_name, target_company.raw_context
        )
        target_strengths = await analysis_service.generate_strengths_weaknesses(
            target_company.company_name, target_company.raw_context
        )

        target_payload = {
            **target_profile,
            "strengths": target_strengths.get("strengths", []),
            "weaknesses": target_strengths.get("weaknesses", []),
            "news": target_company.news,
            "website": target_company.website,
            "logo_url": target_profile.get("logo_url"),
        }

        competitor_results: List[Dict[str, Any]] = []
        competitor_tasks = [
            self._analyze_competitor(company) for company in enriched["competitors"]
        ]

        for competitor in await asyncio.gather(*competitor_tasks):
            competitor_results.append(competitor)

        return {
            "target": target_payload,
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

        return {
            **profile,
            "strengths": strengths.get("strengths", []),
            "weaknesses": strengths.get("weaknesses", []),
            "news": company_research.news,
            "website": company_research.website,
        }

    async def _run_strategist_agent(self, analyzed: Dict[str, Any]) -> Dict[str, Any]:
        logger.info("StrategistAgent: creating messaging playbooks")
        target_company = analyzed["target"]
        competitors = analyzed["competitors"]

        strategy_tasks = [
            analysis_service.generate_strategy_summary(
                target_company.get("company_name", "Target Company"),
                competitor.get("company_name", "Competitor"),
                {
                    "target": target_company,
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
        logger.info("DesignerAgent: assembling final layout")

        html = layout_service.build_battlecard_html(
            strategized["target"],
            strategized["competitors"],
            strategized.get("market_summary", ""),
        )

        return BattlecardResult(
            target_company=strategized["target"],
            competitors=strategized["competitors"],
            market_summary=strategized.get("market_summary"),
            html=html,
        )


