# SafeDeposit Zero — Product & System Spec (v3, final for build)

> Arbitrum Open House Singapore Online Buildathon · submission deadline **4 Oct 2026**
> This is the single source of truth for **what the product does, how money moves, and how every contract and screen behaves**. Visual design lives in `docs/UI-BRIEF.md`. Working rules for the AI agent live in `CLAUDE.md` and override anything here.

---

## 0. Product in one paragraph

SafeDeposit Zero lets tenants **move in without a big security deposit**. A landlord creates a lease invite with the deposit they would normally ask for. The tenant accepts and pays a **small monthly fee** instead. An **on-chain guarantee pool** funded by investors in **USDG** (Paxos, MAS-regulated) guarantees the landlord up to that amount. At move-out the landlord has a **7-day claim window**. The tenant accepts or disputes, and an arbiter decides disputes. The pool **pays approved claims immediately** and the tenant **repays the pool in installments**. Investors earn from **tenant fees + USDG partner rewards on idle cash + tokenized T-bill yield + recoveries**, minus claims. SafeDeposit earns **25% of every fee**, and part of it is locked as a **first-loss reserve** that covers tenant defaults before investors do.

**Tagline:** *Move in without a big deposit.*
**One-liner for judges:** *Tenants keep their cash, landlords stay protected, and investors earn real-world yield from rent guarantees on Arbitrum.*

---

## 1. Decisions locked for this build

| Topic | Decision |
|---|---|
| Chains | Same code for **Arbitrum Sepolia** and **Robinhood Chain testnet** (the developer deploys both) |
| Contract language | **Solidity only** (0.8.24+, Foundry, OpenZeppelin 5). Keep the `IPremiumCalculator` interface so a Stylus version can be added later as roadmap. |
| Arbiter | Team wallet holding `ARBITER_ROLE` (roadmap: independent panel) |
| Premium payment | **Manual monthly payment** by the tenant (can pay ahead); 7-day grace → Lapsed |
| Risk tier | **Computed from on-chain rental history** (TenantRegistry), not chosen by the landlord |
| Investor protections in MVP | Pending claims reduce share price · first-loss reserve from treasury · per-landlord concentration cap · withdrawal queue |
| Yield sources | **Global Dollar Network (GDN) partner rewards** on idle USDG + **tokenized T-bills**; both are mocks on testnet behind adapters |
| Wallet | RainbowKit + wagmi + viem |
| Evidence (photos) | Uploaded to **IPFS via Pinata** through a server-side API route; the CID and a keccak256 hash are stored on-chain |
| Market and UI language | Global, with Singapore and Indonesia examples; UI in **English** |
| Time | **Real time** (production durations). Demo deployments allow an admin **per-policy fast-forward** (`DEMO_ROLE`, only if `demoMode=true` at deploy) |
| First-loss | 40% of the protocol fee (= 10% of each premium) goes to the first-loss reserve until it reaches 5% of pool assets |
| Lapse | Damage before the lapse is still covered. The landlord gets a 7-day claim window after the lapse, and the missed premium becomes tenant debt |
| Frontend pages | Landing + quote, Invite, Tenant, Landlord, Invest, Arbiter, Admin |

---

## 2. Problem

- Renters must pay **1–2 months of rent as a deposit** upfront (Singapore condos: typically 1 month per year of lease; Jakarta apartments/kos: 1–2 months).
- That cash is **locked and idle** for the whole lease. The tenant earns nothing on it and can't use it.
- At move-out, deposits are often **slow to return, deducted unilaterally, or not returned**. Neither side has a neutral record of the unit's condition.
- Landlords don't need the cash. They need **a guarantee** that damage or unpaid rent will be covered.

Example: rent $1,000/month with a 2-month deposit means **$2,000 extra on day one**, locked for 12 months.

---

## 3. Actors and permissions

