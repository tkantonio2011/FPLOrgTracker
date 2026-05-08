/**
 * Transitional auth gate for routes that don't need a league scope (global
 * FPL data: /api/players, /api/fixtures). Accepts either the new session or
 * the legacy single-tenant `user_session` cookie. Either-or until all
 * legacy code paths are migrated, at which point this helper goes away.
 */

import type { NextRequest } from "next/server";
import { getServerUser } from "@/lib/auth/current-user";
import { getSessionManagerId } from "@/lib/auth";
import { NotSignedInError } from "@/lib/authz/errors";

export async function requireAnySession(req: NextRequest): Promise<void> {
  const newUser = await getServerUser(req);
  if (newUser) return;
  const legacyManagerId = getSessionManagerId(req);
  if (legacyManagerId !== null) return;
  throw new NotSignedInError();
}
