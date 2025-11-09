from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional

from ..config import get_settings

settings = get_settings()


@dataclass
class BattlecardSection:
    title: str
    items: Iterable[str]
    color_class: str


def _resolve_logo_url(company: Dict[str, Any]) -> str:
    """Determine the best logo URL for a company, falling back to Clearbit."""

    logo = company.get("logo_url")
    if logo:
        return logo

    website = company.get("website") or company.get("url")
    if website:
        return f"{settings.clearbit_logo_base}{website.replace('https://', '').replace('http://', '').rstrip('/')}"

    return "/static/logo_fallback.png"


def _render_section(section: BattlecardSection) -> str:
    """Render a bullet list section."""

    items_html = "".join(
        f'<li class="text-sm leading-5 text-slate-700">{item}</li>' for item in section.items if item
    )
    return (
        f'<div class="rounded-lg border border-slate-200 p-4 bg-white shadow-sm">'
        f'<h3 class="text-sm font-semibold uppercase tracking-wide {section.color_class} mb-2">'
        f"{section.title}</h3>"
        f"<ul class='space-y-1 list-disc list-inside'>{items_html}</ul>"
        "</div>"
    )


def _render_text_block(title: str, text: str, color_class: str) -> str:
    return (
        f'<div class="rounded-lg border border-slate-200 p-4 bg-white shadow-sm">'
        f'<h3 class="text-sm font-semibold uppercase tracking-wide {color_class} mb-2">{title}</h3>'
        f'<p class="text-sm leading-6 text-slate-700 whitespace-pre-line">{text}</p>'
        "</div>"
    )


def build_battlecard_html(
    target_company: Dict[str, Any],
    competitors: List[Dict[str, Any]],
    market_summary: Optional[str] = "",
) -> str:
    """Build Tailwind-based battlecard HTML for the frontend."""

    target_logo = _resolve_logo_url(target_company)
    target_overview = target_company.get("overview", "")
    target_products = target_company.get("products", [])
    target_pricing = target_company.get("pricing", [])

    target_sections = [
        _render_text_block("Company Overview", target_overview, "text-blue-600"),
        _render_section(
            BattlecardSection("Products", target_products, "text-blue-600"),
        ),
        _render_section(
            BattlecardSection("Pricing", target_pricing, "text-blue-600"),
        ),
    ]

    market_summary_html = (
        f'<section class="rounded-xl bg-white/70 border border-indigo-100 p-6 shadow">'
        f'<h2 class="text-lg font-semibold text-indigo-600 mb-2">Market Snapshot</h2>'
        f'<p class="text-slate-700 text-sm leading-6">{market_summary}</p>'
        "</section>"
        if market_summary
        else ""
    )

    competitor_cards = []
    for competitor in competitors:
        logo_url = _resolve_logo_url(competitor)
        sections_html = [
            _render_text_block("Company Overview", competitor.get("overview", ""), "text-blue-600"),
            _render_section(
                BattlecardSection("Products", competitor.get("products", []), "text-blue-600")
            ),
            _render_section(
                BattlecardSection("Pricing", competitor.get("pricing", []), "text-blue-600")
            ),
            _render_section(
                BattlecardSection("Strengths", competitor.get("strengths", []), "text-emerald-600")
            ),
            _render_section(
                BattlecardSection("Weaknesses", competitor.get("weaknesses", []), "text-slate-500")
            ),
            _render_section(
                BattlecardSection("How We Win", competitor.get("how_we_win", []), "text-red-500")
            ),
            _render_section(
                BattlecardSection(
                    "Potential Landmines",
                    competitor.get("potential_landmines", []),
                    "text-purple-500",
                )
            ),
        ]

        score = competitor.get("score_vs_target")
        score_html = (
            f'<div class="mt-4"><div class="flex items-center justify-between text-xs font-medium text-slate-500">'
            f'<span>Competitive Score</span><span class="text-slate-700">{score}/10</span></div>'
            f'<div class="mt-1 h-2 rounded-full bg-slate-200">'
            f'<div class="h-2 rounded-full bg-indigo-500" style="width:{min(max(score or 0, 0), 10)*10}%"></div>'
            "</div></div>"
        ) if score is not None else ""

        competitor_cards.append(
            f'''
            <article class="group rounded-2xl bg-white/90 border border-slate-200 p-6 shadow transition hover:-translate-y-1 hover:shadow-lg">
                <header class="flex items-center gap-4 mb-4">
                    <img src="{logo_url}" alt="{competitor.get("company_name", "Company")} logo" class="h-12 w-12 rounded-lg object-contain bg-white border border-slate-200" onerror="this.onerror=null;this.src='/static/logo_fallback.png';">
                    <div>
                        <h2 class="text-xl font-semibold text-slate-900">{competitor.get("company_name")}</h2>
                        <p class="text-xs uppercase tracking-wide text-slate-500">{competitor.get("category", "Competitor")}</p>
                    </div>
                </header>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {''.join(sections_html)}
                </div>
                {score_html}
            </article>
            '''
        )

    competitor_grid = "".join(competitor_cards)

    return f"""
    <section class="space-y-8">
        {market_summary_html}
        <section class="rounded-2xl bg-gradient-to-br from-indigo-50 via-white to-cyan-50 border border-indigo-100 p-8 shadow">
            <header class="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-6">
                <div class="flex items-center gap-4">
                    <img src="{target_logo}" alt="{target_company.get("company_name", "Target")} logo" class="h-16 w-16 rounded-xl object-contain bg-white border border-slate-200" onerror="this.onerror=null;this.src='/static/logo_fallback.png';">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-900">{target_company.get("company_name", "Target Company")}</h1>
                        <p class="text-sm text-slate-600">{target_company.get("category", "")}</p>
                    </div>
                </div>
                <div class="flex gap-3">
                    <button data-battlecard-action="copy" class="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition">
                        <span>Copy to Clipboard</span>
                    </button>
                    <button data-battlecard-action="download" class="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition">
                        <span>Download PDF</span>
                    </button>
                </div>
            </header>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                {''.join(target_sections)}
            </div>
        </section>
        <section class="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {competitor_grid}
        </section>
    </section>
    """


