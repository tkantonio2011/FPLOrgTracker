import Link from "next/link";
import { manualManifest } from "@/content/manual/manifest";
import { audienceBadge } from "@/lib/manual/audience";

export default function HelpHomePage() {
  const { sections } = manualManifest;

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">User Manual</h1>
        <p className="text-slate-600 max-w-2xl">
          Everything you need to use this platform — how to read each analytics page, how to switch
          between leagues, and (for League Admins) how to invite members, configure your league, and
          send the weekly digest. Search above or browse the sections below.
        </p>
      </header>

      {sections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
          <p className="text-slate-600">No topics published yet. Check back after the next release.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sections.map((section) => {
            const badge = audienceBadge(section.primaryAudience);
            return (
              <Link
                key={section.id}
                href={section.path}
                className="block rounded-lg border border-slate-200 bg-white p-5 hover:border-[#37003c] hover:shadow-card-md transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
                  {badge && <span className={badge.className}>{badge.label}</span>}
                </div>
                {section.summary && (
                  <p className="text-sm text-slate-600 mb-3">{section.summary}</p>
                )}
                <p className="text-xs text-slate-400">
                  {section.topics.length} topic{section.topics.length === 1 ? "" : "s"}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
