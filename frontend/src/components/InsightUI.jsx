export function Panel({ title, action, children, className = "" }) {
  return (
    <section className={`panel min-w-0 ${className}`}>
      <div className="panel-header gap-3">
        <h2>{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function KpiCard({ label, value, detail, tone = "neutral" }) {
  const toneClass = {
    neutral: "text-hi",
    good: "text-good",
    warn: "text-warn",
    danger: "text-danger",
  }[tone];

  return (
    <div className="panel p-4 min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-low">{label}</p>
      <p className={`font-mono text-2xl mt-2 ${toneClass}`}>{value}</p>
      {detail && <p className="text-xs text-low mt-1">{detail}</p>}
    </div>
  );
}

export function EmptyState({ children }) {
  return <p className="text-sm text-low py-8 text-center">{children}</p>;
}

export function Notice({ children, tone = "info" }) {
  const toneClass = tone === "warn" ? "border-warn/40 text-warn" : "border-line-strong text-mid";
  return <div className={`border-l-2 ${toneClass} bg-bg2/50 px-3 py-2.5 text-xs leading-relaxed`}>{children}</div>;
}

export const controlClass = "bg-bg2 text-hi border border-line-strong rounded-sm px-2.5 py-2 text-sm focus:outline-none focus:border-coolant";

export function formatPercent(value, digits = 1) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(digits)}%` : "Not recorded";
}