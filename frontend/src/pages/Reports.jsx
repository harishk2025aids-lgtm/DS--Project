import { useEffect, useState } from "react";
import { api } from "../api";

export default function Reports() {
  const [rows, setRows] = useState([]);
  const [days, setDays] = useState(7);
  const [error, setError] = useState(null);

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
                    <tr key={`${r.batch_code}-${r.created_at}`} className="border-b border-line">
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
    </div>
  );
}
