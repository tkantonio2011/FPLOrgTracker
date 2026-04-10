-- CreateTable
CREATE TABLE "organisations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "mini_league_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "manager_id" INTEGER NOT NULL,
    "display_name" TEXT,
    "team_name" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "added_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organisation_id" TEXT NOT NULL,
    CONSTRAINT "members_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "organisations_mini_league_id_key" ON "organisations"("mini_league_id");

-- CreateIndex
CREATE UNIQUE INDEX "members_manager_id_key" ON "members"("manager_id");
