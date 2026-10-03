> **Note (v3):** `docs/SPEC.md` overrides any product/business detail in this brief. This brief is the source of truth for visual design and copy tone only. The `/admin` page (see SPEC §8.3) uses the same design system as `/arbiter`.

# UI Design Brief — SafeDeposit Zero (v2)

You are the design lead and frontend engineer for **SafeDeposit Zero**. Build the web app UI described below. Follow this brief exactly — every token, size and state is specified on purpose. Where something is left open, choose what fits *renting a home and protecting money*, never a generic crypto/SaaS default.

---

## 1. What the product is

SafeDeposit Zero lets tenants **move in without a big security deposit**. Instead of locking ~1 month of rent with the landlord, the tenant pays a **small monthly fee**. An **on-chain guarantee pool** (funded by investors in USDG) protects the landlord up to the deposit amount. If there is damage, the landlord files a claim with evidence; the tenant accepts or disputes; a neutral arbiter decides; the pool pays the landlord; the tenant repays the pool in installments. Idle pool capital earns USDG partner rewards (Global Dollar Network) and tokenized US T-bill yield.

- Chains: Arbitrum Sepolia (primary) and Robinhood Chain testnet. Currency: **USDG** (Paxos).
- Fee split: 75% of each premium → pool (investors), 25% → protocol treasury.
- Claim window: 7 days after lease end. Reserve ratio enforced on-chain (new policies blocked if the pool is under-reserved).
- Hackathon demo: lease durations can be set in **minutes** so the full flow can be shown live.

**Audience:** renters in Southeast Asia (Singapore, Jakarta), co-living/apartment operators and landlords, investors looking for real-world yield. Judges will click through every role.

**Primary job of the UI:** make a financial guarantee feel *confident, plain and human*, and make every number verifiable.

---

## 2. Brand & visual direction

**Bold, confident and warm.** The brand is built on three saturated, solid colors — **royal purple, grass green and marigold** — used as flat color blocks, like a well-printed business card. Interfaces stay calm and readable; color carries meaning, not decoration.

### 2.1 Color tokens

Brand colors
| Token | Hex | Role |
|---|---|---|
| `purple-700` | `#6A1B9A` | **Brand primary.** Primary buttons, top bar, active nav, hero color block, links |
| `purple-800` | `#561580` | Primary hover |
| `purple-900` | `#420F63` | Primary pressed |
| `purple-50` | `#F4ECF9` | Selected rows, subtle purple tint backgrounds |
| `green-500` | `#21A04A` | **Brand green** for large shapes, charts, the "Protected" color block, progress fills |
| `green-700` | `#157A36` | Green text, success buttons, "Active/Protected" badges (AA on white) |
| `green-50` | `#E9F6EE` | Success backgrounds, protected-state tint |
| `marigold-400` | `#F5A623` | **Accent.** The guarantee seal, the signature arc, highlight underline. Never for text on light backgrounds |
| `marigold-600` | `#C77F05` | Marigold on light backgrounds when text/border is needed |
| `marigold-50` | `#FEF4E2` | Pending/caution tint |

Neutrals
| Token | Hex | Role |
|---|---|---|
| `paper` | `#F6F5F8` | App background (very light, faintly cool — not cream) |
| `surface` | `#FFFFFF` | Panels, inputs, tables |
| `ink` | `#1C1724` | Primary text (purple-black, not pure black) |
| `muted` | `#625A6E` | Secondary text |
| `line` | `#E2DEE8` | Borders, dividers, table rules |
| `line-strong` | `#C9C3D3` | Input borders |
| `alert` | `#C0262D` | Errors, rejected claims, under-reserved pool |
| `alert-50` | `#FCEBEC` | Error backgrounds |

Color usage rules
- Purple = **brand & action** (what you click). Green = **protected & money in** (status, positive numbers, pool health). Marigold = **the seal & one highlight per screen**.
- Contrast: white text on `purple-700` (≈ 9:1) and `green-700` (≈ 5.3:1) passes AA. **Never** white text on `green-500` or `marigold-400`; put `ink` text on marigold.
- Solid flat fills only. **No gradients of any kind** (especially purple→blue), no glow, no glassmorphism, no neon.
- Forbidden: navy/dark blue, cyan/teal, terracotta/clay orange.
- Ratio on any page: ~70% neutrals, ~20% purple, ~7% green, ~3% marigold.

