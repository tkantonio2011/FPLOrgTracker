/**
 * Persistent UAT environment banner. Server-rendered, no client JS.
 *
 * Mounted from src/app/layout.tsx behind an `isUat()` guard so production
 * renders are byte-identical to the pre-feature behaviour. Yellow chosen
 * because the existing Tailwind palette does not use yellow for any
 * production UI element.
 *
 * Satisfies FR-021 + SC-005: every page (member or admin) must carry an
 * unmistakable indicator that the environment is UAT.
 */

export default function UatBanner() {
  return (
    <div
      role="status"
      aria-label="UAT environment indicator"
      className="sticky top-0 z-50 w-full bg-yellow-400 text-yellow-900 text-center text-sm font-semibold py-1.5 px-4 border-b border-yellow-500"
    >
      UAT environment — non-production data may be present
    </div>
  );
}
