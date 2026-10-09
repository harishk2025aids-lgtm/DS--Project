from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.database import get_db
from app.ml import predictor
from app.ml.synthetic_data import FEATURE_COLUMNS, FEATURE_RANGES
from app.services import gemini_service

router = APIRouter(tags=["analytics", "insights"])
DEFECT_THRESHOLD = 0.5
SCRAP_RISK_THRESHOLD = 0.85
ARTIFACT_DIR = Path(__file__).resolve().parents[1] / "ml" / "artifacts"

FEATURE_LABELS = {
    "temperature_c": "Temperature",
    "rolling_speed_mps": "Rolling speed",
    "carbon_content_pct": "Carbon content",
    "manganese_pct": "Manganese",
    "silicon_pct": "Silicon",
    "cooling_rate_c_per_s": "Cooling rate",
    "thickness_mm": "Thickness",
    "tension_kn": "Tension",
    "furnace_pressure_bar": "Furnace pressure",
    "humidity_pct": "Humidity",
}


def _risk_level(probability: float) -> str:
    if probability >= 0.85:
        return "critical"
    if probability >= 0.65:
        return "high"
    if probability >= 0.4:
        return "elevated"
    return "low"


def _recent_predictions(db: Session, days: int = 30):
    since = datetime.utcnow() - timedelta(days=max(1, min(days, 365)))
    rows = (
        db.query(models.QualityPrediction)
        .options(joinedload(models.QualityPrediction.batch))
        .join(models.ProductionBatch)
        .filter(models.QualityPrediction.created_at >= since)
        .order_by(models.QualityPrediction.created_at.desc())
        .limit(20000)
        .all()
    )
    latest_by_batch = {}
    for prediction in rows:
        if prediction.batch_id not in latest_by_batch:
            latest_by_batch[prediction.batch_id] = prediction
    return list(latest_by_batch.values())


def _analytics_payload(db: Session, days: int, line_id: str | None, grade: str | None, defect_type: str | None):
    predictions = _recent_predictions(db, days)
    if line_id:
        predictions = [row for row in predictions if row.batch.line_id == line_id]
    if grade:
        predictions = [row for row in predictions if row.batch.grade == grade]
    if defect_type:
        predictions = [row for row in predictions if (row.predicted_defect_type or "unclassified") == defect_type]

    line_counts = defaultdict(lambda: {"batches": 0, "predicted_defects": 0})
    grade_counts = defaultdict(lambda: {"batches": 0, "predicted_defects": 0})
    defect_types = defaultdict(int)
    days_data = defaultdict(lambda: {"volume": 0, "defects": 0, "scrap_risk": 0, "quality_total": 0.0, "probability_total": 0.0})

    for prediction in predictions:
        batch = prediction.batch
        probability = float(prediction.defect_probability or 0.0)
        predicted_defect = probability >= DEFECT_THRESHOLD
        defect_label = prediction.predicted_defect_type or "unclassified"
        line_counts[batch.line_id]["batches"] += 1
        line_counts[batch.line_id]["predicted_defects"] += int(predicted_defect)
        grade_counts[batch.grade]["batches"] += 1
        grade_counts[batch.grade]["predicted_defects"] += int(predicted_defect)
        defect_types[defect_label] += 1

        day = prediction.created_at.date().isoformat()
        bucket = days_data[day]
        bucket["volume"] += 1
        bucket["defects"] += int(predicted_defect)
        bucket["scrap_risk"] += int(probability >= SCRAP_RISK_THRESHOLD)
        bucket["quality_total"] += float(prediction.quality_score or 0.0)
        bucket["probability_total"] += probability

    count = len(predictions)
    predicted_defects = sum(row["defects"] for row in days_data.values())
    high_scrap_risk = sum(row["scrap_risk"] for row in days_data.values())
    trends = []
    for day, values in sorted(days_data.items()):
        volume = values["volume"]
        trends.append({
            "date": day,
            "production_volume": volume,
            "avg_quality_score": round(values["quality_total"] / volume, 2),
            "predicted_defect_rate_pct": round(100 * values["defects"] / volume, 2),
            "high_scrap_risk_rate_pct": round(100 * values["scrap_risk"] / volume, 2),
        })

    lines = db.query(models.ProductionBatch.line_id).distinct().order_by(models.ProductionBatch.line_id).all()
    grades = db.query(models.ProductionBatch.grade).distinct().order_by(models.ProductionBatch.grade).all()
    defect_options = db.query(models.QualityPrediction.predicted_defect_type).distinct().all()

    return {
        "period_days": max(1, min(days, 365)),
        "filters": {
            "lines": [row[0] for row in lines if row[0]],
            "grades": [row[0] for row in grades if row[0]],
            "defect_types": sorted({row[0] or "unclassified" for row in defect_options}),
        },
        "kpis": {
            "total_batches": count,
            "average_quality_score": round(sum(float(row.quality_score or 0.0) for row in predictions) / count, 2) if count else 0.0,
            "predicted_defect_rate_pct": round(100 * predicted_defects / count, 2) if count else 0.0,
            "high_scrap_risk_rate_pct": round(100 * high_scrap_risk / count, 2) if count else 0.0,
            "estimated_yield_pct": round(100 * (count - predicted_defects) / count, 2) if count else 0.0,
        },
        "defects_by_line": [
            {"line": key, **value} for key, value in sorted(line_counts.items())
        ],
        "defects_by_grade": [
            {"grade": key, **value} for key, value in sorted(grade_counts.items())
        ],
        "top_defect_types": [
            {"defect_type": key, "count": value}
            for key, value in sorted(defect_types.items(), key=lambda item: (-item[1], item[0]))[:8]
        ],
        "trends": trends,
        "data_notes": {
            "defects": "Predictions with defect probability at or above 50%; not confirmed inspection outcomes.",
            "scrap": "High-risk proxy: predictions at or above 85%; actual scrap disposition is not stored.",
            "yield": "Estimated as 100% minus the predicted defect rate; actual yield labels are not stored.",
        },
    }


