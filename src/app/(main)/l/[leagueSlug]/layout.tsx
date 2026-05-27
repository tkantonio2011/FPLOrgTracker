/**
 * Per-league layout. Resolves the league from the slug and enforces
 * membership. On failure (not signed in, not a member, suspended) we render
 * the appropriate message instead of throwing — the user-facing experience
 * matters more than the HTTP status here.
 */

import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import {
  LeagueNotVisibleError,
  LeagueSuspendedError,
  NotSignedInError,
} from "@/lib/authz/errors";
import { requireLeagueMemberFromCookie } from "@/lib/authz/league-scope";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { LeagueProvider } from "@/components/league/LeagueProvider";
import { LEAGUE_SUSPENDED_BODY, LEAGUE_SUSPENDED_TITLE } from "@/lib/branding/strings";

export default async function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { leagueSlug: string };
}) {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;

  let resolved;
  try {
    resolved = await requireLeagueMemberFromCookie(token, params.leagueSlug);
  } catch (err) {
    if (err instanceof NotSignedInError) {
      redirect(`/sign-in?redirect=/l/${params.leagueSlug}/standings`);
    }
    if (err instanceof LeagueNotVisibleError) {
      // Don't reveal that the league exists.
      notFound();
    }
    if (err instanceof LeagueSuspendedError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <h1 className="text-xl font-bold text-slate-900 mb-2">{LEAGUE_SUSPENDED_TITLE}</h1>
            <p className="text-sm text-slate-600">{LEAGUE_SUSPENDED_BODY}</p>
          </div>
        </div>
      );
    }
    throw err;
  }

  return (
    <LeagueProvider
      league={resolved.league}
      membership={resolved.membership}
      isViewingAsSuperAdmin={!resolved.membership && resolved.user.userAccount.isSuperAdmin}
    >
      {children}
    </LeagueProvider>
  );
}
