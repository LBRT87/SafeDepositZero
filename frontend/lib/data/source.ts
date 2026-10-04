import type {
  ActivityEntry,
  Address,
  AdminParams,
  Claim,
  CreateInviteInput,
  Debt,
  DemoWallet,
  EvidenceBundle,
  FileClaimInput,
  Hash,
  InvestorPosition,
  ParamKey,
  Policy,
  PoolStats,
  PremiumPayment,
  QuoteResult,
  RiskTier,
  SharePricePoint,
  Spender,
  TenantHistory,
  TimeConfig,
  TxOptions,
  TxReceipt,
} from "./types";

/** The UI's only data dependency. Implemented by the mock and onchain sources. */
export interface DataSource {
  readonly kind: "mock" | "onchain";

  // Environment
  now(): number;
  getTimeConfig(): Promise<TimeConfig>;
  /** Mock only: demo personas. */
  getDemoWallets(): DemoWallet[];
  /** Fires when data may have changed. Returns unsubscribe. */
  subscribe(listener: () => void): () => void;

  // Reads
  getPoolStats(): Promise<PoolStats>;
  getPoolActivity(): Promise<ActivityEntry[]>;
  getSharePriceHistory(): Promise<SharePricePoint[]>;
  getInvestorPosition(account: Address): Promise<InvestorPosition>;
  previewDeposit(amount: bigint): Promise<bigint>;
  /** Shares worth `assets` now. */
  previewWithdrawShares(amount: bigint): Promise<bigint>;
  /** New coverage this landlord can add. */
  maxNewCoverage(landlord: Address): Promise<bigint>;

  getPolicies(filter: { landlord?: Address; tenant?: Address }): Promise<Policy[]>;
  getPolicy(id: number): Promise<Policy | null>;
  getPremiumHistory(policyId: number): Promise<PremiumPayment[]>;
  quote(coverage: bigint, totalPeriods: number, tier: RiskTier): Promise<QuoteResult>;
  getTenantHistory(tenant: Address): Promise<TenantHistory>;

  getClaims(filter: { policyId?: number; disputedOnly?: boolean; tenant?: Address; landlord?: Address }): Promise<Claim[]>;
  getClaim(id: number): Promise<Claim | null>;
  getDebts(tenant: Address): Promise<Debt[]>;
  getEvidence(hash: Hash): Promise<EvidenceBundle | null>;

  getUsdgBalance(account: Address): Promise<bigint>;
  getAllowance(owner: Address, spender: Spender): Promise<bigint>;
  hasArbiterRole(account: Address): Promise<boolean>;
  hasAdminRole(account: Address): Promise<boolean>;
  getAdminParams(): Promise<AdminParams>;

  // Writes (report stages via opts.onStage)
  approve(spender: Spender, amount: bigint, opts: TxOptions): Promise<TxReceipt>;
  createInvite(input: CreateInviteInput, opts: TxOptions): Promise<TxReceipt & { policyId: number }>;
  cancelInvite(policyId: number, opts: TxOptions): Promise<TxReceipt>;
  acceptInvite(policyId: number, opts: TxOptions): Promise<TxReceipt>;
  addCheckInEvidence(policyId: number, notes: EvidenceBundle, opts: TxOptions): Promise<TxReceipt>;
  payPremium(policyId: number, opts: TxOptions): Promise<TxReceipt>;
  fileClaim(input: FileClaimInput, opts: TxOptions): Promise<TxReceipt & { claimId: number }>;
  acceptClaim(claimId: number, opts: TxOptions): Promise<TxReceipt>;
  disputeClaim(claimId: number, note: string, opts: TxOptions): Promise<TxReceipt>;
  resolveDispute(claimId: number, amountApproved: bigint, reason: string, opts: TxOptions): Promise<TxReceipt>;
  repay(claimId: number, amount: bigint, opts: TxOptions): Promise<TxReceipt>;
  deposit(amount: bigint, opts: TxOptions): Promise<TxReceipt>;
  withdraw(amount: bigint, opts: TxOptions): Promise<TxReceipt>;
  requestRedeem(shares: bigint, opts: TxOptions): Promise<TxReceipt>;
  cancelRedeem(requestId: number, opts: TxOptions): Promise<TxReceipt>;

  // Keeper (permissionless)
  endLease(policyId: number, opts: TxOptions): Promise<TxReceipt>;
  closeIfNoClaim(policyId: number, opts: TxOptions): Promise<TxReceipt>;
  markLapsed(policyId: number, opts: TxOptions): Promise<TxReceipt>;
  autoAcceptClaim(claimId: number, opts: TxOptions): Promise<TxReceipt>;
  markDefault(claimId: number, opts: TxOptions): Promise<TxReceipt>;
  processQueue(maxCount: number, opts: TxOptions): Promise<TxReceipt>;
  rebalance(opts: TxOptions): Promise<TxReceipt>;
  distributeRewards(opts: TxOptions): Promise<TxReceipt>;

  // Admin (bounded)
  setParam(key: ParamKey, value: bigint, opts: TxOptions): Promise<TxReceipt>;
  setPaused(paused: boolean, opts: TxOptions): Promise<TxReceipt>;

  // Demo helpers
  mintTestUsdg(amount: bigint, opts: TxOptions): Promise<TxReceipt>;
  /** Evidence storage (IPFS via /api/evidence). */
  storeEvidence(bundle: EvidenceBundle): Promise<void>;
}
