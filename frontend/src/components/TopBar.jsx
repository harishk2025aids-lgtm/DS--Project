import { useEffect, useState } from "react";

export default function TopBar({ title, onMenuClick, onLogout }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center justify-between px-4 sm:px-7 py-4 border-b border-line">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden text-mid hover:text-hi text-2xl leading-none"
          aria-label="Open navigation"
        >
          ☰
        </button>
        <h2 className="text-lg sm:text-xl text-hi normal-case tracking-normal font-display font-semibold">
          {title}
        </h2>
      </div>
      <div className="flex items-center gap-3 sm:gap-5">
        <span className="font-mono text-xs sm:text-sm text-low">{now.toLocaleTimeString()}</span>
        <button
          type="button"
          onClick={onLogout}
          className="border border-line-strong px-3 py-1.5 text-xs uppercase tracking-wider text-mid hover:border-molten hover:text-molten"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
