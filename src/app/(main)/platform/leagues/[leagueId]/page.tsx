"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface MemberRow {
  id: string;
  managerId: number;
  displayName: string | null;
  teamName: string | null;
  role: "member" | "admin";
  source: "league" | "manual" | "invitation";
  isActive: boolean;
  email: string | null;
  hasUserAccount: boolean;
  addedAt: string;
}

interface AuditRow {
  id: string;
  action: string;
  actor: { kind: "user" | "migration" | "system"; userAccountId?: string; email?: string };
  targetKind: string;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

interface LeagueDetail {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  miniLeagueId: number | null;
  status: "active" | "suspended";
  memberCount: number;
  adminCount: number;
  createdAt: string;
  suspendedAt: string | null;
  suspensionReason: string | null;
  digestPrompt: string | null;
  members: MemberRow[];
  recentAudit: AuditRow[];
}

interface ApiBody<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export default function PlatformLeagueDetailPage({
  params,
}: {
  params: { leagueId: string };
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const leagueId = params.leagueId;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["platform-league", leagueId],
    queryFn: async (): Promise<LeagueDetail> => {
      const res = await fetch(`/api/platform/leagues/${leagueId}`);
      const body = (await res.json()) as ApiBody<LeagueDetail>;
      if (!res.ok || !body.success || !body.data) {
        throw new Error(body.error ?? "Failed to load league");
      }
      return body.data;
    },
    staleTime: 5_000,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["platform-league", leagueId] });
    qc.invalidateQueries({ queryKey: ["platform-leagues"] });
  }

  if (isLoading) return <div className="text-sm text-slate-500">Loading…</div>;
  if (isError || !data) {
    return (
      <div className="space-y-3">
        <Link href="/platform" className="text-xs text-slate-500 hover:text-slate-900">
          ← Back to leagues
        </Link>
        <div className="bg-red-50 border border-red-200/80 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error instanceof Error ? error.message : "Unable to load league"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/platform" className="text-xs text-slate-500 hover:text-slate-900">
          ← Back to leagues
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{data.name}</h1>
            <p className="text-sm text-slate-500 mt-1 font-mono">/{data.slug}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={data.status} />
            <Link href={`/l/${data.slug}/admin/settings`}>
              <Button variant="secondary" size="sm">
                Manage as admin →
              </Button>
            </Link>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          {data.memberCount} member{data.memberCount === 1 ? "" : "s"} · {data.adminCount} admin
          {data.adminCount === 1 ? "" : "s"} · created {new Date(data.createdAt).toLocaleDateString()}
        </p>
      </header>

      <SettingsOverview league={data} />

      <SuspensionCard league={data} onChanged={invalidate} />

      <MembersCard
        members={data.members}
        onChanged={invalidate}
      />

      <RecentAuditCard events={data.recentAudit} />

      <DangerZone
        league={data}
        onDeleted={() => {
          qc.invalidateQueries({ queryKey: ["platform-leagues"] });
          router.push("/platform");
        }}
      />
    </div>
  );
}

// ── Settings overview ─────────────────────────────────────────────────────

function SettingsOverview({ league }: { league: LeagueDetail }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-slate-900">Settings overview</h2>
      </CardHeader>
      <CardBody>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Detail label="Name" value={league.name} />
          <Detail label="Slug" value={<code className="font-mono text-xs">{league.slug}</code>} />
          <Detail label="FPL mini-league ID" value={league.miniLeagueId ?? "—"} />
          <Detail
            label="Logo URL"
            value={
              league.logoUrl ? (
                <a href={league.logoUrl} target="_blank" rel="noreferrer" className="text-[#37003c] underline truncate inline-block max-w-[260px]">
                  {league.logoUrl}
                </a>
              ) : (
                "—"
              )
            }
          />
        </dl>
        <p className="mt-3 text-xs text-slate-400">
          Edit settings via the "Manage as admin" link above.
        </p>
      </CardBody>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-700 mt-0.5">{value}</dd>
    </div>
  );
}

