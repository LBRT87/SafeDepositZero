// MockDataSource — an in-memory copy of the on-chain state machine (SPEC §5–§7), so every screen and flow can be
// clicked through without a wallet or deployed contracts. Rules mirror the Solidity exactly: tier from rental
// history, the 75 / 10 / 15 premium split with the first-loss cap, pending claims priced in at once, the 50%
// reserve and per-landlord concentration checks, the withdrawal queue, lapse rules, the dispute fee on full
// approval only, pool-first repayments, and defaults covered by the first-loss reserve.

import { keccak256, stringToHex } from "viem";
import { ContractError } from "./errors";
import { seedEvidence } from "./seed-evidence";
import type { DataSource } from "./source";
import type {
  ActivityEntry,
  ActivityKind,
  Address,
  AdminParams,
  Claim,
  ClaimStatus,
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
  QueueRequest,
  QuoteResult,
  RiskTier,
  SharePricePoint,
  Spender,
  TenantHistory,
  TimeConfig,
  TxOptions,
  TxReceipt,
} from "./types";
import { MIN_MONTHLY, quotePremium, splitPremium, UNIT } from "../premium";

// ───────────────────────────── constants ─────────────────────────────

const U = UNIT;
const BPS = 10_000n;
const SHARE_UNIT = 10n ** 12n; // sdUSDG has 6 + 6 (virtual offset) decimals
const OFFSET = 10n ** 6n;
const TBILL_APR_BPS = 340n;
const YEAR = 365n * 24n * 3600n;
/** Simulated yield in the demo profile: 1 real minute = 1 month (43,200 = 30 days × 24 h × 60 min / 1 min). */
const TIME_MULTIPLIER = 43_200n;
const TX_WALLET_MS = 900;
const TX_CONFIRM_MS = 1_300;
const READ_MS = 220;

/** Same values as TimeProfiles.demo() in contracts/src/libraries/Types.sol. */
export const DEMO_TIME: TimeConfig = {
  premiumPeriod: 60,
  gracePeriod: 60,
  checkInWindow: 180,
  claimWindow: 300,
  responseWindow: 180,
  arbiterWindow: 300,
  installmentPeriod: 60,
  debtInstallments: 6,
  profile: "demo",
};

export const PERSONAS = {
  tenant: { role: "tenant", address: "0x7a3E9b2C4d1F8a6B5e0D3c2A1f9E8d7C6b5A4f31", name: "Ayu Pratama" },
  newTenant: { role: "tenant", address: "0x4E8b1D7c3A9f2E6d0B5c8A1e7F3d9B2c6E4a1D07", name: "Dimas Halim (new renter)" },
  landlord: { role: "landlord", address: "0x1F4d8c2E6a9B3f7D5e1C0b4A8d2F6e9C3a7Ba92C", name: "Harbor Co-living" },
  investor: { role: "investor", address: "0x5C2bA81d9E3f6C7a4B0e2D8f1A9c3E5b7D6fE104", name: "Mei Lin Tan" },
  arbiter: { role: "arbiter", address: "0x9E81c4D2b7A3f5E0d6C8a1B9e2F4c7D3a5B6e8A0", name: "Rahul Menon" },
  admin: { role: "admin", address: "0xA7d3E9c1B5f2D8a4C6e0F3b7D1a9E5c2B8f4D6e3", name: "SafeDeposit Zero operations" },
} as const satisfies Record<string, DemoWallet>;

const BUDI: Address = "0x3b6F2a9C1e8D4b7A0c5E3f9D2a6B8c1E4f7A2d55";
const SARI: Address = "0x6d1A8e3F5b9C2d7E4a0B6f8C3e1D9a5B7c2F4e88";
const RIZKY: Address = "0x2E5c9A1d7B3f8E0a6C4d2B9e1F7a3C5d8B0e6F14";
const OTHER_LANDLORDS: Address[] = [
  "0x2a7C9e1B4d6F8a3E5c0D2b9F7e4A1c6D8b3E5f19",
  "0x8c4E1b7D3a9F5c2E6d0A8b4F1e7C3a9D5b2E6c72",
];
const TREASURY: Address = "0xD3a5F7c9E1b3A5d7F9c1E3a5B7d9F1c3E5a7B9d0";

const DEFAULT_PARAMS: Omit<AdminParams, "paused"> = {
  protocolFeeBps: 2_500,
  firstLossShareBps: 4_000,
  firstLossCapBps: 500,
  minReserveBps: 5_000,
  liquidityTargetBps: 4_000,
  maxLandlordShareBps: 1_000,
  concentrationFloor: 20_000n * U,
  maxCoveragePerPolicy: 10_000n * U,
  disputeFeeBps: 200,
  gdnAprBps: 300,
  treasury: TREASURY,
};

/** Same bounds as the contract setters. */
const PARAM_BOUNDS: Record<ParamKey, [bigint, bigint]> = {
  protocolFeeBps: [0n, 4_000n],
  firstLossShareBps: [0n, 10_000n],
  firstLossCapBps: [0n, 2_000n],
  minReserveBps: [3_000n, 10_000n],
  liquidityTargetBps: [500n, 10_000n],
  maxLandlordShareBps: [100n, 10_000n],
  concentrationFloor: [0n, 1_000_000n * U],
  maxCoveragePerPolicy: [1n, 100_000n * U],
  disputeFeeBps: [0n, 1_000n],
  gdnAprBps: [0n, 2_000n],
};

// ───────────────────────────── state ─────────────────────────────

type PolicyRec = Omit<Policy, "claimWindowEnd">;
type ClaimRec = Claim;

interface RegistryRec {
  cleanCompleted: number;
  claimsPaid: number;
  openDebts: number;
  defaulted: boolean;
}

interface QueueRec {
  id: number;
  owner: Address;
  shares: bigint; // 0 once processed or cancelled
  requestedAt: number;
}

interface State {
  time: TimeConfig;
  params: Omit<AdminParams, "paused">;
  paused: boolean;
  policies: Map<number, PolicyRec>;
  claims: Map<number, ClaimRec>;
  debts: Map<number, Debt>;
  registry: Map<string, RegistryRec>;
  premiums: PremiumPayment[];
  evidence: Map<string, EvidenceBundle>;
  balances: Map<string, bigint>;
  allowances: Map<string, bigint>;
  shares: Map<string, bigint>;
  totalShares: bigint; // includes shares escrowed in the queue
  queue: QueueRec[];
  queueHead: number;
  idle: bigint; // includes the first-loss reserve and money held for pending claims
  adapterPrincipal: bigint;
  adapterLastAccrual: number;
  firstLoss: bigint;
  pending: bigint;
  activeCoverage: bigint;
  coverageByLandlord: Map<string, bigint>;
  gdnReserve: bigint;
  gdnLast: number;
  activity: ActivityEntry[];
  assetHistory: { at: number; assets: bigint }[];
  priceHistory: SharePricePoint[];
  arbiters: Set<string>;
  admins: Set<string>;
  nextPolicyId: number;
  nextClaimId: number;
}

const key = (a: string) => a.toLowerCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let hashCounter = 0;
const randomHash = (): Hash => keccak256(stringToHex(`tx-${Date.now()}-${Math.random()}-${hashCounter++}`));
const clone = <T,>(v: T): T => structuredClone(v);
const min = (a: bigint, b: bigint) => (a < b ? a : b);
const max = (a: bigint, b: bigint) => (a > b ? a : b);
const bytes = (s: string) => new TextEncoder().encode(s).length;

// ───────────────────────────── data source ─────────────────────────────

export class MockDataSource implements DataSource {
  readonly kind = "mock" as const;
  private state!: State;
  private listeners = new Set<() => void>();
  private clockOffset = 0;
  private rejectNextTx = false;

  constructor() {
    this.reset();
  }

  // ── demo controls (mock only, not part of DataSource) ──

  reset() {
    this.clockOffset = 0;
    this.state = buildSeed(this.now());
    this.emit();
  }

  /** Moves the mock clock forward, e.g. 60 s = one month in the demo profile. */
  skip(seconds: number) {
    this.clockOffset += seconds;
    this.recordSnapshot();
    this.emit();
  }

  setRejectNext(v: boolean) {
    this.rejectNextTx = v;
    this.emit();
  }

  get rejectNext() {
    return this.rejectNextTx;
  }

  // ── environment ──

  now(): number {
    return Math.floor(Date.now() / 1000) + this.clockOffset;
  }

  async getTimeConfig() {
    return clone(this.state.time);
  }

