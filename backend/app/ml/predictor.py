"""
Runtime inference layer. Loads whatever model artifacts exist on disk
(trained via train_current_quality.py / train_lstm_forecast.py) and
exposes simple predict() functions used by the FastAPI routers.

If artifacts are missing (e.g. fresh clone, models not trained yet),
falls back to a lightweight heuristic so the API still responds --
this keeps local/demo runs unblocked while training happens in the
background or in CI.
"""
import os
import joblib
import numpy as np
import pandas as pd

from app.ml.synthetic_data import FEATURE_COLUMNS
from app.ml.constants import WINDOW

ARTIFACT_DIR = os.path.join(os.path.dirname(__file__), "artifacts")

_xgb_model = None
_lgb_model = None
_lstm_model = None
_lstm_scaler = None


def _lazy_load():
    global _xgb_model, _lgb_model, _lstm_model, _lstm_scaler

    xgb_path = os.path.join(ARTIFACT_DIR, "xgboost_current_quality.joblib")
    lgb_path = os.path.join(ARTIFACT_DIR, "lightgbm_current_quality.joblib")
    lstm_path = os.path.join(ARTIFACT_DIR, "lstm_forecast.keras")
    scaler_path = os.path.join(ARTIFACT_DIR, "lstm_feature_scaler.joblib")

    if _xgb_model is None and os.path.exists(xgb_path):
        _xgb_model = joblib.load(xgb_path)
    if _lgb_model is None and os.path.exists(lgb_path):
        _lgb_model = joblib.load(lgb_path)
    if _lstm_model is None and os.path.exists(lstm_path):
        import tensorflow as tf
        _lstm_model = tf.keras.models.load_model(lstm_path)
    if _lstm_scaler is None and os.path.exists(scaler_path):
        _lstm_scaler = joblib.load(scaler_path)


def _heuristic_probability(features: dict) -> float:
    """Fallback used only when trained artifacts aren't present yet."""
    score = (
        abs(features.get("temperature_c", 1260) - 1260) / 200
        + abs(features.get("cooling_rate_c_per_s", 22) - 22) / 40
        + abs(features.get("carbon_content_pct", 0.16) - 0.16) * 5
        + abs(features.get("tension_kn", 40) - 40) / 60
    )
    return float(np.clip(score, 0, 1))


def predict_current_quality(features: dict) -> dict:
    """Returns defect probability + top contributing features using an
    XGBoost/LightGBM ensemble average."""
    _lazy_load()
    row = pd.DataFrame([{c: features.get(c, 0.0) for c in FEATURE_COLUMNS}])

    probs = []
    model_used = []
    if _xgb_model is not None:
        probs.append(_xgb_model.predict_proba(row)[0, 1])
        model_used.append("xgboost")
    if _lgb_model is not None:
        probs.append(_lgb_model.predict_proba(row)[0, 1])
        model_used.append("lightgbm")

    if probs:
        proba = float(np.mean(probs))
        model_name = "+".join(model_used)
        top_features = _feature_contributions(row, _xgb_model or _lgb_model)
    else:
        proba = _heuristic_probability(features)
        model_name = "heuristic-fallback (train models to replace)"
        top_features = []

    return {
        "model_name": model_name,
        "defect_probability": round(proba, 4),
        "quality_score": round(100 * (1 - proba), 2),
        "top_features": top_features,
    }


def _feature_contributions(row: pd.DataFrame, model) -> list[dict]:
    if model is None or not hasattr(model, "feature_importances_"):
        return []
    importances = model.feature_importances_
    total = importances.sum() or 1
    pairs = sorted(
        zip(FEATURE_COLUMNS, importances), key=lambda p: p[1], reverse=True
    )[:5]
    return [{"feature": f, "impact": round(float(v) / total, 4)} for f, v in pairs]


def predict_forecast(history_rows: list[dict], horizon_points: list[int] = (5, 10, 20, 40)) -> list[dict]:
    """
    history_rows: most recent WINDOW readings (oldest -> newest), each a dict
    of FEATURE_COLUMNS values. Returns a defect-probability forecast at each
    requested horizon (in minutes, assuming ~4min per reading interval).
    """
    _lazy_load()

    if _lstm_model is not None and _lstm_scaler is not None and len(history_rows) >= WINDOW:
        df = pd.DataFrame(history_rows[-WINDOW:])[FEATURE_COLUMNS]
        scaled = _lstm_scaler.transform(df.values)
        X = scaled.reshape(1, WINDOW, len(FEATURE_COLUMNS))
        base_pred = float(_lstm_model.predict(X, verbose=0)[0, 0])
    else:
        last = history_rows[-1] if history_rows else {}
        base_pred = _heuristic_probability(last)

    points = []
    for h in horizon_points:
        # widen uncertainty the further out the forecast goes
        drift = (h / 40) * 0.08
        proba = float(np.clip(base_pred + np.random.default_rng(h).normal(0, drift), 0, 1))
        points.append({
            "minutes_ahead": h,
            "defect_probability": round(proba, 4),
            "quality_score": round(100 * (1 - proba), 2),
        })
    return points
