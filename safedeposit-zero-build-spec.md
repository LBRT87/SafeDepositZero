# SafeDeposit Zero — End-to-End Build Spec (Product, Flows, Contracts, Business Model, Yield)

You are the lead engineer building **SafeDeposit Zero** for the Arbitrum Open House Singapore Buildathon (deadline 4 Oct 2026). Build a complete, working, demo-ready dApp: smart contracts (Solidity + one Stylus module), tests, deploy scripts, and a Next.js frontend. The visual design is defined separately in `safedeposit-zero-ui-prompt.md` — follow it for all UI. This document defines **what the product does, how money moves, and every flow end to end**.

Judging criteria to optimize for: smart contract quality (security, structure, tests), product-market fit, innovation/novelty, real problem solving, use of Arbitrum technology (Stylus), USDG integration, presentation quality.

---

## ⚠️ Working rules — scope of THIS build (read first, overrides anything below)

The developer (me) will **deploy the contracts and wire the frontend to them personally**. Your job is to **write the code only**.

**You MUST:**
- Write all smart contracts, the Stylus crate, Foundry tests and deploy/seed **scripts** — but **never run them against a network**.
- Make everything compile and pass locally: `forge build`, `forge test` (local only, no fork/RPC), `cargo test` for the Stylus crate.
- Build the full frontend UI (all pages, components, states) running on **mock data** behind a clean data layer, so every screen and flow can be clicked through without a wallet or deployed contracts.
- Export contract ABIs to `frontend/abi/*.json` (from `forge build` output) so I can wire them later.
- Leave clear integration points and a short `INTEGRATION.md` explaining exactly where/how to connect real contracts.

**You MUST NOT:**
- Deploy, broadcast or verify any contract (`forge script --broadcast`, `cargo stylus deploy`, `forge verify-contract`, etc.).
- Ask for, create, read or store private keys, seed phrases, RPC API keys or `.env` secrets. Provide `.env.example` with empty placeholders only.
- Hardcode deployed addresses — use placeholders (`0x0000…0000`) with `// TODO: set after deploy` comments.
- Call real RPC endpoints from code or tests.

**Frontend data-layer contract (so I can swap mock → real easily):**
```
frontend/
  lib/data/types.ts          // Policy, Claim, Debt, PoolStats, QuoteResult... (mirror on-chain structs)
  lib/data/source.ts         // interface DataSource { getPoolStats(); getPolicies(addr); quote(...); ... }
                              //            + write actions: createInvite(), acceptInvite(), payPremium(),
                              //              fileClaim(), acceptClaim(), disputeClaim(), resolveDispute(),
                              //              repay(), deposit(), withdraw(), endLease(), closeIfNoClaim()
  lib/data/mock.ts           // MockDataSource: realistic seeded data + in-memory state machine that follows
                              // the exact rules in §5 (statuses, deadlines, 75/25 split, reserve check),
                              // simulated tx delays (wallet → confirming → done) and simulated errors
  lib/data/onchain.ts        // OnchainDataSource: stubbed methods with TODO comments + the viem/wagmi
                              // call each one should make (function name, args, approve step) — not wired
  lib/data/index.ts          // export const dataSource = process.env.NEXT_PUBLIC_DATA_SOURCE === "onchain" ? onchain : mock
  config/contracts.ts        // per-chain placeholders: USDG, GuaranteePool, PolicyManager, ClaimManager,
                              // PremiumCalculator, MockTBillVault, deployBlock — all TODO
```
UI components must only talk to `dataSource` / hooks built on it — never import viem/wagmi contract calls directly in components. Wallet connect (RainbowKit) can be present but the app must work in mock mode without a connected wallet (use a "Demo wallet" role switcher).

**Deliverables checklist for this build:** contracts + tests green locally · Stylus crate + tests green · deploy & seed scripts written (not run) · ABIs exported · frontend fully clickable on mock data covering every flow in §7 and the demo script in §8 · `INTEGRATION.md` · `.env.example` · README.

---

## 0. One-paragraph product definition

