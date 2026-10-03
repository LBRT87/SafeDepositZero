"use client";

import { clsx } from "clsx";
import { useNow } from "@/lib/hooks";
import { countdown } from "@/lib/format";

/** Live countdown to `deadline` (unix seconds). Renders `passed` once the deadline is reached. */
export function Countdown({
  deadline,
  passed = "Deadline passed",
  className,
}: {
  deadline: number;
  passed?: string;
  className?: string;
}) {
  const now = useNow();
  if (now === null) return <span className={clsx("nums", className)}>–:––</span>;
  const left = deadline - now;
  return (
    <span className={clsx("nums", className)} aria-live="off">
      {left > 0 ? countdown(left) : passed}
    </span>
  );
}

export function useSecondsLeft(deadline: number | null | undefined): number | null {
  const now = useNow();
  if (now === null || !deadline) return null;
  return deadline - now;
}