// ── Suspension ────────────────────────────────────────────────────────────

function SuspensionCard({
  league,
  onChanged,
}: {
  league: LeagueDetail;
  onChanged: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const suspend = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/platform/leagues/${league.id}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {}),
      });
      const body = (await res.json()) as ApiBody<unknown>;
      if (!res.ok || !body.success) throw new Error(body.error ?? "Suspend failed");
    },
    onSuccess: () => {
      setReason("");
      setError(null);
      onChanged();
    },
    onError: (err: Error) => setError(err.message),
  });

  const reinstate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/platform/leagues/${league.id}/reinstate`, {
        method: "POST",
      });
      const body = (await res.json()) as ApiBody<unknown>;
      if (!res.ok || !body.success) throw new Error(body.error ?? "Reinstate failed");
    },
    onSuccess: () => {
      setError(null);
      onChanged();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-slate-900">Suspension</h2>
      </CardHeader>
      <CardBody className="space-y-3">
        {league.status === "active" ? (
          <>
            <p className="text-xs text-slate-500">
              Suspending blocks members and League Admins from this league's data and pages.
              Super Admin retains access. Reinstate at any time.
            </p>
            <div className="flex items-start gap-3">
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Optional reason (e.g. abuse review)"
                maxLength={500}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-[#37003c] focus:outline-none focus:ring-1 focus:ring-[#37003c]"
              />
              <Button
                variant="danger"
                size="sm"
                onClick={() => suspend.mutate()}
                disabled={suspend.isPending}
              >
                {suspend.isPending ? "Suspending…" : "Suspend league"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded text-xs">
              <p className="font-semibold">League is suspended</p>
              <p className="mt-0.5">
                Since {league.suspendedAt ? new Date(league.suspendedAt).toLocaleString() : "—"}
                {league.suspensionReason ? ` · "${league.suspensionReason}"` : ""}
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => reinstate.mutate()}
                disabled={reinstate.isPending}
              >
                {reinstate.isPending ? "Reinstating…" : "Reinstate league"}
              </Button>
            </div>
          </>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </CardBody>
    </Card>
  );
}

// ── Members ───────────────────────────────────────────────────────────────

function MembersCard({
  members,
  onChanged,
}: {
  members: MemberRow[];
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const roleChange = useMutation({
    mutationFn: async (vars: { membershipId: string; role: "member" | "admin" }) => {
      const res = await fetch(`/api/platform/memberships/${vars.membershipId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: vars.role }),
      });
      const body = (await res.json()) as ApiBody<unknown>;
      if (!res.ok || !body.success) throw new Error(body.error ?? "Role change failed");
    },
    onSuccess: () => {
      setError(null);
      onChanged();
    },
    onError: (err: Error) => setError(err.message),
  });

  const sorted = useMemo(
    () =>
      [...members].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
        return (a.displayName ?? "").localeCompare(b.displayName ?? "");
      }),
    [members],
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <h2 className="text-sm font-semibold text-slate-900">Members ({sorted.length})</h2>
      </CardHeader>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2 font-semibold">Name</th>
            <th className="px-4 py-2 font-semibold">Email</th>
            <th className="px-4 py-2 font-semibold">FPL ID</th>
            <th className="px-4 py-2 font-semibold">Role</th>
            <th className="px-4 py-2 font-semibold">Source</th>
            <th className="px-4 py-2 font-semibold">Status</th>
            <th className="px-4 py-2 font-semibold text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => (
            <tr key={m.id} className="border-b border-slate-100">
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{m.displayName ?? "—"}</div>
                {m.teamName && <div className="text-xs text-slate-400">{m.teamName}</div>}
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">
                {m.email ?? <span className="text-slate-300">no account</span>}
              </td>
              <td className="px-4 py-3 text-xs font-mono text-slate-500">{m.managerId || "—"}</td>
              <td className="px-4 py-3">
                <RoleBadge role={m.role} />
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">{m.source}</td>
              <td className="px-4 py-3 text-xs">
                {m.isActive ? (
                  <span className="text-emerald-700">Active</span>
                ) : (
                  <span className="text-slate-400">Inactive</span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                {m.role === "admin" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={roleChange.isPending}
                    onClick={() => roleChange.mutate({ membershipId: m.id, role: "member" })}
                  >
                    Demote
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={roleChange.isPending}
                    onClick={() => roleChange.mutate({ membershipId: m.id, role: "admin" })}
                  >
                    Promote
                  </Button>
                )}
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
                No members yet. The initial admin will appear here once they accept their invitation.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {error && <p className="px-4 py-2 text-xs text-red-600">{error}</p>}
    </Card>
  );
}