SafeDeposit Zero lets tenants **move in without a big security deposit**. A landlord/operator creates a lease invite with the deposit they would normally require. The tenant accepts and pays a **small monthly fee** instead of the deposit. An **on-chain guarantee pool** funded by investors in **USDG** guarantees the landlord up to the deposit amount. At move-out the landlord has a **7-day claim window**; the tenant accepts or disputes; an arbiter decides disputes; the pool pays approved claims instantly; the tenant **repays the pool in installments**. Investors earn yield from **tenant premiums + tokenized T-bill yield on idle capital + recoveries**, minus claims. SafeDeposit earns **25% of every premium** plus dispute fees.

---

## 1. Actors & permissions

| Actor | Wallet role | Can do |
|---|---|---|
| **Tenant** | any wallet | Accept lease invite, pay premiums, accept/dispute claims, repay debt |
| **Landlord / Operator** | any wallet (optionally registered operator with name) | Create lease invites, end lease, file claims, receive payouts |
| **Investor** | any wallet | Deposit/withdraw USDG into the pool, receive sdUSDG shares |
| **Arbiter** | `ARBITER_ROLE` | Resolve disputed claims (full / partial / reject) |
| **Admin** | `DEFAULT_ADMIN_ROLE` (multisig in prod; deployer in demo) | Set parameters within hard bounds, pause, withdraw treasury, rebalance yield adapter |
| **Keeper** (anyone) | none | Call time-based transitions (`endLease`, `closeIfNoClaim`, `autoAcceptClaim`, `markLapsed`) — permissionless |

---

## 2. Business model (exact)

### 2.1 Who pays whom
```
Tenant ──monthly premium──► PolicyManager ──75%──► GuaranteePool (investors)
                                           └─25%──► Treasury (SafeDeposit revenue)
Investor ──USDG──► GuaranteePool ──idle capital──► YieldAdapter (tokenized T-bills)
Approved claim: GuaranteePool ──USDG──► Landlord ; Tenant debt += claim
Tenant ──repayments──► GuaranteePool
Dispute fee: losing party ──fee──► Treasury (from tenant debt or deducted from landlord payout)
```

### 2.2 Revenue streams (SafeDeposit)
1. **Protocol fee: 25% of every premium** (`protocolFeeBps = 2500`). Core revenue.
2. **Dispute fee: 2% of the disputed amount, min $10** (`disputeFeeBps = 200`, `minDisputeFee = 10 USDG`), charged to the losing party: if the claim is approved, added to tenant debt; if rejected, deducted from nothing (landlord pays via `payDisputeFee` before the case is closed — demo: landlord pre-funds fee when filing a disputed claim escalation? Simpler: fee is always charged to the **party who disputes/escalates and loses**: tenant disputes → if tenant loses, fee added to tenant debt; if tenant wins, no fee). Implement the simple rule: **fee only applies when the tenant disputes and loses**.
3. **Future (pitch only, not built):** operator SaaS subscription (multi-unit dashboard, reporting, API).

### 2.3 Pricing (premium formula) — implemented in the Stylus `PremiumCalculator`
```
annualPremium = coverage × baseRateBps × termFactor × tierMultiplier / 10_000
monthlyPremium = max(annualPremium / 12, minMonthlyPremium)
```
- `baseRateBps = 900` (9% of coverage per year)
- `termFactor`: 6-month lease 1.10, 12-month 1.00, 24-month 0.95 (scaled ×100 → 110/100/95)
- `tierMultiplier` (risk tier chosen by operator from off-chain screening; demo dropdown): A = 0.80, B = 1.00, C = 1.30 (×100)
- `minMonthlyPremium = 5 USDG`
- Example: coverage $2,000, 12 months, tier B → $180/yr → **$15.00/month**. Tenant would otherwise lock $2,000.

### 2.4 Unit economics (show in pitch, label as illustrative)
Per policy, coverage $2,000, tier B, 12 months, reserve 50% ($1,000 pool capital backing it):
| Line | Amount |
|---|---|
| Premium paid by tenant | $180.00 |
| → Protocol (25%) | **$45.00** |
| → Pool (75%) | $135.00 |
| Expected net claims after recoveries (assumption: 35% of premium) | −$63.00 |
| T-bill yield on $1,000 at ~3.4% | +$34.00 |
| **Investor net on $1,000** | **$106.00 ≈ 10.6% APY** |
Scale: 10,000 active policies ≈ $450K/yr protocol revenue, ~$10M pool capital.

