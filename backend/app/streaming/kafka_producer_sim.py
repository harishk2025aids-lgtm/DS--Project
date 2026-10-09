"""
Simulates sensor/PLC readings coming off the production line and
publishes them to Kafka. This is the piece a real deployment replaces
with an actual SCADA/MQTT/OPC-UA bridge -- the message schema below is
what app/streaming/consumer.py expects, so keep it if you swap this out.

Run standalone:  python -m app.streaming.kafka_producer_sim
(also runs as its own container via docker-compose, see ../../docker-compose.yml)
"""
import asyncio
import json
import logging
import random
import time
import uuid

from aiokafka import AIOKafkaProducer
from aiokafka.errors import KafkaConnectionError

from app.config import settings
from app.ml.synthetic_data import generate_batches, FEATURE_COLUMNS, FEATURE_RANGES

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

LINES = ["LINE-A", "LINE-B", "LINE-C"]
GRADES = ["DP600", "DP800", "HSLA340", "IF-Steel"]
TICK_SECONDS = 2
RECONNECT_DELAY_SECONDS = 5


def _initial_state():
    sample = generate_batches(n_rows=1).iloc[0]
    return {c: float(sample[c]) for c in FEATURE_COLUMNS}


def _drift(state: dict) -> dict:
    for c in FEATURE_COLUMNS:
        low, high = FEATURE_RANGES[c]
        state[c] = min(
            high,
            max(low, state[c] + random.uniform(-1, 1) * (0.01 * abs(state[c]) + 0.05)),
        )
    return state


async def produce_forever():
    line_states = {line: _initial_state() for line in LINES}

    while True:
        producer = AIOKafkaProducer(bootstrap_servers=settings.kafka_bootstrap_servers)
        try:
            await producer.start()
            logger.info("Connected to Kafka at %s, publishing to %s", settings.kafka_bootstrap_servers, settings.kafka_sensor_topic)

            while True:
                line_id = random.choice(LINES)
                state = _drift(line_states[line_id])

                message = {
                    "batch_code": f"{line_id}-{uuid.uuid4().hex[:10]}",
                    "line_id": line_id,
                    "grade": random.choice(GRADES),
                    "timestamp": time.time(),
                    "readings": dict(state),
                }
                await producer.send_and_wait(
                    settings.kafka_sensor_topic,
                    json.dumps(message).encode("utf-8"),
                )
                await asyncio.sleep(TICK_SECONDS)

        except KafkaConnectionError:
            logger.warning("Kafka unreachable, retrying in %ss", RECONNECT_DELAY_SECONDS)
            await asyncio.sleep(RECONNECT_DELAY_SECONDS)
        finally:
            await producer.stop()


if __name__ == "__main__":
    asyncio.run(produce_forever())
