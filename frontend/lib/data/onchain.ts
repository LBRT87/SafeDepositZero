// Reads and writes the deployed contracts with viem (NEXT_PUBLIC_DATA_SOURCE=onchain).

import {
  BaseError,
  ChainMismatchError,
  ContractFunctionRevertedError,
  createPublicClient,
  http,
  keccak256,
  parseEventLogs,
  toHex,
  UserRejectedRequestError,
  type Abi,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import poolJson from "@/abi/GuaranteePool.json";
import pmJson from "@/abi/PolicyManager.json";
import cmJson from "@/abi/ClaimManager.json";
import registryJson from "@/abi/TenantRegistry.json";
import usdgJson from "@/abi/MockUSDG.json";
import adapterJson from "@/abi/TBillAdapter.json";
import vaultJson from "@/abi/MockTBillVault.json";
import gdnJson from "@/abi/MockGdnRewardsDistributor.json";
import { contractsFor, type ContractSet } from "@/config/contracts";
import { PRIMARY_CHAIN, READ_RPC_URL } from "@/config/chains";
import { IPFS_GATEWAY } from "../evidence";
import { getWalletClient } from "../wallet-bridge";
import { ContractError, isContractErrorCode } from "./errors";
import type { DataSource } from "./source";
import {
  CLAIM_STATUSES,
  CLAIM_TYPES,
  POLICY_STATUSES,
  RISK_TIERS,
  type ActivityEntry,
  type ActivityKind,
  type Address,
  type AdminParams,
  type Claim,
  type CreateInviteInput,
  type Debt,
  type DemoWallet,
  type EvidenceBundle,
  type EvidenceFile,
  type FileClaimInput,
  type Hash,
  type InvestorPosition,
  type ParamKey,
  type Policy,
  type PoolStats,
  type PremiumPayment,
  type QueueRequest,
  type QuoteResult,
  type RiskTier,
  type SharePricePoint,
  type Spender,
  type TenantHistory,
  type TimeConfig,
  type TimelineEntry,
  type TxOptions,
  type TxReceipt,
} from "./types";

const ABI = {
  pool: poolJson as Abi,
  pm: pmJson as Abi,
  cm: cmJson as Abi,
  registry: registryJson as Abi,
  usdg: usdgJson as Abi,
  adapter: adapterJson as Abi,
  vault: vaultJson as Abi,
  gdn: gdnJson as Abi,
};
type Key = keyof typeof ABI;

const ZERO_HASH: Hash = "0x0000000000000000000000000000000000000000000000000000000000000000";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ADMIN_ROLE: Hash = ZERO_HASH;
const ARBITER_ROLE = keccak256(toHex("ARBITER_ROLE"));
const SHARE_UNIT = 10n ** 12n;
const POLL_MS = 6_000;

/** Admin parameter → contract setter. */
export const PARAM_SETTERS: Record<ParamKey, [Key, string]> = {
  protocolFeeBps: ["pm", "setProtocolFeeBps"],
  firstLossShareBps: ["pm", "setFirstLossShareBps"],
  maxCoveragePerPolicy: ["pm", "setMaxCoveragePerPolicy"],
  firstLossCapBps: ["pool", "setFirstLossCapBps"],
  minReserveBps: ["pool", "setMinReserveBps"],
  liquidityTargetBps: ["pool", "setLiquidityTargetBps"],
  maxLandlordShareBps: ["pool", "setMaxLandlordShareBps"],
  concentrationFloor: ["pool", "setConcentrationFloor"],
  disputeFeeBps: ["cm", "setDisputeFeeBps"],
  gdnAprBps: ["gdn", "setAprBps"],
};

const SPENDER_KEY: Record<Spender, Key> = { policyManager: "pm", pool: "pool", claimManager: "cm" };

// Raw struct shapes

interface RawPolicy {
  id: bigint;
  landlord: Address;
  tenant: Address;
  propertyRef: string;
  monthlyRent: bigint;
  coverage: bigint;
  monthlyPremium: bigint;
  startTime: bigint;
  endTime: bigint;
  nextPremiumDue: bigint;
  lapsedAt: bigint;
  periodsPaid: number;
  totalPeriods: number;
  tier: number;
  status: number;
  checkInCid: string;
  checkInHash: Hash;
  tenantCheckInCid: string;
  tenantCheckInHash: Hash;
}

interface RawClaim {
  policyId: bigint;
  claimType: number;
  amountClaimed: bigint;
  amountApproved: bigint;
  filedAt: bigint;
  responseDeadline: bigint;
  arbiterDeadline: bigint;
  status: number;
  evidenceCid: string;
  evidenceHash: Hash;
  landlordNote: string;
  tenantNote: string;
  arbiterReason: string;
}

interface RawDebt {
  principal: bigint;
  repaid: bigint;
  nextInstallmentDue: bigint;
  installments: number;
  defaulted: boolean;
}

interface IndexedEvent {
  contract: Key;
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: bigint;
  txHash: Hash;
  logIndex: number;
}

const n = (v: bigint | number) => Number(v);
const lower = (a: string | null | undefined) => (a ?? "").toLowerCase();

// Data source

export class OnchainDataSource implements DataSource {
  readonly kind = "onchain" as const;
  private readonly c: ContractSet;
  private readonly client: PublicClient;
  private listeners = new Set<() => void>();
  private poll: ReturnType<typeof setInterval> | null = null;

  private events: IndexedEvent[] = [];
  private indexedTo = -1n;
  private indexing: Promise<void> | null = null;
  private blockTimes = new Map<bigint, number>();
  private evidence = new Map<string, EvidenceBundle>();
  private timeCache: TimeConfig | null = null;
  private policyCache: Policy[] = [];
  private claimCache: Claim[] = [];

  constructor() {
    this.c = contractsFor(PRIMARY_CHAIN.id);
    this.client = createPublicClient({ chain: PRIMARY_CHAIN, transport: http(READ_RPC_URL) }) as PublicClient;
  }

  // Environment

  now() {
    return Math.floor(Date.now() / 1000);
  }

  getDemoWallets(): DemoWallet[] {
    return [];
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    if (!this.poll && typeof window !== "undefined") this.poll = setInterval(() => this.emit(), POLL_MS);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.poll) {
        clearInterval(this.poll);
        this.poll = null;
      }
    };
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  // Low-level helpers

  private addr(key: Key): Address {
    const map: Record<Key, Address> = {
      pool: this.c.guaranteePool,
      pm: this.c.policyManager,
      cm: this.c.claimManager,
      registry: this.c.tenantRegistry,
      usdg: this.c.usdg,
      adapter: this.c.tbillAdapter,
      vault: this.c.mockTBillVault,
      gdn: this.c.gdnDistributor,
    };
    const a = map[key];
    if (!a || a === ZERO_ADDRESS)
      throw new Error(`The ${key} address isn't set for ${PRIMARY_CHAIN.name}. Fill frontend/config/contracts.ts.`);
    return a;
  }

  private read<T>(key: Key, functionName: string, args: readonly unknown[] = [], blockNumber?: bigint): Promise<T> {
    return this.client.readContract({ address: this.addr(key), abi: ABI[key], functionName, args, blockNumber }) as Promise<T>;
  }

  /** Multicall when available, else parallel reads. */
  private async many<T>(calls: { key: Key; fn: string; args?: readonly unknown[] }[]): Promise<T[]> {
    if (calls.length === 0) return [];
    if (PRIMARY_CHAIN.contracts?.multicall3) {
      const res = await this.client.multicall({
        contracts: calls.map((x) => ({ address: this.addr(x.key), abi: ABI[x.key], functionName: x.fn, args: x.args ?? [] })),
        allowFailure: false,
      });
      return res as T[];
    }
    return Promise.all(calls.map((x) => this.read<T>(x.key, x.fn, x.args ?? [])));
  }

  // Event index

  /** Fetches new events since the last call. */
  private sync(): Promise<void> {
    if (!this.indexing) this.indexing = this.doSync().finally(() => (this.indexing = null));
    return this.indexing;
  }

  private async doSync() {
    const latest = await this.client.getBlockNumber();
    const from = this.indexedTo < 0n ? this.c.deployBlock : this.indexedTo + 1n;
    if (from > latest) return;
    const keys: Key[] = ["pool", "pm", "cm", "vault"];
    const batches = await Promise.all(keys.map((k) => this.logs(k, from, latest)));
    const fresh = batches.flat().sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
    this.events.push(...fresh);
    this.indexedTo = latest;
  }

  /** getLogs, halving the range if the RPC refuses. */
  private async logs(key: Key, from: bigint, to: bigint): Promise<IndexedEvent[]> {
    try {
      const raw = await this.client.getContractEvents({ address: this.addr(key), abi: ABI[key], fromBlock: from, toBlock: to });
      return raw.map((l) => ({
        contract: key,
        eventName: (l as unknown as { eventName: string }).eventName,
        args: ((l as unknown as { args: Record<string, unknown> }).args ?? {}) as Record<string, unknown>,
        blockNumber: l.blockNumber!,
        txHash: l.transactionHash!,
        logIndex: l.logIndex!,
      }));
    } catch (e) {
      if (to - from < 2_000n) throw e;
      const mid = from + (to - from) / 2n;
      return [...(await this.logs(key, from, mid)), ...(await this.logs(key, mid + 1n, to))];
    }
  }

  private find(contract: Key, eventName: string, where?: (args: Record<string, unknown>) => boolean) {
    return this.events.filter((e) => e.contract === contract && e.eventName === eventName && (!where || where(e.args)));
  }

  private async times(blocks: bigint[]): Promise<void> {
    const missing = [...new Set(blocks)].filter((b) => !this.blockTimes.has(b));
    for (let i = 0; i < missing.length; i += 20) {
      const chunk = missing.slice(i, i + 20);
      const got = await Promise.all(chunk.map((b) => this.client.getBlock({ blockNumber: b })));
      got.forEach((b, j) => this.blockTimes.set(chunk[j], Number(b.timestamp)));
    }
  }

  private at(block: bigint): number {
    return this.blockTimes.get(block) ?? 0;
  }

  // Reads: environment and pool

  async getTimeConfig(): Promise<TimeConfig> {
    if (this.timeCache) return this.timeCache;
    const t = await this.read<{
      premiumPeriod: bigint;
      gracePeriod: bigint;
      checkInWindow: bigint;
      claimWindow: bigint;
      responseWindow: bigint;
      arbiterWindow: bigint;
      installmentPeriod: bigint;
      debtInstallments: number;
    }>("pm", "timeConfig");
    this.timeCache = {
      premiumPeriod: n(t.premiumPeriod),
      gracePeriod: n(t.gracePeriod),
      checkInWindow: n(t.checkInWindow),
      claimWindow: n(t.claimWindow),
      responseWindow: n(t.responseWindow),
      arbiterWindow: n(t.arbiterWindow),
      installmentPeriod: n(t.installmentPeriod),
      debtInstallments: n(t.debtInstallments),
      profile: n(t.premiumPeriod) === 60 ? "demo" : "prod",
    };
    return this.timeCache;
  }

  async getPoolStats(): Promise<PoolStats> {
    const names = [
      "totalAssets",
      "grossAssets",
      "idleAssets",
      "firstLossBalance",
      "pendingClaimsLiability",
      "activeCoverage",
      "reserveRatioBps",
      "utilizationBps",
      "minReserveBps",
      "liquidityTargetBps",
      "freeAssets",
      "totalSupply",
      "queueLength",
      "queuedShares",
      "paused",
    ] as const;
    const [vals, priceAssets, adapterValue, policies] = await Promise.all([
      this.many<bigint | boolean>(names.map((fn) => ({ key: "pool" as Key, fn }))),
      this.read<bigint>("pool", "convertToAssets", [SHARE_UNIT]),
      this.read<bigint>("adapter", "totalValue"),
      this.loadPolicies(),
    ]);
    const v = Object.fromEntries(names.map((k, i) => [k, vals[i]])) as Record<Exclude<(typeof names)[number], "paused">, bigint>;
    const paused = vals[names.indexOf("paused")] as boolean;
    const activeCoverage = v.activeCoverage;
    return {
      totalAssets: v.totalAssets,
      grossAssets: v.grossAssets,
      idleAssets: v.idleAssets,
      adapterValue,
      firstLossBalance: v.firstLossBalance,
      pendingClaims: v.pendingClaimsLiability,
      activeCoverage,
      reserveRatioBps: activeCoverage === 0n ? null : n(v.reserveRatioBps),
      utilizationBps: v.utilizationBps > 1_000_000n ? 1_000_000 : n(v.utilizationBps),
      minReserveBps: n(v.minReserveBps),
      liquidityTargetBps: n(v.liquidityTargetBps),
      freeAssets: v.freeAssets,
      totalShares: v.totalSupply,
      sharePrice: n(priceAssets) / 1e6,
      activeGuarantees: policies.filter((p) => ["Active", "Lapsed", "Ended", "Claimed"].includes(p.status)).length,
      queueLength: n(v.queueLength),
      queuedShares: v.queuedShares,
      paused,
      apy: await this.apy(v.totalAssets, adapterValue),
    };
  }

  /** Net APY over the last 12 periods, annualized. */
  private async apy(totalAssets: bigint, adapterValue: bigint) {
    await this.sync();
    const time = await this.getTimeConfig();
    const now = this.now();
    const window = 12 * time.premiumPeriod;
    const first = this.events[0]?.blockNumber;
    if (first !== undefined) await this.times([first]);
    const start = Math.max(now - window, first !== undefined ? this.at(first) : now);
    const recent = this.events.filter((e) => e.blockNumber >= this.c.deployBlock);
    await this.times(recent.map((e) => e.blockNumber));
    const inWindow = recent.filter((e) => this.at(e.blockNumber) >= start);
    const sum = (contract: Key, ev: string, field: string) =>
      inWindow.filter((e) => e.contract === contract && e.eventName === ev).reduce((a, e) => a + ((e.args[field] as bigint) ?? 0n), 0n);
    const premiumsToPool = sum("pool", "PremiumReceived", "toPool");
    const gdnRewards = sum("pool", "RewardsReceived", "amount");
    const recoveries = sum("pool", "RepaymentReceived", "amount");
    const firstLossCovers = sum("pool", "FirstLossUsed", "covered");
    const claimsPaid = sum("pool", "ClaimPayout", "amount");
    // T-bill yield: vault value minus net deposits.
    const adapter = lower(this.c.tbillAdapter);
    const flows = (ev: string) =>
      this.find("vault", ev, (a) => lower(a.account as string) === adapter).reduce((acc, e) => acc + ((e.args.amount as bigint) ?? 0n), 0n);
    const tb = adapterValue + flows("Withdrawn") - flows("Deposited");
    const tbillYield = tb > 0n ? tb : 0n;
    const periodMonths = Math.max(1, (now - start) / time.premiumPeriod);
    const net = premiumsToPool + gdnRewards + tbillYield + recoveries + firstLossCovers - claimsPaid;
    const netApy = totalAssets === 0n ? 0 : (Number(net) / Number(totalAssets)) * (12 / periodMonths);
    return { periodMonths, avgAssets: totalAssets, premiumsToPool, gdnRewards, tbillYield, recoveries, firstLossCovers, claimsPaid, netApy };
  }

  async getPoolActivity(): Promise<ActivityEntry[]> {
    await this.sync();
    const policies = await this.loadPolicies();
    const ref = (id: unknown) => policies.find((p) => p.id === n(id as bigint))?.propertyRef ?? `policy ${String(id)}`;
    const claimPolicy = new Map(this.find("cm", "ClaimFiled").map((e) => [String(e.args.claimId), e.args.policyId]));
    const out: (Omit<ActivityEntry, "at"> & { block: bigint })[] = [];
    const push = (e: IndexedEvent, kind: ActivityKind, amount: bigint, label: string) =>
      out.push({ id: `${e.txHash}-${e.logIndex}`, kind, amount, txHash: e.txHash, label, block: e.blockNumber });
    for (const e of this.events) {
      const a = e.args;
      if (e.contract === "pm" && e.eventName === "PremiumPaid")
        push(e, "premium", a.toPool as bigint, `Premium, ${ref(a.policyId)} (month ${String(a.periodsPaid)})`);
      else if (e.contract === "cm" && e.eventName === "ClaimPaid")
        push(e, "claim", a.amount as bigint, `Claim paid, ${ref(claimPolicy.get(String(a.claimId)))}`);
      else if (e.contract === "cm" && e.eventName === "DebtRepaid" && (a.toPool as bigint) > 0n)
        push(e, "repayment", a.toPool as bigint, `Repayment, ${ref(claimPolicy.get(String(a.claimId)))}`);
      else if (e.contract === "pool" && e.eventName === "RewardsReceived" && (a.amount as bigint) > 0n)
        push(e, "rewards", a.amount as bigint, "USDG partner rewards on idle cash (simulated)");
      else if (e.contract === "pool" && e.eventName === "FirstLossUsed" && (a.covered as bigint) > 0n)
        push(e, "firstLoss", a.covered as bigint, "First-loss reserve covered a default");
      else if (e.contract === "pool" && e.eventName === "Deposit") push(e, "deposit", a.assets as bigint, "Investor deposit");
      else if (e.contract === "pool" && e.eventName === "Withdraw") push(e, "withdraw", a.assets as bigint, "Investor withdrawal");
      else if (e.contract === "pool" && e.eventName === "RedeemProcessed") push(e, "withdraw", a.assets as bigint, "Queued withdrawal paid");
      else if (e.contract === "vault" && e.eventName === "Deposited" && lower(a.account as string) === lower(this.c.tbillAdapter))
        push(e, "rebalance", a.amount as bigint, "Idle cash moved to T-bills");
    }
    const latest = out.slice(-120).reverse();
    await this.times(latest.map((x) => x.block));
    return latest.map(({ block, ...x }) => ({ ...x, at: this.at(block) }));
  }

  async getSharePriceHistory(): Promise<SharePricePoint[]> {
    await this.sync();
    // Share price at each deposit or withdrawal.
    const points = this.events
      .filter((e) => e.contract === "pool" && ["Deposit", "Withdraw", "RedeemProcessed"].includes(e.eventName))
      .filter((e) => (e.args.shares as bigint) > 0n)
      .slice(-60);
    await this.times(points.map((e) => e.blockNumber));
    const history = points.map((e) => ({
      at: this.at(e.blockNumber),
      price: Number(((e.args.assets as bigint) * SHARE_UNIT) / (e.args.shares as bigint)) / 1e6,
    }));
    const now = n(await this.read<bigint>("pool", "convertToAssets", [SHARE_UNIT])) / 1e6;
    return [...history, { at: this.now(), price: now }];
  }

  async getInvestorPosition(account: Address): Promise<InvestorPosition> {
    const [shares, maxWithdraw, head, total] = await Promise.all([
      this.read<bigint>("pool", "balanceOf", [account]),
      this.read<bigint>("pool", "maxWithdraw", [account]),
      this.read<bigint>("pool", "queueHead"),
      this.read<bigint>("pool", "totalRequests"),
    ]);
    const assets = shares > 0n ? await this.read<bigint>("pool", "convertToAssets", [shares]) : 0n;
    const ids = Array.from({ length: Math.min(200, n(total - head)) }, (_, i) => head + BigInt(i));
    const reqs = await this.many<{ owner: Address; shares: bigint; requestedAt: bigint }>(
      ids.map((id) => ({ key: "pool" as Key, fn: "getRedeemRequest", args: [id] })),
    );
    const queued: QueueRequest[] = [];
    let position = 0;
    for (let i = 0; i < reqs.length; i++) {
      if (reqs[i].shares === 0n) continue;
      position++;
      if (lower(reqs[i].owner) !== lower(account)) continue;
      queued.push({
        id: n(ids[i]),
        owner: reqs[i].owner,
        shares: reqs[i].shares,
        assetsNow: await this.read<bigint>("pool", "convertToAssets", [reqs[i].shares]),
        requestedAt: n(reqs[i].requestedAt),
        position,
      });
    }
    return { shares, assets, maxWithdraw, limitedByReserve: maxWithdraw < assets, queued };
  }

  previewDeposit(amount: bigint) {
    return this.read<bigint>("pool", "previewDeposit", [amount]);
  }

  previewWithdrawShares(amount: bigint) {
    return this.read<bigint>("pool", "previewWithdraw", [amount]);
  }

  maxNewCoverage(landlord: Address) {
    return this.read<bigint>("pool", "maxNewCoverage", [landlord]);
  }

  // Reads: policies, claims, debts

  private async loadPolicies(): Promise<Policy[]> {
    const count = n(await this.read<bigint>("pm", "policyCount"));
    const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1));
    const [raws, windows, claimIds] = await Promise.all([
      this.many<RawPolicy>(ids.map((id) => ({ key: "pm" as Key, fn: "getPolicy", args: [id] }))),
      this.many<bigint>(ids.map((id) => ({ key: "pm" as Key, fn: "claimWindowEnd", args: [id] }))),
      this.many<bigint>(ids.map((id) => ({ key: "cm" as Key, fn: "claimIdByPolicy", args: [id] }))),
    ]);
    this.policyCache = raws.map((p, i) => toPolicy(p, windows[i], claimIds[i]));
    return this.policyCache;
  }

  async getPolicies(filter: { landlord?: Address; tenant?: Address }): Promise<Policy[]> {
    const all = await this.loadPolicies();
    return all
      .filter((p) => !filter.landlord || lower(p.landlord) === lower(filter.landlord))
      .filter((p) => !filter.tenant || lower(p.tenant) === lower(filter.tenant))
      .sort((a, b) => b.id - a.id);
  }

  async getPolicy(id: number): Promise<Policy | null> {
    if (!Number.isFinite(id) || id < 1) return null;
    const [raw, window, claimId] = await Promise.all([
      this.read<RawPolicy>("pm", "getPolicy", [BigInt(id)]),
      this.read<bigint>("pm", "claimWindowEnd", [BigInt(id)]),
      this.read<bigint>("cm", "claimIdByPolicy", [BigInt(id)]),
    ]);
    return raw.id === 0n ? null : toPolicy(raw, window, claimId);
  }

  async getPremiumHistory(policyId: number): Promise<PremiumPayment[]> {
    await this.sync();
    const evs = this.find("pm", "PremiumPaid", (a) => n(a.policyId as bigint) === policyId);
    await this.times(evs.map((e) => e.blockNumber));
    return evs.map((e) => ({
      policyId,
      period: n(e.args.periodsPaid as number),
      amount: e.args.amount as bigint,
      toPool: e.args.toPool as bigint,
      toFirstLoss: e.args.toFirstLoss as bigint,
      toTreasury: e.args.toTreasury as bigint,
      paidAt: this.at(e.blockNumber),
      txHash: e.txHash,
    }));
  }

  async quote(coverage: bigint, totalPeriods: number, tier: RiskTier): Promise<QuoteResult> {
    const [monthly, annual] = await this.read<[bigint, bigint]>("pm", "quote", [coverage, totalPeriods, RISK_TIERS.indexOf(tier)]);
    const [toPool, toFirstLoss, toTreasury] = await this.read<[bigint, bigint, bigint]>("pm", "splitPremium", [monthly]);
    return { monthlyPremium: monthly, annualPremium: annual, toPool, toFirstLoss, toTreasury, totalCost: monthly * BigInt(totalPeriods) };
  }

  async getTenantHistory(tenant: Address): Promise<TenantHistory> {
    const [rec, tier, blocked] = await Promise.all([
      this.read<{ cleanCompleted: number; claimsPaid: number; openDebts: number; defaulted: boolean }>("registry", "recordOf", [tenant]),
      this.read<number>("registry", "tierOf", [tenant]),
      this.read<boolean>("registry", "isBlocked", [tenant]),
    ]);
    return {
      cleanCompleted: n(rec.cleanCompleted),
      claimsPaid: n(rec.claimsPaid),
      openDebts: n(rec.openDebts),
      defaulted: rec.defaulted,
      tier: RISK_TIERS[n(tier)],
      blocked,
    };
  }

  private async loadClaims(): Promise<Claim[]> {
    await this.sync();
    const count = n(await this.read<bigint>("cm", "claimCount"));
    const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1));
    const raws = await this.many<RawClaim>(ids.map((id) => ({ key: "cm" as Key, fn: "getClaim", args: [id] })));
    const mine = (name: string, id: bigint) => this.find("cm", name, (a) => (a.claimId as bigint) === id);
    const related = ids.flatMap((id) =>
      ["ClaimFiled", "ClaimAccepted", "ClaimDisputed", "ClaimResolved", "ClaimPaid"].flatMap((nm) => mine(nm, id)),
    );
    await this.times(related.map((e) => e.blockNumber));
    this.claimCache = raws.map((c, i) => {
      const id = ids[i];
      const accepted = mine("ClaimAccepted", id)[0];
      const resolved = mine("ClaimResolved", id)[0];
      const paid = mine("ClaimPaid", id)[0];
      const timeline: TimelineEntry[] = [];
      const add = (label: string, e: IndexedEvent | undefined) => e && timeline.push({ label, at: this.at(e.blockNumber), txHash: e.txHash });
      add("Claim filed", mine("ClaimFiled", id)[0]);
      if (accepted) add(accepted.args.automatic ? "No response, accepted automatically" : "Tenant accepted", accepted);
      add("Tenant disputed", mine("ClaimDisputed", id)[0]);
      if (resolved) {
        const status = CLAIM_STATUSES[n(resolved.args.status as number)];
        add(status === "Rejected" ? "Arbiter rejected the claim" : status === "Approved" ? "Arbiter approved the full amount" : "Arbiter approved part of the claim", resolved);
      }
      add("Pool paid the landlord", paid);
      return {
        id: n(id),
        policyId: n(c.policyId),
        claimType: CLAIM_TYPES[n(c.claimType)],
        amountClaimed: c.amountClaimed,
        amountApproved: c.amountApproved,
        filedAt: n(c.filedAt),
        responseDeadline: n(c.responseDeadline),
        arbiterDeadline: n(c.arbiterDeadline),
        evidenceCid: c.evidenceCid,
        checkOutEvidenceHash: c.evidenceHash,
        landlordNote: c.landlordNote,
        tenantNote: c.tenantNote,
        arbiterReason: c.arbiterReason,
        status: CLAIM_STATUSES[n(c.status)],
        disputeFee: (resolved?.args.disputeFee as bigint) ?? 0n,
        resolvedAt: resolved ? this.at(resolved.blockNumber) : null,
        paidAt: paid ? this.at(paid.blockNumber) : null,
        autoAccepted: !!accepted?.args.automatic,
        timeline,
      };
    });
    return this.claimCache;
  }

  async getClaims(filter: { policyId?: number; disputedOnly?: boolean; tenant?: Address; landlord?: Address }): Promise<Claim[]> {
    const [claims, policies] = await Promise.all([this.loadClaims(), this.loadPolicies()]);
    const byId = new Map(policies.map((p) => [p.id, p]));
    return claims
      .filter((c) => filter.policyId === undefined || c.policyId === filter.policyId)
      .filter((c) => !filter.disputedOnly || c.status === "Disputed")
      .filter((c) => !filter.tenant || lower(byId.get(c.policyId)?.tenant) === lower(filter.tenant))
      .filter((c) => !filter.landlord || lower(byId.get(c.policyId)?.landlord) === lower(filter.landlord))
      .sort((a, b) => b.id - a.id);
  }

  async getClaim(id: number): Promise<Claim | null> {
    return (await this.loadClaims()).find((c) => c.id === id) ?? null;
  }

  async getDebts(tenant: Address): Promise<Debt[]> {
    await this.sync();
    const created = this.find("cm", "DebtCreated", (a) => lower(a.tenant as string) === lower(tenant));
    const out: Debt[] = [];
    for (const e of created) {
      const claimId = e.args.claimId as bigint;
      const [d, fee, start, installment, claim] = await Promise.all([
        this.read<RawDebt>("cm", "getDebt", [claimId]),
        this.read<bigint>("cm", "disputeFeeOf", [claimId]),
        this.read<bigint>("cm", "debtStart", [claimId]),
        this.read<bigint>("cm", "installmentAmount", [claimId]),
        this.read<RawClaim>("cm", "getClaim", [claimId]),
      ]);
      const covered = this.find("cm", "DefaultCovered", (a) => (a.policyId as bigint) === claim.policyId)[0];
      out.push({
        claimId: n(claimId),
        policyId: n(claim.policyId),
        tenant,
        principal: d.principal,
        repaid: d.repaid,
        nextInstallmentDue: n(d.nextInstallmentDue),
        installments: n(d.installments),
        defaulted: d.defaulted,
        disputeFee: fee,
        missedPremium: (e.args.missedPremium as bigint) ?? 0n,
        coveredByFirstLoss: (covered?.args.covered as bigint) ?? 0n,
        startedAt: n(start),
        installmentAmount: installment,
      });
    }
    return out;
  }

  /** Loads an evidence manifest from IPFS. */
  async getEvidence(hash: Hash): Promise<EvidenceBundle | null> {
    const local = this.evidence.get(lower(hash));
    if (local) return local;
    if (hash === ZERO_HASH) return null;
    const cid =
      this.policyCache.find((p) => lower(p.checkInEvidenceHash) === lower(hash))?.checkInCid ||
      this.policyCache.find((p) => lower(p.tenantCheckInHash) === lower(hash))?.tenantCheckInCid ||
      this.claimCache.find((c) => lower(c.checkOutEvidenceHash) === lower(hash))?.evidenceCid ||
      "";
    if (!cid || cid.startsWith("bafkmock")) return null;
    try {
      const res = await fetch(`${IPFS_GATEWAY}${cid}`);
      if (!res.ok) return null;
      const manifest = await res.text();
      const parsed = JSON.parse(manifest) as { files: { name: string; cid: string; keccak256: Hash }[]; note?: string };
      const files: EvidenceFile[] = parsed.files.map((f) => ({ name: f.name, cid: f.cid, hash: f.keccak256, url: `${IPFS_GATEWAY}${f.cid}` }));
      return { hash, cid, manifest, files, note: parsed.note };
    } catch {
      return null;
    }
  }

  async storeEvidence(bundle: EvidenceBundle): Promise<void> {
    // Local copy so this tab shows the photos at once.
    this.evidence.set(lower(bundle.hash), bundle);
  }

  // Reads: wallet and roles

  getUsdgBalance(account: Address) {
    return this.read<bigint>("usdg", "balanceOf", [account]);
  }

  getAllowance(owner: Address, spender: Spender) {
    return this.read<bigint>("usdg", "allowance", [owner, this.addr(SPENDER_KEY[spender])]);
  }

  hasArbiterRole(account: Address) {
    return this.read<boolean>("cm", "hasRole", [ARBITER_ROLE, account]);
  }

  hasAdminRole(account: Address) {
    return this.read<boolean>("pool", "hasRole", [ADMIN_ROLE, account]);
  }

  async getAdminParams(): Promise<AdminParams> {
    const [fee, flShare, maxCov, treasury, flCap, minRes, liq, maxShare, floor, paused, dispute, gdnApr] = await this.many<unknown>([
      { key: "pm", fn: "protocolFeeBps" },
      { key: "pm", fn: "firstLossShareBps" },
      { key: "pm", fn: "maxCoveragePerPolicy" },
      { key: "pm", fn: "treasury" },
      { key: "pool", fn: "firstLossCapBps" },
      { key: "pool", fn: "minReserveBps" },
      { key: "pool", fn: "liquidityTargetBps" },
      { key: "pool", fn: "maxLandlordShareBps" },
      { key: "pool", fn: "concentrationFloor" },
      { key: "pool", fn: "paused" },
      { key: "cm", fn: "disputeFeeBps" },
      { key: "gdn", fn: "gdnAprBps" },
    ]);
    return {
      protocolFeeBps: n(fee as bigint),
      firstLossShareBps: n(flShare as bigint),
      maxCoveragePerPolicy: maxCov as bigint,
      treasury: treasury as Address,
      firstLossCapBps: n(flCap as bigint),
      minReserveBps: n(minRes as bigint),
      liquidityTargetBps: n(liq as bigint),
      maxLandlordShareBps: n(maxShare as bigint),
      concentrationFloor: floor as bigint,
      paused: paused as boolean,
      disputeFeeBps: n(dispute as bigint),
      gdnAprBps: n(gdnApr as bigint),
    };
  }

  // Writes

  private async write(key: Key, functionName: string, args: readonly unknown[], opts: TxOptions): Promise<TxReceipt & { receipt: TransactionReceipt }> {
    const address = this.addr(key);
    try {
      // Simulate first to surface revert reasons.
      const { request } = await this.client.simulateContract({ account: opts.account, address, abi: ABI[key], functionName, args, chain: PRIMARY_CHAIN });
      opts.onStage?.("wallet");
      const wallet = getWalletClient();
      const hash = await wallet.writeContract({ ...request, account: opts.account, chain: PRIMARY_CHAIN });
      opts.onStage?.("confirming", hash);
      const receipt = await this.client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new ContractError("InvalidStatus", "The transaction reverted on-chain. Refresh and try again.");
      this.timeCache = null;
      opts.onStage?.("done", hash);
      this.emit();
      return { hash, receipt };
    } catch (e) {
      throw toContractError(e);
    }
  }

  approve(spender: Spender, amount: bigint, opts: TxOptions) {
    return this.write("usdg", "approve", [this.addr(SPENDER_KEY[spender]), amount], opts);
  }

  async createInvite(input: CreateInviteInput, opts: TxOptions): Promise<TxReceipt & { policyId: number }> {
    const r = await this.write(
      "pm",
      "createInvite",
      [
        input.tenant ?? ZERO_ADDRESS,
        input.propertyRef,
        input.monthlyRent,
        input.coverage,
        input.totalPeriods,
        input.checkIn?.cid ?? "",
        input.checkIn?.hash ?? ZERO_HASH,
      ],
      opts,
    );
    const [log] = parseEventLogs({ abi: ABI.pm, logs: r.receipt.logs, eventName: "InviteCreated" }) as unknown as { args: { policyId: bigint } }[];
    return { hash: r.hash, policyId: n(log.args.policyId) };
  }

  cancelInvite(policyId: number, opts: TxOptions) {
    return this.write("pm", "cancelInvite", [BigInt(policyId)], opts);
  }

  acceptInvite(policyId: number, opts: TxOptions) {
    return this.write("pm", "acceptInvite", [BigInt(policyId)], opts);
  }

  addCheckInEvidence(policyId: number, notes: EvidenceBundle, opts: TxOptions) {
    return this.write("pm", "addCheckInEvidence", [BigInt(policyId), notes.cid, notes.hash], opts);
  }

  payPremium(policyId: number, opts: TxOptions) {
    return this.write("pm", "payPremium", [BigInt(policyId)], opts);
  }

  async fileClaim(input: FileClaimInput, opts: TxOptions): Promise<TxReceipt & { claimId: number }> {
    const r = await this.write(
      "cm",
      "fileClaim",
      [BigInt(input.policyId), CLAIM_TYPES.indexOf(input.claimType), input.amount, input.checkOut.cid, input.checkOut.hash, input.note],
      opts,
    );
    const [log] = parseEventLogs({ abi: ABI.cm, logs: r.receipt.logs, eventName: "ClaimFiled" }) as unknown as { args: { claimId: bigint } }[];
    return { hash: r.hash, claimId: n(log.args.claimId) };
  }

  acceptClaim(claimId: number, opts: TxOptions) {
    return this.write("cm", "acceptClaim", [BigInt(claimId)], opts);
  }

  disputeClaim(claimId: number, note: string, opts: TxOptions) {
    return this.write("cm", "disputeClaim", [BigInt(claimId), note], opts);
  }

  resolveDispute(claimId: number, amountApproved: bigint, reason: string, opts: TxOptions) {
    return this.write("cm", "resolveDispute", [BigInt(claimId), amountApproved, reason], opts);
  }

  repay(claimId: number, amount: bigint, opts: TxOptions) {
    return this.write("cm", "repay", [BigInt(claimId), amount], opts);
  }

  deposit(amount: bigint, opts: TxOptions) {
    return this.write("pool", "deposit", [amount, opts.account], opts);
  }

  withdraw(amount: bigint, opts: TxOptions) {
    return this.write("pool", "withdraw", [amount, opts.account, opts.account], opts);
  }

  requestRedeem(shares: bigint, opts: TxOptions) {
    return this.write("pool", "requestRedeem", [shares], opts);
  }

  cancelRedeem(requestId: number, opts: TxOptions) {
    return this.write("pool", "cancelRedeem", [BigInt(requestId)], opts);
  }

  endLease(policyId: number, opts: TxOptions) {
    return this.write("pm", "endLease", [BigInt(policyId)], opts);
  }

  closeIfNoClaim(policyId: number, opts: TxOptions) {
    return this.write("pm", "closeIfNoClaim", [BigInt(policyId)], opts);
  }

  markLapsed(policyId: number, opts: TxOptions) {
    return this.write("pm", "markLapsed", [BigInt(policyId)], opts);
  }

  autoAcceptClaim(claimId: number, opts: TxOptions) {
    return this.write("cm", "autoAcceptClaim", [BigInt(claimId)], opts);
  }

  markDefault(claimId: number, opts: TxOptions) {
    return this.write("cm", "markDefault", [BigInt(claimId)], opts);
  }

  processQueue(maxCount: number, opts: TxOptions) {
    return this.write("pool", "processQueue", [BigInt(maxCount)], opts);
  }

  rebalance(opts: TxOptions) {
    return this.write("pool", "rebalance", [], opts);
  }

  distributeRewards(opts: TxOptions) {
    return this.write("gdn", "distributeRewards", [], opts);
  }

  setParam(key: ParamKey, value: bigint, opts: TxOptions) {
    const [contract, fn] = PARAM_SETTERS[key];
    return this.write(contract, fn, [value], opts);
  }

  /** Pauses or resumes the pool and policy manager. */
  async setPaused(paused: boolean, opts: TxOptions): Promise<TxReceipt> {
    const fn = paused ? "pause" : "unpause";
    await this.write("pool", fn, [], opts);
    return this.write("pm", fn, [], opts);
  }

  mintTestUsdg(amount: bigint, opts: TxOptions) {
    if (!this.c.usdgIsMock) return Promise.reject(new ContractError("InvalidStatus", "This deployment uses real USDG. Use the Paxos faucet."));
    return this.write("usdg", "mint", [opts.account, amount], opts);
  }
}

