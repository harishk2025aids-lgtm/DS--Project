import { useEffect, useState } from "react";
import { api } from "../api";
import { EmptyState, KpiCard, Notice, Panel, controlClass, formatPercent } from "../components/InsightUI";

const FIELDS = [
  ["temperature_c", "Temperature", "°C", "1"],
  ["furnace_pressure_bar", "Furnace pressure", "bar", "0.01"],
  ["rolling_speed_mps", "Rolling speed", "m/s", "0.01"],
  ["cooling_rate_c_per_s", "Cooling rate", "°C/s", "0.1"],
  ["carbon_content_pct", "Carbon content", "%", "0.001"],
  ["thickness_mm", "Steel thickness", "mm", "0.01"],
  ["manganese_pct", "Manganese", "%", "0.001"],
  ["silicon_pct", "Silicon", "%", "0.001"],
  ["tension_kn", "Tension", "kN", "0.1"],
  ["humidity_pct", "Humidity", "%", "0.1"],
];

function riskTone(value) {
  return value === "high" || value === "critical" ? "danger" : value === "moderate" || value === "elevated" ? "warn" : "good";
}

function metricsFor(result) {
  return [
    { label: "Defect probability", value: formatPercent(result.defect_probability * 100), tone: riskTone(result.risk_level) },
    { label: "Quality score", value: `${Number(result.quality_score).toFixed(1)} / 100`, tone: "neutral" },
    { label: "Scrap risk", value: result.scrap_risk.toUpperCase(), tone: riskTone(result.scrap_risk) },
    { label: "Expected yield", value: formatPercent(result.expected_yield_pct), tone: "good" },
  ];
}

export default function ProcessSimulator({ initialBatchId }) {
  const [batches, setBatches] = useState([]);
  const [batchCode, setBatchCode] = useState("");
  const [detail, setDetail] = useState(null);
  const [modified, setModified] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadBatches() {
      try {
        const rows = await api.getBatchReport({ days: 30 });
        if (cancelled) return;
        setBatches(rows);
        const selected = rows.find((row) => row.batch_code === initialBatchId) || rows[0];
        if (selected) await loadDetail(selected.batch_code, cancelled);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    loadBatches();
    return () => { cancelled = true; };
  }, [initialBatchId]);

  async function loadDetail(code, cancelled = false) {
    setBatchCode(code);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const next = await api.getBatchDetail(code);
      if (cancelled) return;
      setDetail(next);
      setModified({ ...next.parameters });
    } catch (err) {
      if (!cancelled) setError(err.message);
    } finally {
      if (!cancelled) setLoading(false);
    }
  }

  function updateParameter(key, value) {
    setModified((current) => ({ ...current, [key]: value }));
    setResult(null);
  }

  async function runSimulation(event) {
    event.preventDefault();
    if (!detail || !modified) return;
    setSimulating(true);
    setError(null);
    try {
      const current = {
        batch_code: detail.batch_code,
        line_id: detail.line_id,
        grade: detail.grade,
        ...detail.parameters,
        extra_features: detail.extra_features || {},
      };
      const next = {
        ...current,
        ...Object.fromEntries(FIELDS.map(([key]) => [key, Number(modified[key])])),
      };
      setResult(await api.simulate({ current, modified: next }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSimulating(false);
    }
  }

  const changed = result?.changes || [];

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div><p className="text-[11px] uppercase tracking-wider text-low">Model-based what-if analysis</p><h1 className="text-xl mt-1">Process simulator</h1></div>
        <label className="flex flex-col gap-1 text-[10px] uppercase text-low sm:min-w-64">
          Reference batch
          <select className={controlClass} value={batchCode} onChange={(event) => loadDetail(event.target.value)}>
            <option value="">Select a batch</option>{batches.map((batch) => <option key={`${batch.batch_code}-${batch.created_at}`} value={batch.batch_code}>{batch.batch_code} · {batch.line_id}</option>)}
          </select>
        </label>
      </div>

      <Notice tone="warn">Simulation shows model-predicted outcomes only. A changed parameter does not prove it will cause a production result.</Notice>
      {error && <Notice tone="warn">{error}</Notice>}
      {loading && <Notice>Loading batch parameters…</Notice>}
      {!detail && !loading && !error && <Panel title="Select a reference batch"><EmptyState>No recorded batches are available to simulate.</EmptyState></Panel>}

      {detail && modified && <>
        <form onSubmit={runSimulation} className="flex flex-col gap-5">
          <Panel title="Modified process parameters" action={<span className="text-[10px] text-low">Reference: {detail.batch_code}</span>}>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {FIELDS.map(([key, label, unit, step]) => <label key={key} className="flex flex-col gap-1.5 text-xs text-mid">
                {label} <span className="text-low">Current: {detail.parameters[key]} {unit}</span>
                <div className="flex items-center gap-2"><input className={`${controlClass} w-full font-mono`} type="number" step={step} value={modified[key] ?? ""} onChange={(event) => updateParameter(key, event.target.value)} /><span className="w-10 text-low">{unit}</span></div>
              </label>)}
            </div>
            <div className="flex justify-end mt-4"><button type="submit" disabled={simulating} className="px-4 py-2 border border-molten text-molten hover:bg-molten/10 disabled:opacity-50 text-sm">{simulating ? "Simulating…" : "Simulate"}</button></div>
          </Panel>
        </form>

        {result && <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {[{ title: "Current parameters", values: metricsFor(result.current) }, { title: "Model-predicted outcome", values: metricsFor(result.simulated) }].map((group) => <Panel key={group.title} title={group.title}>
              <div className="grid grid-cols-2 gap-3">{group.values.map((metric) => <KpiCard key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />)}</div>
            </Panel>)}
          </div>
          <Panel title="Changed parameters">
            {changed.length ? <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-sm"><thead><tr className="text-left text-[10px] uppercase text-low border-b border-line">{["Parameter", "Current", "Modified", "Change"].map((label) => <th key={label} className="py-2 pr-4 font-medium">{label}</th>)}</tr></thead><tbody>{changed.map((change) => <tr key={change.key} className="border-b border-line"><td className="py-2 pr-4">{change.parameter}</td><td className="py-2 pr-4 font-mono text-mid">{change.from}</td><td className="py-2 pr-4 font-mono text-hi">{change.to}</td><td className="py-2 pr-4 font-mono text-coolant">{Number(change.to) - Number(change.from) > 0 ? "+" : ""}{Number(change.to) - Number(change.from)}</td></tr>)}</tbody></table></div> : <EmptyState>No parameters changed from the reference batch.</EmptyState>}
          </Panel>
          <Notice>{result.note} Model: {result.simulated.model_name}.</Notice>
        </>}
      </>}
    </div>
  );
}