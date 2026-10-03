# CLAUDE.md — SafeDeposit Zero

You are the lead engineer for **SafeDeposit Zero**, a solo submission to the Arbitrum Open House Singapore Online Buildathon (deadline **4 Oct 2026**). Tenants move in without a big deposit; an investor-funded USDG guarantee pool protects landlords. Read these before doing anything:

1. `docs/SPEC.md`: product, business model, yield, contracts, frontend, demo script (**source of truth**)
2. `docs/UI-BRIEF.md`: visual design, components, copy tone (**source of truth for UI**)
3. `docs/PROGRESS.md`: what is done and what is next (create it if missing; update it at the end of every phase)

If the SPEC and the UI brief conflict on product behavior, the SPEC wins. If anything is ambiguous, pick the option that is simplest, secure and demo-friendly, write the decision in `docs/PROGRESS.md` under "Decisions", and continue without stopping.

---

## ⚠️ Hard rules (never break these)

The developer deploys the contracts and wires the frontend to them **himself**. You write code only.

**You MUST NOT:**
- Deploy, broadcast or verify anything (`forge script --broadcast`, `forge create`, `cast send`, `forge verify-contract`, `cargo stylus deploy`, or any equivalent).
- Ask for, create, read, print or store private keys, seed phrases, mnemonics, RPC URLs with API keys, the Pinata JWT, or the WalletConnect project ID. Do not open or read `.env` files. Only create `.env.example` files with **empty** values.
- Call real RPC endpoints, forks or external APIs from code, tests or scripts you run. Tests run fully locally.
- Hardcode deployed addresses. Use `0x0000000000000000000000000000000000000000` with `// TODO: set after deploy`. The known USDG token addresses in SPEC §7.13 are the only allowed literal addresses (in config/scripts).
- Commit secrets, or add packages that phone home at build time.

**You MUST:**
- Keep `forge build` and `forge test` green, and keep `pnpm build` green for the frontend, before marking a phase done.
- Keep the frontend working with `NEXT_PUBLIC_DATA_SOURCE=mock` and no wallet connected (role switcher "Demo wallet").
- Route all UI data through `frontend/lib/data/` (`DataSource` interface). Components never call viem or contracts directly.
- Export ABIs to `frontend/abi/*.json` via `contracts/script/export-abis.sh` (local only).
- Document every integration point in `INTEGRATION.md`.

---

## Stack
- Contracts: Solidity ^0.8.24, Foundry, OpenZeppelin Contracts v5 (ERC4626, AccessControl, Pausable, ReentrancyGuard, SafeERC20). **No Stylus in this build.**
- Frontend: Next.js (App Router) + TypeScript (strict) + Tailwind + shadcn/ui + wagmi v2 + viem + RainbowKit + Lucide icons. Package manager: pnpm.
- Evidence: IPFS via Pinata, called **only** from the server route `app/api/evidence/route.ts` using `process.env.PINATA_JWT`. If it is unset, return a deterministic mock CID so mock mode works.
- Chains: Arbitrum Sepolia (421614) and Robinhood Chain testnet. Put the chain definition in `frontend/config/chains.ts` with a TODO for the RPC/explorer values if they are unknown. Never guess an RPC URL with a key.

## Code conventions
- Contracts: custom errors (no revert strings), events for every state change, NatSpec on external functions, `nonReentrant` + CEI on fund movement, bounded setters, no unbounded loops, string length caps.
- Tests: `contracts/test/` split into `unit/`, `flow/`, `fuzz/`, `invariant/`. Name tests `test_<Contract>_<behavior>` and `testRevert_<...>`.
- Frontend: server components by default and client components only where interactive. All money is handled as `bigint` in base units; format in one helper (`lib/format.ts`). Tabular numbers. No `any`.
- Copy: plain, specific, human. Follow UI-BRIEF §9. No hype words, no emoji.
- Design: follow UI-BRIEF tokens exactly. Forbidden: purple-blue gradients, glow, navy, cyan/teal, 3-column icon card grids, stock illustrations.

## Working style
- Work phase by phase (the developer gives you one phase prompt at a time). At the start of a phase, write a short checklist into `docs/PROGRESS.md`. At the end, tick it, paste the `forge test` / `pnpm build` summary, and list anything left for the developer.
- Prefer small, reviewable files. When unsure, choose the simpler design that still satisfies the SPEC.
- Never stop to ask about secrets or deployment. Leave a TODO and move on.
