from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

def _ensure_iterable(items: Optional[Iterable[str]]) -> List[str]:
    if not items:
        return []
    if isinstance(items, list):
        return [str(item).strip() for item in items if str(item).strip()]
    return [str(items).strip()]


def _score_company(
    strengths: List[str], weaknesses: List[str], fallback: Optional[Any] = None
) -> int:
    if fallback is not None:
        try:
            score_value = float(fallback)
            return max(1, min(10, round(score_value)))
        except (TypeError, ValueError):
            pass

    score = (len(strengths) * 2) - len(weaknesses)
    return max(1, min(10, score))


def _prepare_company_payload(company: Dict[str, Any], *, include_strategy: bool) -> Dict[str, Any]:
    strengths = _ensure_iterable(company.get("strengths"))
    weaknesses = _ensure_iterable(company.get("weaknesses"))
    how_we_win = _ensure_iterable(company.get("how_we_win") if include_strategy else [])
    landmines = _ensure_iterable(
        company.get("potential_landmines") if include_strategy else []
    )

    prepared: Dict[str, Any] = {
        "company_name": company.get("company_name")
        or company.get("name")
        or "Company",
        "overview": company.get("overview") or "",
        "products": _ensure_iterable(company.get("products")),
        "pricing": _ensure_iterable(company.get("pricing")),
        "strengths": strengths,
        "weaknesses": weaknesses,
        "how_we_win": how_we_win,
        "potential_landmines": landmines,
        "category": company.get("category") or "",
        "website": company.get("website") or "",
        "news": company.get("news") or [],
        "summary": company.get("summary") or "",
    }

    if include_strategy:
        prepared["competitor_type"] = company.get("competitor_type") or ""
        prepared["why_similar"] = company.get("why_similar") or ""
        prepared["similarity_breakdown"] = {
            "industry": company.get("industry_similarity"),
            "product": company.get("product_similarity"),
            "audience": company.get("audience_similarity"),
            "size": company.get("size_similarity"),
            "business_model": company.get("business_model_similarity"),
        }

    score = company.get("score_vs_target")
    prepared["score_vs_target"] = _score_company(
        strengths,
        weaknesses,
        fallback=score,
    )

    return prepared


def build_battlecard_payload(
    target_company: Dict[str, Any],
    competitors: List[Dict[str, Any]],
    market_summary: Optional[str] = "",
) -> Dict[str, Any]:
    """Return structured battlecard data for frontend rendering."""

    target_payload = _prepare_company_payload(
        target_company,
        include_strategy=False,
    )
    # The target company score is less meaningful; default to 10 when absent.
    target_score = target_company.get("score_vs_target", 10)
    try:
        target_payload["score_vs_target"] = int(target_score)
    except (TypeError, ValueError):
        target_payload["score_vs_target"] = 10

    competitor_payloads = [
        _prepare_company_payload(competitor, include_strategy=True)
        for competitor in competitors
    ]

    return {
        "target_company": target_payload,
        "competitors": competitor_payloads,
        "market_summary": market_summary or "",
    }


