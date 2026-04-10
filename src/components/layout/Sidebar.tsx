"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const TrophyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
    <path d="M4 22h16"/>
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
  </svg>
);

const CalendarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
    <line x1="16" x2="16" y1="2" y2="6"/>
    <line x1="8" x2="8" y1="2" y2="6"/>
    <line x1="3" x2="21" y1="10" y2="10"/>
  </svg>
);

const UsersIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const SettingsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const HomeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const ZapIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);

const ArrowsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m16 3 4 4-4 4"/>
    <path d="M20 7H4"/>
    <path d="m8 21-4-4 4-4"/>
    <path d="M4 17h16"/>
  </svg>
);

const BenchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9v6"/><path d="M21 9v6"/><path d="M3 12h18"/>
    <path d="M7 5v14"/><path d="M17 5v14"/>
  </svg>
);

const StarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

const AlertIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>
    <path d="M12 9v4"/><path d="M12 17h.01"/>
  </svg>
);

const HeartPulseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
    <path d="M3.22 12H9.5l.5-1 2 4 .5-1H20.5"/>
  </svg>
);

const BarChartIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/>
    <line x1="6" x2="6" y1="20" y2="14"/><line x1="2" x2="22" y1="20" y2="20"/>
  </svg>
);

const FlameIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
  </svg>
);

const DiceIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
    <path d="M16 8h.01"/><path d="M8 8h.01"/><path d="M8 16h.01"/>
    <path d="M16 16h.01"/><path d="M12 12h.01"/>
  </svg>
);

const FrownIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M16 16s-1.5-2-4-2-4 2-4 2"/>
    <line x1="9" x2="9.01" y1="9" y2="9"/>
    <line x1="15" x2="15.01" y1="9" y2="9"/>
  </svg>
);

const ReceiptIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/>
    <path d="M16 8H8"/><path d="M16 12H8"/><path d="M12 16H8"/>
  </svg>
);

const SwordsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/>
    <line x1="13" x2="19" y1="19" y2="13"/>
    <line x1="16" x2="20" y1="16" y2="20"/>
    <line x1="19" x2="21" y1="21" y2="19"/>
    <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/>
    <line x1="5" x2="9" y1="14" y2="18"/>
    <line x1="7" x2="3" y1="17" y2="21"/>
    <line x1="3" x2="5" y1="19" y2="21"/>
  </svg>
);

const ArmBandIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <path d="M9 12h6"/>
    <path d="M12 9v6"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
}

interface NavGroup {
  label?: string; // undefined = no section header
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    items: [
      { href: "/", label: "Home", icon: <HomeIcon />, exact: true },
    ],
  },
  {
    label: "Gameweek",
    items: [
      { href: "/standings",  label: "Standings",   icon: <TrophyIcon /> },
      { href: "/live",       label: "Live Points", icon: <ZapIcon /> },
      { href: "/transfers",  label: "Transfers",   icon: <ArrowsIcon /> },
    ],
  },
  {
    label: "Season",
    items: [
      { href: "/form",           label: "Form Table",   icon: <FlameIcon /> },
      { href: "/season-stats",   label: "Season Stats", icon: <BarChartIcon /> },
      { href: "/bench",          label: "Bench Waste",  icon: <BenchIcon /> },
      { href: "/captain-history",label: "Captains",     icon: <StarIcon /> },
      { href: "/h2h",            label: "H2H Battle",   icon: <SwordsIcon /> },
      { href: "/regret",         label: "Transfer Regret", icon: <ReceiptIcon /> },
      { href: "/agony",          label: "Agony Index",     icon: <FrownIcon /> },
      { href: "/luck",           label: "Luck Ranking",    icon: <DiceIcon /> },
      { href: "/captain-whatif", label: "Captain What-If", icon: <ArmBandIcon /> },
    ],
  },
  {
    label: "Scout",
    items: [
      { href: "/fixtures",      label: "Fixtures",      icon: <CalendarIcon /> },
      { href: "/ownership",     label: "Ownership",     icon: <UsersIcon /> },
      { href: "/differentials", label: "Differentials", icon: <AlertIcon /> },
      { href: "/player-status", label: "Injuries",      icon: <HeartPulseIcon /> },
    ],
  },
  {
    items: [
      { href: "/admin", label: "Admin", icon: <SettingsIcon /> },
    ],
  },
];

export function Sidebar({ version, onClose }: { version: string; onClose?: () => void }) {
  const pathname = usePathname();
  const router   = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  // Accordion state — null = all collapsed; string = that group is open
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // Auto-open the group that contains the active page on load and on navigation
  useEffect(() => {
    for (const group of navGroups) {
      if (!group.label) continue;
      const hasActive = group.items.some((item) =>
        item.exact ? pathname === item.href : pathname?.startsWith(item.href)
      );
      if (hasActive) { setOpenGroup(group.label); return; }
    }
    // Active page is Home or Admin — collapse everything
    setOpenGroup(null);
  }, [pathname]);

  const toggleGroup = (label: string) =>
    setOpenGroup((prev) => (prev === label ? null : label));

  return (
    <aside className="w-56 shrink-0 fpl-gradient text-white flex flex-col h-full shadow-[inset_-1px_0_0_rgb(255_255_255/0.06)]">
      {/* Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#00ff87] flex items-center justify-center shrink-0">
            <span className="text-[#37003c] font-black text-sm leading-none">FPL</span>
          </div>
          <div className="flex-1">
            <div className="text-white font-bold text-sm leading-tight">Organisation</div>
            <div className="text-white/50 text-xs">Tracker</div>
          </div>
          {/* Close button — mobile only */}
          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden text-white/50 hover:text-white transition-colors p-1"
              aria-label="Close menu"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
        {navGroups.map((group, gi) => {
          const isCollapsed = group.label ? openGroup !== group.label : false;
          // Safety net: always show items for the active page even mid-transition
          const hasActive = group.items.some((item) =>
            item.exact ? pathname === item.href : pathname?.startsWith(item.href)
          );

          return (
            <div key={gi} className="space-y-0.5">
              {group.label && (
                <button
                  onClick={() => toggleGroup(group.label!)}
                  className="w-full flex items-center justify-between px-3 pt-1 pb-0.5 group"
                  aria-expanded={!isCollapsed}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-white/25 group-hover:text-white/40 transition-colors select-none">
                    {group.label}
                  </span>
                  <svg
                    width="10" height="10" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round"
                    className={`text-white/20 group-hover:text-white/40 transition-all duration-200 ${
                      isCollapsed ? "-rotate-90" : ""
                    }`}
                  >
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </button>
              )}

              {(!isCollapsed || hasActive) && group.items.map((item) => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname?.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
                      isActive
                        ? "bg-white/15 text-[#00ff87] shadow-[inset_0_1px_0_rgb(255_255_255/0.1)]"
                        : "text-white/60 hover:bg-white/8 hover:text-white/90"
                    }`}
                  >
                    <span className={`shrink-0 transition-colors ${isActive ? "text-[#00ff87]" : "text-white/40"}`}>
                      {item.icon}
                    </span>
                    {item.label}
                    {isActive && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#00ff87]" />
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-white/10 space-y-2">
        <p className="text-white/30 text-xs">FPL 2025/26</p>
        <Link
          href="/changelog"
          className="text-white/30 hover:text-white/60 text-xs transition-colors duration-150 flex items-center justify-between"
        >
          <span>Release notes</span>
          <span className="tabular-nums">v{version}</span>
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 text-white/30 hover:text-red-400 text-xs transition-colors duration-150 pt-1"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  );
}
