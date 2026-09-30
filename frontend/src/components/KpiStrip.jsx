function Kpi({ label, value, unit, tone, borderless }) {
  const toneClass =
    tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-hi";
  return (
    <div className={`flex-1 min-w-[140px] px-4 sm:px-5 py-4 ${borderless ? "" : "sm:border-r border-line"}`}>
      <p className="text-[11px] uppercase tracking-wider text-low mb-2">{label}</p>
      <p className={`font-mono text-2xl sm:text-3xl font-medium ${toneClass}`}>
        {value}
        {unit && <span className="text-sm text-mid ml-1">{unit}</span>}
      </p>
    </div>
  );
}

export default function KpiStrip({ summary }) {
  if (!summary) return null;

  const defectTone = summary.defect_rate_pct >= 15 ? "danger" : summary.defect_rate_pct >= 8 ? "warn" : "good";

  return (
    <div className="panel flex flex-wrap overflow-hidden">
      <Kpi label="Batches / 24h" value={summary.total_batches_today} />
      <Kpi label="Avg quality score" value={summary.avg_quality_score} unit="/ 100" />
      <Kpi label="Defect rate" value={summary.defect_rate_pct} unit="%" tone={defectTone} />
      <Kpi label="Scrap reduction" value={summary.scrap_reduction_pct} unit="%" tone="good" />
      <Kpi
        label="Active alerts"
        value={summary.active_alerts}
        tone={summary.active_alerts > 0 ? "danger" : "good"}
        borderless
      />
    </div>
  );
}
