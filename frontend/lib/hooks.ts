"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { dataSource } from "./data";
import { errorMessage } from "./data/errors";
import type { Address, Hash, Spender, TxOptions, TxReceipt, TxStage } from "./data/types";
import { useSession } from "./session";

/** React Query wrapper around a DataSource read. */
export function useDS<T>(key: readonly unknown[], fn: () => Promise<T>, opts?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery({
    queryKey: key,
    queryFn: fn,
    enabled: opts?.enabled ?? true,
    refetchInterval: opts?.refetchInterval,
    placeholderData: (prev) => prev,
  });
}

/** Re-fetches every query whenever the data source reports a change (mock state change / new block). */
export function DataSync() {
  const qc = useQueryClient();
  useEffect(() => dataSource.subscribe(() => qc.invalidateQueries()), [qc]);
  return null;
}

/** Ticking clock from the data source (mock clock includes "skip ahead"). Null until mounted (no SSR mismatch). */
export function useNow(intervalMs = 1_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(dataSource.now());
    tick();
    const id = setInterval(tick, intervalMs);
    const unsub = dataSource.subscribe(tick);
    return () => {
      clearInterval(id);
      unsub();
    };
  }, [intervalMs]);
  return now;
}

export function useTimeConfig() {
  return useDS(["time"], () => dataSource.getTimeConfig()).data;
}

export function useUsdgBalance(account: Address | null) {
  return useDS(["balance", account], () => dataSource.getUsdgBalance(account!), { enabled: !!account });
}

export type StepState = "idle" | TxStage | "error";

export interface TxFlow {
  needsApproval: boolean;
  approveState: StepState;
  actionState: StepState;
  busy: boolean;
  hash: Hash | null;
  error: string | null;
  approve: () => Promise<void>;
  run: (action: (opts: TxOptions) => Promise<TxReceipt>) => Promise<TxReceipt | null>;
  reset: () => void;
}

/**
 * Two explicit steps for every write: 1 Approve USDG (only if allowance < amount) → 2 Confirm action.
 * Each step goes wallet → confirming → done. Success toast uses the button's verb.
 */
export function useTxFlow({
  approval,
  successTitle,
  successBody,
}: {
  approval?: { spender: Spender; amount: bigint } | null;
  successTitle: string;
  successBody?: string;
}): TxFlow {
  const { account } = useSession();
  const toast = useToast();
  const [approveState, setApproveState] = useState<StepState>("idle");
  const [actionState, setActionState] = useState<StepState>("idle");
  const [hash, setHash] = useState<Hash | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [lastSuccessAt, setLastSuccessAt] = useState(0);
  const allowanceQuery = useDS(
    ["allowance", account, approval?.spender],
    () => dataSource.getAllowance(account!, approval!.spender),
    { enabled: !!account && !!approval },
  );
  const allowance = allowanceQuery.data;
  // The last action spent the allowance; until it is re-read, assume a new approval is needed.
  const allowanceStale = allowanceQuery.dataUpdatedAt < lastSuccessAt;

  const needsApproval =
    !!approval &&
    approval.amount > 0n &&
    ((allowance ?? 0n) < approval.amount || allowanceStale) &&
    approveState !== "done";

  const approve = useCallback(async () => {
    if (!account || !approval) return;
    setError(null);
    try {
      await dataSource.approve(approval.spender, approval.amount, {
        account,
        onStage: (s, h) => {
          setApproveState(s);
          if (h) setHash(h);
        },
      });
      toast.push({ tone: "success", title: "USDG approved" });
    } catch (e) {
      setApproveState("error");
      const msg = errorMessage(e);
      setError(msg);
      toast.push({ tone: "error", title: "Approval didn't go through", body: msg });
    }
  }, [account, approval, toast]);

  const run = useCallback(
    async (action: (opts: TxOptions) => Promise<TxReceipt>) => {
      if (!account) return null;
      setError(null);
      try {
        const receipt = await action({
          account,
          onStage: (s, h) => {
            setActionState(s);
            if (h) setHash(h);
          },
        });
        toast.push({ tone: "success", title: successTitle, body: successBody, txHash: receipt.hash });
        if (approval) setLastSuccessAt(Date.now());
        setApproveState("idle");
        // Show "Done" briefly, then reset so a repeat action (next month's fee) starts a fresh stepper.
        setTimeout(() => {
          setApproveState("idle");
          setActionState("idle");
        }, 2_500);
        return receipt;
      } catch (e) {
        setActionState("error");
        const msg = errorMessage(e);
        setError(msg);
        toast.push({ tone: "error", title: "Transaction didn't go through", body: msg });
        return null;
      }
    },
    [account, toast, successTitle, successBody, approval],
  );

  const reset = useCallback(() => {
    setApproveState("idle");
    setActionState("idle");
    setHash(null);
    setError(null);
  }, []);

  const busy = ["wallet", "confirming"].includes(approveState) || ["wallet", "confirming"].includes(actionState);

  return { needsApproval, approveState, actionState, busy, hash, error, approve, run, reset };
}

export function stageText(state: StepState, chainName: string): string {
  switch (state) {
    case "wallet":
      return "Waiting for wallet";
    case "confirming":
      return `Confirming on ${chainName}`;
    case "done":
      return "Done";
    case "error":
      return "Didn't go through";
    default:
      return "";
  }
}
