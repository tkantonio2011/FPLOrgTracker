import { describe, it, expect } from "vitest";
import {
  orderSectionsForRole,
  audienceBadge,
  viewerRoleFromMemberships,
} from "@/lib/manual/audience";
import type { ManifestSection } from "@/lib/manual/types";

function makeSection(overrides: Partial<ManifestSection>): ManifestSection {
  return {
    id: "x",
    order: 0,
    title: "X",
    summary: "",
    primaryAudience: "both",
    path: "/help/x",
    topics: [],
    ...overrides,
  };
}

describe("orderSectionsForRole", () => {
  const gettingStarted = makeSection({ id: "getting-started", order: 0, primaryAudience: "both" });
  const reading = makeSection({ id: "reading-the-app", order: 10, primaryAudience: "member" });
  const admin = makeSection({ id: "league-admin", order: 20, primaryAudience: "admin" });

  it("admin viewers see admin section first, then the rest in natural order", () => {
    const out = orderSectionsForRole([gettingStarted, reading, admin], "admin");
    expect(out.map((s) => s.id)).toEqual(["league-admin", "getting-started", "reading-the-app"]);
  });

  it("member viewers see non-admin first, admin section last", () => {
    const out = orderSectionsForRole([gettingStarted, reading, admin], "member");
    expect(out.map((s) => s.id)).toEqual(["getting-started", "reading-the-app", "league-admin"]);
  });

  it("ordering within each bucket is by section.order", () => {
    const a = makeSection({ id: "a", order: 50, primaryAudience: "member" });
    const b = makeSection({ id: "b", order: 10, primaryAudience: "member" });
    const out = orderSectionsForRole([a, b], "member");
    expect(out.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("a single admin section appears at the top for admins regardless of order", () => {
    const high = makeSection({ id: "admin", order: 99, primaryAudience: "admin" });
    const low = makeSection({ id: "intro", order: 1, primaryAudience: "both" });
    const out = orderSectionsForRole([low, high], "admin");
    expect(out.map((s) => s.id)).toEqual(["admin", "intro"]);
  });

  it("handles empty input", () => {
    expect(orderSectionsForRole([], "admin")).toEqual([]);
    expect(orderSectionsForRole([], "member")).toEqual([]);
  });
});

describe("audienceBadge", () => {
  it("returns a 'For League Admins' badge for admin topics", () => {
    const badge = audienceBadge("admin");
    expect(badge).not.toBeNull();
    expect(badge!.label).toBe("For League Admins");
  });

  it("returns a 'For Members' badge for member topics", () => {
    const badge = audienceBadge("member");
    expect(badge).not.toBeNull();
    expect(badge!.label).toBe("For Members");
  });

  it("returns null for 'both' topics", () => {
    expect(audienceBadge("both")).toBeNull();
  });
});

describe("viewerRoleFromMemberships", () => {
  it("returns 'admin' for Super Admins regardless of membership", () => {
    expect(viewerRoleFromMemberships([], true)).toBe("admin");
    expect(viewerRoleFromMemberships([{ role: "member", isActive: true }], true)).toBe("admin");
  });

  it("returns 'admin' when any active membership has admin role", () => {
    const memberships = [
      { role: "member", isActive: true },
      { role: "admin", isActive: true },
    ];
    expect(viewerRoleFromMemberships(memberships, false)).toBe("admin");
  });

  it("returns 'member' when all admin memberships are inactive", () => {
    const memberships = [
      { role: "admin", isActive: false },
      { role: "member", isActive: true },
    ];
    expect(viewerRoleFromMemberships(memberships, false)).toBe("member");
  });

  it("returns 'member' for users with only member memberships", () => {
    expect(
      viewerRoleFromMemberships([{ role: "member", isActive: true }], false),
    ).toBe("member");
  });

  it("returns 'member' for users with no memberships and not Super Admin", () => {
    expect(viewerRoleFromMemberships([], false)).toBe("member");
  });
});
