# SafeDeposit Zero — Prompt untuk Claude Code

## Cara pakai (baca dulu)

1. Buat folder repo `safedeposit-zero/`, lalu taruh file berikut:
   ```
   safedeposit-zero/
     CLAUDE.md
     docs/SPEC.md
     docs/UI-BRIEF.md
   ```
2. Buka Claude Code di folder itu. `CLAUDE.md` otomatis dibaca setiap sesi, isinya aturan kerja plus larangan deploy dan larangan menyentuh key.
3. Kirim **Prompt 0**, lalu Prompt 1 sampai 7 **satu per satu**. Tunggu satu tahap selesai dan hasilnya hijau sebelum lanjut.
4. Setelah tiap tahap, cek `docs/PROGRESS.md` untuk melihat apa yang sudah jadi.
5. Kalau konteks penuh atau sesi baru, mulai dengan **Prompt Lanjut** (paling bawah).
6. Deploy dan wiring on-chain kamu lakukan sendiri setelah Prompt 7, mengikuti `INTEGRATION.md`.

**Urutan waktu yang disarankan (deadline 4 Okt):**

| Tahap | Isi | Perkiraan |
|---|---|---|
| 0 | Setup + rencana | 15 menit |
| 1 | Kontrak inti | 2–3 jam |
| 2 | Test lengkap | 1,5–2 jam |
| 3 | Script, ABI, INTEGRATION.md | 45 menit |
| 4 | Frontend: fondasi, design system, data layer mock | 1,5 jam |
| 5 | Halaman tenant, landlord, invite | 2 jam |
| 6 | Halaman invest, arbiter, admin, landing | 2 jam |
| 7 | Polish, QA, README | 1 jam |

> **Kalau waktu mepet:** Tahap 1–3 dan 4–6 bisa jalan paralel di dua sesi Claude Code (satu di `contracts/`, satu di `frontend/`), karena frontend memakai data mock.

---

## Prompt 0 — Setup & rencana

```
Read CLAUDE.md, docs/SPEC.md and docs/UI-BRIEF.md fully before doing anything.

Then:
1. Create docs/PROGRESS.md with: a phase checklist (Phases 1–7 below), a "Decisions" section, and a "Left for developer" section.
2. Scaffold the repo structure from SPEC §10:
   - contracts/: Foundry project with OpenZeppelin v5 and forge-std installed locally (forge install, no network calls beyond package install). foundry.toml with optimizer on, via_ir only if needed, fuzz runs 256, invariant runs 64.
   - frontend/: Next.js App Router + TypeScript strict + Tailwind + shadcn/ui + wagmi v2 + viem + RainbowKit, pnpm.
   - .env.example files with EMPTY values only (contracts: none of the key values filled; frontend: NEXT_PUBLIC_DATA_SOURCE=mock, NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=, PINATA_JWT=).
3. Reply with a short build plan: list every contract file and every frontend route you will create, and any SPEC ambiguity you resolved (also write those into PROGRESS.md "Decisions").

Do not write contract logic yet. Do not deploy anything. Do not read or create real secrets.
```

## Prompt 1 — Kontrak inti

```
Phase 1: implement all contracts from docs/SPEC.md §7 (interfaces, PremiumCalculator, TenantRegistry, GuaranteePool, PolicyManager, ClaimManager, TBillAdapter, MockTBillVault, MockGdnRewardsDistributor, MockUSDG).

Requirements:
- Follow SPEC §4–§7 exactly: premium formula and 75/10/15 split with the first-loss cap, pending-claims accounting in totalAssets, first-loss excluded from investor assets and used only via coverDefault, reserve + concentration checks, withdrawal queue (requestRedeem / processQueue(maxCount) / cancelRedeem), liquidity target + permissionless rebalance, lapse rules (claim window after lapse + missed premium into debt), dispute fee only on full approval, repayments principal-first then fee, tier from TenantRegistry, demo fast-forward per policy gated by immutable demoMode + DEMO_ROLE.
- ERC4626 with _decimalsOffset() = 6. Read USDG decimals on-chain.
- Custom errors and events exactly as listed in SPEC §7.9–7.10. NatSpec on all external functions.
- Security per SPEC §7.11.

Write a few smoke tests so `forge build` and `forge test` pass. The full test suite comes in Phase 2.
At the end: update docs/PROGRESS.md (checklist, decisions, a storage layout summary), and paste the forge build/test summary in your reply.
Do not deploy. Do not use RPC.
```

