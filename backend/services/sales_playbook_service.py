import json
import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


class SalesPlaybookService:
    """
    Generate competitive sales playbooks using the 3-Layer Framework:

    Layer 1 — Battlecard Data Pipeline
        Extract from the existing battlecard instead of regenerating.
        The battlecard is a READ-ONLY source of truth.

    Layer 2 — Context-Aware Content Generation
        Every section explicitly references the target persona's pain points.

    Layer 3 — Multi-Section Consistency & Cross-References
        Sections reference each other; discovery questions map to objection
        responses, which map back to differentiators, which close with ROI.
    """

    # ─── Public entry point ────────────────────────────────────────────────

    @staticmethod
    async def generate_comprehensive_playbook(
        competitor: Dict[str, Any],
        your_company: Dict[str, Any],
        target_company: Dict[str, Any],
        context: str,
        openai_client: Any,
    ) -> Dict[str, Any]:
        """
        Generate a structured sales playbook that:
        • Extracts insights from the battlecard (Layer 1)
        • Injects buyer-persona context into every section (Layer 2)
        • Builds a cross-reference map between sections (Layer 3)
        """
        try:
            # Layer 1: extract battlecard sections before calling the AI
            battlecard_extract = SalesPlaybookService._extract_battlecard_sections(
                competitor, your_company
            )

            prompt = SalesPlaybookService._build_prompt(
                competitor, your_company, target_company, context, battlecard_extract
            )

            response = await openai_client.chat.completions.create(
                model="gpt-4.1-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=3500,
                response_format={"type": "json_object"},
            )

            playbook_text = response.choices[0].message.content
            playbook = SalesPlaybookService._parse_response(playbook_text)

            # Attach data lineage so callers know what was sourced vs generated
            playbook["_data_lineage"] = battlecard_extract["source_map"]
            return playbook

        except Exception as e:
            logger.error(f"Error generating playbook: {e}")
            raise

    # ─── Layer 1: Battlecard data extraction ──────────────────────────────

    @staticmethod
    def _extract_battlecard_sections(
        competitor: Dict[str, Any],
        your_company: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Read-only extraction from the battlecard.

        Maps each battlecard section to the playbook section it feeds.
        Nothing is regenerated — only read and organized.
        """
        differentiators: List[str] = competitor.get("how_we_win", [])[:4]
        landmines: List[str]       = competitor.get("potential_landmines", [])[:3]
        comp_weaknesses: List[str] = competitor.get("weaknesses", [])[:4]
        comp_strengths: List[str]  = competitor.get("strengths", [])[:3]
        their_pricing: List[str]   = competitor.get("pricing", [])[:2]
        our_pricing: List[str]     = your_company.get("pricing", [])[:2]
        our_strengths: List[str]   = your_company.get("strengths", [])[:3]

        return {
            # Extracted content — do NOT regenerate these in the prompt
            "differentiators": differentiators,
            "landmines": landmines,
            "competitor_weaknesses": comp_weaknesses,
            "competitor_strengths": comp_strengths,
            "their_pricing": their_pricing,
            "our_pricing": our_pricing,
            "our_strengths": our_strengths,
            # Source map for data lineage reporting
            "source_map": {
                "positioning_angle":   "battlecard.how_we_win + persona.pain_points",
                "opening_hook":        "persona.context + battlecard.potential_landmines",
                "watch_out_for":       "battlecard.potential_landmines + persona.scale context",
                "discovery_questions": "battlecard.how_we_win → question mapping",
                "objection_responses": "battlecard.potential_landmines + battlecard.weaknesses → battlecard.how_we_win pivot",
                "pricing_roi":         "battlecard.pricing + persona.pain_points",
                "conversation_flow_map": "cross-reference: all sections",
            },
        }

    # ─── Layer 2 + 3: Prompt builder ──────────────────────────────────────

    @staticmethod
    def _build_prompt(
        competitor: Dict[str, Any],
        your_company: Dict[str, Any],
        target_company: Dict[str, Any],
        context: str,
        battlecard_extract: Dict[str, Any],
    ) -> str:
        """
        Build a prompt that:
        • Passes battlecard data as READ-ONLY input (no regeneration)
        • Instructs the AI to add persona-specific context to every section
        • Requests a conversation_flow_map linking sections together
        """
        competitor_name = competitor.get("company_name", "Competitor")
        your_name       = your_company.get("name") or your_company.get("company_name", "Our Company")

        is_b2c = "persona_name" in target_company or "persona_context" in target_company

        if is_b2c:
            persona_name    = target_company.get("persona_name", "Target Persona")
            persona_context = target_company.get("persona_context", context or "")
            target_label    = f"{persona_name} persona"
            pain_points     = target_company.get("painPoints") or target_company.get("pain_points") or []
            priorities      = target_company.get("priorities") or []
            context_str     = f"{persona_context} {context}".strip() if context else persona_context
            audience_note   = (
                f"B2C persona. Address the individual's pain, not corporate goals.\n"
                f"Persona: {persona_name}\n"
                f"Context: {persona_context}\n"
                f"Top pain points: {', '.join(pain_points[:3]) or 'not specified'}\n"
                f"Priorities: {', '.join(priorities[:3]) or 'not specified'}"
            )
        else:
            company_name = target_company.get("company_name", "the target company")
            industry     = (
                target_company.get("industry")
                or target_company.get("research", {}).get("industry", "")
            )
            size         = target_company.get("company_size") or target_company.get("size", "")
            target_label = company_name
            pain_points  = (
                target_company.get("painPoints")
                or target_company.get("pain_points")
                or target_company.get("research", {}).get("pain_points")
                or []
            )
            priorities   = (
                target_company.get("priorities")
                or target_company.get("research", {}).get("priorities")
                or []
            )
            context_str  = context or ""
            audience_note = (
                f"B2B deal.\n"
                f"Target company: {company_name}\n"
                f"Industry: {industry or 'unknown'} | Size: {size or 'unknown'}\n"
                f"Top pain points: {', '.join(pain_points[:4]) or 'not specified'}\n"
                f"Priorities: {', '.join(priorities[:3]) or 'not specified'}"
            )

        bc = battlecard_extract
        has_pricing = bool(bc["their_pricing"] and bc["our_pricing"])

        # Layer 1 section — present battlecard data as the immutable source
        battlecard_block = f"""
=== BATTLECARD DATA (READ-ONLY — do NOT regenerate, only extract and enhance) ===
These sections already exist in the battlecard. Your job is to ADD persona context, not recreate them.

BATTLECARD: {your_name} vs {competitor_name}

Key Differentiators (from battlecard.how_we_win):
{chr(10).join(f"  {i+1}. {d}" for i, d in enumerate(bc["differentiators"])) or "  (none available)"}

Potential Landmines (from battlecard.potential_landmines):
{chr(10).join(f"  {i+1}. {m}" for i, m in enumerate(bc["landmines"])) or "  (none available)"}

{competitor_name} Weaknesses (from battlecard.weaknesses):
{chr(10).join(f"  - {w}" for w in bc["competitor_weaknesses"]) or "  (none available)"}

{competitor_name} Strengths (from battlecard.strengths):
{chr(10).join(f"  - {s}" for s in bc["competitor_strengths"]) or "  (none available)"}

Pricing (from battlecard.pricing):
  {competitor_name}: {', '.join(bc["their_pricing"]) or "not available"}
  {your_name}: {', '.join(bc["our_pricing"]) or "not available"}
"""

        pricing_field = (
            '"comparison": "One-sentence framing of the pricing difference and what the buyer gets for it",'
            if has_pricing
            else ""
        )

        return f"""You are a senior sales coach implementing a 3-layer competitive playbook framework.

Your job is NOT to regenerate competitive intelligence — the battlecard already has it.
Your job IS to:
  1. Extract the battlecard insights (provided below as READ-ONLY)
  2. Add persona-specific context to every section (Layer 2)
  3. Build cross-references between sections so the playbook flows as a connected conversation (Layer 3)

Rules:
- Every section must explicitly reference {target_label}'s pain points and context.
- Do NOT use generic phrases like "drive business value" or "maintain user engagement."
- Write in plain spoken English — what a rep would actually say in a deal review.
- Each discovery question must map to a specific differentiator it's designed to unlock.
- Each objection response must pivot back to a named differentiator.
- Do NOT invent new competitive intelligence — only enhance what the battlecard provides.

=== BUYER PROFILE ===
{audience_note}
Additional context: {context_str or "none provided"}

{battlecard_block}

=== OUTPUT FORMAT ===
Return a single JSON object with this exact structure:

{{
  "competitive_narrative": {{
    "positioning_angle": "2-3 sentences. Extracted from battlecard.how_we_win[0-1], enhanced with {target_label}'s top pain point. Sound like something a rep would actually say.",
    "opening_hook": "One sharp sentence a rep says in the first 30 seconds. Must reference {target_label}'s specific context.",
    "opening_points": [
      "Lead-with point 1 — extracted from battlecard.how_we_win, persona-relevant",
      "Lead-with point 2 — extracted from battlecard.how_we_win, persona-relevant"
    ]
  }},
  "watch_out_for": [
    {{
      "landmine": "Extracted from battlecard.potential_landmines — what {competitor_name} will say",
      "counter": "Persona-specific counter that reframes the landmine as an opportunity. Must pivot to a named differentiator.",
      "source": "battlecard.potential_landmines"
    }}
  ],
  "discovery_questions": [
    {{
      "question": "Question mapped from battlecard.how_we_win[i] — surfaces the gap that differentiator closes",
      "expected_trigger": "What the prospect will reveal that opens the door to your differentiator",
      "leads_to_differentiator": "Which battlecard differentiator this question is designed to unlock",
      "source": "battlecard.how_we_win → question mapping"
    }}
  ],
  "objection_responses": [
    {{
      "if_they_say": "The objection in the buyer's own words — pulled from battlecard landmines or strengths",
      "you_say": "Plain conversational response. Must pivot to a named differentiator. Reference {target_label}'s specific context.",
      "pivot_to": "Which differentiator you're pivoting back to",
      "source": "battlecard.potential_landmines → battlecard.how_we_win"
    }}
  ],
  "pricing_roi": {{
    {pricing_field}
    "value_framing_question": "A question that surfaces the cost of inaction — specific to {target_label}'s pain points"
  }},
  "conversation_flow_map": [
    {{
      "step": 1,
      "type": "opening",
      "label": "Open",
      "content": "Opening hook text",
      "preempts": "Which landmine the opening preempts",
      "lineage": "persona.context + battlecard.potential_landmines"
    }},
    {{
      "step": 2,
      "type": "discovery",
      "label": "Discover 1",
      "content": "First discovery question",
      "expected_trigger": "What prospect reveals",
      "lineage": "battlecard.how_we_win → question mapping"
    }},
    {{
      "step": 3,
      "type": "differentiator",
      "label": "Win 1",
      "content": "The differentiator to land on",
      "counters_landmine": "Which landmine this counters",
      "lineage": "battlecard.how_we_win"
    }},
    {{
      "step": 4,
      "type": "roi",
      "label": "Close",
      "content": "ROI framing question",
      "closes": true,
      "lineage": "battlecard.pricing + persona.pain_points"
    }}
  ]
}}"""

    # ─── Response parser ───────────────────────────────────────────────────

    @staticmethod
    def _parse_response(response_text: str) -> Dict[str, Any]:
        """Parse JSON response from OpenAI."""
        try:
            json_start = response_text.find("{")
            json_end   = response_text.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                return json.loads(response_text[json_start:json_end])
            return SalesPlaybookService._default_playbook()
        except json.JSONDecodeError:
            return SalesPlaybookService._default_playbook()

    @staticmethod
    def _default_playbook() -> Dict[str, Any]:
        """Minimal fallback when parsing fails."""
        return {
            "competitive_narrative": {
                "positioning_angle": "Faster time-to-value with better support",
                "opening_hook": "Let's compare outcomes, not just features.",
                "opening_points": ["Faster implementation", "Better ROI"],
            },
            "watch_out_for": [],
            "discovery_questions": [],
            "objection_responses": [],
            "pricing_roi": {
                "value_framing_question": "What does the status quo cost you each month?"
            },
            "conversation_flow_map": [],
        }
