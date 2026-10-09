import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import Dashboard from "./pages/Dashboard";
import Reports from "./pages/Reports";
import Analytics from "./pages/Analytics";
import RootCause from "./pages/RootCause";
import ProcessSimulator from "./pages/ProcessSimulator";
import Assistant from "./pages/Assistant";
import ModelPerformance from "./pages/ModelPerformance";
import Auth from "./pages/Auth";
import { api } from "./api";

const TITLES = {
  dashboard: "Live floor",
  reports: "History & reports",
  analytics: "Analytics",
  rootCause: "Root cause",
  simulator: "Process simulator",
  assistant: "AI assistant",
  models: "Model performance",
};

export default function App() {
  const [active, setActive] = useState("dashboard");
  const [lineStatus, setLineStatus] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  function navigateToBatch(page, batchId) {
    setSelectedBatchId(batchId);
    setActive(page);
  }

  useEffect(() => {
    api.getCurrentUser()
      .then(setAuthUser)
      .catch(() => setAuthUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!authUser) return;
    api
      .getSummary()
      .then((s) => setLineStatus(s.line_status))
      .catch(() => setLineStatus({ "LINE-A": "running", "LINE-B": "running", "LINE-C": "running" }));
  }, [authUser]);

  if (!authChecked) {
    return <div className="min-h-screen grid place-items-center text-sm text-mid">Checking session...</div>;
  }

  if (!authUser) {
    return <Auth onAuthenticated={setAuthUser} />;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        active={active}
        onNavigate={setActive}
        lineStatus={lineStatus}
        userEmail={authUser.email}
        onLogout={async () => {
          await api.logOut().catch(() => {});
          setAuthUser(null);
          setActive("dashboard");
        }}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={TITLES[active]} onMenuClick={() => setSidebarOpen(true)} />
        {active === "dashboard" && <Dashboard />}
        {active === "reports" && <Reports onNavigate={navigateToBatch} />}
        {active === "analytics" && <Analytics />}
        {active === "rootCause" && <RootCause initialBatchId={selectedBatchId} />}
        {active === "simulator" && <ProcessSimulator initialBatchId={selectedBatchId} />}
        {active === "assistant" && <Assistant initialBatchId={selectedBatchId} />}
        {active === "models" && <ModelPerformance />}
      </div>
    </div>
  );
}
