import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import Dashboard from "./pages/Dashboard";
import Reports from "./pages/Reports";
import { api } from "./api";

const TITLES = {
  dashboard: "Live floor",
  reports: "History & reports",
};

export default function App() {
  const [active, setActive] = useState("dashboard");
  const [lineStatus, setLineStatus] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    api
      .getSummary()
      .then((s) => setLineStatus(s.line_status))
      .catch(() => setLineStatus({ "LINE-A": "running", "LINE-B": "running", "LINE-C": "running" }));
  }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        active={active}
        onNavigate={setActive}
        lineStatus={lineStatus}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={TITLES[active]} onMenuClick={() => setSidebarOpen(true)} />
        {active === "dashboard" ? <Dashboard /> : <Reports />}
      </div>
    </div>
  );
}
