"use client";

import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useLeague } from "@/components/league/LeagueProvider";

interface AuditEntry {
  id: string;
  action: string;
  actor: { kind: "user" | "migration" | "system"; userAccountId?: string; email?: string };
  targetKind: string;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

interface AuditBody {
  success: boolean;
  data?: AuditEntry[];
  meta?: { total: number; page: number; limit: number };
  error?: string;
}

const PAGE_SIZE = 25;

export default function LeagueAdminAuditPage() {
  const { league } = useLeague();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-audit", league.id, page],
    queryFn: async (): Promise<AuditBody> => {
      const res = await fetch(
        `/api/leagues/${league.id}/audit?page=${page}&limit=${PAGE_SIZE}`,
      );
      const body = (await res.json()) as AuditBody;
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to load audit feed");
      return body;
    },
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });

  const events = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Audit log</h1>
        <p className="text-sm text-slate-500 mt-1">
          {total} event{total === 1 ? "" : "s"} recorded for this league
        </p>
      </header>

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
                  <td className="px-4 py-3">
                    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                      {e.action}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <span className="text-slate-400">{e.targetKind}</span>
                    {e.targetId && <span className="ml-1 font-mono">{e.targetId.slice(0, 8)}</span>}
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
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                    No audit events yet.
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
