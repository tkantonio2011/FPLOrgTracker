/**
 * Platform console shell. Sits inside `(main)/layout.tsx` (which has already
 * redirected to /sign-in if no session cookie is present). This layer gates
 * access to Super Admins only — League Admins and members reach the
 * "Super Admin only" message rather than a 404, because the URL is platform-
 * level and revealing its existence is not a leak.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSuperAdminFromCookie } from "@/lib/authz/platform-scope";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { NotAuthorisedError, NotSignedInError } from "@/lib/authz/errors";
import { PlatformTabs } from "@/components/platform/PlatformTabs";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;

  try {
    await requireSuperAdminFromCookie(token);
  } catch (err) {
    if (err instanceof NotSignedInError) {
      redirect(`/sign-in?redirect=/platform`);
    }
    if (err instanceof NotAuthorisedError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <h1 className="text-xl font-bold text-slate-900 mb-2">Super Admin only</h1>
            <p className="text-sm text-slate-600">
              You need the Super Admin role to access the platform console.
            </p>
          </div>
        </div>
      );
    }
    throw err;
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-6xl mx-auto">
      <header className="mb-4">
        <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
          Platform console
        </p>
      </header>
      <PlatformTabs />
      {children}
    </div>
  );
}
