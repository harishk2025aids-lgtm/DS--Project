"""
Trains an LSTM that forecasts defect probability / quality score N steps
ahead from a rolling window of recent process readings, so operators get
a warning *before* a defect actually occurs.

Run:  python -m app.ml.train_lstm_forecast
"""
import os
import joblib
import numpy as np
import mlflow
import mlflow.tensorflow
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
import tensorflow as tf
from tensorflow.keras import layers, models

from app.config import settings
from app.ml.synthetic_data import generate_batches, FEATURE_COLUMNS
from app.ml.constants import WINDOW, HORIZON_STEPS

ARTIFACT_DIR = os.path.join(os.path.dirname(__file__), "artifacts")
os.makedirs(ARTIFACT_DIR, exist_ok=True)


def build_sequences(df, window=WINDOW, horizon=HORIZON_STEPS):
    features = df[FEATURE_COLUMNS].values
    target = df["defect_probability_true"].values

    X, y = [], []
    for i in range(len(df) - window - horizon):
        X.append(features[i:i + window])
        y.append(target[i + window + horizon - 1])
    return np.array(X), np.array(y)


def build_model(n_features):
    model = models.Sequential([
        layers.Input(shape=(WINDOW, n_features)),
        layers.LSTM(64, return_sequences=True),
        layers.Dropout(0.2),
        layers.LSTM(32),
        layers.Dropout(0.2),
        layers.Dense(16, activation="relu"),
        layers.Dense(1, activation="sigmoid"),
    ])
    model.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss="mse", metrics=["mae"])
    return model


def train():
    mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
    mlflow.set_experiment("steel-lstm-forecast")

    df = generate_batches(n_rows=30000).sort_values("timestamp").reset_index(drop=True)

    scaler = StandardScaler()
    df[FEATURE_COLUMNS] = scaler.fit_transform(df[FEATURE_COLUMNS])
    joblib.dump(scaler, os.path.join(ARTIFACT_DIR, "lstm_feature_scaler.joblib"))

    X, y = build_sequences(df)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.15, random_state=42)

    model = build_model(n_features=X.shape[-1])

    with mlflow.start_run(run_name="lstm_future_quality"):
        mlflow.log_params({"window": WINDOW, "horizon_steps": HORIZON_STEPS, "epochs": 25})
        history = model.fit(
            X_train, y_train,
            validation_data=(X_test, y_test),
            epochs=25,
            batch_size=128,
            verbose=2,
        )
        val_mae = history.history["val_mae"][-1]
        mlflow.log_metric("val_mae", float(val_mae))

        model_path = os.path.join(ARTIFACT_DIR, "lstm_forecast.keras")
        model.save(model_path)
        mlflow.log_artifact(model_path)
        print(f"[lstm] val_mae={val_mae:.4f} -> saved to {model_path}")

    return {"val_mae": float(val_mae)}


if __name__ == "__main__":
    train()