## Prompt 2 — Test lengkap

```
Phase 2: write the full Foundry test suite per docs/SPEC.md §7.12 (target 70+ tests).

- unit/: every external function, every revert path, every role check, every bounded setter.
- flow/: all 14 flows listed in §7.12 (no-claim → tier A next time, accepted, silence auto-accept, dispute full/partial/reject, lapse → claim → debt incl. missed premium, full repayment, default → first-loss covers → tenant blocked, concentration cap, reserve cap, withdrawal queue, pending claim lowers share price & rejection restores, rebalance + adapter pull, GDN rewards, demo functions revert when demoMode=false).
- fuzz/: quote bounds, deposit/withdraw, claim ≤ coverage, repay amounts.
- invariant/: handler-based invariants from §7.12.

Fix any contract bugs you find (note them in PROGRESS.md). Run `forge test` and `forge coverage --report summary` locally and paste the summary. Target ≥ 85% line coverage on the core contracts.
Do not deploy. Do not use RPC or forks.
```

## Prompt 3 — Script, ABI, integrasi

```
Phase 3: deployment scripts (WRITE ONLY, NEVER RUN THEM AGAINST A NETWORK), ABI export, integration docs.

1. contracts/script/Deploy.s.sol per SPEC §7.13: reads env vars by name only (DEPLOYER via vm.envUint is fine in code, but you never set or read the actual values), selects the USDG address by chainid (Arbitrum Sepolia / Robinhood testnet) or deploys MockUSDG when USE_MOCK_USDG=true, deploys everything, grants roles, sets the treasury, seeds the pool, DEMO_MODE flag from env. Log all addresses with console2.
2. contracts/script/Seed.s.sol: the seed scenario from SPEC §7.13.
3. contracts/script/export-abis.sh: copy ABIs from out/ to frontend/abi/*.json (run it locally after forge build; that's allowed).
4. Make sure `forge script script/Deploy.s.sol` compiles (simulation without --broadcast and without --rpc-url is OK only if it needs no network; otherwise just `forge build`).
5. Write INTEGRATION.md: for each DataSource method → contract, function, args, whether a USDG approve is needed first, events to read for state; how to fill frontend/config/contracts.ts; the exact commands the DEVELOPER will run himself to deploy on Arbitrum Sepolia and Robinhood testnet (with placeholders like $RPC_URL, never real values); a post-deploy checklist (grant ARBITER_ROLE/DEMO_ROLE, fund mock yield reserves, run Seed).
Update PROGRESS.md.
```

## Prompt 4 — Frontend fondasi

```
Phase 4: frontend foundation.

1. Implement the design system from docs/UI-BRIEF.md exactly: color tokens, fonts (Newsreader + Hanken Grotesk, mono only for addresses), type scale, spacing, radius, buttons (all variants/sizes/states), inputs, badges, tables, top bar, toasts, dialogs, banners, the Guarantee Certificate component with the marigold seal and stamp animation, and a tx Stepper (Approve USDG → Confirm, states: waiting for wallet → confirming → done/error).
2. Data layer per SPEC §8.1: types.ts (mirror the contract structs), source.ts (the full DataSource interface incl. all writes in §8.1), mock.ts (an in-memory state machine that follows SPEC §6–§7 rules EXACTLY: splits, first-loss cap, pending claims affecting share price, reserve/concentration errors, queue, lapse, debt, default + first-loss cover, tier from history, fast-forward per policy, simulated tx delays and errors, seeded with the same scenario as Seed.s.sol), onchain.ts (stubs with TODO + exact call notes), index.ts switch.
3. config/contracts.ts and config/chains.ts with placeholders and TODOs. RainbowKit set up with NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID from env (it's OK if empty in mock mode).
4. app/api/evidence/route.ts: Pinata upload server-side; deterministic mock CID when PINATA_JWT is unset. A lib/evidence.ts helper to build the manifest, keccak256 hash it and verify.
5. App shell: top bar, role switcher (Tenant/Landlord/Investor/Arbiter/Admin "Demo wallet"), network switcher, testnet demo banner.
6. A /dev/components page showing every component and state, so I can review the design quickly.
`pnpm build` must pass. Update PROGRESS.md.
```

## Prompt 5 — Halaman tenant, landlord, invite

