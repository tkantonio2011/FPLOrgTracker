import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/lib/query-client";
import { isUat } from "@/lib/uat/environment";
import UatBanner from "@/components/uat/UatBanner";

export const metadata: Metadata = {
  title: "FPL Tracker",
  description: "Track Fantasy Premier League progress across multiple leagues.",
};

// The root layout reads APP_ENV at request time (via isUat()) to decide whether
// to render the UAT banner. Without force-dynamic, Next.js evaluates isUat()
// once at build time — and the build runs without APP_ENV=uat — so the banner
// would be missing from every cached page. Forcing dynamic rendering on the
// root layout keeps the banner correct without requiring per-page changes.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const showUatBanner = isUat();
  return (
    <html lang="en">
      <body>
        {showUatBanner && <UatBanner />}
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
