import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * Authenticated shell. Defense in depth on top of `middleware.ts`: re-check
 * for a session cookie server-side and redirect to /sign-in if missing. Real
 * DB validation still happens in the league-scoped layout via
 * `requireLeagueMemberFromCookie`.
 */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  const session = cookies().get(SESSION_COOKIE_NAME)?.value;

  if (!session) {
    const pathname = headers().get("x-pathname") ?? "/";
    redirect(`/sign-in?redirect=${encodeURIComponent(pathname)}`);
  }

  return <AppShell>{children}</AppShell>;
}