def _find_batch(db: Session, batch_key: str):
    batch = db.query(models.ProductionBatch).filter_by(batch_code=batch_key).first()
    if batch:
        return batch
    try:
        return db.query(models.ProductionBatch).filter_by(id=batch_key).first()
    except (ValueError, TypeError):
        return None


def _latest_prediction(db: Session, batch_id: str):
    return (
        db.query(models.QualityPrediction)
        .filter_by(batch_id=batch_id, is_forecast=False)
        .order_by(models.QualityPrediction.created_at.desc())
        .first()
    )


def _parameters(batch: models.ProductionBatch) -> dict:
    keys = (
        "temperature_c", "rolling_speed_mps", "carbon_content_pct", "manganese_pct",
        "silicon_pct", "cooling_rate_c_per_s", "thickness_mm", "tension_kn",
        "furnace_pressure_bar", "humidity_pct",
    )
    return {key: getattr(batch, key) for key in keys}


def _feature_attribution(prediction: models.QualityPrediction):
    stored = prediction.shap_top_features or []
    contributions = []
    for item in stored:
        feature = item.get("feature")
        impact = item.get("impact")
        if feature and isinstance(impact, (int, float)):
            contributions.append({
                "feature": feature,
                "label": FEATURE_LABELS.get(feature, feature.replace("_", " ").title()),
                "impact": float(impact),
                "impact_pct": round(float(impact) * 100, 1),
            })
    source = "model_feature_importance" if contributions else "unavailable"
    contributions.sort(key=lambda item: item["impact"], reverse=True)
    return contributions, source


def _heuristic_attribution(batch: models.ProductionBatch) -> list[dict]:
    scores = {
        "temperature_c": abs((batch.temperature_c or 1260) - 1260) / 200,
        "cooling_rate_c_per_s": abs((batch.cooling_rate_c_per_s or 22) - 22) / 40,
        "carbon_content_pct": abs((batch.carbon_content_pct or 0.16) - 0.16) * 5,
        "tension_kn": abs((batch.tension_kn or 40) - 40) / 60,
    }
    total = sum(scores.values())
    if total <= 0:
        return []
    return [
        {
            "feature": feature,
            "label": FEATURE_LABELS[feature],
            "impact": round(score / total, 4),
            "impact_pct": round(score / total * 100, 1),
        }
        for feature, score in sorted(scores.items(), key=lambda item: item[1], reverse=True)
        if score > 0
    ]


def _data_quality_flags(batch: models.ProductionBatch) -> list[dict]:
    flags = []
    for feature, (minimum, maximum) in FEATURE_RANGES.items():
        value = getattr(batch, feature)
        if value is None or value < minimum or value > maximum:
            flags.append({
                "feature": feature,
                "label": FEATURE_LABELS[feature],
                "value": value,
                "minimum": minimum,
                "maximum": maximum,
                "issue": "missing" if value is None else "outside_demo_range",
            })
    return flags