### 2.5 Value to each side (use in UI copy)
- Tenant: keep $2,000 of cash; pay $15/month. Still responsible for damage they cause.
- Landlord: guaranteed up to the deposit amount, paid instantly on approved claims, no deposit admin; units rent faster ("$0 deposit").
- Investor: yield backed by real rent premiums + treasuries, not token emissions; transparent on-chain risk metrics.

---

## 3. Yield model (exact)

### 3.1 Sources (in order of size)
1. **Premiums** — 75% of every premium flows into the pool (real-economy yield, uncorrelated with crypto prices).
2. **Tokenized T-bills** — idle pool USDG is deposited into a `YieldAdapter` → `MockTBillVault` (testnet). Production targets: Franklin Templeton BENJI or BlackRock BUIDL on Arbitrum (institutional access by the protocol entity). Adapter interface must make swapping trivial.
3. **Recoveries** — tenant repayments of paid claims flow back into the pool.
4. **(Pitch/future) USDG partner rewards** — Paxos Global Dollar Network revenue share for integrating platforms. Not built; mention only.
Explicitly NOT used: DeFi farming, leverage, token emissions. UI copy: "Yield comes from rent premiums and treasuries, not token emissions."

### 3.2 Pool accounting (ERC-4626)
- Asset: USDG. Share token: **sdUSDG** ("SafeDeposit Pool Share").
- `totalAssets() = idleUSDG + adapter.totalValue()` — **tenant debt is NOT counted** (conservative; recoveries increase assets only when received).
- Share price rises with premiums, T-bill accrual and recoveries; falls with claim payouts.
- **Liquidity buffer:** keep `liquidityBufferBps = 2000` (20%) of totalAssets idle for instant claim payouts; the rest may be allocated to the adapter via `rebalance()` (admin or keeper). Claims pull from idle first, then `adapter.withdraw` for the remainder.
- **MockTBillVault** accrues linearly: `value = principal + principal × aprBps × elapsed / (365 days × 10_000)`, `aprBps = 340` (3.4%). For demo visibility add `timeMultiplier` (e.g., 1 real minute = 1 simulated day) settable by admin, clearly labeled "simulated".

### 3.3 Risk controls enforced on-chain (key for "smart contract quality")
- `minReserveBps = 5000`: **totalAssets ≥ 50% × activeCoverage** must hold after: creating a policy, investor withdrawal. Otherwise revert `ReserveTooLow(current, required)`.
- `maxCoveragePerPolicy = 10_000 USDG`.
- `maxUtilizationBps = 20000` (activeCoverage ≤ 2× totalAssets) — implied by reserve ratio; expose as view.
- Investor withdrawals: allowed only if post-withdrawal reserve ratio holds; otherwise revert with reason; UI shows max withdrawable.
- Claims cannot exceed policy coverage; one open claim per policy; claim amount paid at most once.
- Pausable: pause new policies & deposits (claims, repayments and withdrawals of excess capital still work).

### 3.4 APY shown in UI (computed off-chain from events, documented)
```
netAPY = (premiumsToPool + tbillYield + recoveries − claimsPaid) / timeWeightedAvgAssets × (365 days / period)
```
Show the breakdown table + a "simulated T-bill yield on testnet" note. Also show share price history.

---

## 4. Data model (on-chain)

```solidity
enum PolicyStatus { Invited, Active, Lapsed, Ended, Claimed, Closed }
enum ClaimStatus  { None, Filed, Accepted, Disputed, Approved, PartiallyApproved, Rejected, Paid }
enum RiskTier     { A, B, C }

struct Policy {
  uint256 id;
  address landlord;
  address tenant;           // set on accept (or pre-set in invite)
  string  propertyRef;      // short label e.g. "Unit 12B, Jl. Sudirman" (keep short; or bytes32 + off-chain metadata)
  uint128 monthlyRent;      // informational
  uint128 coverage;         // = deposit amount guaranteed
  uint128 monthlyPremium;
  uint64  startTime;
  uint64  endTime;
  uint64  nextPremiumDue;
  uint32  periodsPaid;
  uint32  totalPeriods;
  RiskTier tier;
  bytes32 checkInEvidenceHash; // keccak256 of check-in photo bundle
  PolicyStatus status;
}

struct Claim {
  uint256 policyId;
  uint128 amountClaimed;
  uint128 amountApproved;
  uint64  filedAt;
  uint64  responseDeadline;   // tenant must respond by this time
  uint64  arbiterDeadline;
  bytes32 checkOutEvidenceHash;
  string  landlordNote;       // short
  string  tenantNote;         // short
  string  arbiterReason;      // short
  ClaimStatus status;
}

struct Debt {
  uint128 principal;          // approved claim + dispute fee
  uint128 repaid;
  uint64  nextInstallmentDue;
  uint32  installments;       // e.g. 6
  bool    defaulted;
}
```

