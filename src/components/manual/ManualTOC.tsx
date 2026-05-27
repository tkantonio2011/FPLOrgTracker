"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ManualManifest } from "@/lib/manual/types";
import {
  orderSectionsForRole,
  audienceBadge,
  viewerRoleFromMemberships,
} from "@/lib/manual/audience";

interface MeMembershipForTOC {
  role: string;
  isActive: boolean;
}
interface MeResponseForTOC {
  memberships?: MeMembershipForTOC[];
  userAccount?: { isSuperAdmin?: boolean };
}

interface ManualTOCProps {
  manifest: ManualManifest;
}

/**
 * Role-aware table of contents for the user manual.
 *
 * Reads the viewer's role from `/api/auth/me` (same data the Sidebar already
 * fetches — TanStack Query dedupes the request) and reorders sections so the
 * role-appropriate content surfaces first.
 *
 * Highlights the currently active section / topic from `usePathname()`.
 */
export function ManualTOC({ manifest }: ManualTOCProps) {
  const pathname = usePathname();

  const { data } = useQuery<MeResponseForTOC | null>({
    queryKey: ["me-leagues"],
    queryFn: () => fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)),
    staleTime: 60_000,
  });

  const role = viewerRoleFromMemberships(
    data?.memberships ?? [],
    Boolean(data?.userAccount?.isSuperAdmin),
  );
  const sections = orderSectionsForRole(manifest.sections, role);

  return (
    <nav aria-label="User manual navigation" className="space-y-6">
      {sections.length === 0 && (
        <p className="text-sm text-slate-500">No topics published yet.</p>
      )}
      {sections.map((section) => (
        <div key={section.id}>
          <Link
            href={section.path}
            className={`block text-xs font-bold uppercase tracking-widest mb-2 transition-colors ${
              pathname === section.path
                ? "text-[#37003c]"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {section.title}
          </Link>
          <ul className="space-y-0.5">
            {section.topics.map((topic) => {
              const isActive = pathname === topic.path;
              const badge = audienceBadge(topic.audience);
              return (
                <li key={topic.slug}>
                  <Link
                    href={topic.path}
                    className={`flex items-start gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                      isActive
                        ? "bg-[#37003c]/10 text-[#37003c] font-medium"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span className="flex-1">{topic.title}</span>
                    {badge && section.primaryAudience !== topic.audience && (
                      <span className={badge.className}>{badge.label}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