def _root_cause_payload(batch: models.ProductionBatch, prediction: models.QualityPrediction):
    contributions, source = _feature_attribution(prediction)
    if not contributions and (prediction.model_name or "").startswith("heuristic-fallback"):
        contributions = _heuristic_attribution(batch)
        if contributions:
            source = "heuristic_risk_rules"

    data_quality_flags = _data_quality_flags(batch)
    probability = float(prediction.defect_probability or 0.0)
    if data_quality_flags:
        primary = {"feature": "input_data_quality", "label": "Out-of-range or missing process readings"}
        secondary_causes = [{"feature": item["feature"], "label": item["label"]} for item in data_quality_flags]
        flagged = ", ".join(item["label"] for item in data_quality_flags)
        explanation = (
            f"The prediction reports {probability:.1%} defect probability, but these readings fall outside the app's "
            f"synthetic demo ranges: {flagged}. The parameter chart decomposes the heuristic score only; "
            "the prediction is unreliable until the sensor values and real plant limits are checked."
        )
    elif contributions and source == "model_feature_importance":
        primary = contributions[0]
        secondary_causes = contributions[1:4]
        explanation = (
            f"{primary['label']} has the largest stored model feature-importance weight for this prediction. "
            "Feature importance describes model influence; it does not prove that the parameter caused a defect."
        )
    elif contributions:
        primary = {"feature": contributions[0]["feature"], "label": f"Heuristic score: {contributions[0]['label']}"}
        secondary_causes = contributions[1:4]
        explanation = (
            f"The fallback heuristic reports {probability:.1%} defect probability. {contributions[0]['label']} "
            f"is the largest component of that rule-based score ({contributions[0]['impact_pct']:.1f}%). "
            "These are heuristic score components, not SHAP values or proof of physical causation."
        )
    else:
        primary = None
        secondary_causes = []
        explanation = f"This batch has a {probability:.1%} model-predicted defect probability, but no attribution data is available."
    return {
        "batch_id": batch.batch_code,
        "defect_probability": probability,
        "quality_score": float(prediction.quality_score or 0.0),
        "predicted_defect_type": prediction.predicted_defect_type,
        "risk_level": _risk_level(probability),
        "model_name": prediction.model_name,
        "attribution_source": source,
        "contributions": contributions,
        "primary_cause": primary,
        "secondary_causes": secondary_causes,
        "data_quality_flags": data_quality_flags,
        "prediction_reliability": "low" if data_quality_flags else "normal",
        "parameters": _parameters(batch),
        "explanation": explanation,
    }


@router.get("/api/analytics")
def analytics(
    days: int = 30,
    line_id: str | None = None,
    grade: str | None = None,
    defect_type: str | None = None,
    db: Session = Depends(get_db),
):
    return _analytics_payload(db, days, line_id, grade, defect_type)


@router.get("/api/analytics/trends")
def analytics_trends(
    days: int = 30,
    line_id: str | None = None,
    grade: str | None = None,
    defect_type: str | None = None,
    db: Session = Depends(get_db),
):
    payload = _analytics_payload(db, days, line_id, grade, defect_type)
    return {"period_days": payload["period_days"], "trends": payload["trends"], "data_notes": payload["data_notes"]}


