from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Dict, Iterable, List, Optional

from openai import AsyncOpenAI

from ..config import get_settings
from .cache import get_cached_result, set_cached_result

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

    # Create cache key from company name and a hash of context
    context_str = json.dumps(context, sort_keys=True)
    context_hash = hashlib.md5(context_str.encode()).hexdigest()[:8]
    cache_key = f"strengths:{company_name}:{context_hash}"
    
    cached = get_cached_result(cache_key, max_age_seconds=3600)
    if cached:
        logger.debug("Using cached strengths/weaknesses for %s", company_name)
        return cached

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
    
    set_cached_result(cache_key, result)
    return result


async def generate_company_profile(company_name: str, context: Dict[str, Any]) -> Dict[str, Any]:
    """Generate structured overview, products, and pricing details for a company."""

    # Create cache key from company name and a hash of context
    context_str = json.dumps(context, sort_keys=True)
    context_hash = hashlib.md5(context_str.encode()).hexdigest()[:8]
    cache_key = f"profile:{company_name}:{context_hash}"
    
    cached = get_cached_result(cache_key, max_age_seconds=3600)
    if cached:
        logger.debug("Using cached company profile for %s", company_name)
        return cached

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
    
    set_cached_result(cache_key, result)
    return result


async def generate_strategy_summary(
    target_company: str,
    competitor_name: str,
    context: Dict[str, Any],
) -> Dict[str, Any]:
    """Generate 'Key Differentiators' and 'Potential Landmines' insights for a competitor."""

    target_data = context.get("target", {})
    target_profile = context.get("target_profile", {})
    competitor_data = context.get("competitor", {})
    
    # Extract key comparison points
    target_products = target_data.get("products", []) or target_profile.get("core_products", [])
    competitor_products = competitor_data.get("products", []) or competitor_data.get("profile_metadata", {}).get("core_products", [])
    
    target_audience = target_data.get("target_audience") or target_profile.get("target_audience", "")
    competitor_audience = competitor_data.get("target_audience") or competitor_data.get("profile_metadata", {}).get("target_audience", "")
    
    target_strengths = target_data.get("strengths", [])
    competitor_strengths = competitor_data.get("strengths", [])
    
    target_value_prop = target_data.get("summary") or target_profile.get("summary", "")
    competitor_value_prop = competitor_data.get("summary") or competitor_data.get("profile_metadata", {}).get("summary", "")

    prompt = (
        f"You are comparing {target_company} (the target company) with {competitor_name} (a competitor). "
        f"Generate unique, competitor-specific insights based on the actual differences between these two companies.\n\n"
        f"Target Company ({target_company}):\n"
        f"- Products: {target_products}\n"
        f"- Target Audience: {target_audience}\n"
        f"- Key Strengths: {target_strengths}\n"
        f"- Value Proposition: {target_value_prop}\n\n"
        f"Competitor ({competitor_name}):\n"
        f"- Products: {competitor_products}\n"
        f"- Target Audience: {competitor_audience}\n"
        f"- Key Strengths: {competitor_strengths}\n"
        f"- Value Proposition: {competitor_value_prop}\n\n"
        f"Based on these specific differences, generate:\n"
        f"1. Key Differentiators: Write 3 unique bullet points explaining how {target_company} wins against {competitor_name} specifically. "
        f"Focus on differences in product features, target audience, value proposition, and unique strengths. "
        f"These must be specific to this competitor comparison, not generic advantages.\n"
        f"2. Potential Landmines: Write 3 unique bullet points about objections or challenges when competing against {competitor_name} specifically. "
        f"These should address this competitor's unique strengths, different positioning, or areas where they might have an advantage. "
        f"These must be specific to this competitor, not generic objections.\n\n"
        f"IMPORTANT: The differentiators and landmines must be unique to this specific competitor comparison. "
        f"No two competitors should receive identical or near-identical output. "
        f"Reference specific product differences, audience differences, and value prop differences.\n\n"
        f"Return JSON only with keys 'key_differentiators' and 'potential_landmines' (arrays of strings)."
    )

    messages = [
        {"role": "system", "content": "You are an expert competitive strategist for enterprise SaaS deals. You create unique, competitor-specific battlecard insights by comparing specific differences between companies."},
        {
            "role": "user",
            "content": prompt,
        },
    ]

    result = await _json_completion(messages, model=settings.strategist_model)
    result.setdefault("company_name", competitor_name)
    
    # Map the new key names to the old ones for backward compatibility
    if "key_differentiators" in result:
        result["how_we_win"] = result.pop("key_differentiators")
    elif "how_we_win" not in result:
        result["how_we_win"] = []
    
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


