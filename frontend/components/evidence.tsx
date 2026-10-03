"use client";

import { clsx } from "clsx";
import { CheckCircle2, ImagePlus, Loader2, XCircle } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { dataSource } from "@/lib/data";
import { bundleFromFiles, verifyBundle } from "@/lib/evidence";
import { useDS } from "@/lib/hooks";
import { shortAddress } from "@/lib/format";
import type { EvidenceBundle, Hash } from "@/lib/data/types";
import { Skeleton } from "./ui/panel";

/** Photo picker: hashes each photo in the browser, pins it and a manifest to IPFS. CID + hash go on-chain. */
export function EvidenceUpload({
  label,
  helper,
  value,
  onChange,
  note = "",
}: {
  label: string;
  helper?: string;
  value: EvidenceBundle | null;
  onChange: (b: EvidenceBundle | null) => void;
  /** Written into the manifest next to the photos. */
  note?: string;
}) {
  const id = useId();
  const [hashing, setHashing] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="t-label">{label}</span>
      <label
        htmlFor={id}
        className="flex cursor-pointer items-center gap-3 rounded-btn border border-dashed border-line-strong bg-white px-4 py-3 hover:bg-hover focus-within:border-brand-700"
      >
        {hashing ? (
          <Loader2 className="size-5 animate-spin text-muted" />
        ) : (
          <ImagePlus className="size-5 text-muted" strokeWidth={1.75} />
        )}
        <span className="text-[15px]">
          {hashing
            ? "Hashing and pinning to IPFS…"
            : value
              ? `${value.files.length} photo${value.files.length === 1 ? "" : "s"} pinned`
              : "Add photos"}
        </span>
        <input
          id={id}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={async (e) => {
            const files = [...(e.target.files ?? [])];
            if (files.length === 0) return onChange(null);
            setHashing(true);
            onChange(await bundleFromFiles(files, note));
            setHashing(false);
          }}
        />
      </label>
      {value ? (
        <p className="t-small text-muted">
          Manifest <span className="t-mono text-ink">{shortCid(value.cid)}</span>, fingerprint{" "}
          <span className="t-mono text-ink">{shortAddress(value.hash)}</span>. Both are stored on-chain.
        </p>
      ) : (
        helper && <p className="t-small text-muted">{helper}</p>
      )}
    </div>
  );
}

/** Re-hashes the displayed files and compares with the on-chain hash. */
export function HashCheck({ bundle, onChainHash }: { bundle: EvidenceBundle; onChainHash: Hash }) {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    verifyBundle(bundle, onChainHash).then((r) => live && setOk(r));
    return () => {
      live = false;
    };
  }, [bundle, onChainHash]);
  if (ok === null)
    return (
      <span className="t-small inline-flex items-center gap-1.5 text-muted">
        <Loader2 className="size-3.5 animate-spin" /> Checking hash
      </span>
    );
  return ok ? (
    <span className="t-small inline-flex items-center gap-1.5 font-semibold text-green-700">
      <CheckCircle2 className="size-4" strokeWidth={1.75} /> Hash verified
    </span>
  ) : (
    <span className="t-small inline-flex items-center gap-1.5 font-semibold text-alert">
      <XCircle className="size-4" strokeWidth={1.75} /> Hash doesn&apos;t match
    </span>
  );
}

export function shortCid(cid: string): string {
  return cid.length > 16 ? `${cid.slice(0, 8)}…${cid.slice(-6)}` : cid || "—";
}

export function EvidenceViewer({ title, hash, compact }: { title: string; hash: Hash; compact?: boolean }) {
  const { data: bundle, isLoading } = useDS(["evidence", hash], () => dataSource.getEvidence(hash));
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="t-label">{title}</span>
        {bundle && <HashCheck bundle={bundle} onChainHash={hash} />}
      </figcaption>
      {isLoading ? (
        <Skeleton className="aspect-[8/5] w-full" />
      ) : !bundle ? (
        <div className="t-small rounded-btn border border-line bg-paper px-3 py-6 text-muted">
          Photos for hash <span className="t-mono">{shortAddress(hash)}</span> aren&apos;t available here.
        </div>
      ) : (
        <div className={clsx("grid gap-2", compact ? "grid-cols-2" : "grid-cols-1")}>
          {bundle.note && <p className="measure rounded-btn bg-paper px-3 py-2.5">{bundle.note}</p>}
          {bundle.files.map((f) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={f.hash + f.name}
              src={f.url}
              alt={f.caption ?? f.name}
              className="aspect-[8/5] w-full rounded-btn border border-line object-cover"
            />
          ))}
        </div>
      )}
      <span className="t-small text-muted">
        {bundle?.cid && (
          <>
            IPFS manifest <span className="t-mono">{shortCid(bundle.cid)}</span>.{" "}
          </>
        )}
        On-chain hash <span className="t-mono">{shortAddress(hash)}</span>
      </span>
    </figure>
  );
}

/** Side-by-side check-in vs check-out evidence, plus the tenant's own move-in notes when they added any. */
export function EvidenceCompare({ checkIn, checkOut, tenantNotes }: { checkIn: Hash; checkOut: Hash; tenantNotes?: Hash | null }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <EvidenceViewer title="Check-in (landlord)" hash={checkIn} />
        <EvidenceViewer title="Check-out (landlord)" hash={checkOut} />
      </div>
      {tenantNotes && (
        <div className="md:w-1/2 md:pr-2.5">
          <EvidenceViewer title="Move-in notes (tenant)" hash={tenantNotes} />
        </div>
      )}
    </div>
  );
}
