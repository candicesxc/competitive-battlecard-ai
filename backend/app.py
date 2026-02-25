from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .crew_agents import BattlecardCrew
from .models import AnalyzeRequest
from .services.analysis_service import AnalysisError
from .services.search_service import SearchProviderError
from .services.company_extraction import extract_company_data

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Competitive Battlecard Generator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://candicesxc.github.io",
        "https://candicesxc.github.io/competitive-battlecard-ai",
        "https://candiceshen.com",
        "https://candiceshen.com/competitive-battlecard-ai",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Instantiate once at startup so we can reuse the same crew across requests.
battlecard_crew = BattlecardCrew()


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze")
async def analyze_company(payload: AnalyzeRequest) -> JSONResponse:
    """Kick off the CrewAI pipeline to build a battlecard."""

    logger.info("Received analyze request for %s", payload.company_url)

    try:
        async with asyncio.timeout(120):  # 2-minute hard cap; prevents hung Exa/OpenAI calls
            result = await battlecard_crew.run(str(payload.company_url))
    except asyncio.TimeoutError:
        logger.error("Pipeline timed out for %s", payload.company_url)
        raise HTTPException(
            status_code=504, detail="Analysis timed out. Please try again."
        ) from None
    except SearchProviderError as exc:
        logger.error("Search provider error: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except AnalysisError as exc:
        logger.error("Analysis error: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.error("Runtime error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    response: Dict[str, Any] = {
        "target_company": result.target_company,
        "competitors": result.competitors,
        "market_summary": result.market_summary,
    }

    return JSONResponse(content=response)


@app.post("/next-steps")
async def generate_sales_playbook(payload: Dict[str, Any]) -> JSONResponse:
    """Generate comprehensive sales playbook (objections + narratives) for a competitor vs. a target company."""

    logger.info("Received next-steps request for competitor: %s", payload.get("competitor", {}).get("name"))

    try:
        from .services.sales_playbook_service import SalesPlaybookService

        # Extract target company data from URL if provided
        target_company_data = payload.get("target_company", {})
        if target_company_data.get("url"):
            extracted_data = await extract_company_data(target_company_data["url"])
            # Merge extracted data with any user-provided context
            extracted_data["context"] = target_company_data.get("context", "")
            target_company_data = extracted_data

        service = SalesPlaybookService()
        result = await service.generate_comprehensive_playbook(
            competitor=payload.get("competitor"),
            your_company=payload.get("your_company"),
            target_company=target_company_data,
        )

        return JSONResponse(content=result)
    except Exception as exc:
        logger.error("Error generating sales playbook: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/healthz", include_in_schema=False)
async def healthcheck() -> Dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import os
    import uvicorn

    uvicorn.run(
        "backend.app:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=False,
    )