### 2.2 Signature shape — the marigold arc
Inspired by a sweeping curve on a printed card: one **solid marigold arc** (a thick quarter-curve, flat color, no shadow) that sweeps from the edge of a purple color block. Use it in exactly **two** places: the landing hero and the guarantee certificate's seal. Nowhere else.

### 2.3 Typography

Fonts (via `next/font/google`)
- **Newsreader** — display & headings (serif, warm, editorial). Weights 500, 600.
- **Hanken Grotesk** — UI, body, buttons, tables, numbers. Weights 400, 500, 600, 700.
- Every amount, percentage, date and countdown: `font-variant-numeric: tabular-nums lining-nums`.
- Mono (`JetBrains Mono`, 13px) **only** for addresses and tx hashes, always truncated `0x1F4d…a92C`.

Type scale (desktop; mobile in brackets)
| Style | Font / weight | Size / line-height | Tracking | Use |
|---|---|---|---|---|
| Display | Newsreader 600 | 56 / 60 (40 / 44) | -0.02em | Landing hero headline only |
| H1 | Newsreader 600 | 40 / 46 (32 / 38) | -0.015em | Page titles |
| H2 | Newsreader 500 | 28 / 34 (24 / 30) | -0.01em | Section titles |
| H3 | Hanken 600 | 21 / 28 | -0.005em | Panel titles |
| Body L | Hanken 400 | 17 / 28 | 0 | Hero sentence, explanations |
| Body | Hanken 400 | 15 / 24 | 0 | Default text |
| Small | Hanken 500 | 13 / 18 | 0.01em | Helper text, table meta, captions |
| Amount XL | Hanken 700 | 40 / 44 | -0.02em | Key numbers (coverage, pool assets) |
| Amount L | Hanken 600 | 24 / 30 | -0.01em | Secondary numbers |
| Button | Hanken 600 | 15 / 20 (sm: 13 / 18, lg: 17 / 24) | 0.005em | All buttons |

Rules: sentence case everywhere; **no ALL-CAPS labels**; line length ≤ 72 characters; never color/italicize a single word inside a headline; max two weights visible per component.

### 2.4 Spacing, layout, radius, elevation
- Spacing scale (px): 4, 8, 12, 16, 20, 24, 32, 40, 56, 72, 96. Section gaps 72–96 on landing, 32–40 in app.
- Layout: max content width 1200px, 12-column grid, 24px gutters (16px on mobile), 40px page padding (20px mobile). Text left-aligned; only the certificate is centered.
- Radius hierarchy: badges & pills `full`, buttons & inputs `10px`, panels & tables `14px`, dialogs `16px`, **certificate `4px`** (paper-like).
- Elevation: flat by default (1px `line` borders). Only two shadows exist: the certificate `0 12px 32px -12px rgba(66,15,99,0.25)` and dialogs/popovers `0 16px 40px -16px rgba(28,23,36,0.30)`.

---

## 3. Components (exact specs)

### 3.1 Buttons
| Variant | Default | Hover | Pressed | Use |
|---|---|---|---|---|
| **Primary** | bg `purple-700`, text white | bg `purple-800` | bg `purple-900`, translateY(1px) | The one main action per view ("Get a guarantee", "Deposit USDG") |
| **Success** | bg `green-700`, text white | bg `#11652C` | bg `#0D5223` | Confirming money-positive actions ("Approve claim", "Repay") |
| **Secondary** | bg white, 1.5px border `purple-700`, text `purple-700` | bg `purple-50` | bg `#E8D9F2` | Second action ("View certificate") |
| **Ghost** | transparent, text `ink` | bg `#EFECF3` | bg `#E4E0EA` | Tertiary/table actions |
| **Destructive** | bg `alert`, text white | bg `#A21F25` | bg `#861A1F` | "Reject claim", "Cancel guarantee" |
| **Link** | text `purple-700`, underline on hover (2px, offset 3px) | — | — | Inline links, explorer links |

Sizes
| Size | Height | Padding x | Font | Icon | Gap |
|---|---|---|---|---|---|
| sm | 32px | 12px | 13px / 600 | 16px | 6px |
| md (default) | 40px | 16px | 15px / 600 | 18px | 8px |
| lg | 48px | 22px | 17px / 600 | 20px | 10px |

