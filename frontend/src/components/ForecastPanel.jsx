import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function ForecastPanel({ forecast, batchCode }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Forecast (LSTM)</h2>
        <span className="font-mono text-xs text-low">{batchCode || "—"}</span>
      </div>
      <div className="panel-body h-48 sm:h-52">
        {forecast?.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={forecast}>
              <CartesianGrid stroke="#2B333D" vertical={false} />
              <XAxis
                dataKey="minutes_ahead"
                tickFormatter={(v) => `+${v}m`}
                tick={{ fontSize: 11, fill: "#66707C" }}
                axisLine={{ stroke: "#2B333D" }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 1]}
                tickFormatter={(v) => `${Math.round(v * 100)}%`}
                tick={{ fontSize: 11, fill: "#66707C" }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{ background: "#1A1F26", border: "1px solid #2B333D", fontSize: 12 }}
                labelFormatter={(v) => `+${v} min`}
                formatter={(v) => [`${(v * 100).toFixed(1)}%`, "defect risk"]}
              />
              <Line type="monotone" dataKey="defect_probability" stroke="#4FA3D1" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-low text-sm">Select a batch to see its forward-looking risk curve.</p>
        )}
      </div>
    </div>
  );
}
