import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaWalConfigured: boolean | undefined;
};

function buildClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

// Enable SQLite WAL journal mode once per process to reduce write-lock
// contention as the multi-league workload grows. Safe to run repeatedly,
// but we guard with a global flag so we don't issue the pragma on every
// import in dev (Next.js hot-reload).
if (!globalForPrisma.prismaWalConfigured) {
  globalForPrisma.prismaWalConfigured = true;
  // PRAGMA journal_mode returns the active mode as a result row, so it must
  // be issued via $queryRawUnsafe — $executeRawUnsafe rejects with "Execute
  // returned results, which is not allowed in SQLite".
  void db
    .$queryRawUnsafe("PRAGMA journal_mode = WAL;")
    .catch((err) => {
      // Non-SQLite providers will return an error; ignore. Real SQLite
      // failures are surfaced as warnings — the app still works without WAL.
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn("[db] WAL pragma not applied:", err);
      }
    });
}