States
- Focus-visible: 2px ring `marigold-400` + 2px offset (white). Always visible on keyboard focus.
- Disabled: 40% opacity, `cursor: not-allowed`, and a tooltip/helper text saying **why** ("Connect your wallet first").
- Loading: keep width fixed, replace label with spinner (16px) + verb in progress ("Confirming…"); button stays disabled.
- Transition: background-color 120ms ease-out. No scale/bounce, no glow.
- Labels say exactly what happens, in sentence case, no trailing arrows: "Get a guarantee", "Approve 2,000 USDG", "File a claim", "Deposit USDG", "Withdraw", "Accept claim", "Dispute claim", "Repay 150.00 USDG".
- One primary button per view. Full-width buttons only on mobile forms.

### 3.2 Inputs
- Height 44px, padding 12px 14px, 1px `line-strong` border, radius 10px, bg white, text 15px `ink`, placeholder `muted`.
- Label above (13px / 600, `ink`), helper below (13px, `muted`), 6px spacing.
- Focus: border `purple-700` + 3px ring `rgba(106,27,154,0.15)`. Error: border `alert`, helper text in `alert` explaining the fix.
- Amount inputs: right-aligned tabular digits, suffix "USDG" in `muted`, "Max" ghost button inside.

### 3.3 Badges (status)
Pill, height 24px, padding 0 10px, 13px / 600, 6px dot before text.
- Protected / Active → bg `green-50`, text `green-700`
- Claim window open / Pending / Disputed → bg `marigold-50`, text `#8A5800`
- Rejected / Under-reserved → bg `alert-50`, text `alert`
- Closed → bg `#EFECF3`, text `muted`

### 3.4 Tables (primary data display — prefer over cards)
- Header row 13px / 600 `muted`, 44px tall, bottom border `line`. Body rows 56px, 15px text, row divider `line`, hover bg `#FAF9FC`, selected bg `purple-50`.
- Numbers right-aligned, tabular. Addresses mono truncated with copy button.
- Mobile (<640px): each row becomes a stacked block with label/value pairs.

### 3.5 The Guarantee Certificate (signature component)
A lease-style document, not a card. Max width 560px, white, radius 4px, the certificate shadow, 40px padding, 1px inner border `line` inset 8px (double-rule document feel).
- Top: "Deposit guarantee" (Newsreader 600, 28px) + policy ID (mono 13px).
- Body grid: Tenant, Property, Landlord, Coverage (Amount XL, `green-700`), Term, Monthly fee, Start/End dates.
- Bottom-right: **the seal** — 88px circle, flat `marigold-400`, with the marigold arc cutting through it, text "Backed by SafeDeposit pool" in `ink` 11px around/inside.
- Footer: chain name + contract link + "Verify on explorer".
- Motion: when a policy is created, the seal stamps in (scale 1.15 → 1, opacity 0 → 1, 380ms, ease-out). This is the **only** decorative animation in the product. Respect `prefers-reduced-motion` (show instantly).

### 3.6 Top bar & navigation
- Height 64px, bg `purple-700`, text white. Left: wordmark "SafeDeposit" (Newsreader 600, 22px, white) with a small marigold arc mark. Center: role tabs (Tenant / Landlord / Investor / Arbiter) — 15px / 600, inactive white 75% opacity, active white with 3px marigold underline. Right: network pill (white 15% bg, "Arbitrum Sepolia") + wallet button (white bg, purple text, truncated address + USDG balance).
- Mobile: role tabs move to a bottom segmented control.

### 3.7 Toasts, dialogs, banners
- Toast: bottom-right, white, 14px radius, 4px left bar (green success / alert error / marigold pending), title 15/600 + one line 13px + explorer link. Auto-dismiss 6s; errors persist until closed.
- Dialog: max 480px, 16px radius, title Newsreader 24px, body 15px, actions right-aligned (secondary left of primary). Confirmation dialogs state exactly who pays whom and how much.
- Banners (wrong network, paused pool): full-width inside content, 14px radius, tinted bg + icon + one sentence + action button.

### 3.8 Icons
Lucide icons, 1.75px stroke, sizes 16/18/20 matching button sizes. Icons support text; never decorative icon grids.

---

