"""Service for researching target companies and personas to extract pain points and priorities."""

import json
import logging
from typing import Any, Dict, List, Optional

from openai import AsyncOpenAI

from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class ResearchService:
    """Research target companies or personas to extract insights."""

    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.openai_api_key.get_secret_value())
        self.model = settings.openai_model

    async def research_company(self, url: str) -> Dict[str, Any]:
        """Research a target company from its URL to extract pain points and priorities."""
        logger.info(f"Researching company at {url}")

        prompt = f"""You are a market research analyst. Research the company at {url} and provide insights.

Based on what you know about companies in this space, provide:
1. pain_points: Top 3-5 pain points this company likely faces (e.g., "Difficulty scaling data infrastructure", "Vendor lock-in concerns")
2. priorities: What they prioritize most (e.g., "Performance", "Cost optimization", "Data governance")
3. industry: The industry they operate in
4. company_size: Estimated size (startup, small, mid-market, enterprise)
5. use_cases: Primary use cases they care about
6. decision_factors: What matters most when they evaluate solutions

Provide realistic, specific insights. Focus on problems they face, not features they have.
Return ONLY valid JSON with these exact keys."""

        messages = [
            {
                "role": "system",
                "content": "You are a strategic business analyst specializing in B2B market research.",
            },
            {"role": "user", "content": prompt},
        ]

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.3,
                response_format={"type": "json_object"},
            )

            content = response.choices[0].message.content
            if not content:
                logger.error("Empty response from OpenAI for company research")
                return self._default_company_research()

            data = json.loads(content)
            logger.info(f"Successfully researched company: {data.get('industry')}")
            return data

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse company research JSON: {e}")
            return self._default_company_research()
        except Exception as e:
            logger.error(f"Error researching company: {e}")
            return self._default_company_research()

    async def research_persona(self, persona_description: str) -> Dict[str, Any]:
        """Research a target persona to extract their pain points and priorities."""
        logger.info(f"Researching persona: {persona_description[:50]}...")

        prompt = f"""You are a personas and market research expert. Analyze this target audience:

{persona_description}

Provide insights about what matters to this persona:
1. pain_points: Top 3-5 pain points they experience (e.g., "Time-consuming manual processes", "Lack of team coordination")
2. priorities: Their top priorities when evaluating solutions (e.g., "Ease of use", "Customer support", "ROI")
3. job_title: Their likely job title or role
4. industry: Industries they typically work in
5. company_size: Company sizes they work at (startup, small, mid-market, enterprise)
6. buying_factors: What drives their buying decisions
7. motivation: What motivates them (career growth, efficiency, cost savings, etc)

Provide realistic, specific insights based on typical behavior of this persona.
Return ONLY valid JSON with these exact keys."""

        messages = [
            {
                "role": "system",
                "content": "You are a UX researcher and personas expert specializing in B2B buyer psychology.",
            },
            {"role": "user", "content": prompt},
        ]

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.3,
                response_format={"type": "json_object"},
            )

            content = response.choices[0].message.content
            if not content:
                logger.error("Empty response from OpenAI for persona research")
                return self._default_persona_research()

            data = json.loads(content)
            logger.info(f"Successfully researched persona")
            return data

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse persona research JSON: {e}")
            return self._default_persona_research()
        except Exception as e:
            logger.error(f"Error researching persona: {e}")
            return self._default_persona_research()

    def _default_company_research(self) -> Dict[str, Any]:
        """Return default company research data when API fails."""
        return {
            "pain_points": [
                "Scaling data infrastructure",
                "Data governance and compliance",
                "Integration with existing tools",
            ],
            "priorities": ["Performance", "Security", "Cost optimization"],
            "industry": "Technology",
            "company_size": "mid-market",
            "use_cases": ["Data analytics", "Business intelligence"],
            "decision_factors": ["ROI", "Ease of implementation", "Vendor support"],
        }

    def _default_persona_research(self) -> Dict[str, Any]:
        """Return default persona research data when API fails."""
        return {
            "pain_points": [
                "Time-consuming manual processes",
                "Lack of actionable insights",
                "Difficulty getting stakeholder buy-in",
            ],
            "priorities": ["Ease of use", "Time savings", "Team adoption"],
            "job_title": "Unknown",
            "industry": "Technology",
            "company_size": "mid-market",
            "buying_factors": ["ROI", "Implementation speed", "Vendor credibility"],
            "motivation": "Improve efficiency and career advancement",
        }
