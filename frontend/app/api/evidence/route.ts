import { keccak256, toHex } from "viem";
import { mockCid } from "@/lib/evidence";

// Pins evidence to IPFS via Pinata. Without PINATA_JWT it returns a mock CID.

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  let file: File | null = null;
  try {
    const form = await request.formData();
    const entry = form.get("file");
    file = entry instanceof File ? entry : null;
  } catch {
    return Response.json({ error: "Send the file as multipart form data under the key \"file\"." }, { status: 400 });
  }
  if (!file) return Response.json({ error: "No file received." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Files are limited to 10 MB." }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return Response.json({ cid: mockCid(keccak256(toHex(bytes))), mock: true });

  const body = new FormData();
  body.append("file", new Blob([bytes], { type: file.type || "application/octet-stream" }), file.name || "evidence");
  body.append("pinataMetadata", JSON.stringify({ name: `safedeposit-${file.name || "evidence"}` }));
  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body,
  });
  if (!res.ok) return Response.json({ error: "IPFS pinning failed. Try again." }, { status: 502 });
  const { IpfsHash } = (await res.json()) as { IpfsHash: string };
  return Response.json({ cid: IpfsHash, mock: false });
}
