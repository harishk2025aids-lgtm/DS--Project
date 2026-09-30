export default function AlertFeed({ alerts, onAcknowledge }) {
  return (
    <div className="panel flex flex-col h-full max-h-[420px] lg:max-h-none">
      <div className="panel-header">
        <h2>Alerts</h2>
        <span className="font-mono text-xs text-low">{alerts.length}</span>
      </div>
      <div className="overflow-y-auto flex-1">
        {alerts.length === 0 && (
          <p className="p-4 text-sm text-low">No open alerts. Line is running clean.</p>
        )}
        {alerts.map((alert) => (
          <div key={alert.id} className="px-4 py-3 border-b border-line flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className={`dot ${alert.severity === "critical" ? "text-danger" : "text-warn"}`} />
              <span className="font-mono text-[11px] text-low">{alert.batch_code}</span>
            </div>
            <p className="text-sm text-hi leading-relaxed">{alert.message}</p>
            <button
              onClick={() => onAcknowledge(alert.id)}
              className="self-start border border-line-strong text-mid text-xs rounded-sm px-2.5 py-1 hover:text-hi hover:border-mid transition-colors"
            >
              Acknowledge
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