@router.get("/api/batches/{batch_id}")
def batch_detail(batch_id: str, db: Session = Depends(get_db)):
    batch = _find_batch(db, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    prediction = _latest_prediction(db, batch.id)
    if not prediction:
        raise HTTPException(status_code=404, detail="No prediction recorded for this batch")

    recommendation = (
        db.query(models.Recommendation)
        .filter_by(prediction_id=prediction.id)
        .order_by(models.Recommendation.created_at.desc())
        .first()
    )
    comparable = (
        db.query(models.QualityPrediction)
        .join(models.ProductionBatch)
        .filter(
            models.ProductionBatch.id != batch.id,
            models.ProductionBatch.line_id == batch.line_id,
            models.ProductionBatch.grade == batch.grade,
            models.QualityPrediction.created_at >= datetime.utcnow() - timedelta(days=30),
            models.QualityPrediction.is_forecast == False,  # noqa: E712
        )
        .order_by(models.QualityPrediction.created_at.desc())
        .limit(500)
        .all()
    )
    historical = {
        "window_days": 30,
        "comparable_predictions": len(comparable),
        "average_quality_score": round(sum(float(row.quality_score or 0.0) for row in comparable) / len(comparable), 2) if comparable else None,
        "average_defect_probability": round(sum(float(row.defect_probability or 0.0) for row in comparable) / len(comparable), 4) if comparable else None,
    }
    return {
        "id": batch.id,
        "batch_code": batch.batch_code,
        "line_id": batch.line_id,
        "grade": batch.grade,
        "timestamp": batch.timestamp.isoformat() if batch.timestamp else None,
        "parameters": _parameters(batch),
        "extra_features": batch.extra_features or {},
        "prediction": {
            "quality_score": float(prediction.quality_score or 0.0),
            "defect_probability": float(prediction.defect_probability or 0.0),
            "predicted_defect_type": prediction.predicted_defect_type,
            "model_name": prediction.model_name,
            "model_version": prediction.model_version,
            "created_at": prediction.created_at.isoformat() if prediction.created_at else None,
        },
        "root_cause": _root_cause_payload(batch, prediction),
        "recommendation": {
            "explanation": recommendation.explanation,
            "root_cause": recommendation.root_cause,
            "recommended_actions": recommendation.recommended_actions or [],
        } if recommendation else None,
        "historical_comparison": historical,
    }


@router.get("/api/root-cause/{batch_id}")
def root_cause(batch_id: str, db: Session = Depends(get_db)):
    batch = _find_batch(db, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    prediction = _latest_prediction(db, batch.id)
    if not prediction:
        raise HTTPException(status_code=404, detail="No prediction recorded for this batch")
    return _root_cause_payload(batch, prediction)


def _prediction_summary(features: dict):
    result = predictor.predict_current_quality(features)
    probability = float(result["defect_probability"])
    return {
        "defect_probability": probability,
        "quality_score": float(result["quality_score"]),
        "scrap_risk": "high" if probability >= SCRAP_RISK_THRESHOLD else "moderate" if probability >= 0.5 else "low",
        "expected_yield_pct": round(100 * (1 - probability), 2),
        "risk_level": _risk_level(probability),
        "model_name": result["model_name"],
    }


@router.post("/api/simulate")
def simulate_process(payload: schemas.SimulationRequest):
    current = payload.current.model_dump()
    modified = payload.modified.model_dump()
    current_features = {key: current[key] for key in FEATURE_COLUMNS}
    modified_features = {key: modified[key] for key in FEATURE_COLUMNS}
    changes = [
        {"parameter": FEATURE_LABELS.get(key, key), "key": key, "from": current[key], "to": modified[key]}
        for key in FEATURE_COLUMNS if current[key] != modified[key]
    ]
    return {
        "current": _prediction_summary(current_features),
        "simulated": _prediction_summary(modified_features),
        "changes": changes,
        "note": "These are model-predicted outcomes, not a guarantee that parameter changes cause a production result.",
    }


@router.post("/api/ai/chat")
def ai_chat(payload: schemas.AIChatRequest, db: Session = Depends(get_db)):
    analytics_data = _analytics_payload(db, 1, None, None, None)
    kpis = analytics_data["kpis"]
    line_summary = analytics_data["defects_by_line"]
    context = {
        "last_24_hours": kpis,
        "lines": line_summary,
        "defect_types": analytics_data["top_defect_types"],
    }
    related_batch = None
    if payload.batch_id:
        batch = _find_batch(db, payload.batch_id)
        if batch:
            prediction = _latest_prediction(db, batch.id)
            if prediction:
                related_batch = {
                    "batch_code": batch.batch_code,
                    "line_id": batch.line_id,
                    "grade": batch.grade,
                    "quality_score": prediction.quality_score,
                    "defect_probability": prediction.defect_probability,
                    "predicted_defect_type": prediction.predicted_defect_type,
                    "model_name": prediction.model_name,
                    "root_cause": _root_cause_payload(batch, prediction),
                }
                context["related_batch"] = related_batch

    if not kpis["total_batches"]:
        fallback = "There are no recorded production predictions in the last 24 hours, so I don't have current project data to answer this yet."
    elif related_batch:
        attribution = related_batch["root_cause"]["primary_cause"]
        cause_text = f" The largest stored model feature-importance value is {attribution['label']} ({attribution['impact_pct']:.1f}%)." if attribution else " No feature attribution was stored for this prediction."
        fallback = (
            f"Batch {related_batch['batch_code']} on {related_batch['line_id']} ({related_batch['grade']}) has a "
            f"{float(related_batch['defect_probability']):.1%} model-predicted defect probability and a "
            f"{float(related_batch['quality_score']):.1f} quality score.{cause_text}"
        )
    else:
        highest_line = max(line_summary, key=lambda row: row["predicted_defects"], default=None)
        line_text = f" {highest_line['line']} has the most predicted defects ({highest_line['predicted_defects']} of {highest_line['batches']} batches)." if highest_line else ""
        fallback = (
            f"In the last 24 hours, {kpis['total_batches']} batches have an average quality score of "
            f"{kpis['average_quality_score']:.1f} and a model-predicted defect rate of {kpis['predicted_defect_rate_pct']:.1f}%."
            f"{line_text} These are prediction records, not confirmed inspection outcomes."
        )

    response = gemini_service.answer_production_question(payload.question, context, fallback)
    return {**response, "related_data": related_batch or context}


def _model_performance(db: Session):
    registry = (
        db.query(models.ModelRegistry)
        .filter(models.ModelRegistry.is_active == True)  # noqa: E712
        .order_by(models.ModelRegistry.trained_at.desc())
        .all()
    )
    by_name = {}
    for record in registry:
        by_name.setdefault(record.model_name.lower(), record)

    model_definitions = [
        ("xgboost", "xgboost_current_quality.joblib", "classifier"),
        ("lightgbm", "lightgbm_current_quality.joblib", "classifier"),
        ("lstm", "lstm_forecast.keras", "forecast"),
    ]
    model_rows = []
    for name, artifact, model_type in model_definitions:
        record = next((row for key, row in by_name.items() if name in key), None)
        metrics = record.metrics or {} if record else {}
        available = (ARTIFACT_DIR / artifact).is_file()
        if model_type == "forecast":
            mapped_metrics = {"mae": metrics.get("val_mae"), "rmse": metrics.get("rmse")}
        else:
            mapped_metrics = {
                "accuracy": metrics.get("accuracy"),
                "precision": metrics.get("precision"),
                "recall": metrics.get("recall"),
                "f1": metrics.get("f1"),
                "roc_auc": metrics.get("roc_auc", metrics.get("auc")),
            }
        model_rows.append({
            "name": name,
            "type": model_type,
            "status": "artifact available" if available else "not trained / artifact missing",
            "model_version": record.version if record else None,
            "training_date": record.trained_at.isoformat() if record and record.trained_at else None,
            "dataset_size": metrics.get("dataset_size"),
            "feature_count": len(FEATURE_COLUMNS),
            "metrics": mapped_metrics,
            "metrics_source": "model registry" if metrics else "not recorded",
        })

    since = datetime.utcnow() - timedelta(hours=24)
    prediction_query = db.query(models.QualityPrediction).filter(models.QualityPrediction.created_at >= since)
    prediction_count = prediction_query.count()
    average_quality = prediction_query.with_entities(func.avg(models.QualityPrediction.quality_score)).scalar()
    average_probability = prediction_query.with_entities(func.avg(models.QualityPrediction.defect_probability)).scalar()
    latest_prediction = prediction_query.order_by(models.QualityPrediction.created_at.desc()).first()
    return {
        "models": model_rows,
        "comparison": [
            {"model": row["name"], **row["metrics"]}
            for row in model_rows
        ],
        "monitoring": {
            "prediction_count_24h": prediction_count,
            "prediction_latency_ms": None,
            "active_model_version": latest_prediction.model_version if latest_prediction else None,
            "average_quality_score_24h": round(float(average_quality), 2) if average_quality is not None else None,
            "average_defect_probability_24h": round(float(average_probability), 4) if average_probability is not None else None,
            "data_drift_status": "not monitored",
            "latency_status": "not instrumented",
        },
    }


@router.get("/api/models/performance")
def model_performance(db: Session = Depends(get_db)):
    return _model_performance(db)


@router.get("/api/models/status")
def model_status(db: Session = Depends(get_db)):
    return {
        "models": [
            {"name": row["name"], "status": row["status"], "model_version": row["model_version"], "training_date": row["training_date"]}
            for row in _model_performance(db)["models"]
        ]
    }