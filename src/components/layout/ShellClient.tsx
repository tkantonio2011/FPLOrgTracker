"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Nav } from "./Nav";

interface ShellClientProps {
  children: React.ReactNode;
  version: string;
  orgName?: string;
  currentGw?: number;
}

export function ShellClient({ children, version, orgName, currentGw }: ShellClientProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on navigation
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  return (
    <>
      {/* Mobile backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Sidebar — drawer on mobile, static on desktop */}
      <div className={`
        fixed inset-y-0 left-0 z-50 transition-transform duration-250 ease-in-out
        md:static md:translate-x-0 md:z-auto md:transition-none
        ${drawerOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <Sidebar version={version} onClose={() => setDrawerOpen(false)} />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Nav
          orgName={orgName}
          currentGw={currentGw}
          onMenuToggle={() => setDrawerOpen((o) => !o)}
        />
        <main className="flex-1 p-4 md:p-6 overflow-y-auto animate-fade-in">
          {children}
        </main>
      </div>
    </>
  );
}
