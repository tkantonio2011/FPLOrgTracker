"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import type { ManifestTopic, ManualManifest } from "@/lib/manual/types";
import { audienceBadge } from "@/lib/manual/audience";
import { safeReturnPath, prettyNameForPath } from "@/lib/manual/return-path";

interface TopicViewProps {
  topic: ManifestTopic;
  manifest: ManualManifest;
  /** The MDX-rendered body. */
  children: ReactNode;
}

/**
 * Renders the chrome around an MDX topic: breadcrumb, audience badge,
 * last-updated stamp, optional "Back to <pretty name>" affordance from
 * the `?return=` query parameter, the body, and a "Related topics" footer.
 */
export function TopicView({ topic, manifest, children }: TopicViewProps) {
  const searchParams = useSearchParams();
  const returnPath = safeReturnPath(searchParams.get("return"));
  const showReturn = returnPath !== "/";
  const prettyName = showReturn ? prettyNameForPath(returnPath) : "";

  const badge = audienceBadge(topic.audience);

  // Resolve related topics to ManifestTopic objects.
  const relatedTopics: ManifestTopic[] = [];
  for (const path of topic.relatedTopics) {
    for (const section of manifest.sections) {
      const match = section.topics.find((t) => t.path === path);
      if (match) {
        relatedTopics.push(match);
        break;
      }
    }
  }

  return (
    <article className="max-w-3xl">
      {showReturn && (
        <Link
          href={returnPath}
          className="inline-flex items-center gap-1.5 text-sm text-[#37003c] hover:underline mb-4"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Back to {prettyName}
        </Link>
      )}

      <nav className="text-xs text-slate-500 mb-3" aria-label="Breadcrumb">
        <Link href="/help" className="hover:underline">Help</Link>
        <span className="mx-1.5">/</span>
        <Link href={`/help/${topic.sectionId}`} className="hover:underline">
          {topic.sectionTitle}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700">{topic.title}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">{topic.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {badge && <span className={badge.className}>{badge.label}</span>}
          <span>Last updated {topic.lastUpdated}</span>
        </div>
      </header>

      <div className="prose prose-slate max-w-none prose-headings:text-[#37003c] prose-a:text-[#37003c] prose-strong:text-slate-900">
        {children}
      </div>

      {relatedTopics.length > 0 && (
        <footer className="mt-12 pt-6 border-t border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">
            Related topics
          </h2>
          <ul className="space-y-2">
            {relatedTopics.map((rt) => (
              <li key={rt.path}>
                <Link
                  href={rt.path}
                  className="text-sm text-[#37003c] hover:underline"
                >
                  {rt.title}
                </Link>
                <span className="text-xs text-slate-500 ml-2">— {rt.summary}</span>
              </li>
            ))}
          </ul>
        </footer>
      )}
    </article>
  );
}