// Mapping

function toPolicy(p: RawPolicy, claimWindowEnd: bigint, claimId: bigint): Policy {
  return {
    id: n(p.id),
    landlord: p.landlord,
    tenant: p.tenant === ZERO_ADDRESS ? null : p.tenant,
    propertyRef: p.propertyRef,
    monthlyRent: p.monthlyRent,
    coverage: p.coverage,
    monthlyPremium: p.monthlyPremium,
    startTime: n(p.startTime),
    endTime: n(p.endTime),
    nextPremiumDue: n(p.nextPremiumDue),
    lapsedAt: n(p.lapsedAt),
    periodsPaid: n(p.periodsPaid),
    totalPeriods: n(p.totalPeriods),
    tier: RISK_TIERS[n(p.tier)],
    status: POLICY_STATUSES[n(p.status)],
    checkInCid: p.checkInCid,
    checkInEvidenceHash: p.checkInHash,
    tenantCheckInCid: p.tenantCheckInCid,
    tenantCheckInHash: p.tenantCheckInHash === ZERO_HASH ? null : p.tenantCheckInHash,
    claimWindowEnd: p.startTime === 0n ? 0 : n(claimWindowEnd),
    claimId: claimId === 0n ? null : n(claimId),
    createdAt: 0,
    activatedTx: null,
  };
}

