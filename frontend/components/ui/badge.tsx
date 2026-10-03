import { clsx } from "clsx";
import type { ClaimStatus, PolicyStatus } from "@/lib/data/types";

export type BadgeTone = "green" | "marigold" | "alert" | "neutral" | "info";

const tones: Record<BadgeTone, string> = {
  green: "bg-green-50 text-green-700",
  marigold: "bg-marigold-50 text-marigold-ink",
  alert: "bg-alert-50 text-alert",
  neutral: "bg-ghost text-muted",
  info: "bg-accent-50 text-accent-700",
};

export function Badge({ tone, children, className }: { tone: BadgeTone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] font-semibold leading-none",
        tones[tone],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

const POLICY: Record<PolicyStatus, [BadgeTone, string]> = {
  Invited: ["info", "Invite sent"],
  Active: ["green", "Protected"],
  Lapsed: ["alert", "Lapsed"],
  Ended: ["marigold", "Claim window open"],
  Claimed: ["marigold", "Claim in progress"],
  Closed: ["neutral", "Closed"],
  Cancelled: ["neutral", "Withdrawn"],
};

export function PolicyBadge({ status, windowPassed }: { status: PolicyStatus; windowPassed?: boolean }) {
  if (status === "Ended" && windowPassed) return <Badge tone="neutral">Window passed</Badge>;
  const [tone, label] = POLICY[status];
  return <Badge tone={tone}>{label}</Badge>;
}

const CLAIM: Record<ClaimStatus, [BadgeTone, string]> = {
  None: ["neutral", "No claim"],
  Filed: ["marigold", "Waiting for tenant"],
  Accepted: ["green", "Accepted"],
  Disputed: ["marigold", "Disputed"],
  Approved: ["green", "Approved"],
  PartiallyApproved: ["green", "Partly approved"],
  Rejected: ["alert", "Rejected"],
  Paid: ["green", "Paid"],
};

export function ClaimBadge({ status }: { status: ClaimStatus }) {
  const [tone, label] = CLAIM[status];
  return <Badge tone={tone}>{label}</Badge>;
}
