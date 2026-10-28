import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import { EmptyState, KpiCard, Notice, Panel, controlClass, formatPercent } from "../components/InsightUI";

const CHART_GRID = "#2B333D";
const AXIS = "#66707C";
const TOOLTIP_STYLE = { background: "#1A1F26", border: "1px solid #3A4450", borderRadius: 3, color: "#ECEEF1" };

export default function Analytics() {
  const [filters, setFilters] = useState({ days: "30", line_id: "", grade: "", defect_type: "" });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getAnalytics(filters)
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [filters]);

  function updateFilter(event) {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  }

  const kpis = data?.kpis;
  const trends = data?.trends || [];
  const hasData = trends.length > 0;
  const pctAxis = (value) => `${value}%`;

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-low">Production intelligence</p>
          <h1 className="text-xl mt-1">Quality analytics</h1>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full xl:w-auto">
          <label className="flex flex-col gap-1 text-[10px] uppercase text-low">
            Date range
            <select name="days" value={filters.days} onChange={updateFilter} className={controlClass}>
              <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] uppercase text-low">
            Production line
            <select name="line_id" value={filters.line_id} onChange={updateFilter} className={controlClass}>
              <option value="">All lines</option>{(data?.filters.lines || []).map((line) => <option key={line}>{line}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] uppercase text-low">
            Steel grade
            <select name="grade" value={filters.grade} onChange={updateFilter} className={controlClass}>
              <option value="">All grades</option>{(data?.filters.grades || []).map((grade) => <option key={grade}>{grade}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] uppercase text-low">
            Defect type
            <select name="defect_type" value={filters.defect_type} onChange={updateFilter} className={controlClass}>
              <option value="">All types</option>{(data?.filters.defect_types || []).map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
        </div>
      </div>

      {error && <Notice tone="warn">Analytics could not load: {error}</Notice>}
      {loading && !data && <Notice>Loading production records…</Notice>}

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <KpiCard label="Production batches" value={kpis?.total_batches ?? "—"} detail={`Last ${filters.days} days`} />
        <KpiCard label="Average quality" value={kpis ? `${kpis.average_quality_score.toFixed(1)} / 100` : "—"} />
        <KpiCard label="Predicted defect rate" value={kpis ? formatPercent(kpis.predicted_defect_rate_pct) : "—"} tone="danger" detail="Model threshold ≥ 50%" />
        <KpiCard label="High scrap-risk proxy" value={kpis ? formatPercent(kpis.high_scrap_risk_rate_pct) : "—"} tone="warn" detail="Model threshold ≥ 85%" />
        <KpiCard label="Estimated yield" value={kpis ? formatPercent(kpis.estimated_yield_pct) : "—"} tone="good" detail="Inverse of predicted defect rate" />
      </div>

      {data?.data_notes && <Notice tone="warn">{data.data_notes.defects} {data.data_notes.scrap} {data.data_notes.yield}</Notice>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Panel title="Quality trend · score / 100">
          {hasData ? <div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={trends}>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
            <YAxis domain={[0, 100]} tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Line type="monotone" dataKey="avg_quality_score" name="Average quality" stroke="#5FBE87" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart></ResponsiveContainer></div> : <EmptyState>{loading ? "Loading…" : "No batch data matches these filters."}</EmptyState>}
        </Panel>

        <Panel title="Predicted defect and scrap-risk trends">
          {hasData ? <div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={trends}>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
            <YAxis domain={[0, 100]} tickFormatter={pctAxis} tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [`${value}%`]} />
            <Line type="monotone" dataKey="predicted_defect_rate_pct" name="Predicted defects" stroke="#E5484D" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="high_scrap_risk_rate_pct" name="High scrap-risk proxy" stroke="#F2B84B" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart></ResponsiveContainer></div> : <EmptyState>{loading ? "Loading…" : "No trend data available."}</EmptyState>}
        </Panel>

        <Panel title="Predicted defects by production line">
          {data?.defects_by_line?.length ? <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.defects_by_line} margin={{ left: 0, right: 12 }}>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="line" tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
            <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="predicted_defects" name="Predicted defects" fill="#FF6A39" maxBarSize={42} radius={[2, 2, 0, 0]} />
          </BarChart></ResponsiveContainer></div> : <EmptyState>No line data available.</EmptyState>}
        </Panel>

        <Panel title="Predicted defects by steel grade">
          {data?.defects_by_grade?.length ? <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.defects_by_grade} margin={{ left: 0, right: 12 }}>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="grade" tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
            <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="predicted_defects" name="Predicted defects" fill="#FF6A39" maxBarSize={42} radius={[2, 2, 0, 0]} />
          </BarChart></ResponsiveContainer></div> : <EmptyState>No grade data available.</EmptyState>}
        </Panel>

        <Panel title="Production volume by day">
          {hasData ? <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={trends}>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
            <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="production_volume" name="Batches" fill="#4FA3D1" maxBarSize={34} radius={[2, 2, 0, 0]} />
          </BarChart></ResponsiveContainer></div> : <EmptyState>No production volume recorded.</EmptyState>}
        </Panel>

        <Panel title="Top predicted defect types">
          {data?.top_defect_types?.length ? <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.top_defect_types} layout="vertical" margin={{ left: 8, right: 12 }}>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={{ stroke: CHART_GRID }} />
            <YAxis type="category" dataKey="defect_type" width={110} tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="count" name="Predictions" fill="#F2B84B" maxBarSize={22} radius={[0, 2, 2, 0]} />
          </BarChart></ResponsiveContainer></div> : <EmptyState>No predicted defect types recorded.</EmptyState>}
        </Panel>
      </div>
    </div>
  );
}