import { clsx } from "clsx";
import type { ReactNode } from "react";

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={clsx("rounded-panel border border-line bg-surface", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 rounded-t-[13px] border-b border-line bg-tint px-5 py-4 md:px-6">
          <div className="min-w-0">
            {title && <h3 className="t-h3">{title}</h3>}
            {description && <p className="t-small mt-1 text-muted measure">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx("px-5 py-5 md:px-6", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-8 pt-10 md:pt-12">
      <div className="min-w-0">
        <h1 className="t-h1">{title}</h1>
        <p className="t-body-l mt-2 text-muted measure">{subtitle}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Label/value pair. */
export function Stat({
  label,
  value,
  sub,
  size = "l",
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  size?: "xl" | "l" | "body";
  tone?: "green" | "alert";
}) {
  return (
    <div className="min-w-0">
      <div className="t-small text-muted">{label}</div>
      <div
        className={clsx(
          "mt-1 nums",
          size === "xl" ? "t-amount-xl" : size === "l" ? "t-amount-l" : "t-body font-semibold",
          tone === "green" && "text-green-700",
          tone === "alert" && "text-alert",
        )}
      >
        {value}
      </div>
      {sub && <div className="t-small mt-1 text-muted">{sub}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("animate-soft-pulse rounded-[8px] bg-ghost", className)} />;
}

export function EmptyState({ title, body, action }: { title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-panel border border-dashed border-line-strong bg-surface px-6 py-10">
      <h3 className="t-h3">{title}</h3>
      {body && <p className="text-muted measure">{body}</p>}
      {action}
    </div>
  );
}
