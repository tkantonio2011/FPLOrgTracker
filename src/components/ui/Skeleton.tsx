import { HTMLAttributes } from "react";

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  height?: string;
  width?: string;
  rounded?: boolean;
}

export function Skeleton({ height = "h-4", width = "w-full", rounded = false, className = "", ...props }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-slate-100 ${height} ${width} ${rounded ? "rounded-full" : "rounded-md"} ${className}`}
      {...props}
    />
  );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-xl p-5 space-y-3 shadow-card">
      <Skeleton height="h-5" width="w-1/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height="h-4" width={i % 2 === 0 ? "w-full" : "w-4/5"} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/80">
        <Skeleton height="h-4" width="w-1/4" />
      </div>
      <div className="divide-y divide-slate-50">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-5 py-3.5 flex gap-4 items-center">
            <Skeleton height="h-4" width="w-8" rounded />
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} height="h-4" width={c === 0 ? "w-1/3" : "w-1/6"} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
