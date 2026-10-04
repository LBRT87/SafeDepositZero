import { clsx } from "clsx";
import { AlertTriangle, CheckCircle2, Clock, Info } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "alert" | "marigold" | "green" | "info";

const tones: Record<Tone, { box: string; icon: ReactNode }> = {
  alert: { box: "bg-alert-50 text-ink", icon: <AlertTriangle className="size-5 text-alert" strokeWidth={1.75} /> },
  marigold: { box: "bg-marigold-50 text-ink", icon: <Clock className="size-5 text-marigold-600" strokeWidth={1.75} /> },
  green: { box: "bg-green-50 text-ink", icon: <CheckCircle2 className="size-5 text-green-700" strokeWidth={1.75} /> },
  info: { box: "bg-ghost text-ink", icon: <Info className="size-5 text-muted" strokeWidth={1.75} /> },
};

/** In-content banner. */
export function Banner({
  tone,
  children,
  action,
  className,
  live,
}: {
  tone: Tone;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  live?: boolean;
}) {
  return (
    <div
      role={tone === "alert" ? "alert" : "status"}
      aria-live={live ? "polite" : undefined}
      className={clsx(
        "flex animate-fade-up flex-col gap-3 rounded-panel px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between",
        tones[tone].box,
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{tones[tone].icon}</span>
        <div className="text-[15px] leading-6">{children}</div>
      </div>
      {action && <div className="shrink-0 pl-8 sm:pl-0">{action}</div>}
    </div>
  );
}
