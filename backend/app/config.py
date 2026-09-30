from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://steel_user:steel_pass@localhost:5432/steel_quality"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    environment: str = "development"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    mlflow_tracking_uri: str = "./mlruns"

    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_sensor_topic: str = "steel.sensor.readings"
    kafka_consumer_group: str = "steel-quality-api"

    defect_probability_alert_threshold: float = 0.65
    critical_defect_probability_threshold: float = 0.85

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