const REVERT_ALIASES: Record<string, Parameters<typeof makeError>[0]> = {
  ERC20InsufficientBalance: "InsufficientBalance",
  ERC20InsufficientAllowance: "InsufficientAllowance",
  AccessControlUnauthorizedAccount: "NotAdmin",
  OwnableUnauthorizedAccount: "NotAdmin",
  ERC4626ExceededMaxDeposit: "EnforcedPause",
};

function makeError(code: ConstructorParameters<typeof ContractError>[0], message?: string) {
  return new ContractError(code, message);
}

/** Maps a viem error to a ContractError. */
function toContractError(e: unknown): Error {
  if (e instanceof ContractError) return e;
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return makeError("UserRejected");
    if (e.walk((x) => x instanceof ChainMismatchError))
      return makeError("InvalidStatus", `Switch your wallet to ${PRIMARY_CHAIN.name} first.`);
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = revert?.data?.errorName;
    if (name && isContractErrorCode(name)) return makeError(name);
    if (name && REVERT_ALIASES[name]) return makeError(REVERT_ALIASES[name]);
    if (/rejected|denied/i.test(e.shortMessage)) return makeError("UserRejected");
    return new Error(e.shortMessage || e.message);
  }
  if (e instanceof Error && /not connected|connector/i.test(e.message)) return new Error("Connect your wallet first.");
  return e instanceof Error ? e : new Error("Something went wrong. Nothing was sent.");
}
