"use client";

import { useState, type ReactNode } from "react";
import { ManualTOC } from "./ManualTOC";
import { ManualSearch } from "./ManualSearch";
import type { ManualManifest } from "@/lib/manual/types";

interface ManualLayoutProps {
  manifest: ManualManifest;
  children: ReactNode;
}

/**
 * Two-column shell for the manual.
 *  - Desktop: left column = search + TOC; right column = topic body.
 *  - Mobile: TOC collapses behind a "Topics" button at the top of the page,
 *    revealing a drawer overlay when toggled.
 */
export function ManualLayout({ manifest, children }: ManualLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Mobile toggle */}
      <div className="md:hidden flex items-center justify-between">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
          Topics
        </button>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/30"
          onClick={() => setDrawerOpen(false)}
        >
          <aside
            className="absolute inset-y-0 left-0 w-72 bg-white p-4 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-900">User Manual</h2>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close topics"
                className="text-slate-500 hover:text-slate-700 p-1"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ManualSearch manifest={manifest} />
            <div className="mt-4">
              <ManualTOC manifest={manifest} />
            </div>
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:block w-64 shrink-0">
        <ManualSearch manifest={manifest} />
        <div className="mt-6">
          <ManualTOC manifest={manifest} />
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
