from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.ml import predictor
from app.services import gemini_service, alert_service

router = APIRouter(prefix="/api/predictions", tags=["predictions"])


@router.post("/current", response_model=schemas.QualityPredictionOut)
def predict_current(payload: schemas.ProcessParameters, db: Session = Depends(get_db)):
    batch = db.query(models.ProductionBatch).filter_by(batch_code=payload.batch_code).first()
    if not batch:
        batch = models.ProductionBatch(**payload.model_dump())
        db.add(batch)
        db.commit()
        db.refresh(batch)

    result = predictor.predict_current_quality(payload.model_dump())

    prediction = models.QualityPrediction(
        batch_id=batch.id,
        model_name=result["model_name"],
        model_version="v1",
        defect_probability=result["defect_probability"],
        quality_score=result["quality_score"],
        is_forecast=False,
        shap_top_features=result["top_features"],
    )
    db.add(prediction)

    alert = alert_service.build_alert_if_needed(batch.id, batch.batch_code, result["defect_probability"])
    if alert:
        db.add(alert)

    db.commit()
    db.refresh(prediction)

    return schemas.QualityPredictionOut(
        batch_code=batch.batch_code,
        model_name=prediction.model_name,
        defect_probability=prediction.defect_probability,
        predicted_defect_type=prediction.predicted_defect_type,
        quality_score=prediction.quality_score,
        is_forecast=False,
        forecast_horizon_minutes=None,
        top_features=result["top_features"],
        created_at=prediction.created_at,
    )


@router.get("/forecast/{batch_code}", response_model=schemas.ForecastResponse)
def predict_forecast(batch_code: str, db: Session = Depends(get_db)):
    batch = db.query(models.ProductionBatch).filter_by(batch_code=batch_code).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    # In production this would pull the last WINDOW readings for the line
    # from the historian. For now we reuse the batch's own snapshot.
    history = [{
        "temperature_c": batch.temperature_c,
        "rolling_speed_mps": batch.rolling_speed_mps,
        "carbon_content_pct": batch.carbon_content_pct,
        "manganese_pct": batch.manganese_pct,
        "silicon_pct": batch.silicon_pct,
        "cooling_rate_c_per_s": batch.cooling_rate_c_per_s,
        "thickness_mm": batch.thickness_mm,
        "tension_kn": batch.tension_kn,
        "furnace_pressure_bar": batch.furnace_pressure_bar,
        "humidity_pct": batch.humidity_pct,
    }] * 12

    points = predictor.predict_forecast(history)
    return schemas.ForecastResponse(batch_code=batch_code, points=points)


@router.get("/{batch_code}/recommendation", response_model=schemas.RecommendationOut)
def get_recommendation(batch_code: str, db: Session = Depends(get_db)):
    batch = db.query(models.ProductionBatch).filter_by(batch_code=batch_code).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    latest = (
        db.query(models.QualityPrediction)
        .filter_by(batch_id=batch.id)
        .order_by(models.QualityPrediction.created_at.desc())
        .first()
    )
    if not latest:
        raise HTTPException(status_code=404, detail="No prediction yet for this batch")

    parameters = {
        "temperature_c": batch.temperature_c,
        "rolling_speed_mps": batch.rolling_speed_mps,
        "carbon_content_pct": batch.carbon_content_pct,
        "cooling_rate_c_per_s": batch.cooling_rate_c_per_s,
        "tension_kn": batch.tension_kn,
        "furnace_pressure_bar": batch.furnace_pressure_bar,
    }

    result = gemini_service.get_explanation_and_recommendations(
        batch_code=batch.batch_code,
        grade=batch.grade,
        defect_probability=latest.defect_probability,
        defect_type=latest.predicted_defect_type,
        quality_score=latest.quality_score,
        parameters=parameters,
        top_features=latest.shap_top_features or [],
    )

    rec = models.Recommendation(
        prediction_id=latest.id,
        explanation=result["explanation"],
        recommended_actions=result["recommended_actions"],
        root_cause=result.get("root_cause"),
    )
    db.add(rec)
    db.commit()

    return schemas.RecommendationOut(**result)
