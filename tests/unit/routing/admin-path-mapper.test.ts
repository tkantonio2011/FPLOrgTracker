import { describe, expect, it } from "vitest";
import { mapAdminPath } from "@/lib/routing/admin-path-mapper";

interface Case {
  name: string;
  input: { currentPath: string; targetSlug: string; targetRole: "admin" | "member" };
  expected: string;
}

const CASES: Case[] = [
  {
    name: "admin root preserved when target is admin",
    input: { currentPath: "/l/acme/admin", targetSlug: "beta", targetRole: "admin" },
    expected: "/l/beta/admin",
  },
  {
    name: "admin/settings preserved when target is admin",
    input: { currentPath: "/l/acme/admin/settings", targetSlug: "beta", targetRole: "admin" },
    expected: "/l/beta/admin/settings",
  },
  {
    name: "admin/members preserved when target is admin",
    input: { currentPath: "/l/acme/admin/members", targetSlug: "beta", targetRole: "admin" },
    expected: "/l/beta/admin/members",
  },
  {
    name: "admin/digest preserved when target is admin",
    input: { currentPath: "/l/acme/admin/digest", targetSlug: "beta", targetRole: "admin" },
    expected: "/l/beta/admin/digest",
  },
  {
    name: "admin/audit preserved when target is admin",
    input: { currentPath: "/l/acme/admin/audit", targetSlug: "beta", targetRole: "admin" },
    expected: "/l/beta/admin/audit",
  },
  {
    name: "admin/members/<id> collapses back to admin/members",
    input: { currentPath: "/l/acme/admin/members/clxxx123", targetSlug: "beta", targetRole: "admin" },
    expected: "/l/beta/admin/members",
  },
  {
    name: "admin/members/<id>/anything collapses back to admin/members",
    input: { currentPath: "/l/acme/admin/members/clxxx123/edit", targetSlug: "beta", targetRole: "admin" },
    expected: "/l/beta/admin/members",
  },
  {
    name: "admin source falls back to standings when target is member",
    input: { currentPath: "/l/acme/admin/settings", targetSlug: "beta", targetRole: "member" },
    expected: "/l/beta/standings",
  },
  {
    name: "standings source falls through to standings even when target is admin",
    input: { currentPath: "/l/acme/standings", targetSlug: "beta", targetRole: "admin" },
    expected: "/l/beta/standings",
  },
  {
    name: "non-admin league sub-path falls through to standings",
    input: { currentPath: "/l/acme/ownership", targetSlug: "beta", targetRole: "admin" },
    expected: "/l/beta/standings",
  },
  {
    name: "/my-admin source returns standings (no admin context to preserve)",
    input: { currentPath: "/my-admin", targetSlug: "beta", targetRole: "admin" },
    expected: "/l/beta/standings",
  },
  {
    name: "/leagues source returns standings",
    input: { currentPath: "/leagues", targetSlug: "beta", targetRole: "admin" },
    expected: "/l/beta/standings",
  },
  {
    name: "platform path returns standings",
    input: { currentPath: "/platform/leagues", targetSlug: "beta", targetRole: "admin" },
    expected: "/l/beta/standings",
  },
  {
    name: "trailing slash normalised",
    input: { currentPath: "/l/acme/admin/members/", targetSlug: "beta", targetRole: "admin" },
    expected: "/l/beta/admin/members",
  },
  {
    name: "double trailing slash normalised",
    input: { currentPath: "/l/acme/admin/settings//", targetSlug: "beta", targetRole: "admin" },
    expected: "/l/beta/admin/settings",
  },
  {
    name: "query string dropped from source",
    input: { currentPath: "/l/acme/admin/members?page=2", targetSlug: "beta", targetRole: "admin" },
    expected: "/l/beta/admin/members",
  },
  {
    name: "hash dropped from source",
    input: { currentPath: "/l/acme/admin/settings#section", targetSlug: "beta", targetRole: "admin" },
    expected: "/l/beta/admin/settings",
  },
  {
    name: "empty source returns standings",
    input: { currentPath: "", targetSlug: "beta", targetRole: "admin" },
    expected: "/l/beta/standings",
  },
];

describe("mapAdminPath", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const out = mapAdminPath(c.input.currentPath, c.input.targetSlug, c.input.targetRole);
      expect(out).toBe(c.expected);
    });
  }

  it("is idempotent under re-application", () => {
    for (const c of CASES) {
      const once = mapAdminPath(c.input.currentPath, c.input.targetSlug, c.input.targetRole);
      const twice = mapAdminPath(once, c.input.targetSlug, c.input.targetRole);
      expect(twice).toBe(once);
    }
  });

  it("does not preserve admin path across roles even when re-applied", () => {
    const a = mapAdminPath("/l/acme/admin/members", "beta", "member");
    expect(a).toBe("/l/beta/standings");
    const b = mapAdminPath(a, "gamma", "admin");
    expect(b).toBe("/l/gamma/standings");
  });
});
