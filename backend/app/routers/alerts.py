from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", response_model=list[schemas.AlertOut])
def list_alerts(unacknowledged_only: bool = True, db: Session = Depends(get_db)):
    q = db.query(models.Alert).options(joinedload(models.Alert.batch))
    if unacknowledged_only:
        q = q.filter(models.Alert.acknowledged == False)  # noqa: E712
    alerts = q.order_by(models.Alert.created_at.desc()).limit(100).all()
    return [
        schemas.AlertOut(
            id=a.id,
            batch_code=a.batch.batch_code if a.batch else "unknown",
            severity=a.severity,
            message=a.message,
            acknowledged=a.acknowledged,
            created_at=a.created_at,
        )
        for a in alerts
    ]


@router.post("/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str, db: Session = Depends(get_db)):
    alert = db.query(models.Alert).filter_by(id=alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.acknowledged = True
    db.commit()
    return {"status": "acknowledged"}
