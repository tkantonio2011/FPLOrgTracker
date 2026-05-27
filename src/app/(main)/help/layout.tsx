import type { ReactNode } from "react";
import type { Metadata } from "next";
import { ManualLayout } from "@/components/manual/ManualLayout";
import { manualManifest } from "@/content/manual/manifest";

export const metadata: Metadata = {
  title: "Help",
};

export default function HelpLayout({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-7xl mx-auto">
      <ManualLayout manifest={manualManifest}>{children}</ManualLayout>
    </div>
  );
}