| Actor | On-chain identity | Can do |
|---|---|---|
| Tenant | any wallet | Accept invite, add move-in notes, pay fees, accept/dispute claims, repay debt |
| Landlord | any wallet | Create invites, end lease, file claims, receive payouts |
| Investor | any wallet | Deposit/withdraw USDG, request queued redemption |
| Arbiter | `ARBITER_ROLE` | Resolve disputes (full / partial / reject) |
| Admin | `DEFAULT_ADMIN_ROLE` | Bounded parameter changes, pause, treasury address, roles |
| Demo operator | `DEMO_ROLE` (only works if `demoMode=true`) | Fast-forward a policy's clock, fast-forward mock yield sources |
| Keeper | anyone | Permissionless time transitions: `endLease`, `markLapsed`, `closeIfNoClaim`, `autoAcceptClaim`, `markDefault`, `rebalance`, `processQueue`, `distributeRewards` |

---

## 4. Business model

### 4.1 Money flows
```
Tenant ──monthly fee──► PolicyManager ──75%──────────────► GuaranteePool (investors)
                                      ├─10%─(until cap)───► First-loss reserve (inside pool, excluded from investor assets)
                                      └─15% (25% after cap)► Treasury wallet (SafeDeposit revenue)
Investor ──USDG──► GuaranteePool ──idle USDG earns GDN partner rewards
                                 └─allocated USDG──► TBillAdapter ──► tokenized T-bills (mock on testnet)
Approved claim: GuaranteePool ──USDG──► Landlord ; tenant Debt += claim (+ dispute fee if applicable)
Tenant ──repayments──► GuaranteePool
Tenant default: first-loss reserve covers the outstanding debt (up to its balance) → back to investor assets
Dispute fee (tenant disputes and fully loses): added to tenant debt; paid to Treasury when repaid
```

### 4.2 Revenue (SafeDeposit)
1. **Protocol fee: 25% of every premium** (`protocolFeeBps = 2500`), of which `firstLossShareBps = 4000` (40% of the fee) goes to the first-loss reserve until `firstLossBalance ≥ firstLossCapBps (500) × totalAssets`.
2. **Dispute fee: 2% of the claimed amount, min 10 USDG.** Charged only when the tenant disputes and the arbiter approves the **full** claimed amount. It is added to tenant debt, and the treasury receives it when repaid. Repayments go to the pool first and the fee last.
3. Roadmap (pitch only): operator SaaS (multi-unit dashboard, reporting, API), GDN partner revenue share.

### 4.3 Premium formula (`PremiumCalculator`, Solidity, pure integer math)
```
annualPremium  = coverage × baseRateBps × termFactor × tierMultiplier / (10_000 × 100 × 100)
monthlyPremium = max(ceilToCent(annualPremium / 12), minMonthlyPremium)
```
- `baseRateBps = 900` (9% of coverage per year)
- `termFactor`: 6 periods → 110, 12 periods → 100 (only 6 or 12 allowed in MVP; renewals = new policy)
- `tierMultiplier`: A 80 · B 100 · C 130
- `minMonthlyPremium = 5 USDG`; `ceilToCent` rounds up to 0.01 USDG using `decimals()`
- Example: coverage $2,000, 12 months, tier B → $180/yr → **$15.00/month**

### 4.4 Unit economics (illustrative — label as such everywhere)
Portfolio: 1,000 policies × $2,000 coverage, tier B, 12 months. Pool capital $1,000,000 (50% reserve of $2M coverage).

| Line | Per year |
|---|---|
| Premiums paid by tenants | $180,000 |
| → Pool (75%) | +$135,000 |
| → First-loss reserve (10%, until cap $50,000) | $18,000 |
| → Treasury (15%) | $27,000 |
| GDN rewards on idle USDG (40% × $1M × ~3.0%, assumption) | +$12,000 |
| T-bill yield (60% × $1M × ~3.4%) | +$20,400 |
| Net claims after tenant repayments (assumption: 35% of premiums) | −$63,000 |
| **Investor net** | **+$104,400 ≈ 10.4% APY** |

Scenarios for investors (same portfolio):

| | Normal | Bad year | Disaster |
|---|---|---|---|
| Net claims | −63,000 | −180,000 | −600,000 |
| Investor result | **+104,400 (+10.4%)** | **−12,600 (−1.3%)** before first-loss | **−432,600 (−43.3%)** |
| Share price | 1.000 → 1.104 | 1.000 → 0.987 (≈ breakeven after first-loss covers defaults) | 1.000 → 0.567 |

