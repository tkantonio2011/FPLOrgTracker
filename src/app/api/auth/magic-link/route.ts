/**
 * Magic-link sign-in endpoint.
 *
 * Enumeration-resistant: returns an identical `{ sent: true }` response whether
 * or not the account exists and whether or not email delivery succeeds. The
 * response shape MUST stay identical across every code path.
 *
 * The 004 UAT allow-list gate that previously sat in this handler was retired
 * by feature 005-public-signup (see 005 spec FR-017): once any email can
 * self-signup and immediately sign in, an allow-list on the sign-in route was
 * a no-op gate that only succeeded in breaking local dev when APP_ENV=uat was
 * set without UAT_ALLOWED_EMAILS.
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, failFromError } from "@/lib/http/response";
import { parseBody, z } from "@/lib/validation";
import { checkSignInRateLimit, issueSignInToken } from "@/lib/auth/magic-link";
import { sendMagicLink } from "@/lib/auth/email";
import { appOrigin } from "@/lib/auth/origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  // Accept missing / null / string — the sign-in form sends `null` when there
  // is no `?redirect=` query param. `safeRedirect()` below normalises further.
  redirectTo: z.string().nullable().optional(),
});

function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

function safeRedirect(input: string | null | undefined): string {
  // Only allow same-origin paths starting with "/" and not "//" (protocol-relative).
  if (!input) return "/";
  if (!input.startsWith("/")) return "/";
  if (input.startsWith("//")) return "/";
  return input;
}


export async function POST(req: NextRequest) {
  try {
    const body = await parseBody(req, bodySchema);
    const ip = clientIp(req);

    const rl = checkSignInRateLimit(body.email, ip);
    if (!rl.ok) return fail(rl.reason, 429);

    // Look up the account WITHOUT revealing whether it exists.
    const account = await db.userAccount.findUnique({ where: { email: body.email } });
    const isUsable = account && !account.disabledAt;

    const issued = await issueSignInToken(body.email, isUsable ? account.id : null, ip);

    if (issued) {
      const origin = appOrigin(req);
      const redirect = safeRedirect(body.redirectTo);
      const link = `${origin}/api/auth/verify?token=${encodeURIComponent(issued.plaintext)}&redirect=${encodeURIComponent(redirect)}`;
      // Fire-and-forget email send; failures are logged but not surfaced
      // (preserves anti-enumeration: response is identical regardless).
      void sendMagicLink(body.email, link).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[magic-link] send failed:", err);
      });
    }

    return ok({ sent: true });
  } catch (err) {
    return failFromError(err);
  }
}
