"""
Trains the CURRENT quality / defect-probability models:
  - XGBoost classifier  (primary)
  - LightGBM classifier (secondary / ensemble check)

Both are logged to MLflow so runs, metrics and artifacts are comparable
over time as real production data replaces the synthetic set.

Run:  python -m app.ml.train_current_quality
"""
import os
import joblib
import mlflow
import numpy as np
from sklearn.metrics import roc_auc_score, f1_score, precision_recall_curve
from sklearn.model_selection import train_test_split
import xgboost as xgb
import lightgbm as lgb

from app.config import settings
from app.ml.synthetic_data import generate_batches, FEATURE_COLUMNS

ARTIFACT_DIR = os.path.join(os.path.dirname(__file__), "artifacts")
os.makedirs(ARTIFACT_DIR, exist_ok=True)


def _best_threshold(y_true, y_proba):
    prec, rec, thr = precision_recall_curve(y_true, y_proba)
    f1 = 2 * prec * rec / (prec + rec + 1e-9)
    return float(thr[np.argmax(f1[:-1])]) if len(thr) else 0.5


def train():
    mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
    mlflow.set_experiment("steel-current-quality")

    df = generate_batches(n_rows=30000)
    X = df[FEATURE_COLUMNS]
    y = df["is_defect"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    results = {}

    with mlflow.start_run(run_name="xgboost_current_quality"):
        xgb_model = xgb.XGBClassifier(
            n_estimators=400,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.85,
            colsample_bytree=0.85,
            eval_metric="auc",
            reg_lambda=1.0,
            n_jobs=-1,
        )
        xgb_model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
        proba = xgb_model.predict_proba(X_test)[:, 1]
        thr = _best_threshold(y_test, proba)
        auc = roc_auc_score(y_test, proba)
        f1 = f1_score(y_test, proba > thr)

        mlflow.log_params(xgb_model.get_params())
        mlflow.log_metrics({"auc": auc, "f1": f1, "threshold": thr})
        joblib.dump(xgb_model, os.path.join(ARTIFACT_DIR, "xgboost_current_quality.joblib"))
        mlflow.log_artifact(os.path.join(ARTIFACT_DIR, "xgboost_current_quality.joblib"))
        results["xgboost"] = {"auc": auc, "f1": f1, "threshold": thr}
        print(f"[xgboost] AUC={auc:.4f} F1={f1:.4f} thr={thr:.3f}")

    with mlflow.start_run(run_name="lightgbm_current_quality"):
        lgb_model = lgb.LGBMClassifier(
            n_estimators=500,
            num_leaves=48,
            learning_rate=0.04,
            subsample=0.85,
            colsample_bytree=0.85,
            reg_lambda=1.0,
            n_jobs=-1,
        )
        lgb_model.fit(X_train, y_train)
        proba = lgb_model.predict_proba(X_test)[:, 1]
        thr = _best_threshold(y_test, proba)
        auc = roc_auc_score(y_test, proba)
        f1 = f1_score(y_test, proba > thr)

        mlflow.log_params(lgb_model.get_params())
        mlflow.log_metrics({"auc": auc, "f1": f1, "threshold": thr})
        joblib.dump(lgb_model, os.path.join(ARTIFACT_DIR, "lightgbm_current_quality.joblib"))
        mlflow.log_artifact(os.path.join(ARTIFACT_DIR, "lightgbm_current_quality.joblib"))
        results["lightgbm"] = {"auc": auc, "f1": f1, "threshold": thr}
        print(f"[lightgbm] AUC={auc:.4f} F1={f1:.4f} thr={thr:.3f}")

    return results


if __name__ == "__main__":
    train()
