import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import { EmptyState, KpiCard, Notice, Panel } from "../components/InsightUI";

const CLASSIFIER_METRICS = ["accuracy", "precision", "recall", "f1", "roc_auc"];
const GRID = "#2B333D";
const AXIS = "#66707C";
const TOOLTIP = { background: "#1A1F26", border: "1px solid #3A4450", borderRadius: 3, color: "#ECEEF1" };

function displayMetric(value) {
  return value == null ? "Not recorded" : Number(value).toFixed(3);
}

export default function ModelPerformance() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getModelPerformance().then((result) => !cancelled && setData(result)).catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
  }, []);

  const models = data?.models || [];
  const monitoring = data?.monitoring || {};
  const rowsWithMetrics = models.some((model) => Object.values(model.metrics || {}).some((value) => value != null));

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div><p className="text-[11px] uppercase tracking-wider text-low">Model registry and monitoring</p><h1 className="text-xl mt-1">Model performance</h1></div>
      {error && <Notice tone="warn">Model registry could not be loaded: {error}</Notice>}
      {data && <Notice tone="warn">Only values present in the model registry or prediction database are displayed. Missing training metrics, latency, and drift are not estimated.</Notice>}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard label="Predictions · 24h" value={monitoring.prediction_count_24h ?? "—"} />
        <KpiCard label="Mean quality · 24h" value={monitoring.average_quality_score == null ? "Not recorded" : `${monitoring.average_quality_score} / 100`} />
        <KpiCard label="Mean defect probability" value={monitoring.average_defect_probability == null ? "Not recorded" : `${(monitoring.average_defect_probability * 100).toFixed(1)}%`} tone="warn" />
        <KpiCard label="Prediction latency" value={monitoring.prediction_latency_ms == null ? "Not instrumented" : `${monitoring.prediction_latency_ms} ms`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {models.map((model) => {
          const metricKeys = model.type === "forecast" ? ["mae", "rmse"] : CLASSIFIER_METRICS;
          return <Panel key={model.name} title={model.name.toUpperCase()} action={<span className={`pill ${model.status === "artifact available" ? "good" : "warn"}`}>{model.status}</span>}>
            <div className="grid grid-cols-2 gap-3">
              {metricKeys.map((key) => <div key={key} className="border-b border-line pb-2"><p className="text-[10px] uppercase text-low">{key.replace("roc_auc", "ROC-AUC")}</p><p className="font-mono text-lg mt-1 text-hi">{displayMetric(model.metrics?.[key])}</p></div>)}
            </div>
            <dl className="mt-4 flex flex-col gap-2 text-xs">
              <div className="flex justify-between gap-3"><dt className="text-low">Version</dt><dd className="font-mono text-mid">{model.model_version || "Not registered"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-low">Training date</dt><dd className="font-mono text-mid">{model.training_date ? new Date(model.training_date).toLocaleString() : "Not recorded"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-low">Dataset size</dt><dd className="font-mono text-mid">{model.dataset_size ?? "Not recorded"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-low">Features</dt><dd className="font-mono text-mid">{model.feature_count}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-low">Metrics source</dt><dd className="text-mid">{model.metrics_source}</dd></div>
            </dl>
          </Panel>;
        })}
      </div>

      <Panel title="Model comparison · recorded classification metrics">
        {rowsWithMetrics ? <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.comparison.filter((row) => row.model !== "lstm")}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="model" tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis domain={[0, 1]} tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={TOOLTIP} />
          <Legend />
          <Bar dataKey="f1" name="F1" fill="#FF6A39" maxBarSize={38} />
          <Bar dataKey="roc_auc" name="ROC-AUC" fill="#4FA3D1" maxBarSize={38} />
          <Bar dataKey="accuracy" name="Accuracy" fill="#5FBE87" maxBarSize={38} />
        </BarChart></ResponsiveContainer></div> : <EmptyState>No registered training metrics are available for comparison.</EmptyState>}
      </Panel>

      <Panel title="Model monitoring">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><p className="text-[10px] uppercase text-low">Active version</p><p className="font-mono mt-1 text-hi">{monitoring.active_model_version || "Not recorded"}</p></div>
          <div><p className="text-[10px] uppercase text-low">Recent performance</p><p className="mt-1 text-mid">Based on the rolling 24-hour prediction averages above.</p></div>
          <div><p className="text-[10px] uppercase text-low">Data drift</p><p className="mt-1 text-warn uppercase font-mono">{monitoring.data_drift_status || "Not monitored"}</p></div>
        </div>
      </Panel>
    </div>
  );
}