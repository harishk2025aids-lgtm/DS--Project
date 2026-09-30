import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

function riskTone(prob) {
  if (prob >= 0.65) return "#E5484D";
  if (prob >= 0.4) return "#F2B84B";
  return "#5FBE87";
}

export default function LiveQualityPanel({ latest, history, connectionStatus }) {
  const prob = latest?.prediction?.defect_probability ?? 0;
  const quality = latest?.prediction?.quality_score ?? 100;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Live defect risk</h2>
        <span className={`pill ${connectionStatus === "connected" ? "good" : "danger"}`}>
          <span className="dot" />
          {connectionStatus === "connected" ? "streaming" : "offline"}
        </span>
      </div>
      <div className="panel-body flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-44 shrink-0 flex flex-row md:flex-col justify-between md:justify-center gap-4 md:gap-5">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-low">Defect probability</p>
            <p className="font-mono text-3xl sm:text-[42px] font-medium" style={{ color: riskTone(prob) }}>
              {(prob * 100).toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-low">Quality score</p>
            <p className="font-mono text-xl sm:text-2xl text-hi">{quality.toFixed(1)} / 100</p>
          </div>
          {latest && (
            <p className="hidden md:block text-xs text-mid">
              Line <span className="font-mono">{latest.line_id}</span> · model{" "}
              <span className="font-mono">{latest.prediction.model_name}</span>
            </p>
          )}
        </div>

        <div className="flex-1 h-52 sm:h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history}>
              <defs>
                <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF6A39" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#FF6A39" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#2B333D" vertical={false} />
              <XAxis dataKey="t" tick={{ fontSize: 11, fill: "#66707C" }} axisLine={{ stroke: "#2B333D" }} tickLine={false} />
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
                labelStyle={{ color: "#9FAAB6" }}
                formatter={(v) => [`${(v * 100).toFixed(1)}%`, "defect risk"]}
              />
              <Area type="monotone" dataKey="prob" stroke="#FF6A39" strokeWidth={2} fill="url(#riskFill)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
