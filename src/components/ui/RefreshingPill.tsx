/**
 * Subtle "Updating…" indicator shown while a background refetch is in flight
 * over cached data. Tells the user the visible numbers may change shortly,
 * so a stale-then-fresh flash doesn't look like a bug or misleading info.
 */
export function RefreshingPill({ label = "Updating…" }: { label?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      {label}
    </span>
  );
}
