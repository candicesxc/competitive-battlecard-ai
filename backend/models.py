from pydantic import BaseModel, HttpUrl


class AnalyzeRequest(BaseModel):
    company_url: HttpUrl
