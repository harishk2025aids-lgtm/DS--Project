"""
Consumes raw sensor readings from Kafka (topic: settings.kafka_sensor_topic),
runs them through the quality models, persists the result, raises alerts
where needed, and broadcasts the outcome to connected dashboard clients.

Runs as a background asyncio task started from the FastAPI lifespan (see
app/main.py). If Kafka is unreachable -- e.g. running the API locally
without the full docker-compose stack -- this retries with backoff and
logs a warning instead of crashing the app, so the rest of the API
(reports, manual predictions, alerts) keeps working either way.
"""
import asyncio
import json
import logging

from aiokafka import AIOKafkaConsumer
from aiokafka.errors import KafkaConnectionError

from app.config import settings
from app.database import SessionLocal
from app import models
from app.ml import predictor
from app.ml.synthetic_data import FEATURE_COLUMNS
from app.services import alert_service
from app.streaming.broadcaster import broadcaster

logger = logging.getLogger(__name__)

_RECONNECT_DELAY_SECONDS = 5


def process_message(db, payload: dict) -> dict:
    """
    Pure-ish processing step, kept separate from the Kafka plumbing so it
    can be unit-tested with a plain payload + DB session and no broker.
    """
    readings = payload.get("readings", {})
    batch_code = payload["batch_code"]
    line_id = payload.get("line_id", "UNKNOWN")
    grade = payload.get("grade", "DP600")

    batch = db.query(models.ProductionBatch).filter_by(batch_code=batch_code).first()
    if not batch:
        batch = models.ProductionBatch(
            batch_code=batch_code,
            line_id=line_id,
            grade=grade,
            **{c: readings.get(c, 0.0) for c in FEATURE_COLUMNS},
        )
        db.add(batch)
        db.commit()
        db.refresh(batch)

    result = predictor.predict_current_quality(readings)

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
    alert_payload = None
    if alert:
        db.add(alert)
        alert_payload = {"severity": alert.severity, "message": alert.message}

    db.commit()

    return {
        "type": "tick",
        "line_id": line_id,
        "batch_code": batch_code,
        "parameters": readings,
        "prediction": result,
        "alert": alert_payload,
    }


async def _handle_raw_message(raw_value: bytes):
    try:
        payload = json.loads(raw_value.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        logger.warning("Dropping malformed Kafka message: %s", exc)
        return

    db = SessionLocal()
    try:
        outcome = process_message(db, payload)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to process sensor reading for batch %s", payload.get("batch_code"))
        return
    finally:
        db.close()

    await broadcaster.broadcast(outcome)


async def run_consumer(stop_event: asyncio.Event):
    """Long-running loop; reconnects with backoff if the broker is unreachable."""
    while not stop_event.is_set():
        consumer = AIOKafkaConsumer(
            settings.kafka_sensor_topic,
            bootstrap_servers=settings.kafka_bootstrap_servers,
            group_id=settings.kafka_consumer_group,
            auto_offset_reset="latest",
            enable_auto_commit=True,
        )
        try:
            await consumer.start()
            logger.info("Kafka consumer connected, listening on %s", settings.kafka_sensor_topic)
            async for msg in consumer:
                if stop_event.is_set():
                    break
                await _handle_raw_message(msg.value)
        except KafkaConnectionError:
            logger.warning(
                "Could not reach Kafka at %s -- retrying in %ss. The rest of the API keeps working "
                "without the live feed until Kafka is available.",
                settings.kafka_bootstrap_servers,
                _RECONNECT_DELAY_SECONDS,
            )
        except Exception:  # noqa: BLE001
            logger.exception("Kafka consumer loop crashed unexpectedly -- retrying")
        finally:
            await consumer.stop()

        if not stop_event.is_set():
            await asyncio.sleep(_RECONNECT_DELAY_SECONDS)
