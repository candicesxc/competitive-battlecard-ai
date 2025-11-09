from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

from ..config import get_settings

settings = get_settings()

_DEFAULT_LOGO = "img/logo_fallback.png"


def _ensure_iterable(items: Optional[Iterable[str]]) -> List[str]:
    if not items:
        return []
    if isinstance(items, list):
        return [str(item).strip() for item in items if str(item).strip()]
    return [str(items).strip()]


def _resolve_logo_url(company: Dict[str, Any]) -> str:
    logo = company.get("logo_url")
    if isinstance(logo, str) and logo.strip():
        return logo

    website = company.get("website") or company.get("url")
    if isinstance(website, str) and website.strip():
        sanitized = (
            website.replace("https://", "")
            .replace("http://", "")
            .replace("www.", "")
            .strip("/")
        )
        if sanitized:
            return f"{settings.clearbit_logo_base}{sanitized}"

    return _DEFAULT_LOGO


def _score_company(strengths: List[str], weaknesses: List[str]) -> int:
    base_score = 6
    score = base_score + len(strengths) - len(weaknesses)
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
        "logo_url": _resolve_logo_url(company),
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
    }

    score = company.get("score_vs_target")
    if score is None:
        score = _score_company(strengths, weaknesses)
    try:
        prepared["score_vs_target"] = int(score)
    except (TypeError, ValueError):
        prepared["score_vs_target"] = _score_company(strengths, weaknesses)

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