```
Phase 5: build /landlord, /invite/[id] and /tenant per docs/SPEC.md §8.3 and docs/UI-BRIEF.md, using only the DataSource hooks.

- Landlord: the create-invite form (live quote, photo upload → evidence manifest → CID + hash, validation and limits incl. concentration/reserve errors in plain language), units table with status badges and countdowns, unit detail with status-based actions (end lease, file claim with type/amount/evidence, close if no claim), claim timeline, renewal prefill.
- Invite: fee for the tenant's computed tier with an explanation, total cost, plain terms (still responsible for damage, silence = accepted, wear and tear not claimable), "I understand" checkbox, Approve → Accept stepper, certificate stamp on success. Blocked-tenant state.
- Tenant: certificates, payment schedule + pay fee + pay ahead, lapse warning, the move-in notes window (3-day countdown), claim banner with countdown + side-by-side evidence with hash verification + Accept/Dispute, debt panel with installment schedule + repay, rental history and tier card.
Every page needs empty, loading, error and tx states. Every countdown uses policyNow (supports fast-forward).
`pnpm build` must pass. Click through the demo script steps 2, 3 and 5–7 in mock mode and fix anything broken. Update PROGRESS.md.
```

## Prompt 6 — Halaman invest, arbiter, admin, landing

```
Phase 6: build /invest, /arbiter, /admin and the landing page / per docs/SPEC.md §8.3 and docs/UI-BRIEF.md.

- Invest: pool summary (assets, coverage, reserve meter with the min line, utilization, net APY, share price + history chart, first-loss balance, pending claims), Deposit (preview shares), Withdraw (maxWithdraw; when limited, explain why and offer "Request withdrawal" → queue), my queue requests (cancel), the APY breakdown table (premiums, USDG rewards, T-bill yield, recoveries, first-loss covers, claims), a risk explainer with the 3 scenarios from SPEC §4.4 labeled illustrative, an activity ledger.
- Arbiter: dispute queue, detail with side-by-side evidence + hash check, guidelines (wear and tear, depreciation, pre-existing damage), decision with a confirm dialog previewing the landlord payout, tenant debt and dispute fee.
- Admin: bounded parameter editor, pause/unpause, treasury, buttons for rebalance / distribute rewards / process queue, and a demo fast-forward panel (pick a policy → +3 days / +7 days / +1 month / to lease end). Hide the demo panel when demoMode=false.
- Landing: hero with the live quote widget, how it works, who gets what (tenant/landlord/investor, not icon cards), "Where the yield comes from", a pool transparency band, FAQ, footer with contract address placeholders per chain. Copy from UI-BRIEF §9.
`pnpm build` must pass. Run through the full demo script SPEC §9 in mock mode end to end and fix any issues. Update PROGRESS.md.
```

## Prompt 7 — Polish, QA, README

```
Phase 7: final polish and documentation.

1. QA every route at 375px, 768px and 1280px; fix layout issues. Check keyboard focus, contrast, disabled-with-reason states, and that no forbidden design patterns appear (UI-BRIEF self-check §10).
2. Make sure `forge test` and `pnpm build` are both green; paste the summaries.
3. README.md: problem, solution, how it works (mermaid flow), business model + premium formula, the yield model (premiums, USDG GDN rewards, T-bills, recoveries), unit economics + investor scenarios (labeled illustrative), risk controls, architecture (mermaid: contracts + frontend + IPFS), test results, how to run locally (mock mode), deploy instructions pointing to INTEGRATION.md, an address table with placeholders for Arbitrum Sepolia and Robinhood testnet, a roadmap.
4. Final PROGRESS.md: everything done, plus a clear "Left for developer" list (deploy, fill addresses, set roles, fund mock reserves, run Seed, set env values, switch NEXT_PUBLIC_DATA_SOURCE=onchain after wiring).
Do not deploy. Do not touch secrets.
```

---

## Prompt Lanjut (sesi baru / konteks penuh)

```
Read CLAUDE.md, docs/SPEC.md, docs/UI-BRIEF.md and docs/PROGRESS.md. Continue from the first unchecked item in PROGRESS.md. Follow all hard rules in CLAUDE.md (no deploy, no secrets, no RPC). Keep forge test and pnpm build green, and update PROGRESS.md when done.
```

## Prompt perbaikan cepat (kalau ada bug)

```
Bug: <jelaskan apa yang terjadi, di halaman/kontrak mana, langkah untuk mereproduksi>.
Expected per docs/SPEC.md §<nomor>: <perilaku yang benar>.
Fix it, add a test that would have caught it (forge test or a mock-data check), keep everything green, and note it in PROGRESS.md.
```
