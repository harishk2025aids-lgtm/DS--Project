const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${detail}`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  getSummary: () => request("/dashboard/summary"),
  getTrend: (hours = 24) => request(`/dashboard/trend?hours=${hours}`),
  getAlerts: (unacknowledgedOnly = true) =>
    request(`/alerts?unacknowledged_only=${unacknowledgedOnly}`),
  acknowledgeAlert: (id) => request(`/alerts/${id}/acknowledge`, { method: "POST" }),
  predictCurrent: (payload) =>
    request("/predictions/current", { method: "POST", body: JSON.stringify(payload) }),
  getForecast: (batchCode) => request(`/predictions/forecast/${batchCode}`),
  getRecommendation: (batchCode) => request(`/predictions/${batchCode}/recommendation`),
  getBatchReport: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/reports/batches${qs ? `?${qs}` : ""}`);
  },
  getDefectBreakdown: (days = 7) => request(`/reports/defect-breakdown?days=${days}`),
};

export function connectLiveFeed(onMessage, onStatusChange) {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${window.location.host}/ws/live`);

  socket.onopen = () => onStatusChange?.("connected");
  socket.onclose = () => onStatusChange?.("disconnected");
  socket.onerror = () => onStatusChange?.("error");
  socket.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      /* ignore malformed frame */
    }
  };

  return () => socket.close();
}
