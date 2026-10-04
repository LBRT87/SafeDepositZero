"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { KNOWN_NAMES } from "@/lib/data/mock";
import { IS_MOCK } from "@/lib/data";
import { shortAddress } from "@/lib/format";

/** Short address with copy; shows demo names. */
export function AddressTag({
  address,
  showName = true,
  stacked,
}: {
  address: string | null | undefined;
  showName?: boolean;
  /** Name above address. */
  stacked?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (!address) return <span className="text-muted">Not set yet</span>;
  const name = IS_MOCK && showName ? KNOWN_NAMES[address.toLowerCase()] : undefined;
  return (
    <span className={stacked && name ? "inline-flex min-w-0 flex-col" : "inline-flex min-w-0 items-center gap-1.5"}>
      {name && <span className="truncate">{name}</span>}
      <span className="inline-flex items-center gap-1.5">
      <span className={name ? "t-mono whitespace-nowrap text-muted" : "t-mono whitespace-nowrap"}>{shortAddress(address)}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard?.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1_500);
        }}
        className="rounded-[6px] p-1 text-muted hover:bg-ghost hover:text-ink"
        aria-label={copied ? "Copied" : "Copy address"}
      >
        {copied ? <Check className="size-3.5" strokeWidth={1.75} /> : <Copy className="size-3.5" strokeWidth={1.75} />}
      </button>
      </span>
    </span>
  );
}
