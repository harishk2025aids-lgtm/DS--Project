"""
Tracks connected dashboard WebSocket clients and broadcasts messages to
all of them. The Kafka consumer is the only producer of messages here;
the /ws/live endpoint just registers/unregisters connections.
"""
import asyncio
import logging

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class Broadcaster:
    def __init__(self):
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)

    async def disconnect(self, websocket: WebSocket):
        async with self._lock:
            self._connections.discard(websocket)

    async def broadcast(self, message: dict):
        async with self._lock:
            targets = list(self._connections)

        stale = []
        for ws in targets:
            try:
                await ws.send_json(message)
            except Exception:  # noqa: BLE001
                stale.append(ws)

        if stale:
            async with self._lock:
                for ws in stale:
                    self._connections.discard(ws)

    @property
    def connection_count(self) -> int:
        return len(self._connections)


broadcaster = Broadcaster()