- Investors only lose once net claims exceed **~$167K/yr ≈ 93% of premiums**.
- Maximum loss is the amount deposited. Investors are never billed extra.
- Landlords are always paid, because the 50% reserve means the pool can pay even if half of all tenants claim in full at once.

### 4.5 Value to each side (UI copy source)
- **Tenant:** keep $2,000 in your pocket and pay $15/month. You are still responsible for damage you cause.
- **Landlord:** guaranteed up to the deposit amount, paid immediately on approved claims, units rent faster with "$0 deposit".
- **Investor:** yield backed by rent guarantees, USDG rewards and treasuries, not token emissions. Risk metrics are fully on-chain.

---

## 5. Yield model

### 5.1 Sources
1. **Premiums (75%)**: the main source; real-economy cash flow uncorrelated with crypto prices.
2. **GDN partner rewards on idle USDG.** Paxos shares reserve yield with Global Dollar Network partners on the USDG held on their platforms (an off-chain business agreement). The pool keeps a large idle buffer, so the idle cash earns too. **Testnet:** `MockGdnRewardsDistributor`, pre-funded by admin, pays `idle × gdnAprBps × elapsed / year` into the pool via `distributeRewards()` (permissionless). The APR is configurable and labeled "simulated".
3. **Tokenized T-bills**: capital above the liquidity target goes to `TBillAdapter` → `MockTBillVault` (linear accrual at `aprBps = 340`, paid from a pre-funded yield reserve; `totalValue` is capped by real balance). Production targets: BUIDL / BENJI on Arbitrum.
4. **Recoveries**: tenant repayments of paid claims and missed premiums.

Explicitly NOT used: DeFi farming, leverage, token emissions. USDG itself has no staking.

### 5.2 Pool accounting (ERC-4626, asset USDG, share **sdUSDG**)
```
grossAssets  = usdg.balanceOf(pool) + adapter.totalValue()
totalAssets  = grossAssets − firstLossBalance − pendingClaimsLiability   (floored at 0)
```
- **Tenant debt is not counted** until repaid (conservative).
- **Pending claims reduce the price immediately.** `pendingClaimsLiability += amountClaimed` on `fileClaim`; it is set to `amountApproved` on resolution, reduced on payment, and removed on rejection. Withdrawing during a big open claim therefore does not escape the loss.
- Liquidity target: `liquidityTargetBps = 4000` (40% of totalAssets kept idle; it earns GDN rewards and pays claims instantly). `rebalance()` is permissionless and moves the excess to the adapter or pulls it back.
- Claims pay from idle first, then `adapter.withdraw` for the rest.
- Inflation-attack mitigation: `_decimalsOffset() = 6` plus a seed deposit in the deploy script.

### 5.3 Risk controls (on-chain)
| Control | Param | Rule |
|---|---|---|
| Reserve ratio | `minReserveBps = 5000` | `totalAssets ≥ 50% × activeCoverage` must hold after new policy activation and after any withdrawal; else `ReserveTooLow` |
| Max coverage per policy | `maxCoveragePerPolicy = 10_000 USDG` | else `CoverageTooHigh` |
| Concentration | `maxLandlordShareBps = 1000`, `concentrationFloor = 20_000 USDG` | `coverageByLandlord[l] + new ≤ max(floor, 10% × capacity)` where `capacity = totalAssets × 10_000 / minReserveBps` |
| Withdrawal limits | — | `maxWithdraw` = min(user assets, idle available, amount keeping the reserve). Any excess → **withdrawal queue** |
| Pause | `PAUSER_ROLE` | Pauses new invites, activations and deposits. Claims, repayments, queue processing and withdrawals of excess capital keep working |
| Bounded params | — | e.g. `protocolFeeBps ≤ 4000`, `minReserveBps ∈ [3000, 10000]`, `firstLossCapBps ≤ 2000`; emit `ParamsUpdated` |
| Excluded | Terms text | Natural disasters, normal wear and tear and pre-existing damage are not claimable |

### 5.4 Withdrawal queue
- `requestRedeem(shares)`: shares move into pool escrow and a FIFO request `{owner, shares, requestedAt}` is created. Escrowed shares keep bearing gains and losses.
- `processQueue(maxCount)` (permissionless, bounded loop): fulfills requests in order at the **current price** while liquidity and the reserve allow, burning the escrowed shares. It stops at the first request that can't be fully filled.
- `cancelRedeem(requestId)` returns the escrowed shares.
- UI: "Up to $X can be withdrawn now. Request the rest and it will be paid as soon as liquidity frees up."

