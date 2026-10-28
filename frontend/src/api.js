const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${detail}`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  signUp: (payload) => request("/auth/signup", { method: "POST", body: JSON.stringify(payload) }),
  logIn: (payload) => request("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  getCurrentUser: () => request("/auth/me"),
  logOut: () => request("/auth/logout", { method: "POST" }),
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
  getAnalytics: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/analytics${qs ? `?${qs}` : ""}`);
  },
  getAnalyticsTrends: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/analytics/trends${qs ? `?${qs}` : ""}`);
  },
  getBatchDetail: (batchId) => request(`/batches/${encodeURIComponent(batchId)}`),
  getRootCause: (batchId) => request(`/root-cause/${encodeURIComponent(batchId)}`),
  simulate: (payload) => request("/simulate", { method: "POST", body: JSON.stringify(payload) }),
  askAssistant: (payload) => request("/ai/chat", { method: "POST", body: JSON.stringify(payload) }),
  getModelPerformance: () => request("/models/performance"),
  getModelStatus: () => request("/models/status"),
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
