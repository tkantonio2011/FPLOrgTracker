"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

interface Gameweek {
  id: number;
  name: string;
  deadlineTime: string;
  isFinished: boolean;
  isCurrent: boolean;
  isNext: boolean;
}

interface GameweeksData {
  currentGameweek: number;
  gameweeks: Gameweek[];
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number; // ms
}

function calcTimeLeft(deadlineIso: string): TimeLeft {
  const diff = new Date(deadlineIso).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
  return {
    total: diff,
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1000),
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatDeadline(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DeadlineCountdown() {
  const { data } = useQuery<GameweeksData>({
    queryKey: ["gameweeks"],
    queryFn: () => fetch("/api/gameweeks").then((r) => r.json()),
    staleTime: 300_000,
  });

  // Find the next upcoming deadline
  const targetGw = data?.gameweeks?.find((gw) => {
    if (gw.isFinished) return false;
    return new Date(gw.deadlineTime).getTime() > Date.now();
  });

  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(
    targetGw ? calcTimeLeft(targetGw.deadlineTime) : null
  );

  useEffect(() => {
    if (!targetGw) return;
    setTimeLeft(calcTimeLeft(targetGw.deadlineTime));
    const id = setInterval(() => {
      setTimeLeft(calcTimeLeft(targetGw.deadlineTime));
    }, 1000);
    return () => clearInterval(id);
  }, [targetGw?.deadlineTime]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!targetGw || !timeLeft) return null;

  const isUrgent = timeLeft.total <= 3_600_000; // < 1 hour
  const isWarning = timeLeft.total <= 86_400_000; // < 24 hours
  const isCaution = timeLeft.total <= 172_800_000; // < 48 hours

  const urgencyStyles = isUrgent
    ? { border: "border-red-200", bg: "bg-red-50", label: "text-red-600", digits: "text-red-600", badge: "bg-red-100 text-red-700" }
    : isWarning
    ? { border: "border-orange-200", bg: "bg-orange-50", label: "text-orange-600", digits: "text-orange-600", badge: "bg-orange-100 text-orange-700" }
    : isCaution
    ? { border: "border-amber-200", bg: "bg-amber-50", label: "text-amber-600", digits: "text-amber-600", badge: "bg-amber-100 text-amber-700" }
    : { border: "border-slate-200/80", bg: "bg-white", label: "text-slate-500", digits: "text-slate-800", badge: "bg-slate-100 text-slate-600" };

  return (
    <div className={`rounded-xl border ${urgencyStyles.border} ${urgencyStyles.bg} px-4 py-3.5 shadow-card`}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Label + GW name */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`shrink-0 ${isUrgent ? "animate-pulse" : ""}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={urgencyStyles.label}>
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div className="min-w-0">
            <p className={`text-xs font-semibold uppercase tracking-wide ${urgencyStyles.label}`}>
              {isUrgent ? "Deadline imminent!" : isWarning ? "Deadline approaching" : "Next deadline"}
            </p>
            <p className="text-sm font-bold text-slate-800 truncate">{targetGw.name}</p>
          </div>
        </div>

        {/* Countdown digits */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {timeLeft.days > 0 && (
            <>
              <TimeUnit value={timeLeft.days} label="d" styles={urgencyStyles.digits} />
              <Colon styles={urgencyStyles.digits} />
            </>
          )}
          <TimeUnit value={timeLeft.hours} label="h" styles={urgencyStyles.digits} />
          <Colon styles={urgencyStyles.digits} />
          <TimeUnit value={timeLeft.minutes} label="m" styles={urgencyStyles.digits} />
          <Colon styles={urgencyStyles.digits} />
          <TimeUnit value={timeLeft.seconds} label="s" styles={urgencyStyles.digits} />
        </div>

        {/* Deadline date — desktop */}
        <p className="hidden md:block text-xs text-slate-400 shrink-0">
          {formatDeadline(targetGw.deadlineTime)}
        </p>
      </div>

      {/* Deadline date — mobile */}
      <p className="md:hidden text-xs text-slate-400 mt-2">
        {formatDeadline(targetGw.deadlineTime)}
      </p>
    </div>
  );
}

function TimeUnit({ value, label, styles }: { value: number; label: string; styles: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className={`text-xl font-black tabular-nums leading-none ${styles}`}>
        {pad(value)}
      </span>
      <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 mt-0.5">
        {label}
      </span>
    </div>
  );
}

function Colon({ styles }: { styles: string }) {
  return (
    <span className={`text-lg font-black leading-none mb-3 ${styles} opacity-60`}>:</span>
  );
}
