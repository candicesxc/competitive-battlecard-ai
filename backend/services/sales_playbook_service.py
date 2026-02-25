"""Generate comprehensive sales playbooks (objections + narratives) using OpenAI."""

import json
import logging
from typing import Any, Dict, Optional

import openai

logger = logging.getLogger(__name__)


class SalesPlaybookService:
    """Generate comprehensive sales enablement playbooks using OpenAI."""

    def __init__(self):
        """Initialize the service with OpenAI client."""
        self.client = openai.AsyncOpenAI()

    async def generate_comprehensive_playbook(
        self,
        competitor: Dict[str, Any],
        your_company: Dict[str, Any],
        target_company: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Generate unified sales playbook combining objections + narratives.

        Args:
            competitor: Competitor data from battlecard
            your_company: Your company data
            target_company: Target customer data

        Returns:
            Dict with objection_handling and competitive_narrative sections
        """
        try:
            # Build comprehensive prompt
            prompt = self._build_playbook_prompt(
                competitor=competitor,
                your_company=your_company,
                target_company=target_company,
            )

            # Call OpenAI to generate everything in one request
            response = await self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert sales enablement strategist specializing in competitive positioning and objection handling. Generate highly specific, actionable sales content that a sales team can use immediately.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.7,
                max_tokens=4000,
            )

            # Parse response
            content = response.choices[0].message.content
            playbook = self._parse_playbook_response(content)

            return playbook

        except Exception as e:
            logger.error(f"Error generating sales playbook: {e}")
            raise

    def _build_playbook_prompt(
        self,
        competitor: Dict[str, Any],
        your_company: Dict[str, Any],
        target_company: Dict[str, Any],
    ) -> str:
        """Build comprehensive prompt for playbook generation."""

        competitor_name = competitor.get("company_name", "Competitor")
        your_name = your_company.get("name", "Our Company")

        # Extract key data
        competitor_weaknesses = competitor.get("weaknesses", [])
        your_strengths = your_company.get("how_we_win", [])
        target_context = target_company.get("context", "")
        target_size = target_company.get("company_size", "")
        target_industry = target_company.get("industry", "")

        prompt = f"""Generate a comprehensive sales playbook for selling {your_name} against {competitor_name} to a target customer.

COMPETITOR INTEL:
- Name: {competitor_name}
- Weaknesses: {', '.join(competitor_weaknesses[:5]) if competitor_weaknesses else 'N/A'}
- Pricing: {competitor.get('pricing', ['N/A'])[0] if competitor.get('pricing') else 'N/A'}

OUR COMPANY:
- Name: {your_name}
- Key Differentiators: {', '.join(your_strengths[:5]) if your_strengths else 'N/A'}
- Pricing: {your_company.get('pricing', ['N/A'])[0] if your_company.get('pricing') else 'N/A'}

TARGET CUSTOMER:
- Size: {target_size or 'Mid-market'}
- Industry: {target_industry or 'Technology'}
- Context: {target_context or 'Standard B2B SaaS buyer'}

Generate the following in JSON format:

{{
  "objection_handling": {{
    "common_objections": [
      {{
        "objection": "Common objection about {competitor_name}",
        "objection_category": "price|feature|timing|authority",
        "responses": [
          {{
            "framework": "FEEL-FELT-FOUND",
            "response": "I understand how you feel... [companies] felt the same way... but they found..."
          }},
          {{
            "framework": "LAER",
            "response": "Listen... Acknowledge... Explore... Respond"
          }}
        ],
        "talking_points": ["Specific benefit 1", "Specific benefit 2"],
        "success_rate_note": "This response converted X% of similar deals"
      }}
    ],
    "talk_tracks": [
      {{
        "stage": "discovery_call",
        "framework": "Problem-First Approach",
        "flow": "Opening → Discovery → Qualification → Objection Handling → Next Steps",
        "script": "Key phrases and flow for this stage"
      }}
    ],
    "roi_calculator": {{
      "current_state_cost": "Specific cost of current solution or status quo",
      "future_state_savings": "Specific savings with our solution",
      "cost_of_delay": "Specific cost of delay per month"
    }}
  }},
  "competitive_narrative": {{
    "positioning_angle": "How we specifically differentiate from {competitor_name}",
    "buyer_aligned_story": "Story connecting our value to their pain points",
    "personas": [
      {{
        "persona": "Executive",
        "narrative": "ROI and business outcome focused",
        "key_points": ["Point 1", "Point 2", "Point 3"]
      }},
      {{
        "persona": "Technical",
        "narrative": "Architecture, integration, and capability focused",
        "key_points": ["Technical point 1", "Technical point 2"]
      }},
      {{
        "persona": "Financial",
        "narrative": "TCO, cost savings, and ROI focused",
        "key_points": ["Financial point 1", "Financial point 2"]
      }}
    ],
    "competitive_advantages": [
      "Specific advantage vs {competitor_name}",
      "Another specific advantage"
    ],
    "case_study_recommendations": [
      "Case study X - similar company/use case",
      "Case study Y - same industry"
    ]
  }}
}}

Requirements:
- Generate 5-7 common objections with 2-3 response options each
- Use real sales frameworks (FEEL-FELT-FOUND, LAER, FIA)
- Include specific numbers and values in ROI calculator
- Make narratives specific to {target_industry or 'the target industry'} and {target_size or 'mid-market'} buyers
- Focus on concrete, actionable content that sales reps can use immediately
- Return ONLY valid JSON, no markdown or explanations"""

        return prompt

    def _parse_playbook_response(self, content: str) -> Dict[str, Any]:
        """Parse OpenAI response into structured playbook."""
        try:
            # Try to extract JSON from the response
            # Sometimes the model wraps it in markdown
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            playbook = json.loads(content)
            return playbook

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse playbook response: {e}")
            # Return a minimal valid structure if parsing fails
            return {
                "objection_handling": {
                    "common_objections": [],
                    "talk_tracks": [],
                    "roi_calculator": {
                        "current_state_cost": "N/A",
                        "future_state_savings": "N/A",
                        "cost_of_delay": "N/A",
                    },
                },
                "competitive_narrative": {
                    "positioning_angle": "N/A",
                    "buyer_aligned_story": "N/A",
                    "personas": [],
                    "competitive_advantages": [],
                    "case_study_recommendations": [],
                },
            }