### 5.5 First-loss reserve
- Funded by 10% of each premium (40% of the protocol fee) until `firstLossBalance ≥ firstLossCapBps × totalAssets`; beyond the cap the full 25% goes to the treasury.
- Held inside the pool but **excluded from investor assets**. It **cannot be withdrawn** by admin (credibility).
- When a debt is marked **defaulted**, `pool.coverDefault(outstanding)` moves `min(outstanding, firstLossBalance)` into investor assets. Investors absorb only what remains.
- Pitch line: *"If a tenant walks away, our own reserve pays the pool before investors lose a cent."*

### 5.6 APY in UI (computed off-chain from events)
```
netAPY = (premiumsToPool + gdnRewards + tbillYield + recoveries + firstLossCovers − claimsPaid) / timeWeightedAvgAssets × (365d / period)
```
Show the breakdown table, share-price history, and a note that the testnet yield is simulated.

---

## 6. Product rules

| Rule | Detail |
|---|---|
| Move-in report | The landlord uploads check-in photos when creating the invite. The tenant has **3 days after activation** to add their own notes/photos (`addCheckInEvidence`) to flag pre-existing damage. Pre-existing damage is not claimable. |
| Wear and tear | Not claimable (arbiter guideline + UI terms). |
| Depreciation | Arbiter guideline: old items are valued at depreciated value (shown in the arbiter UI help text). |
| Claim types | `Damage`, `UnpaidRent`, `Other` (informational; same flow). Claim amount ≤ coverage; one claim per policy. |
| Claim window | **7 days** after the lease ends or lapses. |
| Tenant response | **3 days**. **Silence = accepted** (`autoAcceptClaim` is permissionless after the deadline). |
| Arbiter window | 5 days (soft: if missed, the dispute stays open and an event is emitted; admin can reassign the arbiter role). |
| Dispute fee | 2% of the claimed amount, min 10 USDG, only when the tenant disputes and the arbiter approves the full amount. |
| Debt | Approved amount + fee + missed premium. **6 monthly installments**, first due 30 days after creation, grace 7 days. Repay any time, any amount. |
| Default | An installment overdue past grace → `markDefault` (permissionless) → tenant flagged in TenantRegistry (blocked) → first-loss covers the outstanding amount. |
| Lapse | A premium unpaid past due + 7 days → `markLapsed` (permissionless). Coverage still applies to damage before the lapse, the landlord gets a 7-day claim window, and the missed premium is added to tenant debt. |
| Term | 6 or 12 months. Renewal = new invite with a fresh check-in (prefill button in UI). |
| Risk tier | Computed at `acceptInvite` from TenantRegistry (see §7.6). |

### Time parameters (production; demo uses the same values plus fast-forward)
| Param | Value |
|---|---|
| Premium period | 30 days |
| Premium grace | 7 days |
| Check-in evidence window | 3 days |
| Claim window | 7 days |
| Tenant response window | 3 days |
| Arbiter window | 5 days |
| Debt installment period / grace | 30 days / 7 days |

### Demo fast-forward
- `demoMode` is an **immutable constructor flag**. When it is false, every demo function reverts with `DemoDisabled()`.
- `PolicyManager.fastForward(policyId, seconds)` (`DEMO_ROLE`) adds to `timeShift[policyId]`. All time checks for that policy, its claim and its debt use `policyNow(id) = block.timestamp + timeShift[id]`.
- `MockTBillVault.fastForward(seconds)` and `MockGdnRewardsDistributor.fastForward(seconds)` simulate yield time.
- The admin page shows buttons: "+1 month", "+7 days", "+3 days", "To lease end".

---

## 7. Smart contracts

### 7.1 Overview
```
contracts/src/
  interfaces/ IPremiumCalculator.sol, IYieldAdapter.sol, IGuaranteePool.sol, ITenantRegistry.sol
  PremiumCalculator.sol
  TenantRegistry.sol
  GuaranteePool.sol
  PolicyManager.sol
  ClaimManager.sol
  adapters/TBillAdapter.sol
  mocks/MockUSDG.sol, MockTBillVault.sol, MockGdnRewardsDistributor.sol
  libraries/Errors.sol, Events.sol (optional)
```

