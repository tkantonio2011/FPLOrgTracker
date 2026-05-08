/**
 * Super Admin authorisation helper. Used by every endpoint under
 * /api/platform/... and every page under (main)/platform/... .
 */

import type { NextRequest } from "next/server";
import { requireSession, requireSessionFromCookie } from "@/lib/authz/league-scope";
import { NotAuthorisedError } from "@/lib/authz/errors";
import type { CurrentUser } from "@/lib/auth/current-user";

export async function requireSuperAdmin(req: NextRequest): Promise<{ user: CurrentUser }> {
  const { user } = await requireSession(req);
  if (!user.userAccount.isSuperAdmin) {
    throw new NotAuthorisedError("Super Admin role required");
  }
  return { user };
}

export async function requireSuperAdminFromCookie(token: string | undefined): Promise<{ user: CurrentUser }> {
  const { user } = await requireSessionFromCookie(token);
  if (!user.userAccount.isSuperAdmin) {
    throw new NotAuthorisedError("Super Admin role required");
  }
  return { user };
}
