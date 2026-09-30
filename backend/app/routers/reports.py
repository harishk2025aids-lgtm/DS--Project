from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app import models

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/batches")
def batch_report(
    line_id: Optional[str] = None,
    grade: Optional[str] = None,
    days: int = 7,
    min_defect_probability: float = 0.0,
    db: Session = Depends(get_db),
):
    since = datetime.utcnow() - timedelta(days=days)
    q = (
        db.query(models.QualityPrediction)
        .options(joinedload(models.QualityPrediction.batch))
        .join(models.ProductionBatch)
        .filter(models.QualityPrediction.created_at >= since)
        .filter(models.QualityPrediction.defect_probability >= min_defect_probability)
    )
    if line_id:
        q = q.filter(models.ProductionBatch.line_id == line_id)
    if grade:
        q = q.filter(models.ProductionBatch.grade == grade)

    rows = q.order_by(models.QualityPrediction.created_at.desc()).limit(500).all()

    return [
        {
            "batch_code": r.batch.batch_code,
            "line_id": r.batch.line_id,
            "grade": r.batch.grade,
            "defect_probability": r.defect_probability,
            "quality_score": r.quality_score,
            "predicted_defect_type": r.predicted_defect_type,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.get("/defect-breakdown")
def defect_breakdown(days: int = 7, db: Session = Depends(get_db)):
    since = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(models.ProductionBatch.grade, models.QualityPrediction.predicted_defect_type)
        .join(models.QualityPrediction)
        .filter(models.QualityPrediction.created_at >= since)
        .all()
    )
    breakdown: dict[str, dict[str, int]] = {}
    for grade, defect_type in rows:
        breakdown.setdefault(grade, {})
        key = defect_type or "none"
        breakdown[grade][key] = breakdown[grade].get(key, 0) + 1
    return breakdown
