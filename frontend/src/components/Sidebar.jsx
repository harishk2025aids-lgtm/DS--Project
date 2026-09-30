const NAV_ITEMS = [
  { key: "dashboard", label: "Live floor" },
  { key: "reports", label: "History" },
];

export default function Sidebar({ active, onNavigate, lineStatus, open, onClose }) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          w-52 shrink-0 flex flex-col gap-7 p-4
          bg-bg1 border-r border-line
          transform transition-transform duration-200 ease-out
          ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0
        `}
      >
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl">Forgesight</h1>
            <p className="font-mono text-[11px] text-low mt-0.5">quality control</p>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-mid hover:text-hi text-xl leading-none"
            aria-label="Close navigation"
          >
            ×
          </button>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => {
                onNavigate(item.key);
                onClose?.();
              }}
              className={`text-left px-2.5 py-2 rounded-sm font-display text-base tracking-wide transition-colors
                ${active === item.key ? "bg-bg2 text-hi" : "text-mid hover:text-hi"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto">
          <p className="text-[11px] uppercase tracking-wider text-low mb-2.5">Line status</p>
          <div className="flex flex-col gap-2">
            {Object.entries(lineStatus || {}).map(([line, status]) => (
              <div key={line} className="flex items-center gap-2 font-mono text-xs">
                <span className={`dot ${status === "running" ? "text-good" : "text-danger"}`} />
                <span className="text-mid">{line}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
