import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const metadata = { title: "Changelog — FPL Org Tracker" };

interface Section {
  version: string;
  date: string;
  groups: { heading: string; items: string[] }[];
}

function parseChangelog(md: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  let currentGroup: { heading: string; items: string[] } | null = null;

  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();

    // ## v1.5.0 — 2026-04-09
    const versionMatch = line.match(/^##\s+(v[\d.]+)\s*[—–-]\s*(.+)/);
    if (versionMatch) {
      if (current) sections.push(current);
      current = { version: versionMatch[1], date: versionMatch[2].trim(), groups: [] };
      currentGroup = null;
      continue;
    }

    // ### New Features / Bug Fixes
    const groupMatch = line.match(/^###\s+(.+)/);
    if (groupMatch && current) {
      currentGroup = { heading: groupMatch[1], items: [] };
      current.groups.push(currentGroup);
      continue;
    }

    // - **Feature** — description
    if (line.startsWith("- ") && currentGroup) {
      currentGroup.items.push(line.slice(2));
    }
  }

  if (current) sections.push(current);
  return sections;
}

function renderItem(raw: string) {
  // Bold **text** → <strong>
  const parts = raw.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} className="font-semibold text-slate-800">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

export default function ChangelogPage() {
  const mdPath = path.join(process.cwd(), "CHANGELOG.md");
  const md = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, "utf-8") : "";
  const sections = parseChangelog(md);

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Release Notes</h1>
        <p className="text-sm text-slate-400 mt-0.5">FPL Organisation Tracker — full version history</p>
      </div>

      {sections.map((section) => (
        <div key={section.version} className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#37003c] text-[#00ff87] tabular-nums">
                {section.version}
              </span>
              <span className="text-sm font-semibold text-slate-700">{section.date}</span>
            </div>
          </div>

          <div className="px-5 py-4 space-y-4">
            {section.groups.map((group) => (
              <div key={group.heading}>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  {group.heading}
                </p>
                <ul className="space-y-1.5">
                  {group.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600 leading-relaxed">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                      <span>{renderItem(item)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
