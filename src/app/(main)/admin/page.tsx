"use client";

import { useState, useEffect } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface Member {
  id: string;
  managerId: number;
  displayName: string;
  teamName: string | null;
  source: string;
  isActive: boolean;
  registeredAt: string | null;
  lastLoginAt: string | null;
}

interface Org {
  id: string;
  name: string;
  miniLeagueId: number | null;
  members: Member[];
}

const LockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

// ─── PIN Gate ─────────────────────────────────────────────────────────────────
function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        onUnlock();
      } else {
        setError("Incorrect PIN. Please try again.");
        setPin("");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span className="text-slate-400"><LockIcon /></span>
            <h2 className="font-semibold text-slate-800">Admin Access</h2>
          </div>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">PIN</label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoFocus
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#37003c]/30 focus:border-[#37003c]/50 shadow-sm transition-colors hover:border-slate-300"
                placeholder="Enter admin PIN"
              />
              {error && (
                <p className="text-xs text-red-600 mt-1.5">{error}</p>
              )}
            </div>
            <Button type="submit" disabled={loading || !pin}>
              {loading ? "Verifying…" : "Unlock"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [authState, setAuthState] = useState<"loading" | "locked" | "unlocked">("loading");
  const [org, setOrg] = useState<Org | null>(null);
  const [orgName, setOrgName] = useState("");
  const [miniLeagueId, setMiniLeagueId] = useState("");
  const [newManagerId, setNewManagerId] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  // Check whether we already have a valid session
  useEffect(() => {
    fetch("/api/admin/check")
      .then((r) => r.json())
      .then((data: { authenticated: boolean; pinRequired: boolean }) => {
        setAuthState(!data.pinRequired || data.authenticated ? "unlocked" : "locked");
      })
      .catch(() => setAuthState("locked"));
  }, []);

  // Load org data once unlocked
  useEffect(() => {
    if (authState !== "unlocked") return;
    fetch("/api/org")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setOrg(data);
          setOrgName(data.name);
          setMiniLeagueId(data.miniLeagueId?.toString() ?? "");
        }
      });
  }, [authState]);

  async function handleSave() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/org/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: orgName, miniLeagueId: miniLeagueId ? parseInt(miniLeagueId) : undefined }),
      });
      if (res.status === 401) { setAuthState("locked"); return; }
      if (!res.ok) throw new Error("Setup failed");
      setStatus({ type: "success", msg: "Organisation saved successfully." });
      const orgRes = await fetch("/api/org");
      if (orgRes.ok) {
        const updated = await orgRes.json();
        setOrg(updated);
        setOrgName(updated.name ?? "");
        setMiniLeagueId(updated.miniLeagueId?.toString() ?? "");
      }
    } catch {
      setStatus({ type: "error", msg: "Failed to save organisation." });
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncLoading(true);
    setStatus(null);
    try {
      // Pass the current form's league ID directly to the sync endpoint so it
      // always uses what the admin typed, regardless of whether Save was clicked.
      const res = await fetch("/api/org/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ miniLeagueId: miniLeagueId ? parseInt(miniLeagueId) : undefined }),
      });
      if (res.status === 401) { setAuthState("locked"); return; }
      const data = await res.json() as { added: number; reactivated: number; removed: number; total: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      const parts = [];
      if (data.added > 0) parts.push(`${data.added} new`);
      if (data.reactivated > 0) parts.push(`${data.reactivated} reactivated`);
      if (data.removed > 0) parts.push(`${data.removed} removed`);
      const summary = parts.length > 0 ? parts.join(", ") : "no changes";
      setStatus({ type: "success", msg: `Sync complete — ${summary}. Total active: ${data.total}.` });
      const orgRes = await fetch("/api/org");
      if (orgRes.ok) setOrg(await orgRes.json());
      // Invalidate cached GW verdicts so landing page regenerates them after sync
      void refreshGwVerdicts();
    } catch (err: unknown) {
      setStatus({ type: "error", msg: err instanceof Error ? err.message : "Sync failed." });
    } finally {
      setSyncLoading(false);
    }
  }

  async function refreshGwVerdicts() {
    try {
      // Clear any existing cached verdicts for all gameweeks
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("gw-verdicts-")) localStorage.removeItem(key);
      }
      // Fetch current standings and regenerate
      const [gwRes, standingsRes] = await Promise.all([
        fetch("/api/gameweeks"),
        fetch("/api/standings"),
      ]);
      if (!gwRes.ok || !standingsRes.ok) return;
      const standings = await standingsRes.json() as {
        gameweekId: number;
        orgAverageGwPoints: number;
        globalAverageGwPoints: number;
        standings: { managerId: number; displayName: string; teamName: string; gameweekPoints: number; rankChange: number; chipUsed: string | null }[];
      };
      const reportRes = await fetch("/api/gw-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameweekId: standings.gameweekId,
          orgAverageGwPoints: standings.orgAverageGwPoints,
          globalAverageGwPoints: standings.globalAverageGwPoints,
          managers: standings.standings.map((e) => ({
            managerId: e.managerId,
            displayName: e.displayName,
            teamName: e.teamName,
            gameweekPoints: e.gameweekPoints,
            rankChange: e.rankChange,
            chipUsed: e.chipUsed,
          })),
        }),
      });
      if (!reportRes.ok) return;
      const report = await reportRes.json() as { verdicts?: { managerId: number; verdict: string }[] };
      if (!report.verdicts?.length) return;
      const map: Record<number, string> = {};
      for (const v of report.verdicts) map[v.managerId] = v.verdict;
      localStorage.setItem(`gw-verdicts-${standings.gameweekId}`, JSON.stringify(map));
    } catch {
      // Non-critical — landing page will regenerate on next visit
    }
  }

  async function handleAddMember() {
    if (!newManagerId) return;
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerId: parseInt(newManagerId) }),
      });
      if (res.status === 401) { setAuthState("locked"); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add member");
      setNewManagerId("");
      setStatus({ type: "success", msg: "Member added successfully." });
      const orgRes = await fetch("/api/org");
      if (orgRes.ok) setOrg(await orgRes.json());
    } catch (err: unknown) {
      setStatus({ type: "error", msg: err instanceof Error ? err.message : "Failed to add member." });
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveMember(managerId: number) {
    try {
      const res = await fetch(`/api/members/${managerId}`, { method: "DELETE" });
      if (res.status === 401) { setAuthState("locked"); return; }
      const orgRes = await fetch("/api/org");
      if (orgRes.ok) setOrg(await orgRes.json());
    } catch {
      setStatus({ type: "error", msg: "Failed to remove member." });
    }
  }

  if (authState === "loading") {
    return (
      <div className="max-w-2xl space-y-6">
        <div className="h-8 w-32 bg-slate-100 rounded-md animate-pulse" />
        <div className="h-48 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (authState === "locked") {
    return (
      <div className="max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin</h1>
          <p className="text-slate-400 text-sm mt-1">Configure your organisation and manage members.</p>
        </div>
        <PinGate onUnlock={() => setAuthState("unlocked")} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin</h1>
        <p className="text-slate-400 text-sm mt-1">Configure your organisation and manage members.</p>
      </div>

      {status && (
        <div className={`px-4 py-3 rounded-xl text-sm shadow-card ${status.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200/80" : "bg-red-50 text-red-800 border border-red-200/80"}`}>
          {status.msg}
        </div>
      )}

      {/* Org Setup */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-800">Organisation Settings</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Organisation Name</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#37003c]/30 focus:border-[#37003c]/50 shadow-sm transition-colors hover:border-slate-300"
              placeholder="e.g. Acme FPL League"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">FPL Mini-League ID</label>
            <input
              type="number"
              value={miniLeagueId}
              onChange={(e) => setMiniLeagueId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#37003c]/30 focus:border-[#37003c]/50 shadow-sm transition-colors hover:border-slate-300"
              placeholder="e.g. 12345"
            />
            <p className="text-xs text-slate-400 mt-1">Find this in your FPL league URL.</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={loading || !orgName}>
              {loading ? "Saving…" : "Save"}
            </Button>
            {miniLeagueId && (
              <Button variant="secondary" onClick={handleSync} disabled={syncLoading}>
                {syncLoading ? "Syncing…" : "Sync from League"}
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Members</h2>
            <span className="text-sm text-slate-400">{org?.members.length ?? 0} active</span>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          {/* Add manually */}
          <div className="flex gap-2">
            <input
              type="number"
              value={newManagerId}
              onChange={(e) => setNewManagerId(e.target.value)}
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#37003c]/30 focus:border-[#37003c]/50 shadow-sm transition-colors hover:border-slate-300"
              placeholder="FPL Manager ID"
            />
            <Button onClick={handleAddMember} disabled={loading || !newManagerId}>
              Add
            </Button>
          </div>

          {/* Member list */}
          <div className="divide-y divide-slate-50">
            {(org?.members ?? []).map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800">{m.displayName}</div>
                  <div className="text-xs text-slate-400">{m.teamName} · ID {m.managerId}</div>
                  <div className="text-xs mt-0.5">
                    {m.registeredAt ? (
                      <span className="text-emerald-600">
                        Registered {new Date(m.registeredAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        {m.lastLoginAt && (
                          <span className="text-slate-400">
                            {" · Last login "}
                            {new Date(m.lastLoginAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-slate-300">Not registered</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  <Badge variant={m.source === "league" ? "purple" : "info"}>
                    {m.source === "league" ? "League" : "Manual"}
                  </Badge>
                  <button
                    onClick={() => handleRemoveMember(m.managerId)}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors cursor-pointer font-medium"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {(org?.members ?? []).length === 0 && (
              <p className="text-sm text-slate-400 py-4 text-center">
                No members yet. Sync from league or add manually.
              </p>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
