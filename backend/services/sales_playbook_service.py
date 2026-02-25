import json
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)


class SalesPlaybookService:
    """Generate comprehensive sales playbooks using OpenAI."""

    @staticmethod
    async def generate_comprehensive_playbook(
        competitor: Dict[str, Any],
        your_company: Dict[str, Any],
        target_company: Dict[str, Any],
        context: str,
        openai_client: Any
    ) -> Dict[str, Any]:
        """Generate unified sales playbook with objections + narratives."""
        try:
            prompt = SalesPlaybookService._build_prompt(
                competitor, your_company, target_company, context
            )

            response = await openai_client.chat.completions.create(
                model="gpt-4",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=3000
            )

            playbook_text = response.choices[0].message.content
            playbook = SalesPlaybookService._parse_response(playbook_text)
            return playbook

        except Exception as e:
            logger.error(f"Error generating playbook: {e}")
            raise

    @staticmethod
    def _build_prompt(
        competitor: Dict[str, Any],
        your_company: Dict[str, Any],
        target_company: Dict[str, Any],
        context: str
    ) -> str:
        """Build a senior-sales-coach-style playbook prompt."""

        competitor_name = competitor.get("company_name", "Competitor")
        your_name = your_company.get("name", "Our Company")

        # Determine if this is B2B (company targeting) or B2C (persona targeting)
        is_b2c = "persona_name" in target_company or "persona_context" in target_company

        if is_b2c:
            persona_name = target_company.get("persona_name", "Target Persona")
            persona_context = target_company.get("persona_context", context or "")
            target_label = f"{persona_name} persona"
            target_pain_points = target_company.get("painPoints") or target_company.get("pain_points") or []
            target_priorities = target_company.get("priorities") or []
            context_str = f"{persona_context} {context}".strip() if context else persona_context
            audience_note = (
                f"This is a B2C persona. All references should address the individual's pain, not a company's business goals.\n"
                f"Persona pain points: {', '.join(target_pain_points[:3]) or 'not specified'}\n"
                f"Persona priorities: {', '.join(target_priorities[:3]) or 'not specified'}"
            )
        else:
            target_company_name = target_company.get("company_name", "the target company")
            industry = target_company.get("industry") or target_company.get("research", {}).get("industry", "")
            size = target_company.get("company_size") or target_company.get("size", "")
            target_label = target_company_name
            target_pain_points = (
                target_company.get("painPoints")
                or target_company.get("pain_points")
                or target_company.get("research", {}).get("pain_points")
                or []
            )
            target_priorities = (
                target_company.get("priorities")
                or target_company.get("research", {}).get("priorities")
                or []
            )
            context_str = context or ""
            audience_note = (
                f"This is a B2B company deal.\n"
                f"Target company: {target_company_name}\n"
                f"Industry: {industry or 'unknown'} | Size: {size or 'unknown'}\n"
                f"Their pain points: {', '.join(target_pain_points[:4]) or 'not specified'}\n"
                f"Their priorities: {', '.join(target_priorities[:3]) or 'not specified'}"
            )

        competitor_weaknesses = competitor.get("weaknesses", [])[:4]
        competitor_strengths  = competitor.get("strengths", [])[:3]
        competitor_pricing    = competitor.get("pricing", [])[:2]
        our_differentiators   = your_company.get("how_we_win", [])[:4]
        our_strengths         = your_company.get("strengths", [])[:3]
        our_pricing           = your_company.get("pricing", [])[:2]

        has_pricing_data = bool(competitor_pricing and our_pricing)

        return f"""You are a senior sales coach writing advice for a rep at {your_name} competing against {competitor_name} for a deal with {target_label}.

Write advice that sounds like it came from someone who knows this deal — not a generic battlecard template.
Rules:
- Be specific to what {target_label} actually cares about based on the profile data below.
- Do NOT use generic phrases like "maintain user engagement" or "drive business value."
- Write in plain, spoken English — the kind a rep would read aloud in a deal review.
- Only include sections you can support with the data provided. Do not fabricate specifics.

=== PROFILE DATA ===
{audience_note}
Additional context: {context_str or "none provided"}

COMPETITOR — {competitor_name}
Strengths: {', '.join(competitor_strengths) or 'not specified'}
Weaknesses: {', '.join(competitor_weaknesses) or 'not specified'}
Pricing: {', '.join(competitor_pricing) or 'not specified'}

YOUR COMPANY — {your_name}
Key differentiators: {', '.join(our_differentiators) or 'not specified'}
Strengths: {', '.join(our_strengths) or 'not specified'}
Pricing: {', '.join(our_pricing) or 'not specified'}

=== OUTPUT FORMAT ===
Return a single JSON object with this exact structure:

{{
  "competitive_narrative": {{
    "positioning_angle": "2-3 sentences MAX. Specific to what {target_label} cares about. Should sound like something a rep would actually say on a call — not a press release.",
    "opening_hook": "ONE sharp opening line that a rep could say in the first 30 seconds. Then list exactly 2 supporting points, each completing the sentence 'This matters to {target_label} because...'",
    "opening_points": ["point 1 — why it matters to {target_label}", "point 2 — why it matters to {target_label}"]
  }},
  "watch_out_for": [
    {{
      "landmine": "One sentence: what {competitor_name} will say or do to win this deal.",
      "counter": "One sentence: how to neutralize it using {your_name} data. If no strong counter exists, write: 'Acknowledge and redirect to [specific strength]'."
    }}
    // max 3 items
  ],
  "discovery_questions": [
    "Question to uncover whether {competitor_name} is already in the account",
    "Question to uncover what the buyer actually cares about (specific to {target_label}'s business)",
    "Question to uncover what would make them switch or move forward now"
  ],
  "objection_responses": [
    {{
      "if_they_say": "The objection in the buyer's own words",
      "you_say": "Your response in plain conversational language — no bullet nesting, no jargon"
    }}
    // max 3 items
  ],
  "pricing_roi": {'"value_framing_question": "A question the rep can ask to surface the cost of inaction — specific to this target"' if not has_pricing_data else '"comparison": "One-sentence framing of the pricing difference and what the buyer gets for it", "value_framing_question": "A question to anchor value, not just price"'}
}}"""

    @staticmethod
    def _parse_response(response_text: str) -> Dict[str, Any]:
        """Parse response into structured playbook."""
        try:
            json_start = response_text.find("{")
            json_end = response_text.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                return json.loads(response_text[json_start:json_end])
            else:
                return SalesPlaybookService._default_playbook()
        except json.JSONDecodeError:
            return SalesPlaybookService._default_playbook()

    @staticmethod
    def _default_playbook() -> Dict[str, Any]:
        """Return default playbook structure."""
        return {
            "objection_handling": {
                "common_objections": [
                    {
                        "objection": "Why choose us over the competitor?",
                        "objection_category": "competitive",
                        "responses": [
                            {
                                "framework": "FEEL-FELT-FOUND",
                                "response": "I understand—the competitor is established. Many felt the same, but found we deliver faster ROI."
                            },
                            {
                                "framework": "FIA",
                                "response": "Fact: 6-month implementation. Impact: You need results in 90 days. Act: We deploy in 6 weeks."
                            }
                        ],
                        "talking_points": ["Faster implementation", "Better support", "Lower TCO"],
                        "success_rate_note": "Proven approach for mid-market"
                    }
                ],
                "talk_tracks": [
                    {
                        "stage": "discovery",
                        "framework": "Problem-First",
                        "flow": "Discovery → Identify Gaps → Position Solution",
                        "script": "Focus on their problems, not competitor features"
                    }
                ],
                "roi_calculator": {
                    "current_state_cost": "Inefficiency costs",
                    "future_state_savings": "Expected savings",
                    "cost_of_delay": "Monthly opportunity cost"
                }
            },
            "competitive_narrative": {
                "positioning_angle": "Faster time-to-value with better support",
                "buyer_aligned_story": "Get results in 90 days instead of 6 months",
                "personas": [
                    {"persona": "Executive", "narrative": "Focus on ROI and speed", "key_points": ["Faster", "Better ROI", "Lower risk"]},
                    {"persona": "Technical", "narrative": "Focus on integration", "key_points": ["Better APIs", "Easier setup", "Modern stack"]},
                    {"persona": "Financial", "narrative": "Focus on TCO", "key_points": ["Lower TCO", "Faster payback", "No hidden costs"]}
                ],
                "competitive_advantages": ["Faster implementation", "Better support", "Better integration"],
                "case_study_recommendations": ["Similar company success", "Successful migrations"]
            }
        }