### 7.2 Data model
```solidity
enum PolicyStatus { Invited, Active, Lapsed, Ended, Claimed, Closed, Cancelled }
enum ClaimStatus  { None, Filed, Accepted, Disputed, Approved, PartiallyApproved, Rejected, Paid }
enum ClaimType    { Damage, UnpaidRent, Other }
enum RiskTier     { A, B, C }

struct Policy {
  address landlord;
  address tenant;              // zero = open invite
  uint128 monthlyRent;         // informational
  uint128 coverage;
  uint128 monthlyPremium;      // set at accept (tier known then)
  uint64  startTime;
  uint64  endTime;
  uint64  paidThrough;         // coverage paid up to this time
  uint64  lapsedAt;
  uint32  totalPeriods;        // 6 or 12
  uint32  periodsPaid;
  RiskTier tier;
  PolicyStatus status;
  string  propertyRef;         // short label
  string  checkInCid;          // landlord check-in bundle (IPFS)
  bytes32 checkInHash;
  string  tenantCheckInCid;    // optional tenant notes within 3 days
  bytes32 tenantCheckInHash;
}

struct Claim {
  uint256 policyId;
  ClaimType claimType;
  uint128 amountClaimed;
  uint128 amountApproved;
  uint64  filedAt;
  uint64  responseDeadline;
  uint64  arbiterDeadline;
  ClaimStatus status;
  string  evidenceCid;   bytes32 evidenceHash;
  string  landlordNote;  string tenantNote;  string arbiterReason;
}

struct Debt {
  uint128 principal;     // to pool
  uint128 feeOwed;       // to treasury, repaid last
  uint128 repaid;
  uint64  createdAt;
  uint64  nextDue;
  uint32  installments;  // 6
  bool    defaulted;
}
```

### 7.3 `PremiumCalculator`
- `quote(uint256 coverage, uint32 totalPeriods, uint8 tier) external view returns (uint256 monthly, uint256 annual)`; `params()` view.
- Reverts `InvalidTerm()` / `InvalidTier()`. Reads the USDG decimals once in the constructor.

### 7.4 `GuaranteePool` (ERC4626, AccessControl, Pausable, ReentrancyGuard)
- Standard `deposit/mint/withdraw/redeem` with `maxWithdraw/maxRedeem` overridden (reserve + idle liquidity).
- `requestRedeem`, `cancelRedeem`, `processQueue(maxCount)`.
- `POLICY_MANAGER_ROLE`: `receivePremium(toPool, toFirstLoss)`, `increaseCoverage(landlord, amount)` (reserve + concentration checks), `decreaseCoverage(landlord, amount)`.
- `CLAIM_MANAGER_ROLE`: `addPendingClaim(amount)`, `updatePendingClaim(old, new)`, `payClaim(landlord, amount)` (pulls from the adapter if needed), `receiveRepayment(amount)`, `coverDefault(amount) returns (covered)`.
- `REWARDS_ROLE`: `receiveRewards(amount)`.
- Permissionless: `rebalance()`.
- Views: `totalAssets`, `idleAssets`, `activeCoverage`, `coverageByLandlord`, `reserveRatioBps`, `utilizationBps`, `firstLossBalance`, `pendingClaimsLiability`, `queueLength`, `queuedShares`, `maxNewCoverage(landlord)`.

### 7.5 `PolicyManager` (AccessControl, Pausable, ReentrancyGuard)
- `createInvite(tenantOrZero, propertyRef, monthlyRent, coverage, totalPeriods, checkInCid, checkInHash) → policyId` (landlord).
- `cancelInvite(policyId)` (landlord, only while Invited).
- `acceptInvite(policyId)` (tenant): registry check (blocked → `TenantBlocked`), tier → quote → pull the first premium → split → `pool.increaseCoverage` → Active.
- `addCheckInEvidence(policyId, cid, hash)` (tenant, within 3 days of start).
- `payPremium(policyId)` (anyone pays for the tenant; can pay ahead up to `totalPeriods`).
- Keeper: `markLapsed`, `endLease`, `closeIfNoClaim` (after the claim window with no claim → Closed, coverage released, registry `recordClean` if not lapsed).
- Demo: `fastForward(policyId, seconds)`; view `policyNow(policyId)`.
- Treasury address (admin-settable).

