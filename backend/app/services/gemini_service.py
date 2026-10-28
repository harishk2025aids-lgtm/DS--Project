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
import logging

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)
_client = None


def _get_client():
    global _client
    if _client is None and settings.has_valid_gemini_key:
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

Use only the supplied batch data. Distinguish stored model feature importance from
your metallurgical interpretation; do not claim correlation proves physical cause.
Explain uncertainty, especially when model feature importance is unavailable.
Recommend practical parameter adjustments tied to the observed readings, but do not
invent plant setpoints or certified operating limits. Tell the operator to validate
changes against approved limits and process procedures before applying them.

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
    top = context["top_features"][0]["feature"] if context["top_features"] else "process readings"
    return {
        "root_cause": f"Deviation in {top}",
        "explanation": (
            f"Batch {context['batch_code']} shows a {context['defect_probability']:.0%} defect "
            f"probability. {top} is the strongest available contributing signal; this is a "
            "rule-based fallback, not an AI-verified metallurgical root cause."
        ),
        "recommended_actions": [
            {
                "parameter": top,
                "change": "Review the recorded reading against the approved setpoint and operating limits for this grade.",
                "reason": "This is the strongest available risk signal; the prediction does not establish physical causation.",
            }
        ],
        "provider": "rule-based fallback",
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

    try:
        client = _get_client()
        if client is None:
            return _fallback_explanation(context)

        prompt = PROMPT_TEMPLATE.format(
            batch_code=batch_code,
            grade=grade,
            defect_probability=defect_probability,
            defect_type=defect_type or "none identified yet",
            quality_score=quality_score,
            parameters="\n".join(f"- {k}: {v if v is not None else 'not recorded'}" for k, v in parameters.items()),
            top_features="\n".join(f"- {f['feature']}: {f['impact']:.2f}" for f in top_features) or "- (none available)",
        )
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.3,
            ),
        )
        result = json.loads(response.text or "")
        if (
            not isinstance(result, dict)
            or not isinstance(result.get("root_cause"), str)
            or not isinstance(result.get("explanation"), str)
            or not isinstance(result.get("recommended_actions"), list)
            or not result["recommended_actions"]
        ):
            raise ValueError("Gemini returned an incomplete root-cause recommendation")
        if any(
            not isinstance(action, dict)
            or not all(isinstance(action.get(key), str) and action[key].strip() for key in ("parameter", "change", "reason"))
            for action in result["recommended_actions"]
        ):
            raise ValueError("Gemini returned an invalid recommended action")
        return {**result, "provider": "Gemini"}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Gemini root-cause recommendation failed; using rule-based fallback")
        fallback = _fallback_explanation(context)
        fallback["explanation"] += f" AI recommendation unavailable ({type(exc).__name__})."
        return fallback


def answer_production_question(question: str, context: dict, fallback_answer: str) -> dict:
    try:
        client = _get_client()
    except Exception:  # noqa: BLE001
        logger.exception("Gemini client initialization failed; using production-data fallback")
        return {"answer": fallback_answer, "provider": "production-data fallback"}
    if client is None:
        return {"answer": fallback_answer, "provider": "production-data fallback"}

    prompt = (
        "You are the production-data assistant for a steel quality control system. "
        "Answer only from the supplied project data. If it does not contain the answer, say so. "
        "Do not present correlation as causation and do not replace the project's prediction models.\n\n"
        f"Project data (JSON): {json.dumps(context, default=str)}\n\n"
        f"Operator question: {question}"
    )
    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.2),
        )
        answer = (response.text or "").strip()
        if answer:
            return {"answer": answer, "provider": "Gemini"}
    except Exception:  # noqa: BLE001
        logger.exception("Gemini production-data answer failed; using production-data fallback")
    return {"answer": fallback_answer, "provider": "production-data fallback"}