### 4.1 Time parameters (production vs demo)
| Param | Production | Demo profile |
|---|---|---|
| Premium period | 30 days | **1 minute** |
| Grace period for missed premium | 7 days | 1 minute |
| Lease length | 6–24 months | **5–10 periods (minutes)** |
| Claim window after lease end | 7 days | **3 minutes** |
| Tenant response window | 3 days | 2 minutes |
| Arbiter decision window | 5 days | 5 minutes |
| Debt installment period | 30 days | 1 minute |
Implement via a `TimeConfig` struct set at deploy (`demo` vs `prod` profile). Display real durations in UI using the active profile.

---

## 5. State machines

### 5.1 Policy
```
Invited ──tenant accepts + pays 1st premium──► Active
Active ──premium unpaid past due+grace (keeper: markLapsed)──► Lapsed   (coverage released; landlord notified)
Active ──now ≥ endTime (keeper: endLease)──► Ended   (claim window opens)
Ended ──landlord files claim within window──► Claimed
Ended ──window passes, no claim (keeper: closeIfNoClaim)──► Closed   (coverage released)
Claimed ──claim reaches Paid or Rejected──► Closed
```
Rules: premiums can be paid early; final period paid → no more dues. Lapsed policies cannot be claimed after lapse time (claims only for Active→Ended). Coverage counts toward `activeCoverage` in states Active, Ended, Claimed.

### 5.2 Claim
```
Filed ──tenant accepts──► Accepted ──(auto)──► Paid
Filed ──tenant disputes──► Disputed ──arbiter──► Approved | PartiallyApproved | Rejected
Filed ──no tenant response by responseDeadline (keeper: autoAcceptClaim)──► Accepted ──► Paid
Disputed ──arbiter misses deadline──► stays Disputed; admin can reassign arbiter (emit event)
Approved/PartiallyApproved ──(auto)──► Paid
```
On Paid: pool transfers `amountApproved` to landlord; tenant `Debt` created (amountApproved + dispute fee if tenant disputed and lost); `activeCoverage -= coverage`; policy → Closed.
Silence rule must be shown clearly in tenant UI: "If you don't respond by <time>, the claim is accepted."

### 5.3 Debt
`repay(policyId, amount)` any time; installments = 6 (demo: 3). If an installment is missed by more than grace → `defaulted = true` (event `DebtDefaulted`) — recorded as on-chain rental history; no further action on-chain in MVP.

---

## 6. Smart contracts (Solidity 0.8.24+, Foundry, OpenZeppelin 5)

### 6.1 Contracts
1. **`GuaranteePool`** — ERC4626 (USDG → sdUSDG), AccessControl, Pausable, ReentrancyGuard.
   - `deposit/mint/withdraw/redeem` (standard) with reserve check on withdraw/redeem; `maxWithdraw/maxRedeem` overridden to respect reserve.
   - `activeCoverage` (only `POLICY_MANAGER_ROLE` can `increaseCoverage/decreaseCoverage`, each checking reserve on increase).
   - `receivePremium(amount)` (called by PolicyManager after transferring), `payClaim(landlord, amount)` (POLICY_MANAGER only), `receiveRepayment(amount)`.
   - `rebalance()` moves idle above buffer into adapter / pulls from adapter if idle below buffer.
   - Views: `reserveRatioBps()`, `idleAssets()`, `utilizationBps()`.
