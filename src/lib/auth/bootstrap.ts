/**
 * Idempotent bootstrap of the platform-level Super Admin.
 *
 * Reads BOOTSTRAP_SUPER_ADMIN_EMAIL (comma-separated list supported) on every
 * boot and ensures: (a) a UserAccount exists for that email, (b) an active
 * SuperAdmin row links to it.
 *
 * Setting the env var does NOT send an email. The bootstrap super admin signs
 * in via the normal magic-link flow when they first need to use the platform.
 *
 * Removing an email from the env var does NOT revoke an existing SuperAdmin.
 * Demotion is via the platform admin UI or by manually setting `revokedAt`.
 */

import { db } from "@/lib/db";

let bootstrapPromise: Promise<void> | null = null;

export function ensureBootstrapSuperAdmin(): Promise<void> {
  if (!bootstrapPromise) bootstrapPromise = run();
  return bootstrapPromise;
}

async function run(): Promise<void> {
  const raw = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL;
  if (!raw || !raw.trim()) return;

  const emails = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  for (const email of emails) {
    try {
      await ensureSuperAdminFor(email);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[bootstrap] failed for ${email}:`, err);
    }
  }

  // Ensure the singleton Platform row exists. Idempotent.
  const platformCount = await db.platform.count();
  if (platformCount === 0) {
    await db.platform.create({ data: {} });
  }
}

async function ensureSuperAdminFor(email: string): Promise<void> {
  const account = await db.userAccount.upsert({
    where: { email },
    update: {},
    create: { email },
  });

  const existing = await db.superAdmin.findUnique({ where: { userAccountId: account.id } });
  if (existing) {
    // If revoked, reinstate; if active, leave alone.
    if (existing.revokedAt) {
      await db.superAdmin.update({
        where: { id: existing.id },
        data: { revokedAt: null, revokedByUserAccountId: null },
      });
    }
    return;
  }

  await db.superAdmin.create({
    data: { userAccountId: account.id },
  });
}
