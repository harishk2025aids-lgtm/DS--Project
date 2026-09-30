"""
Generates physically-plausible synthetic steel production data so the
pipeline can be trained and demoed before real plant data is connected.

Replace this module with a real data-ingestion pipeline (historian /
MES / SCADA export) once production data is available -- the feature
schema here is what app/models.py::ProductionBatch expects.
"""
import numpy as np
import pandas as pd

FEATURE_COLUMNS = [
    "temperature_c",
    "rolling_speed_mps",
    "carbon_content_pct",
    "manganese_pct",
    "silicon_pct",
    "cooling_rate_c_per_s",
    "thickness_mm",
    "tension_kn",
    "furnace_pressure_bar",
    "humidity_pct",
]


def generate_batches(n_rows: int = 20000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    df = pd.DataFrame({
        "temperature_c": rng.normal(1250, 40, n_rows).clip(1100, 1400),
        "rolling_speed_mps": rng.normal(12, 2.5, n_rows).clip(4, 20),
        "carbon_content_pct": rng.normal(0.18, 0.04, n_rows).clip(0.02, 0.4),
        "manganese_pct": rng.normal(1.2, 0.3, n_rows).clip(0.3, 2.2),
        "silicon_pct": rng.normal(0.3, 0.08, n_rows).clip(0.05, 0.6),
        "cooling_rate_c_per_s": rng.normal(25, 8, n_rows).clip(2, 60),
        "thickness_mm": rng.normal(3.2, 0.6, n_rows).clip(0.8, 8),
        "tension_kn": rng.normal(45, 10, n_rows).clip(10, 90),
        "furnace_pressure_bar": rng.normal(1.05, 0.08, n_rows).clip(0.7, 1.4),
        "humidity_pct": rng.normal(55, 15, n_rows).clip(10, 95),
    })

    # --- latent defect-risk function -------------------------------------
    # Deliberately non-linear + interaction terms so tree models earn their keep.
    risk = (
        0.020 * np.abs(df.temperature_c - 1260)
        + 0.35 * np.abs(df.cooling_rate_c_per_s - 22)
        + 4.5 * np.abs(df.carbon_content_pct - 0.16)
        + 0.9 * np.abs(df.tension_kn - 40)
        + 0.06 * np.abs(df.rolling_speed_mps - 11)
        + 2.0 * ((df.thickness_mm < 1.2) & (df.rolling_speed_mps > 16)).astype(float)
        + 3.0 * ((df.furnace_pressure_bar < 0.85) | (df.furnace_pressure_bar > 1.25)).astype(float)
        + 0.01 * np.abs(df.humidity_pct - 50)
    )
    risk += rng.normal(0, 1.5, n_rows)  # process noise
    prob = 1 / (1 + np.exp(-(risk - risk.mean()) / risk.std()))
    df["defect_probability_true"] = prob
    df["is_defect"] = (rng.uniform(0, 1, n_rows) < prob).astype(int)

    defect_types = np.select(
        [
            df.carbon_content_pct > 0.24,
            df.cooling_rate_c_per_s > 35,
            df.furnace_pressure_bar < 0.85,
            df.tension_kn > 60,
        ],
        ["surface_crack", "internal_porosity", "scale_pit", "edge_tear"],
        default="none",
    )
    df["defect_type"] = np.where(df.is_defect == 1, defect_types, "none")
    df["quality_score"] = (100 * (1 - prob)).clip(0, 100)

    df["batch_code"] = [f"B{seed}{i:06d}" for i in range(n_rows)]
    df["line_id"] = rng.choice(["LINE-A", "LINE-B", "LINE-C"], n_rows)
    df["grade"] = rng.choice(["DP600", "DP800", "HSLA340", "IF-Steel"], n_rows)
    df["timestamp"] = pd.date_range("2025-01-01", periods=n_rows, freq="4min")

    return df


def generate_time_series_for_batch(n_steps: int = 200, seed: int = 7) -> pd.DataFrame:
    """A single line's rolling window of readings, used to train/demo the LSTM."""
    df = generate_batches(n_rows=n_steps, seed=seed).sort_values("timestamp")
    return df.reset_index(drop=True)


if __name__ == "__main__":
    data = generate_batches(5000)
    print(data[FEATURE_COLUMNS + ["is_defect", "quality_score"]].describe())
