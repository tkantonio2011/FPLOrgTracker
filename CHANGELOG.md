# Changelog

All notable changes to the FPL Organisation Tracker are documented here.

## vNEXT

### New Features
- **Member registration status in Admin** — The Members list on the Admin page now shows whether each member has registered on the app and when; registered members display their registration date in green alongside their last login date; unregistered members show "Not registered" in muted text; `lastLoginAt` is stamped on the User record on every successful login

---

## v1.6.1 — 2026-04-09

### Bug Fixes
- **Org settings not persisting on AWS** — `GET /api/org` has no `request` parameter, so Next.js 14 treated it as a static route and pre-rendered its response at build time using the local dev database, storing the result as `.next/server/app/api/org.body`; every request on EC2 was served this baked-in file verbatim — completely bypassing the live database — so writes would succeed (correct org record updated in prod.db) but reads always returned the frozen build-time snapshot; fixed by adding `export const dynamic = "force-dynamic"` to the org route and by adding a deploy step that deletes all `*.body` / `*.meta` prebuilt API files after rsync as a safety net for any route still lacking that annotation
- **Admin form fields not refreshed after save** — after a successful save the org name and mini-league ID form fields were not updated from the API response, so navigating away and back could show a stale value; fixed by syncing all three state variables (`org`, `orgName`, `miniLeagueId`) from the re-fetched org after every successful save
- **Sync uses form value directly, not a pre-save** — the previous fix for "Sync ignores unsaved league ID" called `/api/org/setup` as a pre-step before syncing, which required a valid admin cookie and could silently abort the whole sync if that cookie had expired; replaced with a single atomic approach: `miniLeagueId` from the form is passed in the sync request body, and the sync endpoint persists it to the DB before fetching the league standings
- **Sync from League ignores unsaved league ID change** — clicking "Sync from League" after changing the league ID in the form (without clicking "Save" first) would sync against the old league ID stored in the database, leaving the member list unchanged; resolved by passing the current form value directly to the sync endpoint
- **Sync from League never removes stale members** — members who leave the league (or remain from a previous league when the ID is changed) were never deactivated; syncing only added new members, so the list would grow indefinitely and swapping leagues had no effect; fixed by deactivating active league-sourced members who are absent from the current sync results (manually-added members with `source: "manual"` are left untouched); `removed` count added to the sync response and surfaced in the success message
- **Removed member reactivated by next sync** — manually removing a member then clicking "Sync from League" would silently bring them back (they're still in the league), causing a "Member already exists" error on the next manual add attempt; resolved by the stale-member cleanup above — a member removed from the admin UI will be re-deactivated on the next sync if they no longer appear in the league standings
- **Database wiped on every deploy** — `rsync --delete` in `deploy.sh` was syncing `.next/standalone/` (which contains no `prisma/` directory) to `APP_DIR/` with `--delete`, causing it to delete the entire `APP_DIR/prisma/` directory including `prod.db` on every deployment; the subsequent prisma rsync excluded `*.db` so the database was never restored, forcing all users to re-register after each deploy; fixed by adding `--exclude=prisma/ --exclude=.env.local` to the first rsync so the live database and env file are preserved across deploys

---

## v1.6.0 — 2026-04-09

### New Features
- **User authentication** — League members can now register and log in; registration validates the submitted FPL Manager ID against the org's mini-league (Member table first, FPL API fallback); passwords hashed with Node `crypto.scrypt` (no extra dependency); 30-day httpOnly session cookie signed with HMAC-SHA256; all routes are protected by Next.js middleware and redirect to `/login` when unauthenticated; login and register pages use the FPL purple full-screen layout (outside AppShell); a "Sign out" button appears at the bottom of the sidebar; requires running `prisma migrate deploy` after deploying (`users` table added)
- **Season Points Race chart** — Multi-line chart on the Standings page showing cumulative total points per manager across every gameweek; one coloured line per manager (leader's line slightly bolder); dashed reference line at the current GW; tooltip shows all managers sorted by pts with gap-to-leader indicator; reuses the `league-history` TanStack Query cache so no extra network request after visiting the home page
- **Form table sparklines** — Each row in the Form Table now includes a "Trend" column with a tiny inline SVG sparkline connecting the last 3 GW scores; green line = improving, red = declining, grey = flat; subtle area fill under the line reinforces direction; dots at each data point; works on both desktop and mobile layouts; pure SVG, no library
- **Agony org breakdown chart** — Stacked bar chart at the top of the Agony Index page showing all managers side by side, with each bar segmented by component (GW Suffering / Bench Waste / Transfer Hits / Captain Blanks); "Biggest org pain" callout in the header identifies the dominant source of collective misery; org totals per component shown in the legend; tooltip shows per-component values and total agony on hover
- **Bench Points Heatmap** — Compact manager × GW grid on the Bench Waste page; cell colour intensity from pale gold → orange → deep red based on bench pts that week; red outline highlights each manager's personal worst GW; an org-total row at the bottom shows cumulative bench pain per GW; GW header numbers turn red when the org total for that week was high; hover scales the cell with a tooltip; colour scale legend in the card header
- **Captain What-If bar chart** — Colour-coded bar chart on the Captain What-If page showing missed captain pts for every GW; green = optimal pick, amber = small miss (≤4 pts), orange = moderate miss (≤10 pts), red = big miss (>10 pts); header callout shows optimal count, miss count, and worst GW at a glance; tooltip shows captained player, best owned alternative, raw missed pts, and actual score impact; chart appears per-manager between the season summary tiles and the GW breakdown list
- **Relegation Zone styling** — Bottom 3 managers in the Standings leaderboard get red-tinted rows, a DANGER badge next to their name, and a thin colour-coded bar at the bottom of their row showing depth in the danger zone (amber → orange → red from 3rd-bottom to last); a dashed ⚠️ Relegation Zone separator line divides safe managers from the drop zone; only activates when the org has 4+ managers; purely cosmetic
- **Season of Pain counter** — Dark FPL-purple card on the home page showing four cumulative org-wide suffering stats: bench pts left to rot, pts flushed on transfer hits, total pts suffered below the weekly GW winner, and count of below-average GWs across the org; each tile has a footnote surfacing the single most painful moment (worst bench GW, hit count, darkest collective week); skeleton loading state; silently absent if org not configured; sits above the Weekly Highlights Reel
- **GW Punishment Suggester** — Amber card on the home page sentencing the bottom GW scorer to one of 33 pre-written forfeits; deterministic per GW (same punishment every time for the same GW) but a "Spin" button cycles through alternatives; punishments range from group-chat confessionals and mandatory PowerPoints to captain-choice vetoes and voice-note post-mortems; no AI required
- **Post-GW Tribunal** — After each gameweek, the bottom-scoring org manager faces a fictional press conference on the home page; Malcolm Sharp from The FPL Gazette asks three pointed questions referencing actual stats (captain pts, bench waste, GW score vs average, rank drop) and the manager gives defensive, excuse-laden answers with energy trading / software humour; dark red "press conference room" styled card with pulsing live dot; collapsible; auto-generated by Groq (llama-3.1-8b-instant) on first load and cached per GW in localStorage; silently absent when Groq is not configured
- **Season Stats score distribution chart** — Horizontal box-and-whisker chart on the Season Stats page showing the distribution of each manager's GW scores; box spans Q1→Q3 (middle 50%), vertical line = median, hollow circle = average, whiskers extend to min/max; faint dots behind each box show every individual GW score with jitter to avoid overlap; common x-axis lets managers be compared directly — a wide box = volatile manager, a narrow box = consistent one; hover any manager row for a tooltip showing min/Q1/median/avg/Q3/max and IQR spread; alternating row stripes; legend explains the visual encoding
- **Regret GW net bar chart** — Waterfall-style bar chart on the Transfer Regret page showing net transfer pts per GW for the selected manager; green bars extend up for gains, red bars extend down for losses; zero reference line bisects the chart; clicking a bar dims all other bars, scrolls to and highlights that GW's detail card with a purple ring (auto-clears after 2.5 s); header shows total gained, total lost, and season net at a glance; tooltip shows transfer count, hit cost, and net for each GW
- **Captain History cumulative line chart** — Multi-line chart on the Captain History page showing each manager's running total of raw captain points across the season; leader's line slightly bolder; dashed reference line at the current GW; tooltip lists all managers sorted by cumulative pts with gap-to-leader indicator; colour legend in the header with each manager's season total; sits above the per-GW grid table
- **Luck stacked bar chart** — Horizontal stacked bar chart on the Lucky/Unlucky page showing captain luck / bench luck / auto-sub luck composition per manager; sorted luckiest → least lucky; bars extend right (+) or left (−) of zero reference line so positive and negative contributions are immediately visible; custom tooltip shows all three components and total; legend displays org-wide totals per component; sits between the hero banners and the per-manager detail cards
- **Pre-GW Horoscope** — Before each deadline, Groq generates a personalised star-sign reading for every manager on the home page; each prediction is 2–3 sentences blending mystical horoscope language with cold FPL statistics (recent scores become "cosmic sequences", unused chips are "dormant amulets", being last is "the outer planets conspire"); tone is calibrated by org position — top manager gets smug celestial destiny, bottom gets dark omens and Mercury-in-retrograde energy, mid-table gets an ambivalent universe; star signs are deterministically assigned per manager ID; generated once per GW for the whole org in a single Groq call and cached in localStorage; deep-space indigo gradient card with pulsing star, collapsible, silently absent when Groq is not configured
- **Rival Trash Talk** — On the H2H Battle page, a Groq-generated boxing weigh-in quote from each manager's "corner" appears above the rivalry stats; the leader is smug and references their specific edge, the trailer is defiant or in denial; quotes are generated with temperature 1.2 for personality, reference at least one real stat (wins, streak, pts gap, biggest win), and occasionally weave in energy trading / software metaphors; dark gradient "press row" card with emerald (A) and rose (B) corner labels; cached per matchup per GW in localStorage; silently absent when Groq is not configured

### Bug Fixes
- **Map/Set iterator build errors** — Fixed three TypeScript downlevel-iteration errors in `differentials`, `regret`, and `titles` routes by wrapping bare `Map`/`Set` iterations in `Array.from()`
- **Horoscope sign emoji mangled** — Groq was returning zodiac symbols as HTML entities (e.g. `&#x2642;`); fixed by overriding `sign` and `signEmoji` from the server-side SIGNS array by array position instead of trusting Groq's output
- **Horoscope manager names showing as "Manager 1–10"** — Groq was numbering managers 1..N instead of using real FPL IDs; fixed by re-pinning `managerId` from the enriched managers array by position after Groq responds
- **Horoscope star signs replaced with energy trading archetypes** — Replaced standard zodiac signs with 12 energy trading archetypes (The Gas Peaker, The Force Majeure, The Negative Price, The Baseload Beast, etc.); Groq prompt updated to invoke each archetype and blend trading floor jargon with FPL mysticism
- **`league-history` route type error** — `series` record type was missing `totalPoints` field; added to type declaration to fix build failure
- **`AppShell` named import warning** — Replaced `import { version } from 'package.json'` with default import and explicit extraction to silence webpack deprecation warning
- **Auth middleware Edge Runtime crash** — Middleware imported `auth.ts` which calls `promisify(scrypt)` at module load time, crashing the Edge Runtime; fixed by extracting `auth-edge.ts` which uses only the Web Crypto API (`crypto.subtle`) for token verification; Node-only password hashing remains in `auth.ts`
- **Session cookies broken on HTTP deployment** — Cookies were set with `secure: NODE_ENV === "production"` which silently drops them over plain HTTP, causing an infinite redirect loop on EC2; replaced with `secure: COOKIE_SECURE === "true"` env flag; `COOKIE_SECURE=false` added to `.env.production` for the HTTP-only EC2 setup
- **Changelog page serving stale content** — Added `export const dynamic = "force-dynamic"` to the changelog page so it re-reads `CHANGELOG.md` from disk on every request instead of serving a cached static render
- **Admin API routes blocked by middleware** — Middleware was intercepting `POST /api/org/setup`, `/api/org/sync`, and `DELETE /api/members/*` and redirecting them to `/login`, returning HTML instead of JSON; fixed by passing all `/api/*` routes through the middleware (they handle their own auth internally)
- **Admin page inaccessible after auth rollout** — `/admin` was being redirected to `/login` by the middleware before the PIN gate could render; fixed by adding `/admin` to the middleware public paths
- **Sync from League not restoring removed members** — Previously removed members (soft-deleted via `isActive: false`) were being silently reactivated by sync but not counted, so the status message showed "added 0" and appeared to do nothing; fixed by tracking a `reactivated` counter and surfacing it in the success message (e.g. "3 reactivated. Total active: 10")
- **Register 500 — `db.user` undefined** — Prisma client was not regenerated after adding the `User` model; fixed by running `prisma migrate dev` / `prisma db push` followed by `prisma generate`

---

## v1.5.11 — 2026-04-09

### New Features
- **AI Season Narrative** — Each manager's profile page features a "Season So Far" paragraph auto-generated by Groq (llama-3.1-8b-instant) in the style of a football match programme bio; tone is calibrated by org position (smug if leading, brutal if bottom, wryly resigned in mid-table); references specific stats (bench pts wasted, transfer hit cost, pts behind leader, best/worst GW); dark purple gradient card with decorative quote mark; generated once per GW per manager and cached in localStorage; silently absent when Groq is not configured

### Bug Fixes
- **Agony Index crash** — Fixed TypeScript error where component pills used `breakdown[key]` instead of the correctly aliased `b[key]`, causing a build failure

---

## v1.5.10 — 2026-04-09

### New Features
- **Auto-generated Season Titles** — Each manager earns a unique funny title based on their season stats; titles appear as coloured badges in the Standings leaderboard and Season Stats cards; competitive titles (e.g. "The League Leader", "The Gambler", "The Bench Billionaire", "The Fossil", "The Bottler", "Mr. Consistent") are assigned to exactly one manager each based on ranked stats; "Safe Pair of Hands" is awarded to any manager with zero transfer hits; remaining managers get rotating fallback titles (The Dark Horse, The Challenger, The Wildcard, etc.)
- **H2H Battle Simulator** — Pick any two org managers and see their complete head-to-head record across every gameweek of the season; dark rivalry summary card shows wins/losses/draws, net points advantage, average margin, longest winning streak per manager, and current streak; GW-by-GW breakdown table with green/red row tinting (A wins / B wins), margin badges, and a running cumulative score column; defaults to the first two org members on page load; includes two chart views (GW Scores grouped bar chart with faded losing bars, and Cumulative Gap line chart tracking the running points difference with colour-coded dots)
- **Lucky/Unlucky Ranking** — Measures FPL luck per manager across three components: captain luck (actual captain pts vs org-average captain pts each GW), bench luck (your bench pts vs org-average bench pts — below average is lucky), and auto-sub luck (pts scored by auto-subbed players vs org average); hero banners for the "Luckiest Manager" and "Most Hard Done By" with contextual bullet points (captain hauls/blanks, bench over/under-performance); full ranking with proportional luck bars and per-component breakdown tiles with raw numbers on hover; all scores relative to the org average so zero = exactly average luck
- **Agony Index** — Composite misfortune leaderboard ranked from most to least miserable; score = bench pts wasted + captain blank penalty (captain pts × 2 for GWs where captain scored ≤ 2) + transfer hit cost + GW suffering (sum of pts behind the org GW winner each gameweek); stacked proportion bar per manager shows each component's contribution in a distinct colour; per-manager component pills with hover explanations; flavour text tailored to the dominant source of pain; worst-GW callout when the gap from the org winner exceeded 20 pts; last-place manager gets the "protected by the algorithm" treatment
- **Transfer Regret Tracker** — For every transfer made this season, compares the points scored by the player brought in vs the player sold in that same gameweek; shows net gain (+8 pts) or regret (−14 pts) per transfer; GW blocks group transfers together with chip badge, hit cost, and a GW-level net verdict; season rankings table shows all managers ordered by total transfer net pts with a bar chart; manager tabs let you drill into any individual's full transfer log; Hall of Fame surfaces the single best and worst individual transfer of the season org-wide, plus a per-manager best/worst summary
- **Weekly Highlights Reel** — "GW in Drama" card on the home page with auto-generated bullet points narrating the most interesting moments of the gameweek; detects leadership changes (with streak length), rank crossovers that broke a multi-week pattern, GW top scorer, GW bottom scorer, the biggest rank climber and faller, above-average streaks (3+ GWs in a row), chips played, and whether the 1st-to-last points gap is a season high; colour-coded by type (violet = dramatic, green = positive, red = negative); silently absent when there's nothing noteworthy to say
- **Captain What-If Calculator** — For every GW, shows who you captained, who the best available captain in your squad was, and the exact pts cost; season summary tiles showing total pts lost (actual score impact), raw missed pts, optimal pick count, and biggest miss; per-GW breakdown with green rows for optimal picks and amber "Best owned" line when a better option existed; org-wide captain decision ranking with accuracy percentage bars; footnote clarifying "best owned" = best in your 15-man squad and pts lost = raw difference × 2

### Improvements
- **Grouped sidebar navigation** — Nav links reorganised into four labelled sections (Gameweek, Season, Scout, and ungrouped Home/Admin); sections are collapsible with accordion behaviour — clicking a section header opens it and closes all others; the section containing the active page opens automatically on load and on navigation; chevron rotates to indicate collapsed state

---

## v1.5.9 — 2026-04-09

### New Features
- **Live GW Points Tracker** — New "Live Points" page shows each org manager's real-time gameweek score as matches are played; auto-refreshes every 60 seconds during active gameweeks; displays captain name and points, active chip badges (BB/TC/FH/WC), org average, and gap to leader; accessible via the sidebar nav
- **Deadline Countdown** — Live countdown timer on the home page showing days, hours, minutes and seconds until the next FPL transfer deadline; colour changes from neutral → amber (48 h) → orange (24 h) → red with pulse (1 h)
- **Transfer Activity** — New "Transfers" page showing every manager's transfers in/out for each gameweek; highlights crowd picks (same player transferred in by 2+ managers) and differentials (unique to one manager); shows points hits, a popularity bar chart of ins and outs, and a "no transfers" roll-call for managers who held
- **Bench Points Wasted** — New "Bench Waste" page with season-long running totals of points left on the bench per manager; ranked leaderboard with "Bench King" / "Most Efficient" badges, cumulative line chart comparing all managers over the season, per-GW bar chart per manager with worst GW highlighted in red, and Hall of Shame showing each manager's single most painful gameweek
- **Captain History** — New "Captains" page showing who each manager captained every gameweek, the captain's raw points, and a season-long efficiency ranking (average captain pts per GW); includes a scrollable per-GW grid table with green/red highlighting for best/worst captain each week, TC badges for Triple Captain, and Best/Worst Captain Moments cards
- **Differential Alerts** — New "Differentials" page flagging players owned by some org managers but not others; scores each player by swing impact (expected pts × split factor, peaking at 50/50 ownership); shows owner/non-owner name chips, next fixture FDR, form and expected pts; filterable by position, sortable by swing/form/ep/divisiveness; red/amber/grey alert tiers
- **Injury &amp; Doubt Tracker** — New "Injuries" page surfacing FPL injury flags (red = out/suspended/unavailable, amber = doubtful) for every player owned within the org; shows FPL news text with age, chance-of-playing bars for this and next GW, captain/vice-captain warnings, starting/bench status per owner; auto-refreshes every 10 minutes; shows green "all clear" when no org player is flagged
- **Form Table** — New "Form Table" page ranking managers by points scored in the last 3 completed gameweeks only; each row shows the 3 individual GW scores colour-coded against the org average (green = above, red = below, bold border = GW best/worst), a 3-GW total, an arrow indicator showing how form rank compares to overall league position (↑/↓ with delta), and an "On fire / Struggling / Patchy / Steady" badge; In Form and Out of Form callout panels below; org averages shown per GW for reference
- **Season Stats Cards** — New "Season Stats" page with a card per manager showing: highest and lowest GW scores, average GW score, total bench points wasted, total transfer hit cost, and all chip slots with used/available state; org-wide summary strip at top; Best/Worst badges highlight org extremes across each metric; colour-coded chip badges with tooltips showing which GW each was used

---

## v1.5.8 — 2026-04-09

### Improvements
- **Release workflow** — `deploy.sh --skip-build` no longer bumps the version (fixes mismatch between pre-built app and changelog); WSL 1 users should run `npm run release` on Windows before building to stamp the version and changelog correctly

---

## v1.5.7 — 2026-04-09

### Improvements
- **Deploy version bump** — Replaced `npm version` with a Python-based patch increment to avoid `node: command not found` errors in WSL 1

---

## v1.5.6 — 2026-04-09

### New Features
- **Mobile-friendly layout** — Responsive design across all pages; sidebar becomes a slide-in drawer on mobile with a hamburger menu button in the top bar

### Improvements
- **Changelog versioning** — Version number is now stamped automatically by `deploy.sh`; the correct version and date are applied at deploy time

---

## v1.5.3 — 2026-04-09

### New Features
- **League position chart** — Line chart on the landing page showing each manager's org position across every gameweek; one coloured line per manager with an interactive tooltip displaying full names and positions
- **Sidebar fixed layout** — Sidebar no longer scrolls with the main content; stays in place at all times

### Improvements
- **AI verdicts — third person** — Performance report verdicts are now written about managers (not to them), suitable for display to the whole group
- **AI verdicts — auto-generated** — Verdicts generate automatically on first page load each gameweek with no manual button required; cached in browser storage and reused on subsequent visits
- **AI verdicts — sync trigger** — Clicking "Sync from League" on the Admin page now regenerates and caches fresh verdicts immediately
- **Chart tooltip full names** — Hovering the league position chart now shows each manager's full name including surname

---

## v1.5.2 — 2026-04-09

### New Features
- **League position chart** — Line chart on the landing page showing each manager's org position across every gameweek; one coloured line per manager with an interactive tooltip displaying full names and positions
- **Sidebar fixed layout** — Sidebar no longer scrolls with the main content; stays in place at all times

### Improvements
- **AI verdicts — third person** — Performance report verdicts are now written about managers (not to them), suitable for display to the whole group
- **AI verdicts — auto-generated** — Verdicts generate automatically on first page load each gameweek with no manual button required; cached in browser storage and reused on subsequent visits
- **AI verdicts — sync trigger** — Clicking "Sync from League" on the Admin page now regenerates and caches fresh verdicts immediately
- **Chart tooltip full names** — Hovering the league position chart now shows each manager's full name including surname

---

## v1.5.1 — 2026-04-09

### Improvements
- **Release notes link** — Sidebar footer now shows "Release notes" label alongside the version number for clarity

---

## v1.5.0 — 2026-04-09

### New Features
- **Landing page** — New home page with org overview, top-5 mini leaderboard, quick-access links, and a randomly selected FPL quote that refreshes on click
- **GW Performance Report** — Expandable section on the landing page with AI-generated, EnergyOne-themed verdicts for each manager's gameweek performance; generated once per gameweek and cached locally
- **AI integration (Groq)** — Free-tier AI verdict generation via Groq's `llama-3.1-8b-instant` model; falls back to built-in verdicts if API key is not configured
- **Home nav item** — Sidebar now includes a Home link as the first navigation item

---

## v1.4.0 — 2026-04-02

### New Features
- **Org chip usage table** — Shows which chips each member has used and which are still available, using the FPL bootstrap chip windows to correctly distinguish H1 vs H2 wildcards

### Bug Fixes
- **Chip availability logic** — Fixed incorrect chip status when the same chip type is available in two separate windows (e.g. wildcard H1 and H2 in 2025/26)

---

## v1.3.0 — 2026-03-28

### New Features
- **AWS deployment via Terraform** — One-command infrastructure provisioning on EC2 t2.micro (free tier); includes Nginx reverse proxy, PM2 process manager, and SQLite persistence
- **Deploy script** (`scripts/deploy.sh`) — Automated build, upload, migration, and restart pipeline; supports `--skip-build` flag for WSL 1 users who build from Windows

### Bug Fixes
- **HTTP cookie security** — Admin session cookie no longer marked `secure` on plain HTTP deployments; uses `x-forwarded-proto` header to detect HTTPS correctly
- **Standings crash on unconfigured org** — Replaced client-side crash with a friendly amber banner linking to Admin setup
- **Nginx 403 on static assets** — Fixed home directory permissions so Nginx can traverse `/home/ec2-user/app`
- **Prisma binary on Linux** — Resolved cross-platform engine mismatch by copying the Linux binary into the standalone output before upload

---

## v1.2.0 — 2026-03-20

### New Features
- **Admin PIN protection** — All mutating admin operations (org setup, member sync, member management) are gated behind a configurable PIN stored as `ADMIN_PIN` in the environment
- **PIN gate UI** — Admin page shows a PIN entry form when locked; authenticated state is held in an HTTP-only session cookie
- **Stateless session tokens** — Admin tokens are HMAC-SHA256 derived from the PIN; no database session storage required

---

## v1.1.0 — 2026-03-10

### New Features
- **Standings page** — Gameweek leaderboard with rank change indicators, chip badges, org average, and global FPL average; auto-refreshes every 60 seconds
- **Fixtures page** — Upcoming fixtures with FDR difficulty ratings per team
- **Ownership page** — Shows which players are owned across the org with ownership percentages
- **Member profile pages** — Per-manager view with points history and squad details
- **Suggestions — Captain** — AI-assisted captain recommendation based on fixtures and ownership
- **Suggestions — Chips** — Chip availability and recommended usage timing per member
- **Suggestions — Transfers** — Differential transfer recommendations based on org ownership gaps
- **Gameweek selector** — Navigate historical gameweeks on the standings page

---

## v1.0.0 — 2026-03-01

### Initial Release
- **Organisation setup** — Configure an FPL mini-league or manually add manager IDs
- **Member sync** — Pull manager names and team names directly from the FPL API
- **Admin panel** — Web UI for org configuration, member management, and manual sync
- **SQLite database** — Lightweight persistence via Prisma with automatic migrations on deploy
- **Next.js App Router** — Full-stack TypeScript application with server and client components
- **Tailwind CSS design system** — Consistent UI with FPL-inspired purple gradient sidebar
