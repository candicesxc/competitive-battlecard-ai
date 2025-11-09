from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, HttpUrl

from .config import get_settings
from .crew_agents import BattlecardCrew
from .services.analysis_service import AnalysisError
from .services.search_service import SerperError

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="Competitive Battlecard Generator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(
    "/static",
    StaticFiles(directory=BASE_DIR / "static"),
    name="static",
)

templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

settings = get_settings()
battlecard_crew = BattlecardCrew()


class AnalyzeRequest(BaseModel):
    company_url: HttpUrl


@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> HTMLResponse:
    """Render the landing page."""

    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/analyze")
async def analyze_company(payload: AnalyzeRequest) -> JSONResponse:
    """Kick off the CrewAI pipeline to build a battlecard."""

    logger.info("Received analyze request for %s", payload.company_url)

    try:
        result = await battlecard_crew.run(str(payload.company_url))
    except SerperError as exc:
        logger.error("Serper error: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except AnalysisError as exc:
        logger.error("Analysis error: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.error("Runtime error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    response: Dict[str, Any] = {
        "html": result.html,
        "target_company": result.target_company,
        "competitors": result.competitors,
        "market_summary": result.market_summary,
    }

    return JSONResponse(content=response)


