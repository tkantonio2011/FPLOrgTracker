import { HTMLAttributes } from "react";

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "purple"
  | "chip";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-slate-100 text-slate-600 ring-1 ring-slate-200/80",
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-1 ring-red-200",
  info: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  purple: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  chip: "bg-[#00ff87] text-[#37003c] font-semibold ring-0",
};

export function Badge({ variant = "default", className = "", children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

/** Returns the appropriate Badge variant for an FPL player status code */
export function playerStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "a": return "success";
    case "d": return "warning";
    case "i": return "danger";
    case "s": return "danger";
    case "u": return "default";
    default: return "default";
  }
}

/** Returns a human-readable label for an FPL player status code */
export function playerStatusLabel(status: string): string {
  switch (status) {
    case "a": return "Available";
    case "d": return "Doubtful";
    case "i": return "Injured";
    case "s": return "Suspended";
    case "u": return "Unavailable";
    default: return "Unknown";
  }
}

/** Maps a chip name to a display label */
export function chipLabel(chipName: string): string {
  switch (chipName) {
    case "bboost": return "Bench Boost";
    case "3xc": return "Triple Captain";
    case "wildcard": return "Wildcard";
    case "freehit": return "Free Hit";
    default: return chipName;
  }
}
