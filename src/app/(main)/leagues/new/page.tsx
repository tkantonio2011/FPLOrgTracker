/**
 * "Create another league" page. Hosts the CreateAnotherLeagueForm for signed-in
 * users. Feature 005-public-signup, US2.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getServerUserFromCookie } from "@/lib/auth/current-user";
import CreateAnotherLeagueForm from "@/components/auth/CreateAnotherLeagueForm";

export const dynamic = "force-dynamic";

export default async function CreateAnotherLeaguePage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const user = await getServerUserFromCookie(token);
  if (!user) redirect("/sign-in?redirect=/leagues/new");

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-10 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href="/leagues" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to leagues
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Create a new league</h1>
      <p className="text-sm text-slate-600 mb-6">
        Add a league you administer. You&apos;ll be set as its admin immediately — no email confirmation needed because you&apos;re already signed in.
      </p>
      <CreateAnotherLeagueForm />
    </div>
  );
}
