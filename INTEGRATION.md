# Integration guide: mock → on-chain

The frontend runs on `MockDataSource` today. Nothing in the UI imports viem or wagmi contract calls: every read and
write goes through the `DataSource` interface in [frontend/lib/data/source.ts](frontend/lib/data/source.ts). To go
live, deploy the contracts (see [DEPLOY-CHECKLIST.md](DEPLOY-CHECKLIST.md)), paste the addresses, and implement
[frontend/lib/data/onchain.ts](frontend/lib/data/onchain.ts). Each stub there already names the exact call.

## 1. Deploy (you run these; the agent never executed them)

```bash
cd contracts
# Arbitrum Sepolia (Paxos USDG is picked automatically by chain id)
forge script script/Deploy.s.sol:Deploy --rpc-url arbitrum_sepolia --account deployer --broadcast --verify
# Robinhood Chain testnet (confirm the chain id first: ROBINHOOD_CHAIN_ID=…)
forge script script/Deploy.s.sol:Deploy --rpc-url robinhood_testnet --account deployer --broadcast
```

Optional Stylus pricing engine: deploy `stylus/premium-calculator` with `cargo stylus deploy … --constructor-args 6`
and pass its address as `STYLUS_CALCULATOR`. Without it the Solidity `PremiumCalculatorSol` (identical ABI and
math) is deployed.

`Deploy.s.sol` deploys `TenantRegistry, GuaranteePool, PolicyManager, ClaimManager, MockTBillVault, TBillAdapter,
MockGdnRewardsDistributor` (+ `MockUSDG` if `USE_MOCK_USDG=true`), grants every role, seeds the pool with 1 USDG, and
funds the simulated yield reserves (automatically with MockUSDG). It logs every address and the deploy block.

### Post-deploy checklist

| Step | Done by the script? | Command if you need it again |
|---|---|---|
| `GuaranteePool.POLICY_MANAGER_ROLE` → PolicyManager | yes | `pool.grantRole(POLICY_MANAGER_ROLE, pm)` |
| `GuaranteePool.CLAIM_MANAGER_ROLE` → ClaimManager | yes | `pool.grantRole(CLAIM_MANAGER_ROLE, cm)` |
| `GuaranteePool.REWARDS_ROLE` → MockGdnRewardsDistributor | yes | `pool.grantRole(REWARDS_ROLE, gdn)` |
| `PolicyManager.CLAIM_MANAGER_ROLE` → ClaimManager | yes | `pm.grantRole(CLAIM_MANAGER_ROLE, cm)` |
| `TenantRegistry.WRITER_ROLE` → PolicyManager and ClaimManager | yes | `registry.grantRole(WRITER_ROLE, …)` |
| `ClaimManager.ARBITER_ROLE` → `ARBITER_ADDRESS` | yes | `cm.grantRole(ARBITER_ROLE, arbiter)` |
| Pool yield adapter = TBillAdapter | yes | `pool.setYieldAdapter(adapter)` |
| T-bill yield reserve | MockUSDG only | `usdg.approve(vault, x)` + `vault.fundYieldReserve(x)` |
| GDN rewards reserve | MockUSDG only | `usdg.approve(gdn, x)` + `gdn.fund(x)` |
| Seed demo data | no | `Seed.s.sol` phases 1–3 (see DEPLOY-CHECKLIST.md) |

Re-export ABIs after any contract change: `(cd contracts && forge build) && node scripts/export-abis.mjs`.

## 2. Wire the frontend

1. **Addresses.** Paste them into [frontend/config/contracts.ts](frontend/config/contracts.ts) (every field is
   marked `// TODO: set after deploy`). Set `usdgIsMock: true` if you deployed MockUSDG: that turns on the
   "Mint test USDG" button.
2. **Wallet.** `components/onchain-providers.tsx` already sets up wagmi + RainbowKit, themed to the brief. In
   `components/top-bar.tsx`, replace `OnchainWalletSlot` with `<ConnectButton.Custom>` styled as the white wallet
   button. A small bridge component calls `useSession().setOnchainAccount(useAccount().address ?? null)` and sets
   `wrongNetwork` from `useAccount().chainId`; "Switch to Arbitrum Sepolia" calls `switchChain`.
3. **Data source.** Implement every method of `OnchainDataSource` with a viem `publicClient` + `walletClient`:
   `onStage("wallet")` → `writeContract` returns a hash → `onStage("confirming", hash)` →
   `waitForTransactionReceipt` → `onStage("done", hash)`. Decode reverts with the ABI and throw
   `new ContractError(<errorName>)` from `lib/data/errors.ts` (copy for every custom error is there).
