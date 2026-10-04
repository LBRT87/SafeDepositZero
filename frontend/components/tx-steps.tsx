"use client";

import { clsx } from "clsx";
import { Check, Loader2, X } from "lucide-react";
import { ExplorerLink } from "./explorer-link";
import { stageText, type StepState, type TxFlow } from "@/lib/hooks";
import { useSession } from "@/lib/session";

/** Approve → action stepper. */
export function TxSteps({ flow, actionLabel, showApprove }: { flow: TxFlow; actionLabel: string; showApprove: boolean }) {
  const { chainName } = useSession();
  const steps: { label: string; state: StepState }[] = [];
  if (showApprove) steps.push({ label: "Approve USDG", state: flow.approveState === "idle" && !flow.needsApproval ? "done" : flow.approveState });
  steps.push({ label: actionLabel, state: flow.actionState });

  return (
    <ol className="flex flex-col gap-2" aria-live="polite">
      {steps.map((s, i) => (
        <li key={s.label} className="flex animate-fade-in items-center gap-3">
          <span
            className={clsx(
              "flex size-6 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold transition-colors duration-300",
              s.state === "done" && "bg-green-700 text-white",
              s.state === "error" && "bg-alert text-white",
              (s.state === "wallet" || s.state === "confirming") && "bg-marigold-50 text-marigold-ink",
              s.state === "idle" && "bg-ghost text-muted",
            )}
          >
            {s.state === "done" ? (
              <Check className="size-3.5" strokeWidth={2.5} />
            ) : s.state === "error" ? (
              <X className="size-3.5" strokeWidth={2.5} />
            ) : s.state === "wallet" || s.state === "confirming" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              i + 1
            )}
          </span>
          <span className={clsx("text-[15px]", s.state === "idle" ? "text-muted" : "text-ink font-semibold")}>{s.label}</span>
          {s.state !== "idle" && (
            <span className="t-small text-muted">
              {stageText(s.state, chainName)}
              {s.state === "confirming" && flow.hash && (
                <span className="ml-2">
                  <ExplorerLink hash={flow.hash} />
                </span>
              )}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
