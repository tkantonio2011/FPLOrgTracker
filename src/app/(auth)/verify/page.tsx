/**
 * Magic-link landing page. The `/api/auth/verify` route consumes the token
 * and 302-redirects on success. This page is only ever shown when the verify
 * route bounces back with `?error=invalid_or_expired` (or when JS-disabled
 * users hit it directly without a token).
 */

import Link from "next/link";

export default function VerifyPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const error = searchParams.error ?? "invalid_or_expired";
  const message =
    error === "expired"
      ? "That sign-in link has expired. Request a new one to continue."
      : error === "used"
        ? "That sign-in link has already been used. Request a new one if you need to sign in again."
        : error === "conflict"
          // Self-signup race: someone else's magic-link click won the race for
          // the same email address or FPL mini-league ID. See spec FR-011b.
          ? "Sign-up couldn't complete — the email or FPL mini-league ID is already taken. Try signing up again with a different value."
          : "That sign-in link was invalid. Request a new one to continue.";

  const ctaHref = error === "conflict" ? "/sign-up" : "/sign-in";
  const ctaLabel = error === "conflict" ? "Try signing up again" : "Request a new link";

  return (
    <div className="w-full max-w-sm">
      <div className="bg-white rounded-2xl shadow-xl px-6 py-7 text-center">
        <h1 className="text-lg font-bold text-slate-900 mb-2">Sign-in link not valid</h1>
        <p className="text-sm text-slate-500 mb-6">{message}</p>
        <Link
          href={ctaHref}
          className="inline-block py-2.5 px-4 rounded-lg bg-[#37003c] text-white text-sm font-semibold hover:bg-[#4a0052] transition-colors"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
