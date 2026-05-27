/**
 * Admin home. Lists every active league where the signed-in user holds the
 * League Admin role, with deep links to that league's admin sub-shell.
 *
 * Server-rendered: derives the list from `getServerUserFromCookie` only —
 * no fetch, no extra HTTP endpoint, no client state.
 *
 * Suspended leagues remain listed (admins retain visibility per FR-022) but
 * their deep links are rendered disabled — the route gate at
 * `[leagueSlug]/admin/layout.tsx` would otherwise throw `LeagueSuspendedError`
 * and produce a confusing error page.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getServerUserFromCookie } from "@/lib/auth/current-user";

import { HelpButton } from "@/components/manual/HelpButton";
export const dynamic = "force-dynamic";

const SUB_LINKS = [
  { sub: "settings", label: "Settings" },
  { sub: "members", label: "Members" },
  { sub: "digest", label: "Digest" },
  { sub: "audit", label: "Audit" },
] as const;

export default async function MyAdminPage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const user = await getServerUserFromCookie(token);
  if (!user) redirect("/sign-in?redirect=/my-admin");

  const adminMemberships = user.memberships
    .filter((m) => m.role === "admin" && m.isActive)
    .sort((a, b) => a.leagueName.localeCompare(b.leagueName));

  if (adminMemberships.length === 0) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-10 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">My admin leagues</h1>
        <p className="text-sm text-slate-600 mb-6">
          You don&apos;t administer any leagues. If a colleague is expecting you to manage one,
          ask them to promote you in their league&apos;s admin panel.
        </p>
        <Link
          href="/leagues"
          className="inline-flex px-4 py-2.5 rounded-lg bg-[#37003c] text-white text-sm font-semibold hover:bg-[#4a0052] transition-colors"
        >
          Back to my leagues
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-4xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My admin leagues</h1>
          <HelpButton topic="/help/league-admin/overview" />
          <p className="text-sm text-slate-500 mt-1">
            You administer {adminMemberships.length}{" "}
            {adminMemberships.length === 1 ? "league" : "leagues"}. Jump straight into the section
            you need.
          </p>
        </div>
        <Link
          href="/leagues/new"
          className="shrink-0 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 text-sm font-semibold hover:bg-slate-50 transition-colors"
        >
          + Create another league
        </Link>
      </header>

      <ul className="space-y-3">
        {adminMemberships.map((m) => {
          const suspended = m.leagueStatus === "suspended";
          return (
            <li
              key={m.leagueId}
              className={`rounded-lg border bg-white p-4 sm:p-5 ${
                suspended ? "border-amber-200 bg-amber-50/50" : "border-slate-200"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {m.leagueLogoUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={m.leagueLogoUrl}
                    alt=""
                    className="w-7 h-7 rounded object-cover shrink-0"
                  />
                )}
                <Link
                  href={`/l/${m.leagueSlug}/`}
                  className="text-base font-semibold text-slate-900 hover:underline"
                >
                  {m.leagueName}
                </Link>
                {suspended ? (
                  <span className="ml-auto text-[10px] uppercase tracking-wide font-semibold text-amber-700 bg-amber-100 rounded px-2 py-0.5">
                    Suspended
                  </span>
                ) : (
                  <span className="ml-auto text-[10px] uppercase tracking-wide font-semibold text-emerald-700 bg-emerald-50 rounded px-2 py-0.5">
                    Active
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {SUB_LINKS.map((s) =>
                  suspended ? (
                    <span
                      key={s.sub}
                      aria-disabled="true"
                      title="League is suspended"
                      className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-400 bg-slate-100 cursor-not-allowed"
                    >
                      {s.label}
                    </span>
                  ) : (
                    <Link
                      key={s.sub}
                      href={`/l/${m.leagueSlug}/admin/${s.sub}`}
                      className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                    >
                      {s.label}
                    </Link>
                  ),
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/leagues"
          className="text-xs font-medium text-slate-500 hover:text-slate-900"
        >
          ← All my leagues
        </Link>
        {user.userAccount.isSuperAdmin && (
          <Link
            href="/platform"
            className="text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            Platform admin →
          </Link>
        )}
      </div>
    </div>
  );
}
