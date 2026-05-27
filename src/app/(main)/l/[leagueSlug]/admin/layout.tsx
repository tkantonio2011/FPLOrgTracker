/**
 * League Admin sub-shell. Sits inside `[leagueSlug]/layout.tsx`, which has
 * already gated membership and rendered the suspended message if applicable.
 * This layer additionally requires the `admin` role (or Super Admin bypass).
 */

import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { requireLeagueAdminFromCookie } from "@/lib/authz/league-scope";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import {
  LeagueNotVisibleError,
  LeagueSuspendedError,
  NotAuthorisedError,
  NotSignedInError,
} from "@/lib/authz/errors";
import { AdminTabs } from "@/components/league/AdminTabs";

export default async function LeagueAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { leagueSlug: string };
}) {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;

  try {
    await requireLeagueAdminFromCookie(token, params.leagueSlug);
  } catch (err) {
    if (err instanceof NotSignedInError) {
      redirect(`/sign-in?redirect=/l/${params.leagueSlug}/admin/settings`);
    }
    if (err instanceof LeagueNotVisibleError) {
      notFound();
    }
    // The parent layout already renders the suspended UI; if we get here it
    // means the parent let us through (e.g. Super Admin bypass), so propagate.
    if (err instanceof LeagueSuspendedError) {
      throw err;
    }
    if (err instanceof NotAuthorisedError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <h1 className="text-xl font-bold text-slate-900 mb-2">League Admin only</h1>
            <p className="text-sm text-slate-600">
              You need the League Admin role to manage this league. Ask an existing admin to
              promote you, or return to the league dashboard.
            </p>
          </div>
        </div>
      );
    }
    throw err;
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl mx-auto">
      <AdminTabs leagueSlug={params.leagueSlug} />
      {children}
    </div>
  );
}