## 4. Anti-"AI slop" rules (hard requirements)
Do NOT produce:
- Gradients of any kind, glow, neon, glass cards, blurred blobs.
- A "Features" section of 3 identical icon cards; grids of identical rounded cards with the same shadow. Use tables, ledgers, steps and the certificate.
- Emoji, 3D illustrations, stock photos, generic isometric art.
- Hype copy: "revolutionize", "the future of", "seamless", "unlock", "empower", "next-gen", "Web3-powered", "game-changer".
- ALL-CAPS tracked labels above headings, "A · B · C" meta strings, "→" appended to buttons/links, numbered markers on non-sequential content.
- Default shadcn / RainbowKit look: re-theme every component via CSS variables; RainbowKit accent `#6A1B9A`, radius 10px.

---

## 5. Pages

Top bar on every page. All four roles get **equal quality**: one clear hero task, a complete happy path, empty, loading, error and transaction states.

### 5.1 Landing (/)
- **Hero:** left 6 columns on `paper` — Display headline "Move in without a big deposit." + Body L sentence "Pay a small monthly fee. Your landlord is still protected — by an on-chain guarantee pool." + primary lg "Get a guarantee" + secondary lg "Invest in the pool". Right 6 columns: a solid `purple-700` block (radius 14px) with the marigold arc sweeping from its lower-left, holding a white **live quote widget**: inputs monthly rent + deposit months → two results side by side: "Cash you'd lock today" ($2,000.00, `ink`) vs "Your monthly fee" ($15.00, `green-700`, Amount XL).
- **How it works** (true 4-step sequence, numbers allowed): Get a quote → Landlord is guaranteed → Move out → Settle. Horizontal steps on desktop, vertical on mobile, connected by a 2px `line` rule.
- **Who gets what** — a ledger table (rows: Tenant, Landlord, Investor, SafeDeposit; columns: Puts in / Gets). No icon cards.
- **Pool transparency** — full-width `green-500` band with white figures read live from contracts: Active guarantees, Pool assets, Reserve ratio, Investor APY, plus a "How APY is calculated" link.
- **Footer** on `ink`: contract addresses per chain, GitHub, "Testnet demo — USDG rewards and T-bill yield are simulated."

### 5.2 Tenant (/tenant) — hero task: buy a deposit guarantee
- Quote form (property, landlord wallet or operator code, monthly rent, deposit amount, lease length) with fee breakdown table (monthly fee, 75% to pool, 25% protocol).
- Steps: Review → "Approve USDG" → "Buy guarantee" → certificate appears with the seal stamp.
- My guarantees: certificate + payment schedule table (due date, amount, status) + "Pay this month's fee".
- Claims on my lease: status timeline, evidence, "Accept claim" (success) / "Dispute claim" (secondary). If the pool paid: amount owed, installment plan, "Repay".
- Empty: "You don't have a guarantee yet. Get a quote to move in without a deposit." + primary button.

### 5.3 Landlord / operator (/landlord) — hero task: see protected units, file a claim
- Units table: unit, tenant, coverage, lease end, status badge. Row → certificate.
- File a claim (only during the 7-day window; countdown in Amount L, marigold badge): amount (≤ coverage), description, check-out photo upload (hash shown), check-in hash for comparison.
- Claim tracker timeline: Filed → Tenant responded → Arbiter decision → Paid (each with tx link).
- Empty: "No protected units yet. Share your operator code with tenants."

### 5.4 Investor (/invest) — hero task: deposit USDG and understand the risk
- Summary row (not cards — one panel split by vertical rules): Pool assets, Active coverage, Utilization, Net APY.
- **Reserve ratio meter:** horizontal bar, fill `green-500`, minimum marked with a 2px `ink` tick + label; fill turns `alert` below minimum.
- APY breakdown table: premium income, USDG rewards (simulated), T-bill yield (simulated), claims paid, recoveries, first-loss covers, net APY. Plain risk note: "Your capital pays valid claims. Tenants repay the pool over time; repayments can be late."
- Deposit / Withdraw panel (tabs), USDG → sdUSDG shares, preview of shares and value. Withdrawals that would break the reserve ratio are blocked with the reason.
- Activity ledger: premiums in (green), claims out (alert), repayments in (green), yield accrued.

### 5.5 Arbiter (/arbiter) — hero task: decide a dispute fairly
- Dispute queue table: claim ID, unit, amount claimed, opened, deadline (countdown).
- Detail: **side-by-side evidence** (check-in vs check-out photos, landlord vs tenant statement, claimed vs coverage).
- Decision: Success "Approve full amount", Secondary "Approve partial amount" (amount input), Destructive "Reject claim"; written reason required; confirmation dialog states the payout.

