/**
 * League selector. Shown when a signed-in user has no `leagueSlug` in the URL
 * and we need to pick one. If they belong to exactly one active league, we
 * redirect straight to it. Otherwise list the leagues for them to choose.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getServerUserFromCookie } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function LeaguesPage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const user = await getServerUserFromCookie(token);
  if (!user) redirect("/sign-in?redirect=/leagues");

  const memberships = await db.leagueMembership.findMany({
    where: { userAccountId: user.userAccount.id, isActive: true },
    include: { league: true },
    orderBy: { addedAt: "asc" },
  });
  const active = memberships.filter((m) => m.league.status !== "suspended");

  if (active.length === 1) {
    redirect(`/l/${active[0].league.slug}/standings`);
  }

  if (active.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-900 mb-2">No active leagues</h1>
          <p className="text-sm text-slate-600">
            You aren&apos;t currently a member of any active league. If you&apos;re expecting access,
            ask the league administrator who invited you to re-send your invitation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <h1 className="text-xl font-bold text-slate-900 mb-1">Choose a league</h1>
        <p className="text-sm text-slate-500 mb-6">You&apos;re a member of more than one league.</p>
        <ul className="space-y-2">
          {active.map((m) => (
            <li key={m.id}>
              <Link
                href={`/l/${m.league.slug}/standings`}
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
      </div>
    </div>
  );
}
