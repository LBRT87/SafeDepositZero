# SafeDeposit Zero — Progress

Source of truth: `KONTEKS/docs/SPEC.md` (v3) and `KONTEKS/docs/UI-BRIEF.md`. Rules: `KONTEKS/CLAUDE.md`.
The first build followed the older `safedeposit-zero-build-spec.md`. This pass (3 Oct 2026) upgraded it to SPEC v3.

## Upgrade to SPEC v3

### Contracts
- [x] TenantRegistry: rental history, tier computed at accept (A/B/C), blocked tenants
- [x] Premium split 75 / 10 first-loss (until cap) / 15 treasury
- [x] First-loss reserve inside the pool, excluded from investor assets, used only by `coverDefault`
- [x] Pending claims lower `totalAssets` on filing; rejection restores it
- [x] Per-landlord concentration cap (`maxNewCoverage` view for the UI)
- [x] Withdrawal queue: `requestRedeem` / `processQueue(maxCount)` / `cancelRedeem`
- [x] MockGdnRewardsDistributor + `distributeRewards()` (REWARDS_ROLE on the pool)
- [x] Claim types, IPFS CIDs on-chain, tenant move-in notes within the check-in window
- [x] Lapse keeps coverage; landlord gets a claim window from the lapse; missed premium joins the debt
- [x] Dispute fee only on full approval
- [x] Terms limited to 6 or 12 periods; `Cancelled` status for withdrawn invites
- [x] Tests reorganised into `unit/ flow/ fuzz/ invariant/`, `forge test` green
- [x] Deploy (+ registry, GDN, roles, reserves) and 3-phase Seed scripts written, not run; ABIs exported

### Frontend
- [x] Data layer (types, mock state machine, onchain call notes) follows v3
- [x] `/admin` page: bounded params, pause, keeper actions, mock demo clock
- [x] `/api/evidence` route: Pinata server-side, deterministic mock CID when `PINATA_JWT` is unset
- [x] Invest: first-loss, pending claims, queue requests + cancel, APY breakdown incl. USDG rewards and first-loss covers, illustrative risk scenarios
- [x] Tenant: rental history and tier card, move-in notes, lapse banner, missed-fee and default details on debts
- [x] Invite: fee for the viewing wallet's tier, tier explanation, blocked state, plain terms
- [x] Landlord: no tier picker, claim type, capacity/concentration in plain language, lapsed policies claimable in the window
- [x] Arbiter: guidelines (wear and tear, depreciation, pre-existing), tenant move-in notes beside the evidence, payout preview with fee only on full approval
- [x] UI polish (impeccable craft floor) + motion audit (improve-animations) applied
- [x] `npm run build` and `eslint` green; SPEC §9 demo script passes against the mock data source

### Docs
- [x] INTEGRATION.md and DEPLOY-CHECKLIST.md (Indonesian, Arbitrum Sepolia + Robinhood testnet)
- [x] README rewritten for v3; old `docs/architecture.md` and `docs/flows.md` marked superseded

## Results

```
forge test: Ran 10 test suites: 181 tests passed, 0 failed, 0 skipped
coverage (src): lines 99.1% · statements 97.4% · branches 85.1% · functions 97.8%
npm run build: compiled, 11 routes (/, /tenant, /invite/[id], /landlord, /landlord/[id], /invest, /arbiter, /admin, /api/evidence)
demo script (mock): 14/14 checks pass
```

