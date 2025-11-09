from __future__ import annotations

import json
import logging
from typing import Any, Dict, Iterable, List, Optional

from openai import AsyncOpenAI

from ..config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()
openai_client = AsyncOpenAI(api_key=settings.openai_api_key.get_secret_value())


class AnalysisError(RuntimeError):
    """Raised when OpenAI analysis requests fail."""


async def _json_completion(
    messages: List[Dict[str, str]],
    model: Optional[str] = None,
    response_format: Optional[Dict[str, Any]] = None,
) -> Any:
    """Call OpenAI to produce a JSON payload and parse the response."""

    chosen_model = model or settings.openai_model
    format_payload = response_format or {"type": "json_object"}

    try:
        response = await openai_client.chat.completions.create(
            model=chosen_model,
            messages=messages,
            temperature=0.2,
            response_format=format_payload,
        )
    except Exception as exc:  # noqa: BLE001 - upstream exceptions are varied
        logger.exception("OpenAI request failed")
        raise AnalysisError("OpenAI analysis request failed") from exc

    try:
        content = response.choices[0].message.content  # type: ignore[index]
        if not content:
            raise ValueError("Empty response from OpenAI")
        return json.loads(content)
    except (ValueError, KeyError, json.JSONDecodeError) as exc:
        logger.error("Failed to parse OpenAI JSON response: %s", exc)
        raise AnalysisError("Failed to parse OpenAI response") from exc


async def generate_strengths_weaknesses(company_name: str, context: Dict[str, Any]) -> Dict[str, Any]:
    """Generate strengths and weaknesses for a company."""

    prompt = (
        f"Given the following public data about {company_name}, write 3 bullet points of strengths "
        "and 3 bullet points of weaknesses in a concise, professional tone. Focus on product features, "
        "go-to-market, and customer experience. Output JSON only with keys 'company_name', 'strengths', "
        "and 'weaknesses'."
    )

    messages = [
        {"role": "system", "content": "You are a strategic product marketing analyst."},
        {
            "role": "user",
            "content": json.dumps(
                {
                    "instructions": prompt,
                    "context": context,
                }
            ),
        },
    ]

    result = await _json_completion(messages, model=settings.analyst_model)
    if "company_name" not in result:
        result["company_name"] = company_name
    return result


async def generate_company_profile(company_name: str, context: Dict[str, Any]) -> Dict[str, Any]:
    """Generate structured overview, products, and pricing details for a company."""

    prompt = (
        f"Using the provided research snippets about {company_name}, create a concise company profile. "
        "Return JSON with keys 'company_name', 'overview', 'products', 'pricing', and 'category'. "
        "'Products' should be a list of 2-3 strings formatted as 'Product Name – description'. "
        "'Pricing' should list 1-2 tiers if available, otherwise use general pricing insights. "
        "Keep the tone professional and fact-based. Do not reference company logos or images."
    )

    messages = [
        {"role": "system", "content": "You are a marketing research specialist."},
        {
            "role": "user",
            "content": json.dumps(
                {
                    "instructions": prompt,
                    "research": context,
                }
            ),
        },
    ]

    result = await _json_completion(messages)
    result.setdefault("company_name", company_name)
    result.pop("logo_url", None)
    return result


async def generate_strategy_summary(
    target_company: str,
    competitor_name: str,
    context: Dict[str, Any],
) -> Dict[str, Any]:
    """Generate 'How We Win' and 'Potential Landmines' insights for a competitor."""

    prompt = (
        f"Compare {target_company} with {competitor_name}. "
        "Write 3 bullet points for How We Win — reasons customers prefer our solution. "
        "Write 3 bullet points for Potential Landmines — common objections and how to address them. "
        "Keep the tone persuasive yet factual. Return JSON only with keys 'how_we_win' and 'potential_landmines'."
    )

    messages = [
        {"role": "system", "content": "You are an expert competitive strategist for enterprise SaaS deals."},
        {
            "role": "user",
            "content": json.dumps(
                {
                    "instructions": prompt,
                    "target_company": target_company,
                    "competitor_context": context,
                }
            ),
        },
    ]

    result = await _json_completion(messages, model=settings.strategist_model)
    result.setdefault("company_name", competitor_name)
    return result


async def generate_market_summary(target_company: str, competitors: Iterable[Dict[str, Any]]) -> str:
    """Generate an optional market summary paragraph."""

    prompt = (
        "Create a single paragraph summarizing the current market landscape given the following data. "
        "Highlight notable trends and how they relate to the target company. Keep it under 120 words. "
        "Return JSON only with the key 'summary'."
    )
    messages = [
        {"role": "system", "content": "You are a market intelligence analyst crafting executive summaries."},
        {
            "role": "user",
            "content": json.dumps(
                {
                    "instructions": prompt,
                    "target_company": target_company,
                    "competitors": list(competitors),
                }
            ),
        },
    ]

    result = await _json_completion(messages)
    return result.get("summary", "")


