import { notFound, redirect, permanentRedirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { manualManifest } from "@/content/manual/manifest";
import { manualModules } from "@/content/manual/modules";
import { manualRedirects } from "@/lib/manual/redirects";
import { TopicView } from "@/components/manual/TopicView";
import { audienceBadge } from "@/lib/manual/audience";

interface PageProps {
  params: { slug: string[] };
}

export function generateStaticParams(): Array<{ slug: string[] }> {
  const params: Array<{ slug: string[] }> = [];
  for (const section of manualManifest.sections) {
    // Section overview at /help/<section-id>
    params.push({ slug: [section.id] });
    for (const topic of section.topics) {
      // Topic at /help/<section-id>/<topic-slug>
      params.push({ slug: [section.id, topic.slug] });
    }
  }
  return params;
}

export function generateMetadata({ params }: PageProps): Metadata {
  const path = "/help/" + params.slug.join("/");
  for (const section of manualManifest.sections) {
    if (section.path === path) {
      return { title: `${section.title} — Help` };
    }
    const topic = section.topics.find((t) => t.path === path);
    if (topic) {
      return { title: `${topic.title} — Help` };
    }
  }
  return { title: "Help" };
}

export default async function ManualSlugPage({ params }: PageProps) {
  const path = "/help/" + params.slug.join("/");

  // Honour redirects first.
  const redirectTo = manualRedirects[path];
  if (redirectTo) {
    permanentRedirect(redirectTo);
  }

  // Section overview — single-segment slug.
  if (params.slug.length === 1) {
    const section = manualManifest.sections.find((s) => s.path === path);
    if (!section) notFound();
    return <SectionOverview sectionId={section.id} />;
  }

  // Topic — two-segment slug.
  if (params.slug.length === 2) {
    let topic;
    for (const section of manualManifest.sections) {
      const found = section.topics.find((t) => t.path === path);
      if (found) {
        topic = found;
        break;
      }
    }
    if (!topic) notFound();

    const loader = manualModules[path];
    if (!loader) notFound();
    const mod = await loader();
    const MDXContent = mod.default;
    return (
      <TopicView topic={topic} manifest={manualManifest}>
        <MDXContent />
      </TopicView>
    );
  }

  notFound();
}

function SectionOverview({ sectionId }: { sectionId: string }) {
  const section = manualManifest.sections.find((s) => s.id === sectionId)!;
  const badge = audienceBadge(section.primaryAudience);
  return (
    <div className="max-w-3xl">
      <nav className="text-xs text-slate-500 mb-3" aria-label="Breadcrumb">
        <Link href="/help" className="hover:underline">Help</Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700">{section.title}</span>
      </nav>
      <header className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl font-bold text-slate-900">{section.title}</h1>
          {badge && <span className={badge.className}>{badge.label}</span>}
        </div>
        {section.summary && <p className="mt-2 text-slate-600">{section.summary}</p>}
      </header>
      {section.topics.length === 0 ? (
        <p className="text-slate-500">No topics in this section yet.</p>
      ) : (
        <ul className="space-y-3">
          {section.topics.map((topic) => {
            const tBadge = audienceBadge(topic.audience);
            return (
              <li key={topic.slug}>
                <Link
                  href={topic.path}
                  className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-[#37003c] hover:shadow-card-md transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-semibold text-slate-900">{topic.title}</span>
                    {tBadge && section.primaryAudience !== topic.audience && (
                      <span className={tBadge.className}>{tBadge.label}</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600">{topic.summary}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
