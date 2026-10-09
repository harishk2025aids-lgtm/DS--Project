import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Float, Integer, DateTime, ForeignKey, Text, Boolean, JSON, TypeDecorator, CHAR
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base

# JSONB on Postgres (production), plain JSON everywhere else (e.g. SQLite in
# local dev/tests without a Postgres instance running).
JSONType = JSON().with_variant(JSONB, "postgresql")


class UUID(TypeDecorator):
    """Platform-independent UUID: native UUID on Postgres, CHAR(36) elsewhere."""
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID())
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        return str(value) if value is not None else value

    def process_result_value(self, value, dialect):
        return str(value) if value is not None else value


def gen_uuid():
    return str(uuid.uuid4())


class ProductionBatch(Base):
    """One record per coil / heat / batch coming off the line."""
    __tablename__ = "production_batches"

    id = Column(UUID(), primary_key=True, default=gen_uuid)
    batch_code = Column(String, unique=True, index=True, nullable=False)
    line_id = Column(String, index=True, nullable=False)
    grade = Column(String, nullable=False)  # steel grade, e.g. "DP600"
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    # Process parameters (features fed to the models)
    temperature_c = Column(Float)
    rolling_speed_mps = Column(Float)
    carbon_content_pct = Column(Float)
    manganese_pct = Column(Float)
    silicon_pct = Column(Float)
    cooling_rate_c_per_s = Column(Float)
    thickness_mm = Column(Float)
    tension_kn = Column(Float)
    furnace_pressure_bar = Column(Float)
    humidity_pct = Column(Float)
    extra_features = Column(JSONType, default=dict)

    predictions = relationship("QualityPrediction", back_populates="batch", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="batch", cascade="all, delete-orphan")


class QualityPrediction(Base):
    __tablename__ = "quality_predictions"

    id = Column(UUID(), primary_key=True, default=gen_uuid)
    batch_id = Column(UUID(), ForeignKey("production_batches.id"), index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    model_name = Column(String)  # "xgboost" | "lightgbm" | "lstm_forecast"
    model_version = Column(String)

    defect_probability = Column(Float)
    predicted_defect_type = Column(String, nullable=True)
    quality_score = Column(Float)  # 0-100
    is_forecast = Column(Boolean, default=False)  # LSTM future prediction vs current
    forecast_horizon_minutes = Column(Integer, nullable=True)

    shap_top_features = Column(JSONType, default=list)  # feature importance for this prediction

    batch = relationship("ProductionBatch", back_populates="predictions")


class Recommendation(Base):
    """Gemini-generated explanation + recommended process changes."""
    __tablename__ = "recommendations"

    id = Column(UUID(), primary_key=True, default=gen_uuid)
    prediction_id = Column(UUID(), ForeignKey("quality_predictions.id"), index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    explanation = Column(Text)
    recommended_actions = Column(JSONType, default=list)  # list[{parameter, change, reason}]
    root_cause = Column(String, nullable=True)


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(UUID(), primary_key=True, default=gen_uuid)
    batch_id = Column(UUID(), ForeignKey("production_batches.id"), index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    severity = Column(String)  # "warning" | "critical"
    message = Column(Text)
    acknowledged = Column(Boolean, default=False)

    batch = relationship("ProductionBatch", back_populates="alerts")


class ModelRegistry(Base):
    """Tracks which trained model artifact is currently active (mirrors MLflow)."""
    __tablename__ = "model_registry"

    id = Column(UUID(), primary_key=True, default=gen_uuid)
    model_name = Column(String, index=True)
    version = Column(String)
    mlflow_run_id = Column(String, nullable=True)
    artifact_path = Column(String)
    metrics = Column(JSONType, default=dict)
    is_active = Column(Boolean, default=True)
    trained_at = Column(DateTime, default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(), primary_key=True, default=gen_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    sessions = relationship("AuthSession", back_populates="user", cascade="all, delete-orphan")


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id = Column(UUID(), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String, unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="sessions")
