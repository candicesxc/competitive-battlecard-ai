from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

origins = [
    "https://candicesxc.github.io",
    "https://candicesxc.github.io/competitive-battlecard-ai",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import logging
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, HttpUrl

from .crew_agents import BattlecardCrew
from .services.analysis_service import AnalysisError
from .services.search_service import SearchProviderError

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Competitive Battlecard Generator")
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://candicesxc.github.io",
        "https://candicesxc.github.io/competitive-battlecard-ai",
        "https://candicesxc.github.io"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

battlecard_crew = BattlecardCrew()


class AnalyzeRequest(BaseModel):
    company_url: HttpUrl


@app.post("/analyze")
async def analyze_company(payload: AnalyzeRequest) -> JSONResponse:
    """Kick off the CrewAI pipeline to build a battlecard."""

    logger.info("Received analyze request for %s", payload.company_url)

    try:
        result = await battlecard_crew.run(str(payload.company_url))
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

