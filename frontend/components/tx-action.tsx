"use client";

import { ExternalLink } from "lucide-react";
import { dataSource, IS_MOCK } from "@/lib/data";
import { useTxFlow, useUsdgBalance } from "@/lib/hooks";
import { plain, usdg } from "@/lib/format";
import { useSession } from "@/lib/session";
import { PAXOS_FAUCET_URL, PRIMARY_CHAIN } from "@/config/chains";
import type { Spender, TxOptions, TxReceipt } from "@/lib/data/types";
import { Button, type ButtonSize, type ButtonVariant } from "./ui/button";
import { Banner } from "./ui/banner";
import { TxSteps } from "./tx-steps";
import { useToast } from "./ui/toast";

/**
 * One write action with the explicit stepper: Approve USDG (if allowance < amount) → the action.
 * The button label says exactly what happens next; the success toast reuses the action's verb.
 */
export function TxAction({
  label,
  loadingText = "Confirming…",
  successTitle,
  successBody,
  approval,
  run,
  onDone,
  disabledReason,
  variant = "primary",
  size = "md",
  fullWidthOnMobile,
  hideSteps,
}: {
  label: string;
  loadingText?: string;
  successTitle: string;
  successBody?: string;
  approval?: { spender: Spender; amount: bigint } | null;
  run: (opts: TxOptions) => Promise<TxReceipt>;
  onDone?: (r: TxReceipt) => void;
  disabledReason?: string | null;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidthOnMobile?: boolean;
  hideSteps?: boolean;
}) {
  const { account, wrongNetwork } = useSession();
  const flow = useTxFlow({ approval, successTitle, successBody });
  const { data: balance } = useUsdgBalance(account);
  const short = approval && balance !== undefined && balance < approval.amount ? approval.amount - balance : 0n;

  const reason =
    disabledReason ??
    (!account
      ? "Connect your wallet first"
      : wrongNetwork
        ? `Switch to ${PRIMARY_CHAIN.name} first`
        : short > 0n
          ? `You need ${usdg(short)} more`
          : null);

  const approving = flow.needsApproval;
  const busy = flow.busy;
  const showSteps = !hideSteps && (!!approval || flow.actionState !== "idle");
  const width = fullWidthOnMobile ? "w-full sm:w-auto" : undefined;

  return (
    <div className="flex flex-col gap-4">
      {showSteps && (approval || flow.actionState !== "idle") && (
        <TxSteps flow={flow} actionLabel={label} showApprove={!!approval} />
      )}
      {short > 0n && account && <InsufficientUsdg missing={short} />}
      <div className="flex flex-wrap items-center gap-3">
        {approving ? (
          <Button
            size={size}
            variant="primary"
            className={width}
            loading={busy}
            loadingText={flow.approveState === "wallet" ? "Waiting for wallet…" : "Approving…"}
            disabledReason={reason}
            onClick={() => flow.approve()}
          >
            Approve {plain(approval!.amount)} USDG
          </Button>
        ) : (
          <Button
            size={size}
            variant={variant}
            className={width}
            loading={busy}
            loadingText={flow.actionState === "wallet" ? "Waiting for wallet…" : loadingText}
            disabledReason={reason}
            onClick={async () => {
              const r = await flow.run(run);
              if (r) onDone?.(r);
            }}
          >
            {label}
          </Button>
        )}
      </div>
    </div>
  );
}

/** States the missing amount, links the Paxos faucet, and offers a MockUSDG mint in demo mode. */
export function InsufficientUsdg({ missing }: { missing: bigint }) {
  const { account } = useSession();
  const toast = useToast();
  return (
    <Banner
      tone="marigold"
      action={
        IS_MOCK && account ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await dataSource.mintTestUsdg(1_000_000_000n, { account });
              toast.push({ tone: "success", title: "Test USDG minted", body: "1,000.00 USDG added to this demo wallet." });
            }}
          >
            Mint 1,000 test USDG
          </Button>
        ) : undefined
      }
    >
      You need {usdg(missing)} more.{" "}
      <a
        href={PAXOS_FAUCET_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 font-semibold text-brand-700 underline-offset-[3px] hover:underline decoration-2"
      >
        Get test USDG from the Paxos faucet <ExternalLink className="size-3.5" strokeWidth={1.75} />
      </a>
    </Banner>
  );
}
