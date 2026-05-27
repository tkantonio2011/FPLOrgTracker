"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface AuditRow {
  id: string;
  action: string;
  actor: { kind: "user" | "migration" | "system"; userAccountId?: string; email?: string };
  leagueId: string | null;
  leagueName: string | null;
  leagueSlug: string | null;
  targetKind: string;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

interface ApiBody {
  success: boolean;
  data?: AuditRow[];
  meta?: { total: number; page: number; limit: number };
  error?: string;
}

const PAGE_SIZE = 50;

export default function PlatformAuditPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [sinceInput, setSinceInput] = useState("");
  const [since, setSince] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["platform-audit", page, actionFilter, since],
    queryFn: async (): Promise<ApiBody> => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (actionFilter) params.set("action", actionFilter);
      if (since) params.set("since", since);
      const res = await fetch(`/api/platform/audit?${params.toString()}`);
      const body = (await res.json()) as ApiBody;
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to load audit feed");
      return body;
    },
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setActionFilter(actionInput.trim());
    if (sinceInput) {
      // <input type="datetime-local"> returns "YYYY-MM-DDTHH:mm" without timezone.
      // Append seconds + Z so the API's z.string().datetime() validator accepts it.
      try {
        const iso = new Date(sinceInput).toISOString();
        setSince(iso);
      } catch {
        setSince(null);
      }
    } else {
      setSince(null);
    }
  }

  function clearFilters() {
    setActionInput("");
    setSinceInput("");
    setActionFilter("");
    setSince(null);
    setPage(1);
  }

  const events = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilter = Boolean(actionFilter || since);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Audit log</h1>
        <p className="text-sm text-slate-500 mt-1">
          {total} event{total === 1 ? "" : "s"}
          {hasFilter ? " match the current filter" : " platform-wide"}
        </p>
      </header>

      <Card className="px-4 py-3">
        <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-3">
          <label className="text-xs flex-1 min-w-[160px]">
            <span className="block text-slate-600 mb-1">Action (exact match)</span>
            <input
              type="text"
              value={actionInput}
              onChange={(e) => setActionInput(e.target.value)}
              placeholder="e.g. league.suspended"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-[#37003c] focus:outline-none focus:ring-1 focus:ring-[#37003c]"
            />
          </label>
          <label className="text-xs flex-1 min-w-[200px]">
            <span className="block text-slate-600 mb-1">Since</span>
            <input
              type="datetime-local"
              value={sinceInput}
              onChange={(e) => setSinceInput(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-[#37003c] focus:outline-none focus:ring-1 focus:ring-[#37003c]"
            />
          </label>
          <div className="flex items-center gap-2">
            <Button type="submit" variant="secondary" size="sm">
              Apply
            </Button>
            {hasFilter && (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </form>
      </Card>

      {isLoading && <div className="text-sm text-slate-500">Loading…</div>}
      {isError && (
        <div className="bg-red-50 border border-red-200/80 text-red-700 px-4 py-3 rounded-xl text-sm">
          Unable to load audit feed.
        </div>
      )}

      {!isLoading && !isError && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-semibold">When</th>
                <th className="px-4 py-2 font-semibold">Actor</th>
                <th className="px-4 py-2 font-semibold">League</th>
                <th className="px-4 py-2 font-semibold">Action</th>
                <th className="px-4 py-2 font-semibold">Target</th>
                <th className="px-4 py-2 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 align-top">
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {formatTimestamp(e.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {e.actor.kind === "user" ? (
                      <span>{e.actor.email ?? e.actor.userAccountId ?? "user"}</span>
                    ) : (
                      <span className="italic text-slate-400">{e.actor.kind}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {e.leagueId && e.leagueSlug && e.leagueName ? (
                      <Link
                        href={`/platform/leagues/${e.leagueId}`}
                        className="text-[#37003c] hover:underline"
                      >
                        {e.leagueName}
                      </Link>
                    ) : e.leagueId ? (
                      <span className="text-slate-500 font-mono">
                        {e.leagueId.slice(0, 8)}…
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                      {e.action}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <span className="text-slate-400">{e.targetKind}</span>
                    {e.targetId && (
                      <span className="ml-1 font-mono">{e.targetId.slice(0, 8)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {Object.keys(e.details).length > 0 ? (
                      <details>
                        <summary className="cursor-pointer text-slate-500 hover:text-slate-900">
                          show
                        </summary>
                        <pre className="mt-1 text-xs bg-slate-50 p-2 rounded border border-slate-200 overflow-x-auto whitespace-pre-wrap break-all">
                          {JSON.stringify(e.details, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                    {hasFilter ? "No events match the filters." : "No audit events yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 text-xs text-slate-500">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