2. **`IYieldAdapter` + `TBillAdapter` + `MockTBillVault`** — `deposit(amount)`, `withdraw(amount)`, `totalValue()`; mock accrues per §3.2.
3. **`PolicyManager`** — AccessControl, Pausable, ReentrancyGuard.
   - `createInvite(tenantOrZero, propertyRef, monthlyRent, coverage, totalPeriods, tier, checkInEvidenceHash) → policyId` (landlord). Quotes premium via `IPremiumCalculator`.
   - `acceptInvite(policyId)` (tenant): pulls first premium (USDG `transferFrom`), splits 75/25, `pool.increaseCoverage(coverage)` (reverts if reserve too low), status Active.
   - `payPremium(policyId)` (tenant or anyone on tenant's behalf).
   - `markLapsed(policyId)`, `endLease(policyId)`, `closeIfNoClaim(policyId)` (permissionless, time-checked).
   - Treasury address + `withdrawTreasury` (admin) — or send protocol fee directly to a treasury wallet.
4. **`ClaimManager`** — AccessControl, ReentrancyGuard.
   - `fileClaim(policyId, amount, checkOutEvidenceHash, note)` (landlord, within window, amount ≤ coverage).
   - `acceptClaim(claimId)` / `disputeClaim(claimId, note)` (tenant, before responseDeadline).
   - `autoAcceptClaim(claimId)` (permissionless after deadline).
   - `resolveDispute(claimId, amountApproved, reason)` (ARBITER_ROLE; 0 = reject; partial allowed).
   - `_payClaim` → pool.payClaim, create Debt, coverage release, close policy.
   - `repay(claimId, amount)` → pool.receiveRepayment; `markDefault(claimId)` permissionless when overdue.
5. **`PremiumCalculator` (Arbitrum Stylus, Rust)** — `quote(uint256 coverage, uint32 totalPeriods, uint8 tier) → (uint256 monthlyPremium, uint256 annualPremium)` implementing §2.3 with integer math (no overflow, rounding up to 1e-2 USDG). Also `params()` view. Deploy on Arbitrum Sepolia. **Fallback:** `PremiumCalculatorSol` with the identical interface for chains where Stylus isn't available (e.g., if Robinhood Chain testnet doesn't support it). PolicyManager depends only on `IPremiumCalculator`.

### 6.2 Events (frontend reads everything from these)
`InviteCreated, PolicyActivated, PremiumPaid(policyId, amount, toPool, toTreasury, period), PolicyLapsed, LeaseEnded, PolicyClosed, ClaimFiled, ClaimAccepted, ClaimDisputed, ClaimResolved, ClaimPaid(claimId, landlord, amount), DebtCreated, DebtRepaid, DebtDefaulted, CoverageChanged(newActiveCoverage), Rebalanced, ParamsUpdated`.

### 6.3 Custom errors
`ReserveTooLow(uint256 current, uint256 required)`, `NotLandlord()`, `NotTenant()`, `InvalidStatus(uint8 expected, uint8 actual)`, `WindowClosed()`, `WindowNotOpen()`, `AmountExceedsCoverage()`, `PremiumNotDue()`, `CoverageTooHigh()`, `ZeroAmount()`.

