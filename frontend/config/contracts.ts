import type { Address } from "@/lib/data/types";
import { arbitrumSepolia } from "viem/chains";
import { robinhoodTestnet } from "./chains";

const ZERO: Address = "0x0000000000000000000000000000000000000000";

export interface ContractSet {
  usdg: Address;
  guaranteePool: Address;
  policyManager: Address;
  claimManager: Address;
  tenantRegistry: Address;
  premiumCalculator: Address; // PremiumCalculatorSol by default; the Stylus one if you deployed it
  mockTBillVault: Address;
  tbillAdapter: Address;
  gdnDistributor: Address; // MockGdnRewardsDistributor (simulated USDG partner rewards)
  deployBlock: bigint;
  /** true when USDG is the MockUSDG demo token (enables the "Mint test USDG" button). */
  usdgIsMock: boolean;
}

// Addresses are printed by `forge script script/Deploy.s.sol` — paste them here after you deploy.
export const CONTRACTS: Record<number, ContractSet> = {
  [arbitrumSepolia.id]: {
    usdg: "0x216f1d0698D56F8A8D789B73F3ffc9F9784F2b73", // MockUSDG
    guaranteePool: "0x1A8E77B36EeeF1f6d2f84579d08548fe75eAeB98",
    policyManager: "0x8711B0F56c5F7e9d86Cd4e68908F1C0034306C1B",
    claimManager: "0xA09Dc5b515E09F69Ed27D2e9E2EB86E8D3D1947B",
    tenantRegistry: "0xcFa083349A227036472AA2ef63Bb43F027c38ce1",
    premiumCalculator: "0x963Fd245e5FD69a107B60F42A0c1B862FC72A24B", // PremiumCalculatorSol
    mockTBillVault: "0xec5b5146f831575CFFf299FBd9964f320Ebe5b81",
    tbillAdapter: "0xa79905Fb3aa63230a62ABf073d8afAD4F69935E5",
    gdnDistributor: "0x1D1259153A5FA744412D3FE153fEE90AecF9C85f",
    // L2 block of the first deploy receipt. The script's `deployBlock` log is block.number, which on Arbitrum is
    // the L1 block, so don't copy that one.
    deployBlock: 315221125n,
    usdgIsMock: true,
  },
  [robinhoodTestnet.id]: {
    // Same addresses as on Arbitrum Sepolia but shifted by one contract (same deployer, same nonces), so don't mix
    // the two sets up.
    usdg: "0xE96E1bc96dEC0EDc64fE9F03D35d0acA6E49A458", // MockUSDG (Paxos USDG testnet: 0x7E95…802F)
    guaranteePool: "0xcFa083349A227036472AA2ef63Bb43F027c38ce1",
    policyManager: "0x1A8E77B36EeeF1f6d2f84579d08548fe75eAeB98",
    claimManager: "0x8711B0F56c5F7e9d86Cd4e68908F1C0034306C1B",
    tenantRegistry: "0x963Fd245e5FD69a107B60F42A0c1B862FC72A24B",
    premiumCalculator: "0x216f1d0698D56F8A8D789B73F3ffc9F9784F2b73", // PremiumCalculatorSol
    mockTBillVault: "0xA09Dc5b515E09F69Ed27D2e9E2EB86E8D3D1947B",
    tbillAdapter: "0xec5b5146f831575CFFf299FBd9964f320Ebe5b81",
    gdnDistributor: "0xa79905Fb3aa63230a62ABf073d8afAD4F69935E5",
    deployBlock: 128045845n, // block of the first deploy receipt
    usdgIsMock: true,
  },
};

export function contractsFor(chainId: number): ContractSet {
  const set = CONTRACTS[chainId];
  if (!set) throw new Error(`No SafeDeposit contracts configured for chain ${chainId}`);
  return set;
}
