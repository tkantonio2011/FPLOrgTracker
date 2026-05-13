/**
 * League selector. Shown when a signed-in user has no `leagueSlug` in the URL
 * and we need to pick one. If they belong to exactly one active league, we
 * redirect straight to it. Otherwise list the leagues for them to choose.
 *
 * Honours `?next=<path>` for legacy-URL forwarding: when the middleware
 * redirects e.g. `/standings` here, we preserve the route segment so the
 * user lands at `/l/{their-slug}/standings` rather than the default
 * `/l/{their-slug}/standings`. Sanitised against open-redirect.
 *
 * Super-Admin aware: `?next=/admin` forwards to `/platform` (the legacy
 * single-tenant admin URL had no league context), and Super Admins always
 * see a "Platform admin →" link regardless of how many leagues they're in.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getServerUserFromCookie } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

/**
 * Sanitise the `next` param to a same-origin relative path. Returns "" if
 * the value is missing, malformed, or attempts an external redirect.
 */
function safeNext(raw: string | string[] | undefined): string {
  if (!raw) return "";
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v.startsWith("/")) return "";
  if (v.startsWith("//")) return ""; // protocol-relative
  if (v.startsWith("/l/")) return ""; // already in a league shell — don't loop
  return v;
}

interface PageProps {
  searchParams?: { next?: string };
}

export default async function LeaguesPage({ searchParams }: PageProps) {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const user = await getServerUserFromCookie(token);
  if (!user) redirect("/sign-in?redirect=/leagues");

  const next = safeNext(searchParams?.next);
  const isSuperAdmin = user.userAccount.isSuperAdmin;

  // Legacy `/admin` → Super Admins want `/platform`; League Admins land in
  // their league's admin sub-shell.
  if (next === "/admin" && isSuperAdmin) {
    redirect("/platform");
  }

  const targetSegment = next || "/standings";

  const memberships = await db.leagueMembership.findMany({
    where: { userAccountId: user.userAccount.id, isActive: true },
    include: { league: true },
    orderBy: { addedAt: "asc" },
  });
  const active = memberships.filter((m) => m.league.status !== "suspended");

  // Single-league members get a clean redirect. Super Admins are NOT auto-
  // redirected even if they have one membership, because they may have come
  // here to access /platform — the chooser is more useful for them.
  if (active.length === 1 && !isSuperAdmin) {
    redirect(`/l/${active[0].league.slug}${targetSegment}`);
  }

  if (active.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <h1 className="text-xl font-bold text-slate-900 mb-2">No active leagues</h1>
          <p className="text-sm text-slate-600">
            You aren&apos;t currently a member of any active league. If you&apos;re expecting access,
            ask the league administrator who invited you to re-send your invitation.
          </p>
          {isSuperAdmin && (
            <Link
              href="/platform"
              className="inline-flex mt-6 px-4 py-2.5 rounded-lg bg-[#37003c] text-white text-sm font-semibold hover:bg-[#4a0052] transition-colors"
            >
              Platform admin →
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <h1 className="text-xl font-bold text-slate-900 mb-1">Choose a league</h1>
        <p className="text-sm text-slate-500 mb-6">
          {active.length === 1
            ? "Pick a destination."
            : "You're a member of more than one league."}
        </p>
        <ul className="space-y-2">
          {active.map((m) => (
            <li key={m.id}>
              <Link
                href={`/l/${m.league.slug}${targetSegment}`}
                className="flex items-center justify-between px-4 py-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
              >
                <span className="font-medium text-slate-900">{m.league.name}</span>
                {m.role === "admin" && (
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">Admin</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
        {isSuperAdmin && (
          <>
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 border-t border-slate-200" />
              <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
                Platform
              </span>
              <div className="flex-1 border-t border-slate-200" />
            </div>
            <Link
              href="/platform"
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-slate-200 bg-slate-900 text-white hover:bg-slate-800 transition-colors"
            >
              <span className="font-medium">Platform admin</span>
              <span className="text-[10px] uppercase tracking-wide text-slate-400">Super Admin</span>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
