/**
 * Audience helpers for the in-app user manual.
 *
 * The TOC is shown in full to every signed-in user (members can read admin
 * topics if they choose — see spec FR-018). The ordering changes by role:
 * admins see the admin section first; members see it last.
 */

import type { Audience, ManifestSection, ViewerRole } from "./types";

/**
 * Return sections ordered for the given viewer role.
 * - admin viewers: admin sections first, then the rest in natural order
 * - member viewers: admin sections last, the rest in natural order
 * - `both` sections retain their natural position regardless of role
 */
export function orderSectionsForRole(
  sections: ReadonlyArray<ManifestSection>,
  role: ViewerRole,
): ManifestSection[] {
  const others: ManifestSection[] = [];
  const admin: ManifestSection[] = [];
  for (const s of sections) {
    if (s.primaryAudience === "admin") admin.push(s);
    else others.push(s);
  }
  // Within each bucket keep the natural (numeric prefix) order.
  others.sort((a, b) => a.order - b.order);
  admin.sort((a, b) => a.order - b.order);
  return role === "admin" ? [...admin, ...others] : [...others, ...admin];
}

export interface AudienceBadge {
  label: string;
  className: string;
}

/**
 * Returns the audience-badge descriptor for a topic or null when no badge
 * should be rendered (audience: "both" or unknown).
 */
export function audienceBadge(audience: Audience): AudienceBadge | null {
  if (audience === "admin") {
    return {
      label: "For League Admins",
      className:
        "inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 text-xs font-medium",
    };
  }
  if (audience === "member") {
    return {
      label: "For Members",
      className:
        "inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 text-xs font-medium",
    };
  }
  return null;
}

/**
 * Derive the viewer role from membership data — used by the TOC.
 *
 * "Admin" if the user holds the admin role on ANY active league; "member"
 * otherwise. Super Admin is treated as "admin" for the manual's purposes
 * (they read the same admin content even though their cross-league
 * operations are not yet documented).
 */
export function viewerRoleFromMemberships(
  memberships: ReadonlyArray<{ role: string; isActive: boolean }>,
  isSuperAdmin: boolean,
): ViewerRole {
  if (isSuperAdmin) return "admin";
  for (const m of memberships) {
    if (m.isActive && m.role === "admin") return "admin";
  }
  return "member";
}
