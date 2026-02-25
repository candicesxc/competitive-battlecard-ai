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

            response = openai_client.chat.completions.create(
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
        """Build prompt for playbook generation."""

        competitor_name = competitor.get("company_name", "Competitor")
        your_name = your_company.get("name", "Our Company")

        # Determine if this is B2B (company targeting) or B2C (persona targeting)
        is_b2c = "persona_name" in target_company or "persona_context" in target_company

        if is_b2c:
            # B2C: Audience persona targeting
            persona_name = target_company.get("persona_name", "Target Persona")
            persona_context = target_company.get("persona_context", context or "")
            target_description = f"a {persona_name} persona"
            context_str = f"{persona_context} {context}" if context else persona_context
        else:
            # B2B: Company targeting
            target_company_name = target_company.get("company_name", "a target company")
            industry = target_company.get("industry", "unknown industry")
            size = target_company.get("size", "unknown size")
            target_description = f"{target_company_name}"
            context_str = f"{industry}, {size}. {context}" if context else f"{industry}, {size}"

        return f"""Generate a sales playbook for selling against {competitor_name} to {target_description}.

COMPETITOR: {competitor_name}
- Weaknesses: {", ".join(competitor.get("weaknesses", [])[:3])}
- Pricing: {", ".join(competitor.get("pricing", [])[:2])}

OUR COMPANY: {your_name}
- Differentiators: {", ".join(your_company.get("how_we_win", [])[:3])}

TARGET: {target_description}
CONTEXT: {context_str or "no additional context"}

Return JSON with objection_handling (common_objections with FEEL-FELT-FOUND and FIA responses, talk_tracks, roi_calculator) and competitive_narrative (positioning_angle, personas with Executive/Technical/Financial narratives, competitive_advantages, case_study_recommendations)."""

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
