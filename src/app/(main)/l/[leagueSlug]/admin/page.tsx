import { redirect } from "next/navigation";

/** Bare `/admin` → land on the settings tab. */
export default function LeagueAdminIndexPage({
  params,
}: {
  params: { leagueSlug: string };
}) {
  redirect(`/l/${params.leagueSlug}/admin/settings`);
}
