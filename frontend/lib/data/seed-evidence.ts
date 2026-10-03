// Seeded evidence for the demo: plain flat "photo" placeholders generated as SVG so they can be
// re-hashed in the browser and the "Hash verified" check is real. Uploaded files replace these in use.

import { keccak256, stringToHex } from "viem";
import { buildManifest, manifestHash, mockCid } from "../evidence";
import type { EvidenceBundle, EvidenceFile } from "./types";

type Scene = "wall" | "wall-damaged" | "wardrobe" | "wardrobe-damaged" | "floor" | "kitchen";

function sceneSvg(scene: Scene, caption: string): string {
  const wall = "#E9E5EE";
  const trim = "#C9C3D3";
  const wood = "#B9A68E";
  const ink = "#625A6E";
  let body = "";
  switch (scene) {
    case "wall":
    case "wall-damaged":
      body = `<rect x="0" y="0" width="480" height="270" fill="${wall}"/>
        <rect x="0" y="230" width="480" height="40" fill="${trim}"/>
        <rect x="300" y="60" width="110" height="80" fill="#D9D3E0" stroke="${trim}" stroke-width="4"/>`;
      if (scene === "wall-damaged")
        body += `<path d="M120 70 L138 104 L126 130 L150 170 L140 200" stroke="${ink}" stroke-width="3" fill="none"/>
        <ellipse cx="200" cy="150" rx="34" ry="20" fill="#CFC5B8"/>`;
      break;
    case "wardrobe":
    case "wardrobe-damaged":
      body = `<rect x="0" y="0" width="480" height="270" fill="${wall}"/>
        <rect x="150" y="30" width="180" height="230" fill="${wood}"/>
        <line x1="240" y1="30" x2="240" y2="260" stroke="#8E7C66" stroke-width="3"/>
        <circle cx="228" cy="150" r="5" fill="#6E5E4C"/><circle cx="252" cy="150" r="5" fill="#6E5E4C"/>`;
      if (scene === "wardrobe-damaged")
        body += `<polygon points="240,30 330,30 352,252 260,262" fill="#A8957D" stroke="#6E5E4C" stroke-width="2"/>
        <path d="M300 90 L318 120" stroke="${ink}" stroke-width="3"/>`;
      break;
    case "floor":
      body = `<rect x="0" y="0" width="480" height="270" fill="#D8CCBC"/>
        ${[0, 1, 2, 3, 4, 5].map((i) => `<line x1="0" y1="${i * 45}" x2="480" y2="${i * 45}" stroke="#C4B6A4" stroke-width="2"/>`).join("")}`;
      break;
    case "kitchen":
      body = `<rect x="0" y="0" width="480" height="270" fill="${wall}"/>
        <rect x="40" y="150" width="400" height="100" fill="#D9D3E0"/>
        <rect x="40" y="140" width="400" height="14" fill="${trim}"/>
        <rect x="80" y="40" width="140" height="70" fill="#D9D3E0" stroke="${trim}" stroke-width="3"/>`;
      break;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300">
    ${body}
    <rect x="0" y="270" width="480" height="30" fill="#1C1724"/>
    <text x="12" y="290" font-family="Arial, sans-serif" font-size="13" fill="#FFFFFF">${caption}</text>
  </svg>`;
}

function file(name: string, scene: Scene, caption: string): EvidenceFile {
  const svg = sceneSvg(scene, caption);
  const url = `data:image/svg+xml;base64,${btoa(svg)}`;
  const hash = keccak256(stringToHex(svg));
  return { name, url, hash, cid: mockCid(hash), caption };
}

function bundle(files: EvidenceFile[], note = ""): EvidenceBundle {
  const manifest = buildManifest(files, note, 1_759_000_000);
  const hash = manifestHash(manifest);
  return { hash, cid: mockCid(hash), manifest, files, note };
}

export function seedEvidence() {
  const genericCheckIn = bundle([
    file("living-room.jpg", "floor", "Check-in: living room floor"),
    file("kitchen.jpg", "kitchen", "Check-in: kitchen counter"),
  ]);
  const senopatiCheckIn = bundle([
    file("bedroom-wall.jpg", "wall", "Check-in: bedroom wall, 12 Mar"),
    file("wardrobe.jpg", "wardrobe", "Check-in: wardrobe, doors closed"),
  ]);
  const senopatiCheckOut = bundle([
    file("bedroom-wall.jpg", "wall-damaged", "Check-out: bedroom wall, crack and stain"),
    file("wardrobe.jpg", "wardrobe-damaged", "Check-out: wardrobe door off its hinge"),
  ]);
  const kuninganCheckIn = bundle([file("bedroom-wall.jpg", "wall", "Check-in: bedroom wall")]);
  const kuninganCheckOut = bundle([file("bedroom-wall.jpg", "wall-damaged", "Check-out: bedroom wall")]);
  const senopatiTenantNotes = bundle(
    [file("wardrobe-hinge.jpg", "wardrobe", "Move-in: wardrobe door already loose")],
    "The left wardrobe door was loose on move-in day.",
  );
  return { genericCheckIn, senopatiCheckIn, senopatiCheckOut, senopatiTenantNotes, kuninganCheckIn, kuninganCheckOut };
}
