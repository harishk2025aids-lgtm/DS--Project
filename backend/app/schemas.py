from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class ProcessParameters(BaseModel):
    batch_code: str
    line_id: str
    grade: str
    temperature_c: float
    rolling_speed_mps: float
    carbon_content_pct: float
    manganese_pct: float
    silicon_pct: float
    cooling_rate_c_per_s: float
    thickness_mm: float
    tension_kn: float
    furnace_pressure_bar: float
    humidity_pct: float
    extra_features: Dict[str, Any] = Field(default_factory=dict)


class FeatureImportance(BaseModel):
    feature: str
    impact: float


class QualityPredictionOut(BaseModel):
    batch_code: str
    model_name: str
    defect_probability: float
    predicted_defect_type: Optional[str]
    quality_score: float
    is_forecast: bool
    forecast_horizon_minutes: Optional[int]
    top_features: List[FeatureImportance]
    created_at: datetime

    class Config:
        from_attributes = True


class ForecastPoint(BaseModel):
    minutes_ahead: int
    defect_probability: float
    quality_score: float


class ForecastResponse(BaseModel):
    batch_code: str
    points: List[ForecastPoint]


class RecommendedAction(BaseModel):
    parameter: str
    change: str
    reason: str


class RecommendationOut(BaseModel):
    explanation: str
    root_cause: Optional[str]
    recommended_actions: List[RecommendedAction]


class AlertOut(BaseModel):
    id: str
    batch_code: str
    severity: str
    message: str
    acknowledged: bool
    created_at: datetime

    class Config:
        from_attributes = True


class DashboardSummary(BaseModel):
    total_batches_today: int
    avg_quality_score: float
    defect_rate_pct: float
    scrap_reduction_pct: float
    active_alerts: int
    line_status: Dict[str, str]
