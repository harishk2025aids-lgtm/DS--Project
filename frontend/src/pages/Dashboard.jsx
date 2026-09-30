import { useEffect, useRef, useState } from "react";
import { api, connectLiveFeed } from "../api";
import KpiStrip from "../components/KpiStrip";
import LiveQualityPanel from "../components/LiveQualityPanel";
import ForecastPanel from "../components/ForecastPanel";
import AlertFeed from "../components/AlertFeed";
import RecommendationPanel from "../components/RecommendationPanel";

const HISTORY_LIMIT = 40;

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [forecast, setForecast] = useState([]);
  const [recommendation, setRecommendation] = useState(null);
  const [recLoading, setRecLoading] = useState(false);
  const tickRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function loadBaseline() {
      try {
        const [s, a] = await Promise.all([api.getSummary(), api.getAlerts(true)]);
        if (!cancelled) {
          setSummary(s);
          setAlerts(a);
        }
      } catch {
        // Backend not reachable yet -- dashboard still renders its shell.
      }
    }

    loadBaseline();
    const poll = setInterval(loadBaseline, 15000);

    const disconnect = connectLiveFeed(
      (msg) => {
        if (msg.type !== "tick") return;
        tickRef.current += 1;
        setLatest(msg);
        setHistory((prev) => {
          const next = [...prev, { t: tickRef.current, prob: msg.prediction.defect_probability }];
          return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
        });
      },
      setConnectionStatus
    );

    return () => {
      cancelled = true;
      clearInterval(poll);
      disconnect();
    };
  }, []);

  async function handleAcknowledge(id) {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    try {
      await api.acknowledgeAlert(id);
    } catch {
      /* optimistic UI already updated; next poll will resync */
    }
  }

  async function handleExplain() {
    if (!latest) return;
    setRecLoading(true);
    try {
      const payload = { batch_code: `LIVE-${latest.line_id}`, line_id: latest.line_id, grade: "DP600", ...latest.parameters };
      await api.predictCurrent(payload);
      const rec = await api.getRecommendation(payload.batch_code);
      setRecommendation(rec);
      const fc = await api.getForecast(payload.batch_code);
      setForecast(fc.points);
    } catch (err) {
      setRecommendation({
        explanation: `Could not reach the recommendation service: ${err.message}`,
        root_cause: null,
        recommended_actions: [],
      });
    } finally {
      setRecLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <KpiStrip summary={summary} />

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">
        <div className="flex flex-col gap-5 min-w-0">
          <LiveQualityPanel latest={latest} history={history} connectionStatus={connectionStatus} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <ForecastPanel forecast={forecast} batchCode={latest ? `LIVE-${latest.line_id}` : null} />
            <RecommendationPanel
              recommendation={recommendation}
              loading={recLoading}
              onRequest={handleExplain}
              batchCode={latest ? `LIVE-${latest.line_id}` : null}
            />
          </div>
        </div>
        <AlertFeed alerts={alerts} onAcknowledge={handleAcknowledge} />
      </div>
    </div>
  );
}