---

## 6. States & feedback (every role)
- Transaction lifecycle: idle → "Waiting for wallet" → "Confirming on Arbitrum Sepolia" (explorer link) → toast using the button's verb ("Guarantee purchased", "Claim filed", "Deposited").
- Wrong network: banner "You're on the wrong network." + "Switch to Arbitrum Sepolia".
- Insufficient USDG: state the missing amount + link to the Paxos testnet faucet.
- Errors are specific and don't apologize: "The pool is below its minimum reserve, so new guarantees are paused. Try again after new deposits."
- Loading: skeletons shaped like the real content (table rows, certificate outline) in `#EFECF3`, no spinners inside empty boxes.

## 7. Copy voice
Plain, calm, specific, sentence case. Use renters' words: "deposit", "monthly fee", "move out", "damage claim" — not "collateral", "underwriting tranche", "settlement primitive". Amounts: "$2,000.00 USDG" in detail, "$2,000" in summaries. Dates: "4 Oct 2026".

## 8. Technical
- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui (re-themed with the tokens above as CSS variables) + wagmi/viem + RainbowKit.
- Responsive down to 375px; tables collapse to stacked rows; the certificate scales without breaking.
- Accessibility: WCAG AA contrast, visible focus ring, keyboard-operable dialogs, `aria-live="polite"` for tx status, `prefers-reduced-motion` honored.
- Contract addresses/ABIs in `config/contracts.ts`, one entry per chain.

## 9. Copy deck (use this exact copy; it is part of the design)

Voice: a calm, plain-spoken friend who understands money. Short sentences, concrete numbers, no hype. Every headline states a fact or a benefit a renter would say out loud. Never use: revolutionize, future of, seamless, unlock, empower, next-gen, cutting-edge, Web3-powered, game-changer, disrupt, leverage, synergy, "in today's world".

### 9.1 SEO / sharing
- `<title>`: **SafeDeposit Zero — Move in without a big deposit**
- Meta description: **Pay a small monthly fee instead of a security deposit. Your landlord stays protected by an on-chain guarantee pool on Arbitrum.**
- Open Graph image text: "Move in without a big deposit." + wordmark, on the purple block with the marigold arc.

### 9.2 Landing page
**Hero**
- Headline (Display): **Move in without a big deposit.**
- Subhead (Body L): **Keep your cash. Pay a small monthly fee, and your landlord is protected up to the full deposit by a guarantee pool anyone can check.**
- Buttons: **Get a guarantee** (primary) · **Invest in the pool** (secondary)
- Quote widget title: **What would you pay?**
  - Inputs: "Monthly rent", "Deposit your landlord asks for", "Lease length"
  - Results: "Cash you'd lock today" → **$2,000.00** · "Your monthly fee" → **$15.00**
  - Footnote (Small, muted): "You're still responsible for damage you cause. Fees depend on lease length and screening."

**The problem** (H2 + one paragraph + three facts in a row, plain text with tabular numbers, no icons)
- H2: **A deposit is a month of rent you can't use.**
- Body: "It sits with your landlord for the whole lease. It earns you nothing. And at move-out it often comes back late, cut, or not at all."
- Facts: "1–2 months of rent paid up front" · "0% earned while it's held" · "Weeks of back-and-forth at move-out"

**How it works** (true sequence → numbered)
- H2: **How a guarantee works**
1. **Your landlord sends an invite.** They set the deposit they'd normally ask for.
2. **You pay a small monthly fee.** Your landlord is now guaranteed up to that amount.
3. **You move out.** Your landlord has 7 days to report damage, with photos.
4. **It settles.** No claim, nothing to do. A fair claim is paid by the pool right away, and you repay it in installments.

**Who gets what** (ledger table)
- H2: **Everyone gets what they actually need**
| | Puts in | Gets |
|---|---|---|
| Tenant | A small monthly fee | Moves in without locking a deposit |
| Landlord | Nothing extra | Protection up to the full deposit, paid within minutes on approved claims |
| Investor | USDG into the pool | Yield from rent fees and treasuries |
| SafeDeposit | Runs the protocol | 25% of each fee |