function RoleBadge({ role }: { role: "member" | "admin" }) {
  if (role === "admin") {
    return (
      <span className="inline-flex items-center rounded-full bg-[#37003c] text-white px-2 py-0.5 text-xs font-medium">
        Admin
      </span>
    );
  }
  return <span className="text-xs text-slate-500">Member</span>;
}

// ── Recent audit ──────────────────────────────────────────────────────────

function RecentAuditCard({ events }: { events: AuditRow[] }) {
  if (events.length === 0) return null;
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <h2 className="text-sm font-semibold text-slate-900">Recent audit (last {events.length})</h2>
      </CardHeader>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2 font-semibold">When</th>
            <th className="px-4 py-2 font-semibold">Actor</th>
            <th className="px-4 py-2 font-semibold">Action</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-b border-slate-100">
              <td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">
                {new Date(e.createdAt).toLocaleString()}
              </td>
              <td className="px-4 py-2 text-xs text-slate-600">
                {e.actor.kind === "user" ? e.actor.email ?? "user" : (
                  <span className="italic text-slate-400">{e.actor.kind}</span>
                )}
              </td>
              <td className="px-4 py-2">
                <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                  {e.action}
                </code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ── Danger zone ───────────────────────────────────────────────────────────

function DangerZone({
  league,
  onDeleted,
}: {
  league: LeagueDetail;
  onDeleted: () => void;
}) {
  const [confirmSlug, setConfirmSlug] = useState("");
  const [error, setError] = useState<string | null>(null);

  const del = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/platform/leagues/${league.id}?confirm=${encodeURIComponent(confirmSlug)}`,
        { method: "DELETE" },
      );
      const body = (await res.json()) as ApiBody<unknown>;
      if (!res.ok || !body.success) throw new Error(body.error ?? "Delete failed");
    },
    onSuccess: () => {
      setError(null);
      onDeleted();
    },
    onError: (err: Error) => setError(err.message),
  });

  const canDelete = confirmSlug === league.slug;

  return (
    <Card className="border-red-200">
      <CardHeader className="border-red-100">
        <h2 className="text-sm font-semibold text-red-700">Danger zone</h2>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-xs text-slate-500">
          Permanently delete this league. Members, invitations, and slug history are removed.
          Audit history is retained but no longer linked to a live league.
          <br />
          Type the slug{" "}
          <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">
            {league.slug}
          </code>{" "}
          to confirm.
        </p>
        <div className="flex items-start gap-3">
          <input
            type="text"
            value={confirmSlug}
            onChange={(e) => setConfirmSlug(e.target.value)}
            placeholder={league.slug}
            className="flex-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          <Button
            variant="danger"
            size="sm"
            disabled={!canDelete || del.isPending}
            onClick={() => del.mutate()}
          >
            {del.isPending ? "Deleting…" : "Delete league"}
          </Button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </CardBody>
    </Card>
  );
}

function StatusBadge({ status }: { status: "active" | "suspended" }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-xs font-medium">
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 text-xs font-medium">
      Suspended
    </span>
  );
}
