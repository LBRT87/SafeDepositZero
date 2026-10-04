import { keccak256, stringToHex, toHex } from "viem";
import type { EvidenceBundle, EvidenceFile, Hash } from "./data/types";

// Photos and a manifest are pinned to IPFS; the manifest CID and hash go on-chain.

export const EMPTY_HASH: Hash = "0x0000000000000000000000000000000000000000000000000000000000000000";
export const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/";

/** Stand-in CID when Pinata isn't configured. */
export function mockCid(bytesHash: Hash): string {
  return `bafkmock${bytesHash.slice(2, 50)}`;
}

/** keccak256 of the file bytes. */
export async function hashFile(file: File | Blob): Promise<Hash> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return keccak256(toHex(bytes));
}

export function manifestHash(manifest: string): Hash {
  return keccak256(stringToHex(manifest));
}

/** Pins a file, or falls back to a mock CID. */
async function pin(body: Blob, name: string, bytesHash: Hash): Promise<string> {
  try {
    const form = new FormData();
    form.append("file", body, name);
    const res = await fetch("/api/evidence", { method: "POST", body: form });
    if (!res.ok) throw new Error(`evidence upload failed: ${res.status}`);
    const { cid } = (await res.json()) as { cid: string };
    return cid;
  } catch {
    return mockCid(bytesHash);
  }
}

export function buildManifest(files: Pick<EvidenceFile, "name" | "cid" | "hash">[], note: string, createdAt: number): string {
  return JSON.stringify({
    files: files.map((f) => ({ name: f.name, cid: f.cid, keccak256: f.hash })),
    note,
    createdAt,
  });
}

export async function bundleFromFiles(files: File[], note = ""): Promise<EvidenceBundle> {
  const entries: EvidenceFile[] = await Promise.all(
    files.map(async (f) => {
      const hash = await hashFile(f);
      const cid = await pin(f, f.name, hash);
      return { name: f.name, url: URL.createObjectURL(f), hash, cid };
    }),
  );
  const manifest = buildManifest(entries, note, Math.floor(Date.now() / 1000));
  const hash = manifestHash(manifest);
  const cid = await pin(new Blob([manifest], { type: "application/json" }), "manifest.json", hash);
  return { hash, cid, manifest, files: entries, note };
}

/** Checks the manifest and photos against the on-chain hash. */
export async function verifyBundle(bundle: EvidenceBundle, onChainHash: Hash): Promise<boolean> {
  try {
    if (manifestHash(bundle.manifest) !== onChainHash.toLowerCase()) return false;
    const listed = (JSON.parse(bundle.manifest) as { files: { keccak256: string }[] }).files;
    const hashes = await Promise.all(
      bundle.files.map(async (f) => {
        const res = await fetch(f.url);
        return hashFile(await res.blob());
      }),
    );
    return hashes.length === listed.length && hashes.every((h, i) => h === listed[i].keccak256.toLowerCase());
  } catch {
    return false;
  }
}
