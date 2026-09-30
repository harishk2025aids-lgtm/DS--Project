# Forgesight — Steel Quality Prediction

A full-stack system that predicts steel manufacturing defects before they
happen, forecasts future quality, and uses Gemini to explain *why* and
*what to change* on the line.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React.js + Tailwind CSS, reusable components, responsive layout |
| Backend | Python + FastAPI, REST APIs |
| Current quality prediction | XGBoost / LightGBM |
| Deep learning forecast | TensorFlow (LSTM) |
| Data processing | Pandas / NumPy |
| Streaming | Apache Kafka (live production/sensor data) |
| Database | PostgreSQL |
| Explanation & recommendations | Gemini (`google-genai` SDK) |
| Experiment tracking | MLflow |

## Project layout

```
backend/
  app/
    main.py                FastAPI app, CORS, Kafka consumer lifespan, /ws/live
    config.py                Settings (env-driven, incl. Kafka)
    database.py               SQLAlchemy engine/session
    models.py                  ORM models (batches, predictions, alerts, recommendations)
    schemas.py                  Pydantic request/response models
    ml/
      synthetic_data.py          Synthetic steel production data generator (swap for real data)
      constants.py                 Shared lightweight constants (no heavy imports)
      train_current_quality.py      Trains XGBoost + LightGBM, logs to MLflow
      train_lstm_forecast.py         Trains the LSTM forecaster, logs to MLflow
      predictor.py                    Runtime inference (loads trained artifacts, heuristic fallback)
    services/
      gemini_service.py             Defect explanation + recommendations via Gemini
      alert_service.py               Threshold-based alert generation
    streaming/
      kafka_producer_sim.py         Simulates plant sensors publishing to Kafka (swap for real SCADA/MQTT/OPC-UA bridge)
      consumer.py                    Consumes readings, scores them, persists, broadcasts to dashboards
      broadcaster.py                  In-memory WebSocket fan-out to connected dashboard clients
    routers/
      predictions.py, dashboard.py, alerts.py, reports.py
frontend/
  tailwind.config.js       Forgesight color/font tokens
  src/
    api.js                  REST + WebSocket client
    App.jsx, pages/, components/   All Tailwind, responsive (sidebar collapses to a drawer below `lg`)
docker-compose.yml         One-command local stack (Postgres + Kafka + producer + backend + frontend)
```

## How the live data flows

```
[sensors / PLC]  --(real deployment)-->  Kafka topic: steel.sensor.readings
[kafka_producer_sim.py]  --(this demo)-->  Kafka topic: steel.sensor.readings
                                                   |
                                                   v
                                     backend consumer (app/streaming/consumer.py)
                                       - scores reading with XGBoost/LightGBM
                                       - persists batch + prediction to Postgres
                                       - raises an alert if risk crosses threshold
                                                   |
                                                   v
                                    broadcaster --> WebSocket --> React dashboard
```

Kafka is the backbone for live production/sensor data; the WebSocket is
only the last-mile hop into the browser, since browsers can't consume
Kafka topics directly.

## Quick start (Docker)

```bash
cp backend/.env.example backend/.env
# edit backend/.env and add your GEMINI_API_KEY (optional — the app
# works without it, using a rule-based fallback explanation)

docker compose up --build
```

- Frontend: http://localhost:5173
- Backend docs: http://localhost:8000/docs
- Kafka broker: localhost:9092 (single-node, KRaft mode, no ZooKeeper)

Compose starts, in order: Postgres, Kafka, the sensor-simulating
producer, the FastAPI backend (which starts a Kafka consumer as a
background task on startup), and the frontend.

## Quick start (without Docker)

You'll need a running Postgres instance and a running Kafka broker
(e.g. via `docker compose up db kafka` and running the rest natively).

**Backend**
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # point DATABASE_URL / KAFKA_BOOTSTRAP_SERVERS at your instances
uvicorn app.main:app --reload
```

**Sensor simulator** (in a second terminal, same venv)
```bash
python -m app.streaming.kafka_producer_sim
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

If Kafka isn't running, the backend's consumer retries with backoff and
logs a warning rather than crashing — the rest of the API (manual
predictions, reports, alerts) keeps working; you just won't see live
ticks on the dashboard until Kafka is reachable.

## Training the models

The system ships with a synthetic steel-production data generator
(`app/ml/synthetic_data.py`) so you can train and demo the full pipeline
immediately. Swap that module for a real historian/MES export when
production data is available — the feature schema is documented in
`app/models.py::ProductionBatch`.

```bash
cd backend
python -m app.ml.train_current_quality   # trains XGBoost + LightGBM
python -m app.ml.train_lstm_forecast     # trains the LSTM forecaster
mlflow ui                                 # inspect runs at http://localhost:5000
```

Trained artifacts land in `app/ml/artifacts/`. The API's `predictor.py`
auto-loads them on the next request. If no artifacts exist yet, the API
falls back to a transparent heuristic so the rest of the system
(dashboard, alerts, reports) stays fully functional while training runs
in the background.

## Testing notes

- The backend was verified end-to-end (all REST endpoints + the
  `process_message` Kafka handler logic) against a SQLite database for
  fast local testing; `models.py` uses cross-compatible column types
  (`JSON`/`JSONB`, portable `UUID`) so this works without a Postgres
  server, while production still gets native `JSONB`/`UUID` on Postgres.
- The frontend was verified with a clean `npm run build` (Tailwind
  utilities compiling correctly).
- `predictor.py` is intentionally decoupled from the training scripts
  (see `ml/constants.py`) so inference doesn't require TensorFlow/MLflow
  to be installed if you only need the XGBoost/LightGBM path.
- The Kafka consumer's message-processing logic (`consumer.process_message`)
  is a plain function taking a DB session + payload, so it's testable
  without a live broker; only the `run_consumer`/`kafka_producer_sim`
  wrappers need an actual Kafka instance.

## Configuration

See `backend/.env.example` for all environment variables, including
Kafka connection settings, alert thresholds
(`DEFECT_PROBABILITY_ALERT_THRESHOLD`, `CRITICAL_DEFECT_PROBABILITY_THRESHOLD`),
and the Gemini model name.
