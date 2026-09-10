"""
MediConnect AI Check-in Service
--------------------------------
Small standalone microservice. The Node API calls this over HTTP.
Takes a patient's free-text daily check-in message and returns a severity
assessment: how serious does this sound, and should a doctor be alerted?

Runs on Claude via the Anthropic API. If no API key is configured, falls back
to a simple keyword-based scorer so the prototype still works end-to-end
during a demo without needing a live key.
"""

import os
import json
import re
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="MediConnect AI Service")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

# Lazily import/instantiate the Anthropic client only if a key is present,
# so the service still boots (and falls back gracefully) without one.
client = None
if ANTHROPIC_API_KEY:
    from anthropic import Anthropic
    client = Anthropic(api_key=ANTHROPIC_API_KEY)


class CheckinRequest(BaseModel):
    patient_id: str
    message_text: str


class CheckinResponse(BaseModel):
    severity_score: int       # 0-100
    severity_label: str       # mild / moderate / serious
    flagged: bool             # true => should alert the doctor
    summary: str


SYSTEM_PROMPT = """You are a medical triage assistant reviewing a patient's daily
check-in message. Your job is ONLY to assess how urgent the message sounds -
you are not diagnosing or giving medical advice.

Respond with ONLY a JSON object, no other text, no markdown fences:
{
  "severity_score": <integer 0-100, where 0 is completely fine and 100 is a medical emergency>,
  "severity_label": "<mild | moderate | serious>",
  "flagged": <true if a doctor should be alerted, false otherwise - flag anything moderate or above>,
  "summary": "<one sentence, clinical and neutral, summarizing the patient's state for a doctor>"
}

Guidelines:
- Mentions of chest pain, breathlessness, severe bleeding, loss of consciousness,
  stroke symptoms, or suicidal ideation => severity_score 80+, flagged true.
- General mild discomfort, fatigue, "feeling fine", adherence confirmations => low score, flagged false.
- When uncertain, err toward flagging - missing a real problem is worse than a false alarm."""


def keyword_fallback(message: str) -> CheckinResponse:
    """Simple fallback scorer used only if no Anthropic API key is configured."""
    text = message.lower()

    serious_terms = [
        "chest pain", "can't breathe", "cannot breathe", "breathless",
        "severe bleeding", "unconscious", "collapsed", "stroke",
        "suicidal", "want to die", "severe pain",
    ]
    moderate_terms = ["pain", "fever", "dizzy", "vomit", "breathless", "worse", "swelling"]

    if any(term in text for term in serious_terms):
        return CheckinResponse(
            severity_score=85,
            severity_label="serious",
            flagged=True,
            summary="Keyword-based fallback flagged this message as potentially serious. Review manually.",
        )
    if any(term in text for term in moderate_terms):
        return CheckinResponse(
            severity_score=45,
            severity_label="moderate",
            flagged=True,
            summary="Keyword-based fallback flagged this message as moderate. Review manually.",
        )
    return CheckinResponse(
        severity_score=10,
        severity_label="mild",
        flagged=False,
        summary="No concerning keywords detected in this check-in.",
    )


@app.get("/health")
def health():
    return {"status": "ok", "service": "mediconnect-ai-service", "using_claude": client is not None}


@app.post("/analyze-checkin", response_model=CheckinResponse)
def analyze_checkin(req: CheckinRequest):
    if not req.message_text.strip():
        raise HTTPException(status_code=400, detail="message_text cannot be empty")

    # No API key configured -> use fallback so the demo still runs end-to-end
    if client is None:
        return keyword_fallback(req.message_text)

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=300,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": req.message_text}],
        )

        raw_text = "".join(
            block.text for block in response.content if block.type == "text"
        ).strip()

        # Strip markdown code fences if the model adds them despite instructions
        cleaned = re.sub(r"^```(json)?|```$", "", raw_text.strip(), flags=re.MULTILINE).strip()

        parsed = json.loads(cleaned)

        return CheckinResponse(
            severity_score=int(parsed["severity_score"]),
            severity_label=parsed["severity_label"],
            flagged=bool(parsed["flagged"]),
            summary=parsed["summary"],
        )

    except Exception as e:
        # If Claude call or parsing fails, don't silently lose the check-in -
        # fall back to keyword scoring and note it in the summary.
        fallback = keyword_fallback(req.message_text)
        fallback.summary = f"[AI call failed, used fallback: {str(e)[:100]}] {fallback.summary}"
        return fallback


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
