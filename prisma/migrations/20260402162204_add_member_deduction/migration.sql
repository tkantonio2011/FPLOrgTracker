-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "manager_id" INTEGER NOT NULL,
    "display_name" TEXT,
    "team_name" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "points_deduction_per_gw" INTEGER NOT NULL DEFAULT 0,
    "added_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organisation_id" TEXT NOT NULL,
    CONSTRAINT "members_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_members" ("added_at", "display_name", "id", "is_active", "manager_id", "organisation_id", "source", "team_name") SELECT "added_at", "display_name", "id", "is_active", "manager_id", "organisation_id", "source", "team_name" FROM "members";
DROP TABLE "members";
ALTER TABLE "new_members" RENAME TO "members";
CREATE UNIQUE INDEX "members_manager_id_key" ON "members"("manager_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
