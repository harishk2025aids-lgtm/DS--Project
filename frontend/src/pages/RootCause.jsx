import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import { EmptyState, KpiCard, Notice, Panel, controlClass, formatPercent } from "../components/InsightUI";

const AXIS = "#66707C";
const GRID = "#2B333D";
const TOOLTIP = { background: "#1A1F26", border: "1px solid #3A4450", borderRadius: 3, color: "#ECEEF1" };

function riskTone(level) {
  return level === "critical" || level === "high" ? "danger" : level === "elevated" ? "warn" : "good";
}

export default function RootCause({ initialBatchId }) {
  const [batches, setBatches] = useState([]);
  const [batchCode, setBatchCode] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getBatchReport({ days: 30 }).then((rows) => {
      if (cancelled) return;
      setBatches(rows);
      const match = rows.find((row) => row.batch_code === initialBatchId);
      const nextCode = match?.batch_code || rows[0]?.batch_code || "";
      setBatchCode(nextCode);
      if (nextCode) {
        setLoading(true);
        api.getRootCause(nextCode)
          .then((result) => !cancelled && setData(result))
          .catch((err) => !cancelled && setError(err.message))
          .finally(() => !cancelled && setLoading(false));
      }
    }).catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
  }, [initialBatchId]);

  async function selectBatch(event) {
    const code = event.target.value;
    setBatchCode(code);
    setData(null);
    setError(null);
    if (!code) return;
    setLoading(true);
    try {
      setData(await api.getRootCause(code));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const contributions = data?.contributions || [];
  const primary = data?.primary_cause;
  const dataQualityFlags = data?.data_quality_flags || [];
  const attributionLabel = {
    model_feature_importance: "Stored model importance",
    heuristic_risk_rules: "Heuristic risk factors",
  }[data?.attribution_source] || "Attribution unavailable";
  const riskClass = { critical: "text-danger", high: "text-danger", elevated: "text-warn", low: "text-good" }[data?.risk_level] || "text-mid";

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-low">Prediction explainability</p>
          <h1 className="text-xl mt-1">Root cause analysis</h1>
        </div>
        <label className="flex flex-col gap-1 text-[10px] uppercase text-low sm:min-w-64">
          Production batch
          <select className={controlClass} value={batchCode} onChange={selectBatch}>
            <option value="">Select a batch</option>
            {batches.map((batch) => <option key={`${batch.batch_code}-${batch.created_at}`} value={batch.batch_code}>{batch.batch_code} · {batch.line_id}</option>)}
          </select>
        </label>
      </div>

      {error && <Notice tone="warn">Root-cause data could not be loaded: {error}</Notice>}
      {!loading && !error && !data && <Panel title="Batch attribution"><EmptyState>No recorded batches are available for analysis.</EmptyState></Panel>}
      {loading && <Notice>Loading the stored prediction and attribution…</Notice>}

      {data && <>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiCard label="Selected batch" value={data.batch_id} detail={data.model_name || "Model not recorded"} />
          <KpiCard label="Defect probability" value={formatPercent(data.defect_probability * 100)} tone={riskTone(data.risk_level)} />
          <KpiCard label="Quality score" value={`${Number(data.quality_score).toFixed(1)} / 100`} />
          <KpiCard label="Risk level" value={data.risk_level.toUpperCase()} tone={riskTone(data.risk_level)} detail={data.predicted_defect_type || "Defect type not identified"} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-5">
          <Panel title="Main contributing parameters" action={<span className="text-[10px] uppercase text-low">{attributionLabel}</span>}>
            {contributions.length ? <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={contributions.slice(0, 8)} layout="vertical" margin={{ left: 10, right: 22 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, "dataMax"]} tickFormatter={(value) => `${Math.round(value * 100)}%`} tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis type="category" dataKey="label" width={112} tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TOOLTIP} formatter={(value) => [`${(Number(value) * 100).toFixed(1)}%`, data.attribution_source === "heuristic_risk_rules" ? "Share of heuristic score" : "Importance"]} />
              <Bar dataKey="impact" name={data.attribution_source === "heuristic_risk_rules" ? "Heuristic score share" : "Feature importance"} fill="#FF6A39" maxBarSize={24} radius={[0, 2, 2, 0]} />
            </BarChart></ResponsiveContainer></div> : <EmptyState>No model feature importance was stored for this prediction.</EmptyState>}
            {data.attribution_source === "heuristic_risk_rules" && <Notice tone="warn">These bars decompose the fallback scoring formula; they are not SHAP values or proof of physical cause.</Notice>}
            {data.attribution_source === "unavailable" && <Notice tone="warn">No trained-model feature importance or fallback risk factors are available for this prediction.</Notice>}
          </Panel>

          <div className="flex flex-col gap-5">
            <Panel title="Cause assessment">
              <div className="flex flex-col gap-4">
                <div><p className="text-[10px] uppercase text-low">Primary cause</p><p className="mt-1 font-display text-xl">{primary?.label || "Not attributed"}</p></div>
                <div><p className="text-[10px] uppercase text-low">Secondary causes</p><p className="mt-1 text-sm text-mid">{data.secondary_causes?.length ? data.secondary_causes.map((item) => item.label).join(" · ") : "No secondary attribution available"}</p></div>
                <div><p className="text-[10px] uppercase text-low">Predicted defect type</p><p className="mt-1 text-sm text-mid">{data.predicted_defect_type || "Not classified"}</p></div>
                <div><p className="text-[10px] uppercase text-low">Risk level</p><p className={`mt-1 font-mono uppercase ${riskClass}`}>{data.risk_level}</p></div>
              </div>
            </Panel>
            <Panel title="Explanation"><p className="text-sm leading-relaxed text-mid">{data.explanation}</p></Panel>
            <Panel title="Input data quality">
              {dataQualityFlags.length ? <>
                <Notice tone="warn">Prediction reliability is low. These values are outside the application's synthetic demo ranges, which are not certified plant operating limits.</Notice>
                <ul className="mt-3 space-y-2 text-xs text-mid">
                  {dataQualityFlags.map((item) => <li key={item.feature} className="flex justify-between gap-3 border-b border-line pb-2">
                    <span>{item.label}: <span className="font-mono text-danger">{item.value ?? "missing"}</span></span>
                    <span className="text-low">Demo range {item.minimum}–{item.maximum}</span>
                  </li>)}
                </ul>
              </> : <p className="text-sm text-mid">Recorded values are within the synthetic demo ranges. Plant-specific operating limits have not been configured.</p>}
            </Panel>
            <Panel title="Recorded process parameters">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {Object.entries(data.parameters || {}).map(([key, value]) => <div key={key} className="flex justify-between gap-2 border-b border-line py-1"><dt className="text-low">{key.replaceAll("_", " ")}</dt><dd className="font-mono text-mid">{value ?? "—"}</dd></div>)}
              </dl>
            </Panel>
          </div>
        </div>
      </>}
    </div>
  );
}