// Mirrors contracts/src/libraries/Types.sol. Amounts are bigint in USDG base units (6 decimals);
// ids are numbers (on-chain uint256, small in practice); times are unix seconds.

export type Address = `0x${string}`;
export type Hash = `0x${string}`;

export const POLICY_STATUSES = ["Invited", "Active", "Lapsed", "Ended", "Claimed", "Closed", "Cancelled"] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];

export const CLAIM_STATUSES = [
  "None",
  "Filed",
  "Accepted",
  "Disputed",
  "Approved",
  "PartiallyApproved",
  "Rejected",
  "Paid",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_TYPES = ["Damage", "UnpaidRent", "Other"] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export const RISK_TIERS = ["A", "B", "C"] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

/** Lease lengths the contract accepts (SPEC §4.3). */
export const TERMS = [6, 12] as const;

export type Role = "tenant" | "landlord" | "investor" | "arbiter" | "admin";

export interface TimeConfig {
  premiumPeriod: number;
  gracePeriod: number;
  checkInWindow: number;
  claimWindow: number;
  responseWindow: number;
  arbiterWindow: number;
  installmentPeriod: number;
  debtInstallments: number;
  /** "demo" = 1 minute per month. Drives copy like "1 minute = 1 month". */
  profile: "demo" | "prod";
}

export interface Policy {
  id: number;
  landlord: Address;
  tenant: Address | null; // null until accepted for open invites
  propertyRef: string;
  monthlyRent: bigint;
  coverage: bigint;
  /** Set at acceptance, once the tenant's tier is known. 0 for open invites. */
  monthlyPremium: bigint;
  startTime: number;
  endTime: number;
  nextPremiumDue: number; // 0 once every period is paid
  lapsedAt: number; // 0 unless the policy lapsed
  periodsPaid: number;
  totalPeriods: number;
  tier: RiskTier;
  status: PolicyStatus;
  checkInCid: string;
  checkInEvidenceHash: Hash;
  /** Tenant's own move-in notes, added within the check-in window. */
  tenantCheckInCid: string;
  tenantCheckInHash: Hash | null;
  // Derived / indexed (events), not stored in the struct:
  claimWindowEnd: number;
  claimId: number | null;
  createdAt: number;
  activatedTx: Hash | null;
}

export interface Claim {
  id: number;
  policyId: number;
  claimType: ClaimType;
  amountClaimed: bigint;
  amountApproved: bigint;
  filedAt: number;
  responseDeadline: number;
  arbiterDeadline: number;
  evidenceCid: string;
  checkOutEvidenceHash: Hash;
  landlordNote: string;
  tenantNote: string;
  arbiterReason: string;
  status: ClaimStatus;
  // Indexed from events:
  disputeFee: bigint;
  resolvedAt: number | null;
  paidAt: number | null;
  autoAccepted: boolean;
  timeline: TimelineEntry[];
}

export interface TimelineEntry {
  label: string;
  at: number;
  txHash: Hash | null;
}

export interface Debt {
  claimId: number;
  policyId: number;
  tenant: Address;
  principal: bigint; // approved claim + missed premium + dispute fee
  repaid: bigint;
  nextInstallmentDue: number; // 0 once fully repaid
  installments: number;
  defaulted: boolean;
  disputeFee: bigint;
  missedPremium: bigint;
  /** What the first-loss reserve covered when the debt defaulted. */
  coveredByFirstLoss: bigint;
  startedAt: number;
  installmentAmount: bigint;
}

/** TenantRegistry record plus the tier it implies (SPEC §7.6). */
export interface TenantHistory {
  cleanCompleted: number;
  claimsPaid: number;
  openDebts: number;
  defaulted: boolean;
  tier: RiskTier;
  blocked: boolean;
}

export interface PremiumPayment {
  policyId: number;
  period: number;
  amount: bigint;
  toPool: bigint;
  toFirstLoss: bigint;
  toTreasury: bigint;
  paidAt: number;
  txHash: Hash;
}

export interface PoolStats {
  /** Investor assets: gross − first-loss − pending claims. */
  totalAssets: bigint;
  grossAssets: bigint;
  idleAssets: bigint;
  adapterValue: bigint;
  firstLossBalance: bigint;
  pendingClaims: bigint;
  activeCoverage: bigint;
  /** bps; null when nothing is covered (infinite ratio). */
  reserveRatioBps: number | null;
  utilizationBps: number;
  minReserveBps: number;
  liquidityTargetBps: number;
  /** Investor assets free above the reserve right now. */
  freeAssets: bigint;
  totalShares: bigint;
  /** USDG (base units) per 1 whole sdUSDG share. */
  sharePrice: number;
  activeGuarantees: number;
  queueLength: number;
  queuedShares: bigint;
  paused: boolean;
  apy: ApyBreakdown;
}

export interface ApyBreakdown {
  /** Simulated months covered by the window. */
  periodMonths: number;
  avgAssets: bigint;
  premiumsToPool: bigint;
  gdnRewards: bigint;
  tbillYield: bigint;
  recoveries: bigint;
  firstLossCovers: bigint;
  claimsPaid: bigint;
  /** e.g. 0.106 for 10.6% */
  netApy: number;
}

export type ActivityKind =
  | "premium"
  | "claim"
  | "repayment"
  | "yield"
  | "rewards"
  | "firstLoss"
  | "rebalance"
  | "deposit"
  | "withdraw";

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  amount: bigint;
  at: number;
  txHash: Hash;
  label: string;
}

