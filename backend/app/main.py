import asyncio
import hashlib
import logging
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect  # type: ignore[reportMissingImports]
from fastapi.middleware.cors import CORSMiddleware  # type: ignore[reportMissingImports]

from app.config import settings
from app.database import SessionLocal, init_db
from app import models
from app.routers import predictions, dashboard, alerts, reports, insights, auth
from app.routers.auth import get_current_user
from app.streaming.broadcaster import broadcaster
from app.streaming.consumer import run_consumer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_stop_event = asyncio.Event()
_consumer_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _consumer_task
    init_db()
    _stop_event.clear()
    _consumer_task = asyncio.create_task(run_consumer(_stop_event))
    logger.info("Kafka consumer task started")

    yield

    _stop_event.set()
    if _consumer_task:
        _consumer_task.cancel()
        try:
            await _consumer_task
        except asyncio.CancelledError:
            pass
    logger.info("Kafka consumer task stopped")


app = FastAPI(
    title="Steel Quality Prediction API",
    description="Predicts steel manufacturing defects, forecasts future quality, "
                "and generates AI-driven process recommendations from a live Kafka feed.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(predictions.router, dependencies=[Depends(get_current_user)])
app.include_router(dashboard.router, dependencies=[Depends(get_current_user)])
app.include_router(alerts.router, dependencies=[Depends(get_current_user)])
app.include_router(reports.router, dependencies=[Depends(get_current_user)])
app.include_router(insights.router, dependencies=[Depends(get_current_user)])


@app.get("/")
def root():
    return {"status": "ok", "service": "steel-quality-prediction-api"}


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "live_connections": broadcaster.connection_count,
    }


@app.websocket("/ws/live")
async def live_feed(websocket: WebSocket):
    """
    Dashboard clients connect here. All messages are pushed by the Kafka
    consumer via `broadcaster` -- this endpoint just registers/unregisters
    the connection and keeps it alive.
    """
    token = websocket.cookies.get("foresight_session")
    if not token:
        await websocket.close(code=4401)
        return

    db = SessionLocal()
    try:
        session = db.query(models.AuthSession).filter(
            models.AuthSession.token_hash == hashlib.sha256(token.encode()).hexdigest(),
            models.AuthSession.expires_at > datetime.utcnow(),
        ).first()
        if not session:
            await websocket.close(code=4401)
            return
    finally:
        db.close()

    await broadcaster.connect(websocket)
    try:
        while True:
            # We don't expect the client to send anything; this just
            # detects disconnects promptly.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await broadcaster.disconnect(websocket)
