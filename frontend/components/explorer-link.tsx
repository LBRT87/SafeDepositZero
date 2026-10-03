"use client";

import { ExternalLink } from "lucide-react";
import { IS_MOCK } from "@/lib/data";
import { explorerTx, PRIMARY_CHAIN } from "@/config/chains";
import { shortAddress } from "@/lib/format";

/** Explorer link for a tx. In mock mode the hash is simulated, so it's shown but not linked. */
export function ExplorerLink({ hash, label = "View on explorer" }: { hash: string; label?: string }) {
  if (IS_MOCK) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted">
        <span className="t-mono">{shortAddress(hash)}</span>
        <span className="text-[13px]">simulated tx</span>
      </span>
    );
  }
  return (
    <a
      href={explorerTx(PRIMARY_CHAIN.id, hash)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-semibold text-brand-700 decoration-2 underline-offset-[3px] hover:underline"
    >
      {label}
      <ExternalLink className="size-3.5" strokeWidth={1.75} aria-hidden />
    </a>
  );
}