### 7.6 `TenantRegistry`
- Records per tenant: `cleanCompleted`, `claimsPaid`, `openDebts`, `defaulted`.
- Writers: PolicyManager + ClaimManager (roles).
- `tierOf(tenant)`: defaulted or openDebts > 0 → **blocked** (`isBlocked`); claimsPaid ≥ 1 → **C**; cleanCompleted ≥ 1 → **A**; else **B**.
- UI explains: "Your fee depends on your rental history on SafeDeposit: new renters pay the standard rate, clean history gets 20% off."

### 7.7 `ClaimManager` (AccessControl, ReentrancyGuard)
- `fileClaim(policyId, claimType, amount, evidenceCid, evidenceHash, note)`: landlord only, policy Ended or Lapsed, within window, amount ≤ coverage, no existing claim → Filed; `pool.addPendingClaim`.
- `acceptClaim(claimId)` / `disputeClaim(claimId, note)`: tenant, before the response deadline.
- `autoAcceptClaim(claimId)`: permissionless after the deadline.
- `resolveDispute(claimId, amountApproved, reason)`: `ARBITER_ROLE`; 0 = Rejected, < claimed = PartiallyApproved, = claimed = Approved (+ dispute fee).
- `_pay`: `pool.payClaim` → Debt created/increased (+ missed premium if lapsed) → registry update → coverage released → policy Closed.
- `repay(policyId, amount)`: principal to the pool first, then the fee to the treasury. When fully repaid, the registry's `openDebts` decreases.
- `markDefault(policyId)`: permissionless when an installment is overdue past grace → `pool.coverDefault(outstanding)` → registry blocked.

### 7.8 Adapters and mocks
- `IYieldAdapter { deposit(uint256); withdraw(uint256) returns (uint256); totalValue() view; }`
- `TBillAdapter` → `MockTBillVault` (apr 340 bps, pre-funded yield reserve, `fastForward` demo-only).
- `MockGdnRewardsDistributor` (gdnAprBps default 300, pre-funded, `distributeRewards()` permissionless, `fastForward` demo-only).
- `MockUSDG` (6 decimals, public `mint` capped per call). Used only if faucet USDG is insufficient; clearly labeled.

### 7.9 Events
`InviteCreated, InviteCancelled, PolicyActivated(policyId, tenant, tier, monthlyPremium), CheckInEvidenceAdded, PremiumPaid(policyId, amount, toPool, toFirstLoss, toTreasury, periodsPaid), PolicyLapsed, LeaseEnded, PolicyClosed, PolicyFastForwarded, ClaimFiled, ClaimAccepted, ClaimDisputed, ClaimResolved, ClaimPaid, DebtCreated, DebtRepaid, DebtDefaulted, DefaultCovered(policyId, covered, uncovered), CoverageChanged, PendingClaimsChanged, RewardsReceived, Rebalanced, RedeemRequested, RedeemProcessed, RedeemCancelled, ParamsUpdated`.

### 7.10 Custom errors
`ReserveTooLow(uint256 current, uint256 required)`, `ConcentrationTooHigh(uint256 current, uint256 limit)`, `CoverageTooHigh()`, `TenantBlocked()`, `NotLandlord()`, `NotTenant()`, `InvalidStatus(uint8 expected, uint8 actual)`, `WindowClosed()`, `WindowNotOpen()`, `AmountExceedsCoverage()`, `ClaimExists()`, `InvalidTerm()`, `InvalidTier()`, `ZeroAmount()`, `DemoDisabled()`, `InsufficientLiquidity()`, `ParamOutOfBounds()`.

### 7.11 Security
- SafeERC20 everywhere; read `decimals()` on-chain.
- Checks-effects-interactions + `nonReentrant` on every function that moves funds.
- Pool funds move only via role-gated managers; roles granted in the deploy script.
- No unbounded loops; the queue is processed with `maxCount`; per-user lists come from events.
- Strings are length-capped (propertyRef ≤ 64, notes ≤ 280, CID ≤ 100).

