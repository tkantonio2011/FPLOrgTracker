/**
 * Public sign-up page. Renders the SignupForm for anonymous visitors. For
 * signed-in visitors, renders a redirect-suggestion view instead — per spec
 * edge case "Sign-up while signed in" and research.md §R12.
 *
 * Marked force-dynamic because the server-side session check must run on
 * every request (matches the layout-cache lesson from 004 — pages that branch
 * on request-scoped state must opt out of static prerendering).
 */

import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getServerUserFromCookie } from "@/lib/auth/current-user";
import SignupForm from "@/components/auth/SignupForm";
import { PLATFORM_NAME } from "@/lib/branding/strings";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const user = await getServerUserFromCookie(token);

  if (user) {
    return (
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#00ff87] mb-4">
            <span className="text-2xl">⚽</span>
          </div>
          <h1 className="text-2xl font-bold text-white">{PLATFORM_NAME}</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-xl px-6 py-7 text-center">
          <h2 className="text-lg font-bold text-slate-900 mb-2">You&apos;re already signed in</h2>
          <p className="text-sm text-slate-500 mb-6">
            Pick a league to manage, or create another one.
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href="/leagues"
              className="inline-block py-2.5 px-4 rounded-lg bg-[#37003c] text-white text-sm font-semibold hover:bg-[#4a0052] transition-colors"
            >
              Go to my leagues
            </Link>
            <Link
              href="/leagues/new"
              className="inline-block py-2.5 px-4 rounded-lg border border-slate-200 text-slate-900 text-sm font-semibold hover:bg-slate-50 transition-colors"
            >
              Create another league
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <SignupForm />;
}
