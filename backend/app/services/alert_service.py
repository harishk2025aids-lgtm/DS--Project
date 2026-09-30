from app.config import settings
from app.models import Alert


def build_alert_if_needed(batch_id: str, batch_code: str, defect_probability: float) -> Alert | None:
    if defect_probability >= settings.critical_defect_probability_threshold:
        return Alert(
            batch_id=batch_id,
            severity="critical",
            message=(
                f"Batch {batch_code}: defect probability {defect_probability:.0%} — "
                "stop-and-check recommended before this coil proceeds downstream."
            ),
        )
    if defect_probability >= settings.defect_probability_alert_threshold:
        return Alert(
            batch_id=batch_id,
            severity="warning",
            message=(
                f"Batch {batch_code}: defect probability {defect_probability:.0%} — "
                "review process parameters."
            ),
        )
    return None
