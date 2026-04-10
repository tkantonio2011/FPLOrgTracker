"use client";

interface NavProps {
  orgName?: string;
  currentGw?: number;
  onMenuToggle: () => void;
}

export function Nav({ orgName = "FPL Tracker", currentGw, onMenuToggle }: NavProps) {
  return (
    <header className="bg-white border-b border-slate-200/80 px-4 py-3.5 flex items-center gap-3 sticky top-0 z-10 backdrop-blur-sm bg-white/95">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuToggle}
        className="md:hidden shrink-0 p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
        aria-label="Open menu"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" x2="20" y1="6" y2="6"/>
          <line x1="4" x2="20" y1="12" y2="12"/>
          <line x1="4" x2="20" y1="18" y2="18"/>
        </svg>
      </button>

      <h1 className="font-semibold text-slate-700 text-sm tracking-tight flex-1">{orgName}</h1>

      {currentGw && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="w-2 h-2 rounded-full bg-[#00ff87] animate-pulse" />
          <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full tabular">
            GW {currentGw}
          </span>
        </div>
      )}
    </header>
  );
}