### 7.12 Tests (Foundry, 70+ tests)
- Unit: every function, revert path and role check.
- Flows:
  - happy path with no claim → clean record → next policy tier A
  - claim accepted
  - silence → auto-accept
  - dispute → full approve (+ fee)
  - dispute → partial
  - dispute → reject
  - lapse → claim → debt including the missed premium
  - repayment in full
  - default → first-loss covers → tenant blocked
  - concentration cap
  - reserve cap on activation and on withdraw
  - withdrawal queue: request, process, cancel, FIFO and partial-stop behavior
  - pending claim lowers the share price and rejection restores it
  - rebalance and adapter pull on a claim
  - GDN rewards raise the price
  - demo functions revert when `demoMode=false`
- Fuzz: quote bounds; deposit/withdraw; claim ≤ coverage; repay amounts.
- Invariants:
  - reserve ratio holds after any activation or withdrawal
  - the premium split sums exactly
  - `activeCoverage` = sum of coverage of Active/Lapsed/Ended/Claimed policies
  - `firstLossBalance` never decreases except via `coverDefault`
  - the share price changes downward only on claim filing/payment or a default not fully covered

### 7.13 Scripts (written, **never executed by the agent**)
- `Deploy.s.sol`: reads the USDG address per chain (Arbitrum Sepolia `0xFFC95faa3d63Cde504a05B567C600B78C0b41892`, Robinhood testnet `0x7E955252E15c84f5768B83c41a71F9eba181802F`) or deploys MockUSDG if a flag is set; deploys all contracts; grants roles; seeds the pool; `demoMode` flag from env.
- `Seed.s.sol`: investor deposits, a tenant with a clean history, an active policy, an ended policy in its claim window, a disputed claim, and a defaulted debt, so every dashboard has data.
- `export-abis.sh`: copies ABIs from `out/` to `frontend/abi/`.

---

## 8. Frontend (Next.js App Router + TypeScript + Tailwind + shadcn/ui + wagmi/viem + RainbowKit)

### 8.1 Data layer (mock-first; the developer wires on-chain himself)
```
frontend/lib/data/types.ts     mirrors on-chain structs + PoolStats, QuoteResult, LedgerEntry, QueueRequest, TenantHistory
frontend/lib/data/source.ts    interface DataSource (reads + writes listed below)
frontend/lib/data/mock.ts      MockDataSource: in-memory state machine following §6–§7 exactly, seeded data,
                               simulated tx states (wallet → confirming → done), simulated errors, fast-forward
frontend/lib/data/onchain.ts   OnchainDataSource: stubs with TODO + exact contract/function/args/approve step
frontend/lib/data/index.ts     NEXT_PUBLIC_DATA_SOURCE = mock | onchain
frontend/config/contracts.ts   per-chain placeholder addresses (TODO: set after deploy)
frontend/app/api/evidence/route.ts  server-side Pinata upload (PINATA_JWT from env; returns a mock CID if unset)
```
**Writes:**
- Tenant and landlord policy actions: `createInvite`, `cancelInvite`, `acceptInvite`, `addCheckInEvidence`, `payPremium`, `endLease`, `markLapsed`, `closeIfNoClaim`
- Claim and debt actions: `fileClaim`, `acceptClaim`, `disputeClaim`, `autoAcceptClaim`, `resolveDispute`, `repay`, `markDefault`
- Pool actions: `deposit`, `withdraw`, `requestRedeem`, `cancelRedeem`, `processQueue`, `rebalance`, `distributeRewards`
- Admin and demo: `fastForwardPolicy`, `setParam`, `pause`, `unpause`

Components talk only to `dataSource` (via hooks), never directly to viem.

### 8.2 Evidence upload
The user picks photos → each file is uploaded to `/api/evidence` → a manifest JSON `{files:[{name,cid,sha256}], note, createdAt}` is built and pinned → `hash = keccak256(manifestBytes)` → the CID and hash are passed to the contract. The viewer re-fetches and re-hashes the manifest to show "Hash verified" or "Hash mismatch".

