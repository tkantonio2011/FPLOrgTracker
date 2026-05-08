"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface LeagueSummary {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  status: "active" | "suspended";
  miniLeagueId: number | null;
}

export interface MembershipSummary {
  id: string;
  role: "member" | "admin";
  isActive: boolean;
  managerId: number;
}

interface LeagueContextValue {
  league: LeagueSummary;
  membership: MembershipSummary | null;
  /** True when the viewer is a Super Admin and not actually a member. */
  isViewingAsSuperAdmin: boolean;
}

const LeagueContext = createContext<LeagueContextValue | null>(null);

export function LeagueProvider({
  league,
  membership,
  isViewingAsSuperAdmin,
  children,
}: LeagueContextValue & { children: ReactNode }) {
  return (
    <LeagueContext.Provider value={{ league, membership, isViewingAsSuperAdmin }}>
      {children}
    </LeagueContext.Provider>
  );
}

export function useLeague(): LeagueContextValue {
  const ctx = useContext(LeagueContext);
  if (!ctx) {
    throw new Error(
      "useLeague() called outside a LeagueProvider — this component must be rendered inside a /l/[leagueSlug]/* route.",
    );
  }
  return ctx;
}

export function useOptionalLeague(): LeagueContextValue | null {
  return useContext(LeagueContext);
}
