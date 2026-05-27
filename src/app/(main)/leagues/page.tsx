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
import { HelpButton } from "@/components/manual/HelpButton";
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
          <p className="text-sm text-slate-600 mb-6">
            You aren&apos;t currently a member of any active league. Create one of your own, or ask the league administrator who invited you to re-send your invitation.
          </p>
          <Link
            href="/leagues/new"
            className="inline-flex px-4 py-2.5 rounded-lg bg-[#37003c] text-white text-sm font-semibold hover:bg-[#4a0052] transition-colors"
          >
            Create a new league
          </Link>
          {isSuperAdmin && (
            <Link
              href="/platform"
              className="inline-flex mt-3 ml-3 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 text-sm font-semibold hover:bg-slate-50 transition-colors"
            >
              Platform admin →
            </Link>
          )}
        </div>
      </div>
    );
  }

  const adminLeagues = active.filter((m) => m.role === "admin");
  const memberLeagues = active.filter((m) => m.role === "member");
  const splitGroups = adminLeagues.length > 0 && memberLeagues.length > 0;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h1 className="text-xl font-bold text-slate-900">Choose a league</h1>
          <HelpButton topic="/help/getting-started/switching-leagues" size="sm" />
        </div>
        <p className="text-sm text-slate-500 mb-6">
          {active.length === 1
            ? "Pick a destination."
            : "You're a member of more than one league."}
        </p>

        {splitGroups ? (
          <div className="space-y-6">
            <section>
              <h2 className="text-[10px] uppercase tracking-widest font-semibold text-slate-400 mb-2">
                Leagues you administer
              </h2>
              <ul className="space-y-2">
                {adminLeagues.map((m) => (
                  <AdminLeagueRow key={m.id} membership={m} targetSegment={targetSegment} />
                ))}
              </ul>
            </section>
            <section>
              <h2 className="text-[10px] uppercase tracking-widest font-semibold text-slate-400 mb-2">
                Leagues you&apos;re a member of
              </h2>
              <ul className="space-y-2">
                {memberLeagues.map((m) => (
                  <MemberLeagueRow key={m.id} membership={m} targetSegment={targetSegment} />
                ))}
              </ul>
            </section>
          </div>
        ) : (
          <ul className="space-y-2">
            {active.map((m) =>
              m.role === "admin" ? (
                <AdminLeagueRow key={m.id} membership={m} targetSegment={targetSegment} />
              ) : (
                <MemberLeagueRow key={m.id} membership={m} targetSegment={targetSegment} />
              ),
            )}
          </ul>
        )}

        <div className="mt-4">
          <Link
            href="/leagues/new"
            className="block w-full text-center py-2.5 px-4 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            + Create another league
          </Link>
        </div>

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

interface RowMembership {
  id: string;
  role: string;
  league: { slug: string; name: string; status: string };
}

function AdminLeagueRow({
  membership,
  targetSegment,
}: {
  membership: RowMembership;
  targetSegment: string;
}) {
  const suspended = membership.league.status === "suspended";
  return (
    <li>
      <Link
        href={`/l/${membership.league.slug}${targetSegment}`}
        className={`flex items-center justify-between px-4 py-3 rounded-lg border bg-white transition-colors ${
          suspended
            ? "border-amber-200 bg-amber-50/50 hover:bg-amber-50"
            : "border-slate-200 hover:bg-slate-50"
        }`}
      >
        <span className="font-medium text-slate-900">{membership.league.name}</span>
        {suspended ? (
          <span className="text-[10px] uppercase tracking-wide text-amber-700">Suspended</span>
        ) : (
          <span className="text-[10px] uppercase tracking-wide text-slate-400">Admin</span>
        )}
      </Link>
      {!suspended && (
        <div className="mt-1 flex gap-3 px-4">
          <Link
            href={`/l/${membership.league.slug}/admin/settings`}
            className="text-[11px] text-slate-500 hover:text-slate-900"
          >
            Settings
          </Link>
          <Link
            href={`/l/${membership.league.slug}/admin/members`}
            className="text-[11px] text-slate-500 hover:text-slate-900"
          >
            Members
          </Link>
        </div>
      )}
    </li>
  );
}

function MemberLeagueRow({
  membership,
  targetSegment,
}: {
  membership: RowMembership;
  targetSegment: string;
}) {
  return (
    <li>
      <Link
        href={`/l/${membership.league.slug}${targetSegment}`}
        className="flex items-center justify-between px-4 py-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
      >
        <span className="font-medium text-slate-900">{membership.league.name}</span>
      </Link>
    </li>
  );
}