### 8.3 Pages
| Route | Content |
|---|---|
| `/` | Hero + live quote widget ("Cash you'd lock today" vs "Your monthly fee"), how it works (3 steps, not icon cards), who it's for (tenant/landlord/investor), pool transparency band (assets, coverage, reserve, APY), FAQ |
| `/invite/[id]` | Landlord, property, coverage, the fee for *your* tier with an explanation, total cost, plain terms, "I understand" checkbox, Approve → "Accept and pay first fee", certificate stamp |
| `/tenant` | Guarantee certificate(s), payment schedule, pay fee, lapse warning, add move-in notes (3-day countdown), claim banner with countdown + evidence compare + Accept/Dispute, debt + installment schedule + repay, rental history and tier |
| `/landlord` | Create invite form (with live quote + photo upload), units table, unit detail with status-based actions (end lease, file claim, close), claim timeline, renewal prefill |
| `/invest` | Pool summary (assets, coverage, reserve meter, utilization, APY, share price, first-loss balance, pending claims), deposit, withdraw with queue, my queue requests, APY breakdown, risk explainer, activity ledger |
| `/arbiter` | Dispute queue, detail with side-by-side evidence + hash check, guidelines (wear and tear, depreciation, pre-existing), decision (full / partial / reject + reason) with a preview of payout and tenant debt |
| `/admin` | Parameters (bounded), pause, treasury, rebalance, distribute rewards, process queue, **demo fast-forward panel** (select policy → +3d/+7d/+1 month/to lease end) |

Global: role switcher (mock mode), network switcher (Arbitrum Sepolia / Robinhood testnet), wrong-network banner, USDG faucet helper, "Testnet demo · yield simulated" banner, a stepper for Approve → Confirm on every write, and empty, loading and error states everywhere.

---

## 9. Demo script (≈3 minutes)
1. **Investor** deposits 5,000 USDG → share price, reserve and first-loss shown.
2. **Landlord** creates an invite: "Unit 12B, Orchard" (or "Kos Tebet No. 7"), rent $2,000, coverage $2,000, 12 months, check-in photos pinned to IPFS.
3. **Tenant** (new wallet → tier B) opens the link → pays the first $15 → the certificate stamps in. Ledger: pool +$11.25, first-loss +$1.50, treasury +$2.25.
4. Admin fast-forwards the policy +1 month → tenant pays again → the investor APY moves; distribute GDN rewards → the price ticks up.
5. Fast-forward to lease end → **landlord** files a $300 claim with check-out photos → the investor sees "pending claims" lower the price.
6. **Tenant** disputes → **arbiter** compares photos → approves $200 partially → the pool pays the landlord instantly; tenant debt $200 in 6 installments.
7. Tenant repays $70 → pool assets rise.
8. Show the seeded defaulted debt: the first-loss reserve covered it and the tenant is blocked. Close on the investor page: *"Yield from rent guarantees, USDG rewards and treasuries, not token emissions."*

---

## 10. Repository
```
safedeposit-zero/
  CLAUDE.md
  docs/SPEC.md · docs/UI-BRIEF.md · docs/PROGRESS.md (agent keeps it updated)
  contracts/   Foundry (src, test, script), foundry.toml, remappings
  frontend/    Next.js app
  INTEGRATION.md · README.md · .env.example (contracts) · frontend/.env.example
```

## 11. Definition of done (agent scope)
- `forge build` and `forge test` green locally (no RPC/fork), invariants included, coverage ≥ 85% on core contracts.
- Deploy/seed scripts and the ABI export written; **not executed**; addresses are placeholders.
- `frontend` builds (`pnpm build`) and every flow in §8 plus the demo script in §9 can be clicked end to end with `NEXT_PUBLIC_DATA_SOURCE=mock`.
- `INTEGRATION.md`: for every DataSource method → contract, function, args, approve step, events to read.
- README: problem, solution, business model (§4), yield (§5), unit economics + scenarios, architecture diagram (mermaid), how to run, test output, address table placeholders for both chains.
- UI follows `docs/UI-BRIEF.md` with no forbidden patterns.

## 12. Roadmap (pitch only)
Stylus premium engine · independent arbiter panel · GDN partner onboarding with Paxos · real BUIDL/BENJI allocation · operator SaaS · tier C bonds · junior/senior pool tranches · credit-bureau-style rental history portable across platforms.
