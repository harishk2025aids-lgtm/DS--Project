"""
Wraps Gemini for two jobs:
  1. Explaining *why* a batch is predicted to be defective, in plain
     operator-facing language, grounded in the model's top features.
  2. Recommending concrete process-parameter changes to avoid the defect.

Uses the current `google-genai` SDK (the older `google-generativeai`
package is deprecated/EOL as of late 2025 -- do not switch back to it).

Requires GEMINI_API_KEY in .env. Falls back to a deterministic
rule-based explanation if the key is missing, so the API keeps working
in local/demo environments without a key configured.
"""
import json

from google import genai
from google.genai import types

from app.config import settings

_client = None


def _get_client():
    global _client
    if _client is None and settings.gemini_api_key:
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


PROMPT_TEMPLATE = """You are a senior steel process metallurgist assisting a plant operator.

A quality model predicted the following for batch {batch_code} (grade {grade}):
- Defect probability: {defect_probability:.1%}
- Predicted defect type: {defect_type}
- Quality score: {quality_score:.1f}/100

Current process parameters:
{parameters}

Top contributing features from the model (feature: relative impact):
{top_features}

Respond ONLY with valid JSON, no markdown fences, matching this schema:
{{
  "root_cause": "<one short phrase naming the most likely root cause>",
  "explanation": "<2-3 sentences, plain language, explaining why this batch is at risk, referencing the actual parameter values>",
  "recommended_actions": [
    {{"parameter": "<process parameter name>", "change": "<specific directional change, e.g. 'reduce by 8-10 C'>", "reason": "<one sentence why>"}}
  ]
}}
Give 2-4 recommended_actions, ordered by expected impact.
"""


def _fallback_explanation(context: dict) -> dict:
    top = context["top_features"][0]["feature"] if context["top_features"] else "process temperature"
    return {
        "root_cause": f"Deviation in {top}",
        "explanation": (
            f"Batch {context['batch_code']} shows a {context['defect_probability']:.0%} defect "
            f"probability, primarily driven by {top}. (Set GEMINI_API_KEY for a full AI-generated "
            "explanation grounded in metallurgical reasoning.)"
        ),
        "recommended_actions": [
            {
                "parameter": top,
                "change": "Bring back toward the historical setpoint for this grade",
                "reason": "This was the largest contributor to the model's defect-probability output.",
            }
        ],
    }


def get_explanation_and_recommendations(
    batch_code: str,
    grade: str,
    defect_probability: float,
    defect_type: str,
    quality_score: float,
    parameters: dict,
    top_features: list[dict],
) -> dict:
    context = {
        "batch_code": batch_code,
        "defect_probability": defect_probability,
        "top_features": top_features,
    }

    client = _get_client()
    if client is None:
        return _fallback_explanation(context)

    prompt = PROMPT_TEMPLATE.format(
        batch_code=batch_code,
        grade=grade,
        defect_probability=defect_probability,
        defect_type=defect_type or "none identified yet",
        quality_score=quality_score,
        parameters="\n".join(f"- {k}: {v}" for k, v in parameters.items()),
        top_features="\n".join(f"- {f['feature']}: {f['impact']:.2f}" for f in top_features) or "- (none available)",
    )

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.3,
            ),
        )
        return json.loads(response.text)
    except Exception as exc:  # noqa: BLE001
        fallback = _fallback_explanation(context)
        fallback["explanation"] += f" (Gemini call failed: {exc})"
        return fallback
