/**
 * Next.js instrumentation hook.
 * Runs once per process at startup. Used to bootstrap the platform-level
 * Super Admin from BOOTSTRAP_SUPER_ADMIN_EMAIL.
 *
 * Only runs in the Node.js runtime — guarded so edge-runtime requests don't
 * fail trying to load the Prisma client.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureBootstrapSuperAdmin } = await import("@/lib/auth/bootstrap");
  await ensureBootstrapSuperAdmin();
}