export interface SharePricePoint {
  at: number;
  price: number;
}

export interface QueueRequest {
  id: number;
  owner: Address;
  shares: bigint;
  /** Value of the escrowed shares at today's price. */
  assetsNow: bigint;
  requestedAt: number;
  /** Position in the FIFO queue (1 = next). */
  position: number;
}

export interface InvestorPosition {
  shares: bigint;
  assets: bigint;
  maxWithdraw: bigint;
  /** True when maxWithdraw is limited by the reserve rule rather than the investor's balance. */
  limitedByReserve: boolean;
  queued: QueueRequest[];
}

export interface QuoteResult {
  monthlyPremium: bigint;
  annualPremium: bigint;
  toPool: bigint;
  toFirstLoss: bigint;
  toTreasury: bigint;
  totalCost: bigint;
}

export interface EvidenceFile {
  name: string;
  url: string; // object/data URL or IPFS gateway URL
  hash: Hash; // keccak256 of file bytes
  cid: string; // IPFS CID of the file
  caption?: string;
}

export interface EvidenceBundle {
  /** keccak256 of the manifest bytes. This goes on-chain. */
  hash: Hash;
  /** IPFS CID of the manifest. This goes on-chain too. */
  cid: string;
  /** The exact manifest JSON that was hashed and pinned. */
  manifest: string;
  files: EvidenceFile[];
  note?: string;
}

export type Spender = "policyManager" | "pool" | "claimManager";

export interface DemoWallet {
  role: Role;
  address: Address;
  name: string;
}

export interface CreateInviteInput {
  tenant: Address | null;
  propertyRef: string;
  monthlyRent: bigint;
  coverage: bigint;
  totalPeriods: number;
  checkIn: EvidenceBundle | null;
}

export interface FileClaimInput {
  policyId: number;
  claimType: ClaimType;
  amount: bigint;
  note: string;
  checkOut: EvidenceBundle;
}

/** Bounded admin parameters (SPEC §5.3). Bps unless noted. */
export interface AdminParams {
  protocolFeeBps: number;
  firstLossShareBps: number;
  firstLossCapBps: number;
  minReserveBps: number;
  liquidityTargetBps: number;
  maxLandlordShareBps: number;
  /** USDG base units */
  concentrationFloor: bigint;
  /** USDG base units */
  maxCoveragePerPolicy: bigint;
  disputeFeeBps: number;
  gdnAprBps: number;
  treasury: Address;
  paused: boolean;
}

export type ParamKey = Exclude<keyof AdminParams, "treasury" | "paused">;

export type TxStage = "wallet" | "confirming" | "done";

export interface TxOptions {
  account: Address;
  onStage?: (stage: TxStage, hash?: Hash) => void;
}

export interface TxReceipt {
  hash: Hash;
}