4. **Live updates.** In `subscribe`, call `publicClient.watchBlockNumber`; `DataSync` re-fetches on each block.
5. **Evidence (SPEC §8.2).** Already wired: `lib/evidence.ts` pins each photo and a manifest
   `{files:[{name,cid,keccak256}], note, createdAt}` through the server route `app/api/evidence/route.ts`
   (`PINATA_JWT` server-side; mock CIDs when it's unset). The manifest CID and `keccak256(manifest bytes)` go
   on-chain. In `getEvidence`, fetch the manifest by CID from `NEXT_PUBLIC_IPFS_GATEWAY` and map files to
   gateway URLs; `verifyBundle` re-hashes the manifest and every photo.
6. Set `NEXT_PUBLIC_DATA_SOURCE=onchain` in `frontend/.env.local`.

## 3. Method → contract table

Amounts are uint in USDG base units (6 decimals). Enums are uint8 indexes: `RiskTier` A/B/C = 0/1/2,
`ClaimType` Damage/UnpaidRent/Other = 0/1/2, statuses follow `POLICY_STATUSES` / `CLAIM_STATUSES` in
`lib/data/types.ts`. Ids are `uint256`; convert with `Number(id)`.

### Reads

| DataSource method | Contract call(s) |
|---|---|
| `getTimeConfig()` | `PolicyManager.timeConfig()`; `profile = premiumPeriod === 60 ? "demo" : "prod"` |
| `getPoolStats()` | multicall `GuaranteePool.totalAssets, grossAssets, idleAssets, firstLossBalance, pendingClaimsLiability, activeCoverage, reserveRatioBps, utilizationBps, minReserveBps, liquidityTargetBps, freeAssets, totalSupply, convertToAssets(1e12), queueLength, queuedShares, paused` + `TBillAdapter.totalValue()`; `reserveRatioBps` = null when `activeCoverage == 0`; `apy` below |
| `getPoolActivity()` | `getLogs` from `deployBlock`: `GuaranteePool.PremiumReceived, ClaimPayout, RepaymentReceived, RewardsReceived, FirstLossUsed, Rebalanced, Deposit, Withdraw, RedeemProcessed` |
| `getSharePriceHistory()` | `GuaranteePool.convertToAssets(1e12)` at past block numbers (sample at each event block) |
| `getInvestorPosition(a)` | `balanceOf(a)`, `convertToAssets(shares)`, `maxWithdraw(a)`; `limitedByReserve = maxWithdraw < assets`; `queued` from `RedeemRequested(owner=a)` → `getRedeemRequest(id)` where `shares > 0`, position counted from `queueHead` |
| `previewDeposit(x)` / `previewWithdrawShares(x)` | `GuaranteePool.previewDeposit(x)` / `previewWithdraw(x)` |
| `maxNewCoverage(landlord)` | `GuaranteePool.maxNewCoverage(landlord)` |
| `getPolicies({landlord})` | `getLogs PolicyManager.InviteCreated(landlord)` → ids → multicall `getPolicy(id)`, `claimWindowEnd(id)`, `ClaimManager.claimIdByPolicy(id)` |
| `getPolicies({tenant})` | `getLogs PolicyManager.PolicyActivated(tenant)` + `InviteCreated(tenant)` → same multicall |
| `getPolicy(id)` | `PolicyManager.getPolicy(id)`, `claimWindowEnd(id)`, `ClaimManager.claimIdByPolicy(id)`. Map `checkInHash` → `checkInEvidenceHash`, a zero `tenantCheckInHash` → `null` |
| `getPremiumHistory(id)` | `getLogs PolicyManager.PremiumPaid(policyId=id)` → `toPool, toFirstLoss, toTreasury`; block timestamp = `paidAt` |
| `quote(cov, n, tier)` | `PolicyManager.quote(cov, n, tier)` + `PolicyManager.splitPremium(monthly)`; `totalCost = monthly × n` |
| `getTenantHistory(t)` | `TenantRegistry.recordOf(t)`, `tierOf(t)`, `isBlocked(t)` |
| `getClaims(filter)` | `getLogs ClaimManager.ClaimFiled` → `getClaim(id)`; timeline from `ClaimFiled/ClaimAccepted/ClaimDisputed/ClaimResolved/ClaimPaid`; `disputeFee` from `ClaimResolved` |
| `getClaim(id)` | `ClaimManager.getClaim(id)` + its logs |
| `getDebts(t)` | `getLogs ClaimManager.DebtCreated(tenant=t)` → `getDebt(id)`, `disputeFeeOf(id)`, `debtStart(id)`, `installmentAmount(id)`; `missedPremium` from `DebtCreated`; `coveredByFirstLoss` from `DefaultCovered` |
| `getEvidence(hash)` | manifest by CID from IPFS (see step 5) |
| `getUsdgBalance(a)` / `getAllowance(o, s)` | `USDG.balanceOf(a)` / `USDG.allowance(o, contracts[s])` |
| `hasArbiterRole(a)` / `hasAdminRole(a)` | `ClaimManager.hasRole(ARBITER_ROLE, a)` / `GuaranteePool.hasRole(DEFAULT_ADMIN_ROLE, a)` |
| `getAdminParams()` | `PolicyManager.protocolFeeBps, firstLossShareBps, maxCoveragePerPolicy, treasury`; `GuaranteePool.firstLossCapBps, minReserveBps, liquidityTargetBps, maxLandlordShareBps, concentrationFloor, paused`; `ClaimManager.disputeFeeBps`; `MockGdnRewardsDistributor.gdnAprBps` |

**APY** (SPEC §5.6): `(Σ PremiumReceived.toPool + Σ RewardsReceived + T-bill accrual + Σ RepaymentReceived +
Σ FirstLossUsed.covered − Σ ClaimPayout) / time-weighted avg totalAssets × (365 days / window)`. T-bill accrual is the
change in `TBillAdapter.totalValue()` net of `Rebalanced` moves.

### Writes

`TxAction` shows the approve step whenever `allowance < amount`.

| DataSource method | Approve step | Contract call |
|---|---|---|
| `approve(spender, x)` | — | `USDG.approve(contracts[spender], x)` |
| `createInvite(input)` | — | `PolicyManager.createInvite(tenant ?? 0x0, propertyRef, monthlyRent, coverage, totalPeriods, checkIn.cid, checkIn.hash)`; `policyId` from `InviteCreated` |
| `cancelInvite(id)` | — | `PolicyManager.cancelInvite(id)` |
| `acceptInvite(id)` | `USDG.approve(policyManager, quoteFor(id, account).monthlyPremium)` | `PolicyManager.acceptInvite(id)` (reverts `TenantBlocked` for open debts / defaults) |
| `addCheckInEvidence(id, notes)` | — | `PolicyManager.addCheckInEvidence(id, notes.cid, notes.hash)` (tenant, within the check-in window) |
| `payPremium(id)` | `USDG.approve(policyManager, monthlyPremium)` | `PolicyManager.payPremium(id)` |
| `fileClaim(input)` | — | `ClaimManager.fileClaim(policyId, claimType, amount, checkOut.cid, checkOut.hash, note)`; `claimId` from `ClaimFiled` |
| `acceptClaim(id)` / `disputeClaim(id, note)` | — | `ClaimManager.acceptClaim(id)` / `disputeClaim(id, note)` |
| `resolveDispute(id, x, reason)` | — | `ClaimManager.resolveDispute(id, x, reason)` (`ARBITER_ROLE`) |
| `repay(id, x)` | `USDG.approve(claimManager, x)` | `ClaimManager.repay(id, x)` |
| `deposit(x)` | `USDG.approve(guaranteePool, x)` | `GuaranteePool.deposit(x, account)` |
| `withdraw(x)` | — | `GuaranteePool.withdraw(x, account, account)` |
| `requestRedeem(shares)` / `cancelRedeem(id)` | — | `GuaranteePool.requestRedeem(shares)` / `cancelRedeem(id)` |
| `processQueue(n)` | — | `GuaranteePool.processQueue(n)` (keeper, anyone) |
| `rebalance()` | — | `GuaranteePool.rebalance()` (keeper) |
| `distributeRewards()` | — | `MockGdnRewardsDistributor.distributeRewards()` (keeper) |
| `endLease / closeIfNoClaim / markLapsed(id)` | — | `PolicyManager.*(id)` (keeper) |
| `autoAcceptClaim / markDefault(id)` | — | `ClaimManager.*(id)` (keeper) |
| `setParam(key, x)` | — | see `PARAM_SETTERS` in `onchain.ts` (`DEFAULT_ADMIN_ROLE`; GDN rate is `onlyOwner`) |
| `setPaused(p)` | — | `pause()` / `unpause()` on both `GuaranteePool` and `PolicyManager` |
| `mintTestUsdg(x)` | — | `MockUSDG.mint(account, x)`; only when `usdgIsMock` |

## 4. Events to index

`InviteCreated, InviteCancelled, PolicyActivated, CheckInEvidenceAdded, PremiumPaid, PolicyLapsed, LeaseEnded,
PolicyClaimed, PolicyClosed` (PolicyManager) · `ClaimFiled, ClaimAccepted, ClaimDisputed, ClaimResolved, ClaimPaid,
DebtCreated, DebtRepaid, DebtDefaulted, DefaultCovered` (ClaimManager) · `CoverageChanged, PendingClaimsChanged,
PremiumReceived, RepaymentReceived, RewardsReceived, FirstLossUsed, ClaimPayout, Rebalanced, RedeemRequested,
RedeemProcessed, RedeemCancelled, ParamsUpdated, Deposit, Withdraw` (GuaranteePool) · `CleanRecorded,
ClaimPaidRecorded, DebtClosedRecorded, DefaultRecorded` (TenantRegistry).