  getDemoWallets(): DemoWallet[] {
    return Object.values(PERSONAS);
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  // ── pool math ──

  private adapterValue(): bigint {
    const s = this.state;
    if (s.adapterPrincipal === 0n) return 0n;
    const elapsed = BigInt(Math.max(0, this.now() - s.adapterLastAccrual));
    return s.adapterPrincipal + (s.adapterPrincipal * TBILL_APR_BPS * elapsed * TIME_MULTIPLIER) / (YEAR * BPS);
  }

  /** Crystallizes accrued T-bill interest and logs it as yield. */
  private crystallize(hash: Hash) {
    const s = this.state;
    const value = this.adapterValue();
    const interest = value - s.adapterPrincipal;
    s.adapterPrincipal = value;
    s.adapterLastAccrual = this.now();
    if (interest > 0n) this.log("yield", interest, hash, "T-bill yield accrued (simulated)");
  }

  private grossAssets(): bigint {
    return this.state.idle + this.adapterValue();
  }

  /** Investor assets: gross − first-loss − pending claims, floored at 0. */
  private totalAssets(): bigint {
    const held = this.state.firstLoss + this.state.pending;
    const gross = this.grossAssets();
    return gross > held ? gross - held : 0n;
  }

  private required(coverage: bigint): bigint {
    return (coverage * BigInt(this.state.params.minReserveBps) + BPS - 1n) / BPS;
  }

  private freeAssets(): bigint {
    const ta = this.totalAssets();
    const req = this.required(this.state.activeCoverage);
    return ta > req ? ta - req : 0n;
  }

  private landlordLimit(): bigint {
    const p = this.state.params;
    const capacity = (this.totalAssets() * BPS) / BigInt(p.minReserveBps);
    return max(p.concentrationFloor, (capacity * BigInt(p.maxLandlordShareBps)) / BPS);
  }

  private firstLossRoom(): bigint {
    const cap = (this.totalAssets() * BigInt(this.state.params.firstLossCapBps)) / BPS;
    return cap > this.state.firstLoss ? cap - this.state.firstLoss : 0n;
  }

  private underwater(): boolean {
    return this.state.totalShares > 0n && this.totalAssets() === 0n;
  }

  private toShares(assets: bigint, roundUp = false): bigint {
    const num = assets * (this.state.totalShares + OFFSET);
    const den = this.totalAssets() + 1n;
    return roundUp ? (num + den - 1n) / den : num / den;
  }

  private toAssets(shares: bigint): bigint {
    return (shares * (this.totalAssets() + 1n)) / (this.state.totalShares + OFFSET);
  }

  private sharePrice(): number {
    return Number(this.toAssets(SHARE_UNIT)) / Number(U);
  }

  private gdnPending(): bigint {
    const s = this.state;
    const elapsed = BigInt(Math.max(0, this.now() - s.gdnLast));
    const accrued = (s.idle * BigInt(s.params.gdnAprBps) * elapsed * TIME_MULTIPLIER) / (YEAR * BPS);
    return min(accrued, s.gdnReserve);
  }

  private checkCapacity(landlord: Address, coverage: bigint) {
    const s = this.state;
    const required = this.required(s.activeCoverage + coverage);
    if (this.totalAssets() < required) throw new ContractError("ReserveTooLow");
    const after = (s.coverageByLandlord.get(key(landlord)) ?? 0n) + coverage;
    if (after > this.landlordLimit()) throw new ContractError("ConcentrationTooHigh");
  }

  private ensureLiquidity(amount: bigint, hash: Hash) {
    const s = this.state;
    if (s.idle >= amount) return;
    this.crystallize(hash);
    const pull = min(amount - s.idle, s.adapterPrincipal);
    s.adapterPrincipal -= pull;
    s.idle += pull;
    if (s.idle < amount) throw new ContractError("ReserveTooLow", "The pool doesn't have enough cash to pay this right now.");
  }

  /** Keeps `liquidityTargetBps` of investor assets idle, plus first-loss and pending claims. */
  private doRebalance(hash: Hash) {
    const s = this.state;
    this.crystallize(hash);
    const target = (this.totalAssets() * BigInt(s.params.liquidityTargetBps)) / BPS + s.firstLoss + s.pending;
    if (s.idle > target) {
      const move = s.idle - target;
      s.idle -= move;
      s.adapterPrincipal += move;
    } else if (s.idle < target) {
      const move = min(target - s.idle, s.adapterPrincipal);
      s.adapterPrincipal -= move;
      s.idle += move;
    }
  }

  private recordSnapshot() {
    const s = this.state;
    const at = this.now();
    s.assetHistory.push({ at, assets: this.totalAssets() });
    s.priceHistory.push({ at, price: this.sharePrice() });
    if (s.priceHistory.length > 400) s.priceHistory.splice(0, s.priceHistory.length - 400);
    if (s.assetHistory.length > 400) s.assetHistory.splice(0, s.assetHistory.length - 400);
  }

  private log(kind: ActivityKind, amount: bigint, txHash: Hash, label: string) {
    this.state.activity.unshift({ id: `${txHash}-${kind}-${this.state.activity.length}`, kind, amount, at: this.now(), txHash, label });
  }

  // ── registry ──

  private record(tenant: Address): RegistryRec {
    const k = key(tenant);
    let r = this.state.registry.get(k);
    if (!r) {
      r = { cleanCompleted: 0, claimsPaid: 0, openDebts: 0, defaulted: false };
      this.state.registry.set(k, r);
    }
    return r;
  }

  private history(tenant: Address): TenantHistory {
    const r = this.state.registry.get(key(tenant)) ?? { cleanCompleted: 0, claimsPaid: 0, openDebts: 0, defaulted: false };
    const tier: RiskTier = r.claimsPaid > 0 ? "C" : r.cleanCompleted > 0 ? "A" : "B";
    return { ...r, tier, blocked: r.defaulted || r.openDebts > 0 };
  }

  // ── token helpers ──

  private balance(a: Address) {
    return this.state.balances.get(key(a)) ?? 0n;
  }

  private credit(a: Address | string, amount: bigint) {
    this.state.balances.set(key(a), (this.state.balances.get(key(a)) ?? 0n) + amount);
  }

  private allowanceKey(owner: Address, spender: Spender) {
    return `${key(owner)}:${spender}`;
  }

  private requireFunds(owner: Address, spender: Spender, amount: bigint) {
    if (this.balance(owner) < amount) throw new ContractError("InsufficientBalance");
    if ((this.state.allowances.get(this.allowanceKey(owner, spender)) ?? 0n) < amount)
      throw new ContractError("InsufficientAllowance");
  }

  /** transferFrom: spends allowance and moves balance. */
  private pull(owner: Address, spender: Spender, amount: bigint) {
    const k = this.allowanceKey(owner, spender);
    this.state.allowances.set(k, (this.state.allowances.get(k) ?? 0n) - amount);
    this.credit(owner, -amount);
  }

  // ── tx lifecycle ──

  private async tx<T extends object>(opts: TxOptions, validate: () => void, apply: (hash: Hash) => T): Promise<T & TxReceipt> {
    validate(); // like eth_call simulation: fail before asking the wallet
    opts.onStage?.("wallet");
    await sleep(TX_WALLET_MS);
    if (this.rejectNextTx) {
      this.rejectNextTx = false;
      this.emit();
      throw new ContractError("UserRejected");
    }
    const hash = randomHash();
    opts.onStage?.("confirming", hash);
    await sleep(TX_CONFIRM_MS);
    validate(); // state may have moved while confirming
    const result = apply(hash);
    this.recordSnapshot();
    this.emit();
    opts.onStage?.("done", hash);
    return { ...result, hash };
  }

  // ── reads ──

  private async read<T>(fn: () => T): Promise<T> {
    await sleep(READ_MS);
    return clone(fn());
  }

  private claimWindowEnd(p: PolicyRec): number {
    const from = p.lapsedAt || p.endTime;
    return from ? from + this.state.time.claimWindow : 0;
  }

  private policyView(p: PolicyRec): Policy {
    return { ...p, claimWindowEnd: this.claimWindowEnd(p) };
  }

  getPoolStats(): Promise<PoolStats> {
    return this.read(() => {
      const s = this.state;
      const ta = this.totalAssets();
      const activeGuarantees = [...s.policies.values()].filter((p) => ["Active", "Lapsed", "Ended", "Claimed"].includes(p.status)).length;
      const open = s.queue.slice(s.queueHead).filter((q) => q.shares > 0n);
      return {
        totalAssets: ta,
        grossAssets: this.grossAssets(),
        idleAssets: s.idle,
        adapterValue: this.adapterValue(),
        firstLossBalance: s.firstLoss,
        pendingClaims: s.pending,
        activeCoverage: s.activeCoverage,
        reserveRatioBps: s.activeCoverage === 0n ? null : Number((ta * BPS) / s.activeCoverage),
        utilizationBps: ta === 0n ? 0 : Number((s.activeCoverage * BPS) / ta),
        minReserveBps: s.params.minReserveBps,
        liquidityTargetBps: s.params.liquidityTargetBps,
        freeAssets: this.freeAssets(),
        totalShares: s.totalShares,
        sharePrice: this.sharePrice(),
        activeGuarantees,
        queueLength: open.length,
        queuedShares: open.reduce((acc, q) => acc + q.shares, 0n),
        paused: s.paused,
        apy: this.apy(),
      };
    });
  }

  /**
   * netAPY = (premiumsToPool + gdnRewards + tbillYield + recoveries + firstLossCovers − claimsPaid)
   *          / avgAssets × (12 months / period)   (SPEC §5.6)
   */
  private apy() {
    const s = this.state;
    const now = this.now();
    const yearSecs = 12 * s.time.premiumPeriod;
    const start = Math.max(now - yearSecs, Math.min(...s.assetHistory.map((h) => h.at)));
    const sum = (kind: ActivityKind) =>
      s.activity.filter((a) => a.kind === kind && a.at >= start).reduce((acc, a) => acc + a.amount, 0n);
    const premiumsToPool = sum("premium");
    const tbillYield = sum("yield") + (this.adapterValue() - s.adapterPrincipal);
    const gdnRewards = sum("rewards");
    const recoveries = sum("repayment");
    const firstLossCovers = sum("firstLoss");
    const claimsPaid = sum("claim");
    const window = s.assetHistory.filter((h) => h.at >= start);
    const avgAssets =
      window.length > 0 ? window.reduce((acc, h) => acc + h.assets, 0n) / BigInt(window.length) : this.totalAssets();
    const periodMonths = Math.max(1, (now - start) / s.time.premiumPeriod);
    const net = premiumsToPool + gdnRewards + tbillYield + recoveries + firstLossCovers - claimsPaid;
    const netApy = avgAssets === 0n ? 0 : (Number(net) / Number(avgAssets)) * (12 / periodMonths);
    return { periodMonths, avgAssets, premiumsToPool, gdnRewards, tbillYield, recoveries, firstLossCovers, claimsPaid, netApy };
  }

  getPoolActivity() {
    return this.read(() => this.state.activity.slice(0, 120));
  }

  getSharePriceHistory() {
    return this.read(() => [...this.state.priceHistory, { at: this.now(), price: this.sharePrice() }]);
  }

  getInvestorPosition(account: Address): Promise<InvestorPosition> {
    return this.read(() => {
      const s = this.state;
      const shares = s.shares.get(key(account)) ?? 0n;
      const assets = this.toAssets(shares);
      const free = this.freeAssets();
      const queued: QueueRequest[] = [];
      let position = 0;
      for (let i = s.queueHead; i < s.queue.length; i++) {
        const q = s.queue[i];
        if (q.shares === 0n) continue;
        position++;
        if (key(q.owner) === key(account))
          queued.push({ id: q.id, owner: q.owner, shares: q.shares, assetsNow: this.toAssets(q.shares), requestedAt: q.requestedAt, position });
      }
      return { shares, assets, maxWithdraw: min(assets, free), limitedByReserve: free < assets, queued };
    });
  }

  previewDeposit(amount: bigint) {
    return this.read(() => this.toShares(amount));
  }

  previewWithdrawShares(amount: bigint) {
    return this.read(() => this.toShares(amount, true));
  }

  maxNewCoverage(landlord: Address) {
    return this.read(() => {
      const s = this.state;
      const capacity = (this.totalAssets() * BPS) / BigInt(s.params.minReserveBps);
      const byReserve = capacity > s.activeCoverage ? capacity - s.activeCoverage : 0n;
      const used = s.coverageByLandlord.get(key(landlord)) ?? 0n;
      const limit = this.landlordLimit();
      return min(byReserve, limit > used ? limit - used : 0n);
    });
  }

  getPolicies(filter: { landlord?: Address; tenant?: Address }) {
    return this.read(() =>
      [...this.state.policies.values()]
        .filter((p) => !filter.landlord || key(p.landlord) === key(filter.landlord))
        .filter((p) => !filter.tenant || (p.tenant && key(p.tenant) === key(filter.tenant)))
        .sort((a, b) => b.id - a.id)
        .map((p) => this.policyView(p)),
    );
  }

  getPolicy(id: number) {
    return this.read(() => {
      const p = this.state.policies.get(id);
      return p ? this.policyView(p) : null;
    });
  }

  getPremiumHistory(policyId: number) {
    return this.read(() => this.state.premiums.filter((p) => p.policyId === policyId).sort((a, b) => a.period - b.period));
  }

  async quote(coverage: bigint, totalPeriods: number, tier: RiskTier): Promise<QuoteResult> {
    const { monthlyPremium, annualPremium } = quotePremium(coverage, totalPeriods, tier);
    const p = this.state.params;
    const { toPool, toFirstLoss, toTreasury } = splitPremium(
      monthlyPremium,
      this.firstLossRoom(),
      BigInt(p.protocolFeeBps),
      BigInt(p.firstLossShareBps),
    );
    return { monthlyPremium, annualPremium, toPool, toFirstLoss, toTreasury, totalCost: monthlyPremium * BigInt(totalPeriods) };
  }

  getTenantHistory(tenant: Address) {
    return this.read(() => this.history(tenant));
  }

  getClaims(filter: { policyId?: number; disputedOnly?: boolean; tenant?: Address; landlord?: Address }) {
    return this.read(() =>
      [...this.state.claims.values()]
        .filter((c) => filter.policyId === undefined || c.policyId === filter.policyId)
        .filter((c) => !filter.disputedOnly || c.status === "Disputed")
        .filter((c) => {
          const p = this.state.policies.get(c.policyId)!;
          if (filter.tenant && (!p.tenant || key(p.tenant) !== key(filter.tenant))) return false;
          if (filter.landlord && key(p.landlord) !== key(filter.landlord)) return false;
          return true;
        })
        .sort((a, b) => b.id - a.id),
    );
  }

  getClaim(id: number) {
    return this.read(() => this.state.claims.get(id) ?? null);
  }

  getDebts(tenant: Address) {
    return this.read(() => [...this.state.debts.values()].filter((d) => key(d.tenant) === key(tenant)));
  }

  async getEvidence(hash: Hash) {
    const b = this.state.evidence.get(hash.toLowerCase());
    return b ? { ...b, files: b.files.map((f) => ({ ...f })) } : null;
  }

  async storeEvidence(bundle: EvidenceBundle) {
    this.state.evidence.set(bundle.hash.toLowerCase(), bundle);
  }

  async getUsdgBalance(account: Address) {
    return this.balance(account);
  }

  async getAllowance(owner: Address, spender: Spender) {
    return this.state.allowances.get(this.allowanceKey(owner, spender)) ?? 0n;
  }

  async hasArbiterRole(account: Address) {
    return this.state.arbiters.has(key(account));
  }

  async hasAdminRole(account: Address) {
    return this.state.admins.has(key(account));
  }

  getAdminParams(): Promise<AdminParams> {
    return this.read(() => ({ ...this.state.params, paused: this.state.paused }));
  }

  // ── writes: approvals and policies ──

  approve(spender: Spender, amount: bigint, opts: TxOptions) {
    return this.tx(
      opts,
      () => {},
      () => {
        this.state.allowances.set(this.allowanceKey(opts.account, spender), amount);
        return {};
      },
    );
  }

  createInvite(input: CreateInviteInput, opts: TxOptions) {
    const s = this.state;
    return this.tx(
      opts,
      () => {
        if (s.paused) throw new ContractError("EnforcedPause");
        if (input.coverage === 0n) throw new ContractError("ZeroAmount");
        if (input.coverage > s.params.maxCoveragePerPolicy) throw new ContractError("CoverageTooHigh");
        if (input.totalPeriods !== 6 && input.totalPeriods !== 12) throw new ContractError("InvalidTerm");
        if (!input.propertyRef.trim() || bytes(input.propertyRef) > 64) throw new ContractError("StringTooLong");
        if (input.tenant && key(input.tenant) === key(opts.account)) throw new ContractError("SameParty");
        this.checkCapacity(opts.account, input.coverage);
      },
      () => {
        const id = s.nextPolicyId++;
        if (input.checkIn) s.evidence.set(input.checkIn.hash.toLowerCase(), input.checkIn);
        s.policies.set(id, {
          id,
          landlord: opts.account,
          tenant: input.tenant,
          propertyRef: input.propertyRef.trim(),
          monthlyRent: input.monthlyRent,
          coverage: input.coverage,
          monthlyPremium: 0n,
          startTime: 0,
          endTime: 0,
          nextPremiumDue: 0,
          lapsedAt: 0,
          periodsPaid: 0,
          totalPeriods: input.totalPeriods,
          tier: "B",
          status: "Invited",
          checkInCid: input.checkIn?.cid ?? "",
          checkInEvidenceHash: input.checkIn?.hash ?? EMPTY,
          tenantCheckInCid: "",
          tenantCheckInHash: null,
          claimId: null,
          createdAt: this.now(),
          activatedTx: null,
        });
        return { policyId: id };
      },
    );
  }

  cancelInvite(policyId: number, opts: TxOptions) {
    return this.tx(
      opts,
      () => {
        const p = this.mustPolicy(policyId);
        if (key(p.landlord) !== key(opts.account)) throw new ContractError("NotLandlord");
        this.requireStatus(p, "Invited");
      },
      () => {
        this.mustPolicy(policyId).status = "Cancelled";
        return {};
      },
    );
  }

  acceptInvite(policyId: number, opts: TxOptions) {
    const s = this.state;
    return this.tx(
      opts,
      () => {
        const p = this.mustPolicy(policyId);
        if (s.paused) throw new ContractError("EnforcedPause");
        this.requireStatus(p, "Invited");
        if (p.tenant && key(p.tenant) !== key(opts.account)) throw new ContractError("NotTenant");
        if (!p.tenant && key(p.landlord) === key(opts.account)) throw new ContractError("SameParty");
        const h = this.history(opts.account);
        if (h.blocked) throw new ContractError("TenantBlocked");
        this.checkCapacity(p.landlord, p.coverage);
        this.requireFunds(opts.account, "policyManager", quotePremium(p.coverage, p.totalPeriods, h.tier).monthlyPremium);
      },
      (hash) => {
        const p = this.mustPolicy(policyId);
        const now = this.now();
        const tier = this.history(opts.account).tier;
        p.tenant = opts.account;
        p.tier = tier;
        p.monthlyPremium = quotePremium(p.coverage, p.totalPeriods, tier).monthlyPremium;
        p.startTime = now;
        p.endTime = now + p.totalPeriods * s.time.premiumPeriod;
        p.periodsPaid = 1;
        p.nextPremiumDue = now + s.time.premiumPeriod;
        p.status = "Active";
        p.activatedTx = hash;
        this.addCoverage(p.landlord, p.coverage);
        this.collectPremium(p, opts.account, 1, hash);
        return {};
      },
    );
  }

  addCheckInEvidence(policyId: number, notes: EvidenceBundle, opts: TxOptions) {
    return this.tx(
      opts,
      () => {
        const p = this.mustPolicy(policyId);
        this.requireStatus(p, "Active");
        if (!p.tenant || key(p.tenant) !== key(opts.account)) throw new ContractError("NotTenant");
        if (this.now() > p.startTime + this.state.time.checkInWindow) throw new ContractError("WindowClosed");
        if (!notes.cid || bytes(notes.cid) > 100) throw new ContractError("StringTooLong");
      },
      () => {
        const p = this.mustPolicy(policyId);
        this.state.evidence.set(notes.hash.toLowerCase(), notes);
        p.tenantCheckInCid = notes.cid;
        p.tenantCheckInHash = notes.hash;
        return {};
      },
    );
  }

  payPremium(policyId: number, opts: TxOptions) {
    const s = this.state;
    return this.tx(
      opts,
      () => {
        const p = this.mustPolicy(policyId);
        this.requireStatus(p, "Active");
        if (p.periodsPaid >= p.totalPeriods) throw new ContractError("PremiumNotDue");
        if (this.now() > p.nextPremiumDue + s.time.gracePeriod) throw new ContractError("WindowClosed");
        this.requireFunds(opts.account, "policyManager", p.monthlyPremium);
      },
      (hash) => {
        const p = this.mustPolicy(policyId);
        const period = ++p.periodsPaid;
        p.nextPremiumDue = period < p.totalPeriods ? p.startTime + period * s.time.premiumPeriod : 0;
        this.collectPremium(p, opts.account, period, hash);
        return {};
      },
    );
  }

  private collectPremium(p: PolicyRec, payer: Address, period: number, hash: Hash) {
    const s = this.state;
    const { toPool, toFirstLoss, toTreasury } = splitPremium(
      p.monthlyPremium,
      this.firstLossRoom(),
      BigInt(s.params.protocolFeeBps),
      BigInt(s.params.firstLossShareBps),
    );
    this.pull(payer, "policyManager", p.monthlyPremium);
    s.idle += toPool + toFirstLoss;
    s.firstLoss += toFirstLoss;
    this.credit(s.params.treasury, toTreasury);
    s.premiums.push({ policyId: p.id, period, amount: p.monthlyPremium, toPool, toFirstLoss, toTreasury, paidAt: this.now(), txHash: hash });
    this.log("premium", toPool, hash, `Premium, ${p.propertyRef} (month ${period})`);
  }

  private addCoverage(landlord: Address, amount: bigint) {
    const s = this.state;
    s.activeCoverage += amount;
    s.coverageByLandlord.set(key(landlord), (s.coverageByLandlord.get(key(landlord)) ?? 0n) + amount);
  }

  private closePolicy(p: PolicyRec, clean: boolean) {
    const s = this.state;
    p.status = "Closed";
    s.activeCoverage -= p.coverage;
    s.coverageByLandlord.set(key(p.landlord), (s.coverageByLandlord.get(key(p.landlord)) ?? 0n) - p.coverage);
    if (clean && !p.lapsedAt && p.tenant) this.record(p.tenant).cleanCompleted += 1;
  }

  // ── writes: claims and debt ──

  fileClaim(input: FileClaimInput, opts: TxOptions) {
    const s = this.state;
    return this.tx(
      opts,
      () => {
        const p = this.mustPolicy(input.policyId);
        if (key(p.landlord) !== key(opts.account)) throw new ContractError("NotLandlord");
        if (p.claimId !== null) throw new ContractError("ClaimExists");
        if (input.amount === 0n) throw new ContractError("ZeroAmount");
        if (input.amount > p.coverage) throw new ContractError("AmountExceedsCoverage");
        if (bytes(input.note) > 280) throw new ContractError("StringTooLong");
        const status = this.autoEndStatus(p);
        if (status !== "Ended" && status !== "Lapsed") throw new ContractError("InvalidStatus");
        if (this.now() > this.claimWindowEnd({ ...p, status })) throw new ContractError("WindowClosed");
      },
      (hash) => {
        const p = this.mustPolicy(input.policyId);
        this.autoEnd(p);
        p.status = "Claimed";
        const id = s.nextClaimId++;
        const now = this.now();
        s.evidence.set(input.checkOut.hash.toLowerCase(), input.checkOut);
        s.claims.set(id, {
          id,
          policyId: p.id,
          claimType: input.claimType,
          amountClaimed: input.amount,
          amountApproved: 0n,
          filedAt: now,
          responseDeadline: now + s.time.responseWindow,
          arbiterDeadline: 0,
          evidenceCid: input.checkOut.cid,
          checkOutEvidenceHash: input.checkOut.hash,
          landlordNote: input.note,
          tenantNote: "",
          arbiterReason: "",
          status: "Filed",
          disputeFee: 0n,
          resolvedAt: null,
          paidAt: null,
          autoAccepted: false,
          timeline: [{ label: "Claim filed", at: now, txHash: hash }],
        });
        p.claimId = id;
        s.pending += input.amount;
        return { claimId: id };
      },
    );
  }

  acceptClaim(claimId: number, opts: TxOptions) {
    return this.tx(
      opts,
      () => {
        const c = this.mustClaim(claimId);
        this.requireClaimStatus(c, "Filed");
        if (key(this.tenantOf(c)) !== key(opts.account)) throw new ContractError("NotTenant");
        if (this.now() > c.responseDeadline) throw new ContractError("WindowClosed");
      },
      (hash) => {
        const c = this.mustClaim(claimId);
        c.status = "Accepted";
        c.timeline.push({ label: "Tenant accepted", at: this.now(), txHash: hash });
        this.payClaim(c, c.amountClaimed, 0n, hash);
        return {};
      },
    );
  }

  disputeClaim(claimId: number, note: string, opts: TxOptions) {
    return this.tx(
      opts,
      () => {
        const c = this.mustClaim(claimId);
        this.requireClaimStatus(c, "Filed");
        if (key(this.tenantOf(c)) !== key(opts.account)) throw new ContractError("NotTenant");
        if (this.now() > c.responseDeadline) throw new ContractError("WindowClosed");
        if (!note.trim()) throw new ContractError("ReasonRequired");
        if (bytes(note) > 280) throw new ContractError("StringTooLong");
      },
      (hash) => {
        const c = this.mustClaim(claimId);
        c.status = "Disputed";
        c.tenantNote = note.trim();
        c.arbiterDeadline = this.now() + this.state.time.arbiterWindow;
        c.timeline.push({ label: "Tenant disputed", at: this.now(), txHash: hash });
        return {};
      },
    );
  }

  autoAcceptClaim(claimId: number, opts: TxOptions) {
    return this.tx(
      opts,
      () => {
        const c = this.mustClaim(claimId);
        this.requireClaimStatus(c, "Filed");
        if (this.now() <= c.responseDeadline) throw new ContractError("WindowNotOpen");
      },
      (hash) => {
        const c = this.mustClaim(claimId);
        c.status = "Accepted";
        c.autoAccepted = true;
        c.timeline.push({ label: "No response, accepted automatically", at: this.now(), txHash: hash });
        this.payClaim(c, c.amountClaimed, 0n, hash);
        return {};
      },
    );
  }

  resolveDispute(claimId: number, amountApproved: bigint, reason: string, opts: TxOptions) {
    const s = this.state;
    return this.tx(
      opts,
      () => {
        if (!s.arbiters.has(key(opts.account))) throw new ContractError("NotArbiter");
        const c = this.mustClaim(claimId);
        this.requireClaimStatus(c, "Disputed");
        if (amountApproved > c.amountClaimed) throw new ContractError("AmountExceedsClaim");
        if (!reason.trim()) throw new ContractError("ReasonRequired");
        if (bytes(reason) > 280) throw new ContractError("StringTooLong");
      },
      (hash) => {
        const c = this.mustClaim(claimId);
        c.arbiterReason = reason.trim();
        c.resolvedAt = this.now();
        s.pending = s.pending - c.amountClaimed + amountApproved;
        if (amountApproved === 0n) {
          c.status = "Rejected";
          c.timeline.push({ label: "Arbiter rejected the claim", at: this.now(), txHash: hash });
          this.closePolicy(this.mustPolicy(c.policyId), true);
          return {};
        }
        const full = amountApproved === c.amountClaimed;
        c.status = full ? "Approved" : "PartiallyApproved";
        c.timeline.push({
          label: full ? "Arbiter approved the full amount" : "Arbiter approved part of the claim",
          at: this.now(),
          txHash: hash,
        });
        this.payClaim(c, amountApproved, full ? disputeFee(c.amountClaimed, s.params.disputeFeeBps) : 0n, hash);
        return {};
      },
    );
  }

  private payClaim(c: ClaimRec, amount: bigint, fee: bigint, hash: Hash) {
    const s = this.state;
    const p = this.mustPolicy(c.policyId);
    const now = this.now();
    const missedPremium = p.lapsedAt ? p.monthlyPremium : 0n;
    c.amountApproved = amount;
    c.disputeFee = fee;
    c.status = "Paid";
    c.paidAt = now;
    c.timeline.push({ label: "Pool paid the landlord", at: now, txHash: hash });
    const principal = amount + missedPremium + fee;
    s.debts.set(c.id, {
      claimId: c.id,
      policyId: p.id,
      tenant: p.tenant!,
      principal,
      repaid: 0n,
      nextInstallmentDue: now + s.time.installmentPeriod,
      installments: s.time.debtInstallments,
      defaulted: false,
      disputeFee: fee,
      missedPremium,
      coveredByFirstLoss: 0n,
      startedAt: now,
      installmentAmount: ceilDiv(principal, BigInt(s.time.debtInstallments)),
    });
    const r = this.record(p.tenant!);
    r.claimsPaid += 1;
    r.openDebts += 1;
    this.closePolicy(p, false);
    s.pending -= amount;
    this.ensureLiquidity(amount, hash);
    s.idle -= amount;
    this.credit(p.landlord, amount);
    this.log("claim", amount, hash, `Claim paid, ${p.propertyRef}`);
    this.doRebalance(hash);
  }

  repay(claimId: number, amount: bigint, opts: TxOptions) {
    const s = this.state;
    return this.tx(
      opts,
      () => {
        if (amount === 0n) throw new ContractError("ZeroAmount");
        const d = s.debts.get(claimId);
        if (!d || d.repaid >= d.principal) throw new ContractError("NothingOwed");
        this.requireFunds(opts.account, "claimManager", min(amount, d.principal - d.repaid));
      },
      (hash) => {
        const d = s.debts.get(claimId)!;
        const pay = min(amount, d.principal - d.repaid);
        const poolPortion = d.principal - d.disputeFee;
        const poolRemaining = poolPortion > d.repaid ? poolPortion - d.repaid : 0n;
        const toPool = min(pay, poolRemaining);
        const toTreasury = pay - toPool;
        this.pull(opts.account, "claimManager", pay);
        s.idle += toPool;
        this.credit(s.params.treasury, toTreasury);
        d.repaid += pay;
        d.nextInstallmentDue =
          d.repaid >= d.principal ? 0 : d.startedAt + (Number(d.repaid / d.installmentAmount) + 1) * s.time.installmentPeriod;
        if (d.repaid >= d.principal && !d.defaulted) {
          const r = this.record(d.tenant);
          if (r.openDebts > 0) r.openDebts -= 1;
        }
        const p = this.mustPolicy(d.policyId);
        if (toPool > 0n) this.log("repayment", toPool, hash, `Repayment, ${p.propertyRef}`);
        return {};
      },
    );
  }

  markDefault(claimId: number, opts: TxOptions) {
    const s = this.state;
    return this.tx(
      opts,
      () => {
        const d = s.debts.get(claimId);
        if (!d || d.repaid >= d.principal) throw new ContractError("NothingOwed");
        if (d.defaulted) throw new ContractError("AlreadyDefaulted");
        if (this.now() <= d.nextInstallmentDue + s.time.gracePeriod) throw new ContractError("NotOverdue");
      },
      (hash) => {
        const d = s.debts.get(claimId)!;
        d.defaulted = true;
        const poolPortion = d.principal - d.disputeFee;
        const outstanding = poolPortion > d.repaid ? poolPortion - d.repaid : 0n;
        const covered = min(outstanding, s.firstLoss);
        s.firstLoss -= covered;
        d.coveredByFirstLoss = covered;
        this.record(d.tenant).defaulted = true;
        const p = this.mustPolicy(d.policyId);
        if (covered > 0n) this.log("firstLoss", covered, hash, `First-loss reserve covered a default, ${p.propertyRef}`);
        return {};
      },
    );
  }

  // ── writes: investors ──

  deposit(amount: bigint, opts: TxOptions) {
    const s = this.state;
    return this.tx(
      opts,
      () => {
        if (s.paused) throw new ContractError("EnforcedPause");
        if (amount === 0n) throw new ContractError("ZeroAmount");
        if (this.underwater()) throw new ContractError("PoolUnderwater");
        this.requireFunds(opts.account, "pool", amount);
      },
      (hash) => {
        this.crystallize(hash);
        const shares = this.toShares(amount);
        this.pull(opts.account, "pool", amount);
        s.idle += amount;
        s.totalShares += shares;
        s.shares.set(key(opts.account), (s.shares.get(key(opts.account)) ?? 0n) + shares);
        this.log("deposit", amount, hash, "Investor deposit");
        this.doRebalance(hash);
        return {};
      },
    );
  }

  withdraw(amount: bigint, opts: TxOptions) {
    const s = this.state;
    return this.tx(
      opts,
      () => {
        if (amount === 0n) throw new ContractError("ZeroAmount");
        const ta = this.totalAssets();
        const after = ta > amount ? ta - amount : 0n;
        if (after < this.required(s.activeCoverage))
          throw new ContractError("ReserveTooLow", "This would drop the pool below its minimum reserve. Withdraw a smaller amount or request a queued withdrawal.");
        const owned = this.toAssets(s.shares.get(key(opts.account)) ?? 0n);
        if (amount > owned) throw new ContractError("InsufficientBalance", "That's more than your position in the pool.");
      },
      (hash) => {
        this.crystallize(hash);
        const shares = this.toShares(amount, true);
        this.ensureLiquidity(amount, hash);
        s.idle -= amount;
        s.totalShares -= shares;
        s.shares.set(key(opts.account), (s.shares.get(key(opts.account)) ?? 0n) - shares);
        this.credit(opts.account, amount);
        this.log("withdraw", amount, hash, "Investor withdrawal");
        this.doRebalance(hash);
        return {};
      },
    );
  }

  requestRedeem(shares: bigint, opts: TxOptions) {
    const s = this.state;
    return this.tx(
      opts,
      () => {
        if (shares === 0n) throw new ContractError("ZeroAmount");
        if ((s.shares.get(key(opts.account)) ?? 0n) < shares)
          throw new ContractError("InsufficientBalance", "That's more than your position in the pool.");
      },
      () => {
        s.shares.set(key(opts.account), (s.shares.get(key(opts.account)) ?? 0n) - shares);
        s.queue.push({ id: s.queue.length, owner: opts.account, shares, requestedAt: this.now() });
        return {};
      },
    );
  }

  cancelRedeem(requestId: number, opts: TxOptions) {
    const s = this.state;
    return this.tx(
      opts,
      () => {
        const q = s.queue[requestId];
        if (!q || key(q.owner) !== key(opts.account)) throw new ContractError("NotRequestOwner");
        if (q.shares === 0n) throw new ContractError("ZeroAmount", "This request was already paid or cancelled.");
      },
      () => {
        const q = s.queue[requestId];
        s.shares.set(key(q.owner), (s.shares.get(key(q.owner)) ?? 0n) + q.shares);
        q.shares = 0n;
        return {};
      },
    );
  }

  processQueue(maxCount: number, opts: TxOptions) {
    const s = this.state;
    return this.tx(
      opts,
      () => {},
      (hash) => {
        this.crystallize(hash);
        let i = s.queueHead;
        let steps = 0;
        while (i < s.queue.length && steps < maxCount) {
          const q = s.queue[i];
          if (q.shares > 0n) {
            const assets = this.toAssets(q.shares);
            if (assets > this.freeAssets()) break;
            s.totalShares -= q.shares;
            q.shares = 0n;
            this.ensureLiquidity(assets, hash);
            s.idle -= assets;
            this.credit(q.owner, assets);
            this.log("withdraw", assets, hash, "Queued withdrawal paid");
          }
          i++;
          steps++;
        }
        s.queueHead = i;
        return {};
      },
    );
  }

  rebalance(opts: TxOptions) {
    return this.tx(
      opts,
      () => {},
      (hash) => {
        const before = this.adapterValue();
        this.doRebalance(hash);
        const moved = this.state.adapterPrincipal - before;
        if (moved !== 0n)
          this.log("rebalance", moved > 0n ? moved : -moved, hash, moved > 0n ? "Idle cash moved to T-bills" : "Cash pulled back from T-bills");
        return {};
      },
    );
  }

  distributeRewards(opts: TxOptions) {
    const s = this.state;
    return this.tx(
      opts,
      () => {},
      (hash) => {
        const reward = this.gdnPending();
        s.gdnLast = this.now();
        if (reward > 0n) {
          s.gdnReserve -= reward;
          s.idle += reward;
          this.log("rewards", reward, hash, "USDG partner rewards on idle cash (simulated)");
        }
        return {};
      },
    );
  }

  // ── writes: keeper ──

  endLease(policyId: number, opts: TxOptions) {
    return this.tx(
      opts,
      () => {
        const p = this.mustPolicy(policyId);
        this.requireStatus(p, "Active");
        if (this.now() < p.endTime) throw new ContractError("WindowNotOpen");
        if (p.periodsPaid < p.totalPeriods) throw new ContractError("PremiumsOutstanding");
      },
      () => {
        this.mustPolicy(policyId).status = "Ended";
        return {};
      },
    );
  }

  closeIfNoClaim(policyId: number, opts: TxOptions) {
    return this.tx(
      opts,
      () => {
        const p = this.mustPolicy(policyId);
        const status = this.autoEndStatus(p);
        if (status !== "Ended" && status !== "Lapsed") throw new ContractError("InvalidStatus");
        if (this.now() <= this.claimWindowEnd(p)) throw new ContractError("WindowNotOpen");
      },
      () => {
        const p = this.mustPolicy(policyId);
        this.autoEnd(p);
        this.closePolicy(p, true);
        return {};
      },
    );
  }

  markLapsed(policyId: number, opts: TxOptions) {
    return this.tx(
      opts,
      () => {
        const p = this.mustPolicy(policyId);
        this.requireStatus(p, "Active");
        if (p.periodsPaid >= p.totalPeriods) throw new ContractError("PremiumNotDue");
        if (this.now() <= p.nextPremiumDue + this.state.time.gracePeriod) throw new ContractError("WindowNotOpen");
      },
      () => {
        const p = this.mustPolicy(policyId);
        p.status = "Lapsed";
        p.lapsedAt = this.now();
        return {};
      },
    );
  }

  // ── writes: admin ──

  setParam(paramKey: ParamKey, value: bigint, opts: TxOptions) {
    const s = this.state;
    return this.tx(
      opts,
      () => {
        if (!s.admins.has(key(opts.account))) throw new ContractError("NotAdmin");
        const [lo, hi] = PARAM_BOUNDS[paramKey];
        if (value < lo || value > hi) throw new ContractError("ParamOutOfBounds");
      },
      () => {
        if (paramKey === "concentrationFloor" || paramKey === "maxCoveragePerPolicy") s.params[paramKey] = value;
        else s.params[paramKey] = Number(value);
        return {};
      },
    );
  }

  setPaused(paused: boolean, opts: TxOptions) {
    return this.tx(
      opts,
      () => {
        if (!this.state.admins.has(key(opts.account))) throw new ContractError("NotAdmin");
      },
      () => {
        this.state.paused = paused;
        return {};
      },
    );
  }

  mintTestUsdg(amount: bigint, opts: TxOptions) {
    return this.tx(
      opts,
      () => {
        if (amount > 100_000n * U) throw new ContractError("ZeroAmount", "MockUSDG mints at most 100,000 per call.");
      },
      () => {
        this.credit(opts.account, amount);
        return {};
      },
    );
  }

  // ── internal rule helpers ──

  private mustPolicy(id: number): PolicyRec {
    const p = this.state.policies.get(id);
    if (!p) throw new ContractError("InvalidStatus", "This lease doesn't exist.");
    return p;
  }

  private mustClaim(id: number): ClaimRec {
    const c = this.state.claims.get(id);
    if (!c) throw new ContractError("InvalidStatus", "This claim doesn't exist.");
    return c;
  }

  private tenantOf(c: ClaimRec): Address {
    return this.mustPolicy(c.policyId).tenant!;
  }

  private requireStatus(p: PolicyRec, expected: Policy["status"]) {
    if (p.status !== expected) throw new ContractError("InvalidStatus");
  }

  private requireClaimStatus(c: ClaimRec, expected: ClaimStatus) {
    if (c.status !== expected) throw new ContractError("InvalidStatus");
  }

  /** A fully paid lease past its end time counts as Ended even before a keeper calls endLease. */
  private autoEndStatus(p: PolicyRec): Policy["status"] {
    if (p.status === "Active" && this.now() >= p.endTime && p.periodsPaid >= p.totalPeriods) return "Ended";
    return p.status;
  }

  private autoEnd(p: PolicyRec) {
    p.status = this.autoEndStatus(p);
  }
}

const EMPTY: Hash = "0x0000000000000000000000000000000000000000000000000000000000000000";

function ceilDiv(a: bigint, b: bigint) {
  return a === 0n ? 0n : (a - 1n) / b + 1n;
}

function disputeFee(claimed: bigint, feeBps: number) {
  const fee = (claimed * BigInt(feeBps)) / BPS;
  const minFee = 10n * U;
  return fee < minFee ? minFee : fee;
}

// ───────────────────────────── seed ─────────────────────────────
// Mirrors contracts/script/Seed.s.sol, laid out relative to "now" so every dashboard has live data:
// the demo invite for a new renter (tier B), a returning tenant repaying a past claim, an ended lease in its claim
// window, a disputed claim with the tenant's move-in notes, a clean closed lease, and a defaulted debt that the
// first-loss reserve covered.

function buildSeed(T: number): State {
  const time = DEMO_TIME;
  const ev = seedEvidence();
  const s: State = {
    time,
    params: { ...DEFAULT_PARAMS },
    paused: false,
    policies: new Map(),
    claims: new Map(),
    debts: new Map(),
    registry: new Map(),
    premiums: [],
    evidence: new Map(),
    balances: new Map(),
    allowances: new Map(),
    shares: new Map(),
    totalShares: 0n,
    queue: [],
    queueHead: 0,
    idle: 0n,
    adapterPrincipal: 0n,
    adapterLastAccrual: T,
    firstLoss: 0n,
    pending: 0n,
    activeCoverage: 0n,
    coverageByLandlord: new Map(),
    gdnReserve: 1_000n * U,
    gdnLast: T - 120,
    activity: [],
    assetHistory: [],
    priceHistory: [],
    arbiters: new Set([key(PERSONAS.arbiter.address)]),
    admins: new Set([key(PERSONAS.admin.address)]),
    nextPolicyId: 1,
    nextClaimId: 1,
  };
  for (const b of Object.values(ev)) s.evidence.set(b.hash.toLowerCase(), b);

  s.balances.set(key(PERSONAS.tenant.address), 640n * U);
  s.balances.set(key(PERSONAS.newTenant.address), 400n * U);
  s.balances.set(key(PERSONAS.landlord.address), 1_250n * U);
  s.balances.set(key(PERSONAS.investor.address), 25_000n * U);
  s.balances.set(key(PERSONAS.arbiter.address), 50n * U);
  s.balances.set(key(PERSONAS.admin.address), 50n * U);
  for (const t of [BUDI, SARI, RIZKY]) s.balances.set(key(t), 500n * U);

  // Pool: 52,340.18 USDG of investor assets at a share price of ~1.0712 after twelve simulated months.
  // On top of that the pool holds the first-loss reserve and the 300 USDG of Sari's disputed claim.
  const investorAssets = 52_340_180_000n;
  s.firstLoss = 1_284_500_000n;
  s.pending = 300n * U;
  const price = 10_712n; // ×1e-4
  s.totalShares = (investorAssets * SHARE_UNIT * 10_000n) / (price * U);
  s.shares.set(key(PERSONAS.investor.address), (12_856_400_000n * SHARE_UNIT * 10_000n) / (price * U));
  s.idle = (investorAssets * BigInt(s.params.liquidityTargetBps)) / BPS + s.firstLoss + s.pending;
  s.adapterPrincipal = investorAssets + s.firstLoss + s.pending - s.idle;

  // Twelve simulated months of history (1 month = 60 s back from now).
  const m = time.premiumPeriod;
  const fakeHash = (i: number) => keccak256(stringToHex(`seed-${i}`));
  const prices = [10_000, 10_061, 10_118, 10_176, 10_139, 10_201, 10_262, 10_318, 10_377, 10_350, 10_419, 10_488, 10_712];
  const assets = [43_100, 44_200, 45_050, 46_300, 46_900, 47_850, 48_400, 49_900, 50_600, 51_050, 51_700, 52_020, 52_340];
  for (let i = 0; i <= 12; i++) {
    const at = T - (12 - i) * m;
    s.priceHistory.push({ at, price: prices[i] / 10_000 });
    s.assetHistory.push({ at, assets: BigInt(assets[i]) * U });
  }
  const seedLog = (monthsAgo: number, kind: ActivityKind, amount: bigint, label: string, i: number) =>
    s.activity.push({ id: `seed-${i}`, kind, amount, at: T - monthsAgo * m, txHash: fakeHash(i), label });
  let i = 0;
  for (let mo = 12; mo >= 1; mo--) {
    seedLog(mo - 0.5, "premium", BigInt(520 + (12 - mo) * 9) * U, "Premiums from active leases", i++);
    seedLog(mo - 0.9, "yield", BigInt(62 + (12 - mo) * 2) * U, "T-bill yield accrued (simulated)", i++);
    seedLog(mo - 0.7, "rewards", BigInt(41 + (12 - mo)) * U, "USDG partner rewards on idle cash (simulated)", i++);
  }
  seedLog(8.3, "claim", 1_450n * U, "Claim paid, Unit 3A, Jl. Gatot Subroto", i++);
  seedLog(3.4, "claim", 2_100n * U, "Claim paid, Room 8, Holland Village", i++);
  seedLog(7.1, "repayment", 320n * U, "Repayment, Unit 3A, Jl. Gatot Subroto", i++);
  seedLog(5.2, "repayment", 280n * U, "Repayment, Unit 3A, Jl. Gatot Subroto", i++);
  seedLog(2.2, "repayment", 250n * U, "Repayment, Room 8, Holland Village", i++);
  seedLog(9.6, "deposit", 8_000n * U, "Investor deposit", i++);
  seedLog(4.0, "rebalance", 6_200n * U, "Idle cash moved to T-bills", i++);

  const L = PERSONAS.landlord.address;
  const AYU = PERSONAS.tenant.address;
  const add = (p: Partial<PolicyRec> & Pick<PolicyRec, "propertyRef" | "coverage" | "totalPeriods" | "status">) => {
    const id = s.nextPolicyId++;
    const tier = p.tier ?? "B";
    const rec: PolicyRec = {
      id,
      landlord: L,
      tenant: null,
      monthlyRent: p.coverage,
      monthlyPremium: p.status === "Invited" ? 0n : quotePremium(p.coverage, p.totalPeriods, tier).monthlyPremium,
      startTime: 0,
      endTime: 0,
      nextPremiumDue: 0,
      lapsedAt: 0,
      periodsPaid: 0,
      tier,
      checkInCid: ev.genericCheckIn.cid,
      checkInEvidenceHash: ev.genericCheckIn.hash,
      tenantCheckInCid: "",
      tenantCheckInHash: null,
      claimId: null,
      createdAt: T - 120,
      activatedTx: null,
      ...p,
    };
    s.policies.set(id, rec);
    if (["Active", "Lapsed", "Ended", "Claimed"].includes(rec.status)) {
      s.activeCoverage += rec.coverage;
      s.coverageByLandlord.set(key(rec.landlord), (s.coverageByLandlord.get(key(rec.landlord)) ?? 0n) + rec.coverage);
    }
    for (let k = 1; k <= rec.periodsPaid; k++) {
      const split = splitPremium(rec.monthlyPremium);
      s.premiums.push({ policyId: id, period: k, amount: rec.monthlyPremium, ...split, paidAt: rec.startTime + (k - 1) * m, txHash: fakeHash(1_000 + id * 20 + k) });
    }
    return rec;
  };
  const active = (start: number, periods: number, paid: number) => ({
    startTime: start,
    endTime: start + periods * m,
    periodsPaid: paid,
    nextPremiumDue: paid < periods ? start + paid * m : 0,
    activatedTx: fakeHash(2_000 + start),
  });
  const reg = (who: Address, r: Partial<RegistryRec>) => s.registry.set(key(who), { cleanCompleted: 0, claimsPaid: 0, openDebts: 0, defaulted: false, ...r });

  // Open invites. #1 is the demo invite link for a new renter (tier B → $15.00).
  add({ propertyRef: "Unit 12B, Orchard", coverage: 2_000n * U, monthlyRent: 2_000n * U, totalPeriods: 12, status: "Invited", createdAt: T - 90 });
  add({ propertyRef: "Kos Tebet No. 7", coverage: 800n * U, monthlyRent: 400n * U, totalPeriods: 12, status: "Invited", createdAt: T - 200 });
  add({ propertyRef: "Room 3C, Tiong Bahru", coverage: 1_200n * U, totalPeriods: 6, status: "Invited", createdAt: T - 260 });

  // Ayu's current lease: 5 of 12 months paid, next fee due in 90 s.
  add({ propertyRef: "Unit 4D, Orchard Rd", coverage: 2_200n * U, monthlyRent: 2_200n * U, totalPeriods: 12, tier: "B", status: "Active", tenant: AYU, ...active(T - 210, 12, 5), checkInEvidenceHash: ev.kuninganCheckIn.hash, checkInCid: ev.kuninganCheckIn.cid });

  // Ended lease inside its claim window (ended 40 s ago).
  add({ propertyRef: "Unit 9F, Jl. Thamrin", coverage: 1_800n * U, totalPeriods: 6, tier: "A", status: "Ended", tenant: BUDI, ...active(T - 400, 6, 6) });

  // Disputed claim waiting for the arbiter. Sari added move-in notes within the check-in window.
  const senopati = add({
    propertyRef: "Unit 2B, Jl. Senopati",
    coverage: 2_000n * U,
    totalPeriods: 6,
    tier: "B",
    status: "Claimed",
    tenant: SARI,
    ...active(T - 460, 6, 6),
    checkInEvidenceHash: ev.senopatiCheckIn.hash,
    checkInCid: ev.senopatiCheckIn.cid,
    tenantCheckInHash: ev.senopatiTenantNotes.hash,
    tenantCheckInCid: ev.senopatiTenantNotes.cid,
  });
  const disputedId = s.nextClaimId++;
  s.claims.set(disputedId, {
    id: disputedId,
    policyId: senopati.id,
    claimType: "Damage",
    amountClaimed: 300n * U,
    amountApproved: 0n,
    filedAt: T - 90,
    responseDeadline: T - 90 + time.responseWindow,
    arbiterDeadline: T - 60 + time.arbiterWindow,
    evidenceCid: ev.senopatiCheckOut.cid,
    checkOutEvidenceHash: ev.senopatiCheckOut.hash,
    landlordNote: "Wardrobe door broken off its hinge and a crack with a water stain on the bedroom wall.",
    tenantNote: "The wardrobe door was already loose at check-in (see my move-in photo). The wall crack is new and I accept that part.",
    arbiterReason: "",
    status: "Disputed",
    disputeFee: 0n,
    resolvedAt: null,
    paidAt: null,
    autoAccepted: false,
    timeline: [
      { label: "Claim filed", at: T - 90, txHash: fakeHash(3_001) },
      { label: "Tenant disputed", at: T - 60, txHash: fakeHash(3_002) },
    ],
  });
  senopati.claimId = disputedId;

  // Budi's earlier lease closed with no claim: a clean record, so his next lease is tier A.
  add({ propertyRef: "Unit 5E, Clementi Ave", coverage: 1_500n * U, totalPeriods: 6, tier: "B", status: "Closed", tenant: BUDI, ...active(T - 900, 6, 6) });
  reg(BUDI, { cleanCompleted: 1 });

  // Ayu's previous lease: the arbiter approved 200 of a 300 claim (no dispute fee on a partial decision); 70 repaid.
  const kuningan = add({ propertyRef: "Unit 11C, Kuningan City", coverage: 2_000n * U, totalPeriods: 6, tier: "B", status: "Closed", tenant: AYU, ...active(T - 780, 6, 6), checkInEvidenceHash: ev.kuninganCheckIn.hash, checkInCid: ev.kuninganCheckIn.cid });
  const paidId = s.nextClaimId++;
  s.claims.set(paidId, {
    id: paidId,
    policyId: kuningan.id,
    claimType: "Damage",
    amountClaimed: 300n * U,
    amountApproved: 200n * U,
    filedAt: T - 330,
    responseDeadline: T - 150,
    arbiterDeadline: T - 0,
    evidenceCid: ev.kuninganCheckOut.cid,
    checkOutEvidenceHash: ev.kuninganCheckOut.hash,
    landlordNote: "Wall damage in the bedroom and a missing curtain rail.",
    tenantNote: "The curtain rail was never installed.",
    arbiterReason: "Wall damage is new; the curtain rail is not on the check-in photos.",
    status: "Paid",
    disputeFee: 0n,
    resolvedAt: T - 110,
    paidAt: T - 110,
    autoAccepted: false,
    timeline: [
      { label: "Claim filed", at: T - 330, txHash: fakeHash(3_101) },
      { label: "Tenant disputed", at: T - 300, txHash: fakeHash(3_102) },
      { label: "Arbiter approved part of the claim", at: T - 110, txHash: fakeHash(3_103) },
      { label: "Pool paid the landlord", at: T - 110, txHash: fakeHash(3_103) },
    ],
  });
  kuningan.claimId = paidId;
  s.debts.set(paidId, {
    claimId: paidId,
    policyId: kuningan.id,
    tenant: AYU,
    principal: 200n * U,
    repaid: 70n * U,
    nextInstallmentDue: T - 50 + 3 * time.installmentPeriod,
    installments: time.debtInstallments,
    defaulted: false,
    disputeFee: 0n,
    missedPremium: 0n,
    coveredByFirstLoss: 0n,
    startedAt: T - 50,
    installmentAmount: ceilDiv(200n * U, BigInt(time.debtInstallments)),
  });
  reg(AYU, { claimsPaid: 1, openDebts: 1 });
  seedLog(1.8, "claim", 200n * U, "Claim paid, Unit 11C, Kuningan City", i++);
  seedLog(0.6, "repayment", 70n * U, "Repayment, Unit 11C, Kuningan City", i++);

  // Rizky lapsed, the landlord claimed 250 + the missed fee, he never repaid: defaulted, covered by first-loss.
  const tebet = add({ propertyRef: "Unit 6A, Jl. Tebet Raya", coverage: 1_000n * U, totalPeriods: 12, tier: "B", status: "Closed", tenant: RIZKY, ...active(T - 600, 12, 3), lapsedAt: T - 350 });
  const defaultId = s.nextClaimId++;
  s.claims.set(defaultId, {
    id: defaultId,
    policyId: tebet.id,
    claimType: "UnpaidRent",
    amountClaimed: 250n * U,
    amountApproved: 250n * U,
    filedAt: T - 340,
    responseDeadline: T - 160,
    arbiterDeadline: 0,
    evidenceCid: ev.genericCheckIn.cid,
    checkOutEvidenceHash: ev.genericCheckIn.hash,
    landlordNote: "Tenant left two weeks early without paying the last half month of rent.",
    tenantNote: "",
    arbiterReason: "",
    status: "Paid",
    disputeFee: 0n,
    resolvedAt: null,
    paidAt: T - 155,
    autoAccepted: true,
    timeline: [
      { label: "Claim filed", at: T - 340, txHash: fakeHash(3_201) },
      { label: "No response, accepted automatically", at: T - 155, txHash: fakeHash(3_202) },
      { label: "Pool paid the landlord", at: T - 155, txHash: fakeHash(3_202) },
    ],
  });
  tebet.claimId = defaultId;
  const tebetMissed = quotePremium(1_000n * U, 12, "B").monthlyPremium;
  s.debts.set(defaultId, {
    claimId: defaultId,
    policyId: tebet.id,
    tenant: RIZKY,
    principal: 250n * U + tebetMissed,
    repaid: 0n,
    nextInstallmentDue: T - 95,
    installments: time.debtInstallments,
    defaulted: true,
    disputeFee: 0n,
    missedPremium: tebetMissed,
    coveredByFirstLoss: 250n * U + tebetMissed,
    startedAt: T - 155,
    installmentAmount: ceilDiv(250n * U + tebetMissed, BigInt(time.debtInstallments)),
  });
  reg(RIZKY, { claimsPaid: 1, openDebts: 1, defaulted: true });
  seedLog(2.6, "claim", 250n * U, "Claim paid, Unit 6A, Jl. Tebet Raya", i++);
  seedLog(0.5, "firstLoss", 250n * U + tebetMissed, "First-loss reserve covered a default, Unit 6A, Jl. Tebet Raya", i++);

  // Other landlords' leases backing the pool's active coverage (prepaid, so they don't lapse mid-demo).
  const others: [string, bigint, RiskTier][] = [
    ["Studio 14, Tanjong Pagar", 1_800n, "A"],
    ["Unit 6C, Jl. Kebon Jeruk", 2_500n, "B"],
    ["Room 2, Bukit Timah", 1_200n, "B"],
    ["Unit 21A, Jl. Casablanca", 3_000n, "C"],
    ["Loft 5, Kampong Glam", 2_200n, "A"],
    ["Unit 8D, Jl. Panglima Polim", 1_900n, "B"],
    ["Room 11, Novena", 1_400n, "B"],
    ["Unit 3F, Jl. Senayan", 2_600n, "B"],
    ["Unit 17B, Jl. Rasuna Said", 1_400n, "C"],
  ];
  others.forEach(([ref, cov, tier], n) => {
    add({
      propertyRef: ref,
      coverage: cov * U,
      totalPeriods: 12,
      tier,
      status: "Active",
      landlord: OTHER_LANDLORDS[n % 2],
      tenant: keccak256(stringToHex(`tenant-${n}`)).slice(0, 42) as Address,
      ...active(T - 120 - n * 15, 12, 12),
    });
  });

  s.activity.sort((a, b) => b.at - a.at);
  return s;
}

/** Display names for known demo addresses. */
export const KNOWN_NAMES: Record<string, string> = {
  ...Object.fromEntries(Object.values(PERSONAS).map((p) => [key(p.address), p.name.replace(" (new renter)", "")])),
  [key(BUDI)]: "Budi Santoso",
  [key(SARI)]: "Sari Wijaya",
  [key(RIZKY)]: "Rizky Pratama",
};

export { MIN_MONTHLY };
