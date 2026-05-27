"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface HelpButtonProps {
  /**
   * The canonical manual path for the topic that documents this page.
   * MUST start with `/help/` and MUST resolve to a topic in the manifest
   * at build time. (Today, this is informally enforced — a broken link
   * results in a 404 like any other typo'd URL.)
   */
  topic: string;
  /**
   * Accessible label override. Defaults to "Help on this page".
   * Override on pages that already host another "help"-flavoured affordance.
   */
  ariaLabel?: string;
  /** Size variant; defaults to "md" (24×24). "sm" (18×18) for dense headers. */
  size?: "sm" | "md";
}

const SIZE_PX: Record<NonNullable<HelpButtonProps["size"]>, number> = {
  sm: 18,
  md: 24,
};

/**
 * The contextual "?" affordance mounted on every member-facing and admin-facing
 * feature page. Clicking it navigates to the matching manual topic with a
 * `?return=<current path>` query param so the topic page can render a
 * "Back to <pretty name>" link.
 *
 * Contract: specs/003-user-manual/contracts/help-button.md
 */
export function HelpButton({ topic, ariaLabel, size = "md" }: HelpButtonProps) {
  const pathname = usePathname() ?? "/";
  const href = `${topic}?return=${encodeURIComponent(pathname)}`;
  const px = SIZE_PX[size];

  return (
    <Link
      href={href}
      aria-label={ariaLabel ?? "Help on this page"}
      className="inline-flex items-center justify-center rounded-full text-slate-500 hover:text-[#37003c] hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-[#37003c] focus-visible:outline-none transition-colors p-1.5"
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" x2="12.01" y1="17" y2="17" />
      </svg>
    </Link>
  );
}
