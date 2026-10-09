import { useEffect, useState } from "react";
import { api } from "../api";

export default function Reports({ onNavigate }) {
  const [rows, setRows] = useState([]);
  const [days, setDays] = useState(7);
  const [error, setError] = useState(null);
  const [selectedCode, setSelectedCode] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getBatchReport({ days })
      .then((data) => !cancelled && setRows(data))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [days]);

  async function openBatch(batchCode) {
    setSelectedCode(batchCode);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      setDetail(await api.getBatchDetail(batchCode));
    } catch (err) {
      setDetailError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeBatch() {
    setSelectedCode(null);
    setDetail(null);
  }

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4">
      <div className="panel">
        <div className="panel-header">
          <h2>Batch history</h2>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-bg2 text-hi border border-line-strong rounded-sm px-2 py-1 text-xs"
          >
            <option value={1}>Last 24h</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          {error && <p className="p-4 text-danger text-sm">{error}</p>}
          {!error && rows.length === 0 && (
            <p className="p-4 text-low text-sm">
              No predictions logged yet for this window. Data appears here once batches flow through the live feed.
            </p>
          )}
          {rows.length > 0 && (
            <table className="w-full border-collapse text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-line text-left">
                  {["Batch", "Line", "Grade", "Defect prob.", "Quality", "Defect type", "Timestamp"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-low uppercase text-[11px] tracking-wide font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const probColor =
                    r.defect_probability >= 0.65 ? "text-danger" : r.defect_probability >= 0.4 ? "text-warn" : "text-good";
                  return (
                    <tr
                      key={`${r.batch_code}-${r.created_at}`}
                      className="border-b border-line cursor-pointer hover:bg-bg2/70 focus-visible:outline focus-visible:outline-coolant"
                      onClick={() => openBatch(r.batch_code)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openBatch(r.batch_code);
                        }
                      }}
                      tabIndex={0}
                      aria-label={`Open details for batch ${r.batch_code}`}
                    >
                      <td className="font-mono px-4 py-2.5">{r.batch_code}</td>
                      <td className="px-4 py-2.5 text-mid">{r.line_id}</td>
                      <td className="px-4 py-2.5 text-mid">{r.grade}</td>
                      <td className={`font-mono px-4 py-2.5 ${probColor}`}>{(r.defect_probability * 100).toFixed(1)}%</td>
                      <td className="font-mono px-4 py-2.5">{r.quality_score.toFixed(1)}</td>
                      <td className="px-4 py-2.5 text-mid">{r.predicted_defect_type || "none"}</td>
                      <td className="font-mono px-4 py-2.5 text-low text-xs">{new Date(r.created_at).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedCode && <div className="fixed inset-0 z-50 bg-black/70 p-3 sm:p-6 flex items-center justify-center" onMouseDown={(event) => event.target === event.currentTarget && closeBatch()}>
        <section className="panel w-full max-w-5xl max-h-[92vh] overflow-y-auto shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="batch-detail-title">
          <div className="panel-header sticky top-0 bg-bg1 z-10">
            <div><p className="text-[10px] uppercase tracking-wider text-low">Production batch detail</p><h2 id="batch-detail-title" className="mt-1 normal-case text-lg text-hi">{detail?.batch_code || selectedCode}</h2></div>
            <button onClick={closeBatch} className="text-mid hover:text-hi text-xl" aria-label="Close batch details">×</button>
          </div>
          {detailLoading && <p className="p-5 text-sm text-low">Loading batch data…</p>}
          {detailError && <p className="p-5 text-sm text-danger">Could not load batch details: {detailError}</p>}
          {detail && <div className="p-4 sm:p-5 flex flex-col gap-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[["Line", detail.line_id], ["Steel grade", detail.grade], ["Timestamp", detail.timestamp ? new Date(detail.timestamp).toLocaleString() : "Not recorded"], ["Model", detail.prediction.model_name || "Not recorded"]].map(([label, value]) => <div key={label} className="border border-line bg-bg2/40 p-3 min-w-0"><p className="text-[10px] uppercase text-low">{label}</p><p className="mt-1 text-sm text-hi break-words">{value}</p></div>)}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[["Quality score", `${Number(detail.prediction.quality_score).toFixed(1)} / 100`], ["Defect probability", `${(Number(detail.prediction.defect_probability) * 100).toFixed(1)}%`], ["Predicted defect", detail.prediction.predicted_defect_type || "Not classified"], ["Model version", detail.prediction.model_version || "Not recorded"]].map(([label, value]) => <div key={label} className="border border-line p-3 min-w-0"><p className="text-[10px] uppercase text-low">{label}</p><p className="mt-1 font-mono text-sm text-hi break-words">{value}</p></div>)}
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <div className="border border-line p-3"><h3 className="text-xs uppercase text-mid mb-3">Input parameters</h3><dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">{Object.entries(detail.parameters || {}).map(([key, value]) => <div key={key} className="flex justify-between gap-2 border-b border-line py-1"><dt className="text-low">{key.replaceAll("_", " ")}</dt><dd className="font-mono text-mid">{value ?? "—"}</dd></div>)}</dl></div>
              <div className="flex flex-col gap-4">
                <div className="border border-line p-3"><h3 className="text-xs uppercase text-mid mb-2">Root cause attribution</h3><p className="text-sm text-hi">{detail.root_cause.primary_cause?.label || "No feature attribution stored"}</p><p className="text-xs text-low mt-2">{detail.root_cause.explanation}</p><p className="text-[10px] uppercase text-low mt-2">Source: {detail.root_cause.attribution_source.replaceAll("_", " ")}</p></div>
                <div className="border border-line p-3"><h3 className="text-xs uppercase text-mid mb-2">AI recommendation</h3>{detail.recommendation ? <><p className="text-sm leading-relaxed text-mid">{detail.recommendation.explanation}</p>{detail.recommendation.recommended_actions?.map((action, index) => <p key={`${action.parameter}-${index}`} className="text-xs text-low mt-2">{action.parameter}: {action.change}</p>)}</> : <p className="text-sm text-low">No recommendation is stored for this prediction.</p>}</div>
              </div>
            </div>
            <div className="border border-line p-3"><h3 className="text-xs uppercase text-mid mb-2">Historical comparison · same line and grade, 30 days</h3><p className="text-xs text-mid">{detail.historical_comparison.comparable_predictions} comparable predictions · average quality {detail.historical_comparison.average_quality_score ?? "not available"} · average defect probability {detail.historical_comparison.average_defect_probability == null ? "not available" : `${(detail.historical_comparison.average_defect_probability * 100).toFixed(1)}%`}</p></div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button onClick={() => onNavigate?.("rootCause", detail.batch_code)} className="px-3 py-2 border border-line-strong text-sm text-mid hover:text-hi">View Root Cause</button>
              <button onClick={() => onNavigate?.("simulator", detail.batch_code)} className="px-3 py-2 border border-line-strong text-sm text-mid hover:text-hi">Run What-If Simulation</button>
              <button onClick={() => onNavigate?.("assistant", detail.batch_code)} className="px-3 py-2 border border-molten text-molten text-sm hover:bg-molten/10">Ask AI About This Batch</button>
            </div>
          </div>}
        </section>
      </div>}
    </div>
  );
}