## Decisions
- **Time model:** keep the deploy-time `TIME_PROFILE` (`demo`: 1 minute = 1 month, `prod`: real durations) instead of SPEC's per-policy fast-forward. Chosen with the developer on 3 Oct. The admin page has a demo clock in mock mode only.
- **Stylus:** the Rust `PremiumCalculator` in `stylus/` stays as an optional pricing engine behind `IPremiumCalculator`; the Solidity calculator is the default (same math, same ABI).
- **Repay by claim id:** `repay(claimId, amount)` and `markDefault(claimId)` are keyed by claim id (one claim per policy, so it maps 1:1 to the policy).
- **Missed premium on lapse:** one monthly premium is added to the debt principal (paid to the pool) when a claim on a lapsed policy is paid.
- **Clean record:** a lease counts as clean when it closes without a paid claim and never lapsed (a fully rejected claim still counts as clean).
- **Underwater guard (found by the invariant fuzzer):** deposits revert with `PoolUnderwater` while pending claims exceed investor assets, so new deposits can't be absorbed by an existing loss.
- **First-loss vs. repayment after default:** if a defaulted tenant later repays, the money goes to the pool as a recovery; the tenant stays blocked.
- **Demo personas:** invite links open as a new renter (Dimas, tier B) so the demo shows the $15 fee; `/tenant` opens as a returning tenant (Ayu) with a lease, a debt and a blocked history.
- **Evidence hash:** on-chain hash = keccak256 of the manifest JSON bytes (`{files:[{name,cid,keccak256}], note, createdAt}`), plus the manifest CID.
- **Package manager:** npm (`package-lock.json` already exists), not pnpm.
- **Palette from the logo (3 Oct, developer's request, overrides UI-BRIEF §2.1):** graphite & emerald. Emerald `brand-*` is the one brand colour (actions, links, protected/money in); violet `accent-*` only for focus, the active tab and the seal ring; amber and red only mean pending and error; cool graphite neutrals. White header with the real logo (`public/brand/logo-mark.png`, `app/icon.png`, cropped from `Logo.jpg`); graphite hero block with an emerald arc. Old SVG icon kept in `public/brand/legacy/`. All text pairs checked for WCAG AA.
- **Transparent logo (v3, steel S-shield with circuit board and keyhole):** `Logo.jpg` has a checkerboard baked into the JPG, not real transparency. It's removed by flood-filling the neutral grey checker from the border, keeping the largest foreground shape and softening the edge by 1px. The cut-out has no light fringe, so it sits directly on light and dark surfaces (the footer's white tile is gone). Earlier marks are in `public/brand/legacy/`. Palette retuned to the v3 logo (measured from the artwork): emerald moved from hue 137 (`#23a047`) to the circuit board's hue ~160 (`brand-500 #0f9468`, `brand-700 #086a4a`, white text 6.6:1); violet moved from hue 258 (`#8b5cf6`) toward the keyhole light, hue ~271 (`accent-500 #9333ea`, 5.4:1 on white, was 4.2:1), deliberately less neon than the logo's `#9c0ae3`. Graphite, neutrals and the pending/error colours are unchanged; the logo's neon blue is not added as a third accent.
- **Landing motion (impeccable animate + improve-animations rules):** one authored moment (the hero fee counts down from the deposit while its bar shrinks; the arc draws once), then only meaningful motion: the how-it-works rule draws through the 4 steps, the yield bars grow from the baseline, the pool band counts up, the sample certificate's seal stamps when visible. Content is visible by default, everything plays once, reduced motion shows final states, and tweens have a timeout fallback for hidden tabs. New landing sections: the certificate a landlord gets, and where the yield comes from (illustrative SPEC §4.4 numbers).
- **Design references:** the links in `KONTEKS/reference.txt` are pitch-deck inspiration only; the website follows UI-BRIEF.
- **Old tests:** the first build's tests are kept in `contracts/test-v2-backup/` as `.bak` files (not compiled). Delete the folder when you no longer need it.

## Left for developer
- Deploy and verify on Arbitrum Sepolia and Robinhood testnet (confirm the Robinhood chain id), fill `frontend/config/contracts.ts` and the README address table, fund yield reserves if using real USDG, run the three Seed phases. Step by step: `DEPLOY-CHECKLIST.md`.
- **On-chain mode:** `frontend/lib/data/onchain.ts` is still call notes. Implement it (and the RainbowKit button) before switching `NEXT_PUBLIC_DATA_SOURCE=onchain`; until then, deploy the frontend in mock mode.
- Optional: set `PINATA_JWT` for real IPFS pins; Stylus deploy via Docker.
- Demo video, GitHub link in footer/README, HackQuest form.