**For landlords** (two-column text block, not a card)
- H2: **List with $0 deposit. Stay fully covered.**
- Body: "Units with no upfront deposit rent faster. You're still protected up to the deposit you set, and approved claims are paid straight from the pool."
- Button: **Create a lease invite**

**For investors**
- H2: **Earn from rent, not from token emissions.**
- Body: "The pool earns from tenant fees and tokenized US treasuries. Every premium, claim and repayment is on-chain, and a minimum reserve is enforced by the contract."
- Button: **See the pool**

**Pool transparency band** (green-500 band, white figures, live)
- H2 (white): **Every dollar in the pool is on-chain.**
- Figures: "Active guarantees" · "Pool assets" · "Reserve ratio" (with "minimum 50%") · "Investor APY"
- Link: "How we calculate APY"

**FAQ** (H2: **Questions renters and landlords ask**)
- **Do I still pay for damage?** Yes. If a claim is approved, the pool pays your landlord first and you repay the pool in installments. Normal wear and tear isn't damage.
- **What if I disagree with a claim?** Dispute it with your own photos and a note. A neutral arbiter compares check-in and check-out evidence and decides.
- **What if I don't respond to a claim?** If you don't respond before the deadline, the claim is accepted. We'll show the deadline clearly.
- **Where does investor yield come from?** Tenant fees, interest from tokenized US treasuries, and repayments of past claims. Nothing comes from minting tokens.
- **What if the pool runs low?** The contract stops new guarantees whenever reserves fall below 50% of active coverage, so existing guarantees stay backed.
- **Is this live?** It's running on Arbitrum Sepolia and Robinhood Chain testnet with test USDG. Treasury yield is simulated on testnet.

**Footer**: "SafeDeposit Zero · Built on Arbitrum · Paid in USDG" (the only place middle dots are allowed) + contract links + "Testnet demo. Not financial advice."

### 9.3 App pages (title + one-line subtitle)
| Page | H1 | Subtitle |
|---|---|---|
| /tenant | **Your guarantees** | Pay your monthly fee, follow your lease, and respond to claims. |
| /invite/[id] | **Move in without a deposit** | {Landlord} is asking for a {$2,000} deposit for {Unit 12B}. Pay {$15.00}/month instead. |
| /landlord | **Your protected units** | Invite tenants, see what's covered, and file claims after move-out. |
| /invest | **The guarantee pool** | Deposit USDG to back rental guarantees and earn from fees and treasuries. |
| /arbiter | **Disputes to decide** | Compare the evidence and decide what's fair. Your decision pays out immediately. |

Key microcopy
- Certificate seal: "Backed by the SafeDeposit pool"
- Invite consent checkbox: "I understand I'm still responsible for damage I cause, and that approved claims are repaid in installments."
- Claim banner (tenant): "{Landlord} filed a damage claim of {$300.00}. Respond by {14:32, 4 Oct}."
- Reserve meter caption: "Guarantees pause automatically if this drops below 50%."
- Withdraw limit: "Up to {$X} can be withdrawn now. The rest is backing active guarantees."
- Demo banner: "Testnet demo · Yield is simulated · Admin can fast-forward a policy"

### 9.4 Hackathon submission copy (HackQuest)
- **Project name:** SafeDeposit Zero
- **Tagline (one line):** Move in without a big deposit. Tenants pay a small monthly fee; an on-chain USDG pool guarantees the landlord.
- **Short description (~50 words):** Security deposits lock up a month or more of a renter's cash and earn nothing. SafeDeposit Zero replaces them with a guarantee: tenants pay a small monthly fee, a USDG pool on Arbitrum covers the landlord up to the full deposit, and investors earn yield from rent fees and tokenized treasuries.
- **Long description sections (headings to use):** The problem · How it works · Who gets what · Business model · Where the yield comes from · Risk controls enforced on-chain · Built with Arbitrum (Arbitrum Sepolia + Robinhood Chain, USDG) · What's live (addresses, tests, demo) · What's next (pilot with a co-living operator, licensed insurance partner for mainnet).

## 10. Self-check before finishing
Screenshot every page and verify: no gradients or forbidden colors; color ratio roughly 70/20/7/3; the marigold arc appears only in the hero and the seal; only the certificate and dialogs have shadows; every role has empty/loading/error/tx states; all numbers are tabular; button labels match their toasts; all headlines and descriptions match the copy deck in §9 exactly; no banned words. Then remove one decorative element per page that doesn't carry information.
