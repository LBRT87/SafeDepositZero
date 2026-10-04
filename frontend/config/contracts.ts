import type { Address } from "@/lib/data/types";
import { arbitrumSepolia } from "viem/chains";
import { robinhoodTestnet } from "./chains";

export interface ContractSet {
  usdg: Address;
  guaranteePool: Address;
  policyManager: Address;
  claimManager: Address;
  tenantRegistry: Address;
  premiumCalculator: Address; // Solidity or Stylus
  mockTBillVault: Address;
  tbillAdapter: Address;
  gdnDistributor: Address; // simulated USDG rewards
  deployBlock: bigint;
  /** MockUSDG: enables "Mint test USDG". */
  usdgIsMock: boolean;
}

// Deployed addresses per chain.
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
    // First L2 receipt block (script logs the L1 block).
    deployBlock: 315221125n,
    usdgIsMock: true,
  },
  [robinhoodTestnet.id]: {
    // Same addresses as Arbitrum, different contracts (nonce offset).
    usdg: "0xE96E1bc96dEC0EDc64fE9F03D35d0acA6E49A458", // MockUSDG
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