### 6.4 Security requirements
- SafeERC20 everywhere; read `USDG.decimals()` (don't hardcode).
- Checks-effects-interactions + ReentrancyGuard on all fund-moving functions.
- Role separation: pool funds move only via PolicyManager/ClaimManager roles.
- Parameter setters bounded (e.g., `protocolFeeBps ≤ 4000`, `minReserveBps ≥ 3000`), emit `ParamsUpdated`.
- No unbounded loops over policies; per-user lists tracked via events/indexing, not on-chain arrays (or bounded arrays per address).
- ERC-4626 inflation attack mitigation: OZ virtual shares offset (`_decimalsOffset() = 6`) and a seed deposit at deploy.

### 6.5 Tests (Foundry) — target 60+ tests, include in README with `forge test` output and coverage
- Unit: every function, every revert path, every role check.
- Flow tests: (a) happy path no claim, (b) claim accepted, (c) dispute → full approve, (d) partial, (e) reject, (f) silence → auto-accept, (g) premium missed → lapsed, (h) repayment full & default.
- Fuzz: premium quote bounds, deposit/withdraw amounts, claim amounts ≤ coverage.
- **Invariants:** `totalAssets ≥ minReserve × activeCoverage` after any successful policy creation or withdrawal; `sum(premiums) × 75% == premiums received by pool`; share price never decreases except on `ClaimPaid`; activeCoverage equals sum of coverage of Active/Ended/Claimed policies.
- Stylus: Rust unit tests for `quote` matching the Solidity fallback on a table of cases.

### 6.6 Deployment (scripts only — I will run them myself; do NOT execute)
- Foundry scripts `Deploy.s.sol` with `demo` profile; deploy to **Arbitrum Sepolia** (Stylus PremiumCalculator via `cargo stylus deploy`) and **Robinhood Chain testnet** (Solidity fallback calculator if needed).
- USDG testnet addresses: Arbitrum Sepolia `0xFFC95faa3d63Cde504a05B567C600B78C0b41892`, Robinhood testnet `0x7E955252E15c84f5768B83c41a71F9eba181802F`. Get test USDG from the Paxos faucet. If faucet supply is insufficient for the demo, deploy `MockUSDG` (same decimals/interface, public `mint` for demo) and document it clearly.
- Verify contracts on explorers; write addresses to `frontend/config/contracts.ts` and README.
- `Seed.s.sol`: seeds pool with investor deposits, creates 3 demo invites (tiers A/B/C), one active policy, one ended policy with an open claim window, one disputed claim — so every dashboard has live data during judging.

---

## 7. Frontend flows (Next.js App Router + wagmi/viem + RainbowKit)

Data: read contract state with viem multicall + event logs (`getLogs` from deploy block); no backend required. Evidence photos: hash client-side (`keccak256` of file bytes or of a JSON bundle of photo hashes); store files on IPFS (Pinata/web3.storage) or Vercel Blob; store only the hash on-chain; show "Hash verified ✓/✗" by re-hashing the displayed file.

Every write = explicit steps shown in a stepper: **1 Approve USDG (if allowance < amount) → 2 Confirm action**. Each step: waiting for wallet → confirming (explorer link) → done. Toast uses the button verb.

### 7.1 Landing `/`
Live quote widget calls `PremiumCalculator.quote` (read) → shows "Cash you'd lock today" vs "Your monthly fee". CTAs: "Get a guarantee" (→ /tenant), "Invest in the pool" (→ /invest). Pool transparency band reads `totalAssets`, `activeCoverage`, `reserveRatioBps`, APY (from events).

### 7.2 Landlord / Operator `/landlord`
1. **Create lease invite** form: property label, tenant wallet (optional — else shareable invite link `/invite/[policyId]`), monthly rent, deposit to guarantee (coverage), lease length (periods), risk tier (A/B/C with one-line explanation), check-in photos upload (→ hash). Shows the premium the tenant will pay (live quote). Tx: `createInvite`. Success → copyable invite link + QR.
2. **Units table**: all policies where landlord = me: property, tenant, coverage, status badge, next due / lease end / claim countdown.
3. **Unit detail**: certificate (if Active+), premium history, actions by status:
   - Active & now ≥ endTime → "End lease" (`endLease`).
   - Ended & in window → "File a claim" form (amount ≤ coverage, note, check-out photos → hash) → `fileClaim`. Countdown visible.
   - Ended & window passed → "Close guarantee" (`closeIfNoClaim`).
   - Claim tracker timeline with tx links; payout amount when Paid.
4. Empty state per spec.

### 7.3 Tenant `/tenant` and `/invite/[policyId]`
1. **Invite page**: shows landlord, property, coverage ("Your landlord is protected up to $2,000"), monthly fee, term, total cost, plain-language terms: "You're still responsible for damage you cause. If a claim is approved, the pool pays your landlord and you repay the pool in installments." Checkbox "I understand". Steps: Approve USDG → "Accept and pay first fee" (`acceptInvite`). Success → certificate stamps in.
2. **My guarantees**: certificate(s), payment schedule table, "Pay this month's fee" (`payPremium`), lapse warning banner if due soon.
3. **Claims**: when a claim is filed → prominent banner with countdown: "Your landlord filed a damage claim of $300. Respond by 14:32." Evidence viewer (check-in vs check-out). Buttons: "Accept claim" / "Dispute claim" (note required). Silence rule shown.
4. **Debt**: amount owed, installment schedule, "Repay $50.00" / custom amount (`repay`), default warning.
5. Empty state: "You don't have a guarantee yet. Ask your landlord for an invite link, or try the demo invite."

### 7.4 Investor `/invest`
1. Summary panel: pool assets, active coverage, reserve ratio meter (min line), utilization, net APY, share price.
2. Deposit tab: amount (Max = wallet balance) → preview sdUSDG shares → Approve → "Deposit USDG" (`deposit`).
3. Withdraw tab: shows `maxWithdraw`; if limited by reserve: "Up to $X can be withdrawn now. The rest backs active guarantees." → "Withdraw" (`withdraw`).
4. APY breakdown table + risk note + activity ledger from events (premiums in, claims out, repayments in, yield accrued, rebalances).

### 7.5 Arbiter `/arbiter` (visible only to ARBITER_ROLE; otherwise read-only explainer)
1. Dispute queue table (claim, property, claimed, coverage, opened, deadline countdown).
2. Dispute detail: side-by-side evidence with hash verification, both notes, policy info.
3. Decision: "Approve full amount" / "Approve partial amount" (input ≤ claimed) / "Reject claim" + required reason → confirm dialog states the exact payout and resulting tenant debt (incl. dispute fee) → `resolveDispute`.

### 7.6 Global
- Role switcher in top bar (any wallet can view any role; actions gated by on-chain role/ownership with clear messages).
- Network switcher (Arbitrum Sepolia / Robinhood testnet), wrong-network banner, insufficient-USDG helper with faucet link (and `MockUSDG` mint button only in demo mode).
- "Keeper" actions surfaced contextually as buttons for anyone ("End lease", "Close guarantee", "Accept claim automatically (deadline passed)").
- Demo mode banner: "Testnet demo · 1 minute = 1 month · T-bill yield simulated".

---

## 8. End-to-end demo script (≤ 3 minutes, all on Arbitrum Sepolia)
1. **Investor** deposits 5,000 USDG → share price & reserve ratio update.
2. **Landlord** creates invite: Unit 12B, rent $2,000, coverage $2,000, 5 periods, tier B → premium quote $15 (from Stylus).
3. **Tenant** opens invite link → accepts & pays first $15 → certificate stamps in; pool shows +$11.25, treasury +$3.75; landlord's unit turns "Protected".
4. Tenant pays 2 more premiums (minutes pass); investor APY ticks up; T-bill accrual visible.
5. Lease ends → landlord files a $300 claim with check-out photos.
6. **Tenant** disputes → **Arbiter** sees side-by-side photos → approves $200 partial → pool pays landlord $200 instantly; tenant debt $210 (incl. $10 dispute fee).
7. Tenant repays $70 → pool assets increase. Show the ledger: premiums in, claim out, recovery in.
8. Close on the investor dashboard: "Yield from rent and treasuries — not token emissions."
Prepare a second pre-seeded policy for the "no claim → closed" happy path to show in parallel.

---

## 9. Repository structure
```
safedeposit-zero/
  contracts/            Foundry project (src/, test/, script/)
  stylus/premium-calculator/   Rust Stylus crate + tests
  frontend/             Next.js app (app/, components/, config/contracts.ts, lib/)
  docs/                 architecture.png, flows.md
  README.md             problem, solution, business model, yield model, architecture, addresses (both chains), how to run, test results, demo video link
```

## 10. Definition of done (for this build — code only)
- `forge build` and `forge test` (local) green, including invariants; coverage ≥ 85% on core contracts; Stylus `cargo test` green.
- Deploy + seed scripts written and documented for Arbitrum Sepolia and Robinhood Chain testnet, but **not executed**; addresses left as placeholders.
- ABIs exported to `frontend/abi/`; `INTEGRATION.md` lists, for every `DataSource` method, the contract + function + args + approve step to wire.
- Frontend runs with `NEXT_PUBLIC_DATA_SOURCE=mock` and every flow in §7 plus the demo script in §8 can be clicked through end to end (including tx states, errors, countdowns using the demo time profile).
- (After I deploy and wire it: all flows work on-chain on Arbitrum Sepolia; same contracts on Robinhood Chain testnet.)
- Every page has empty/loading/error/tx states per the UI brief; no forbidden design patterns.
- README contains business model (§2), yield model (§3), unit economics table, architecture diagram, and addresses.
