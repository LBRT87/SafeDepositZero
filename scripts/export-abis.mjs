// Copies ABIs from `forge build` output (contracts/out) to frontend/abi/*.json.
// Usage: (cd contracts && forge build) && node scripts/export-abis.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "contracts", "out");
const dest = join(root, "frontend", "abi");
mkdirSync(dest, { recursive: true });

const CONTRACTS = [
  "GuaranteePool",
  "TenantRegistry",
  "MockGdnRewardsDistributor",
  "PolicyManager",
  "ClaimManager",
  "PremiumCalculatorSol",
  "IPremiumCalculator",
  "MockUSDG",
  "MockTBillVault",
  "TBillAdapter",
  "IYieldAdapter",
];

for (const name of CONTRACTS) {
  const artifact = JSON.parse(readFileSync(join(out, `${name}.sol`, `${name}.json`), "utf8"));
  writeFileSync(join(dest, `${name}.json`), JSON.stringify(artifact.abi, null, 2) + "\n");
  console.log(`abi/${name}.json  (${artifact.abi.length} entries)`);
}
