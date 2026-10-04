# Pitch Deck Prompt — SafeDeposit Zero

## Cara pakai (baca dulu)

1. **Isi semua `[ISI: …]`** sebelum dipakai: data Kos Royal 12, tim, dan link. Jangan biarkan AI mengarang bagian ini.
2. **Cek angka bertanda ⚠** ke sumber aslinya (daftar sumber ada di bagian paling bawah). Kurs dan beberapa data perlu dicek ulang sebelum presentasi.
3. Salin semua isi mulai dari **`=== PROMPT ===`** sampai akhir file, lalu tempel ke tool pembuat deck (Gamma, Canva Magic Design, Figma Slides + AI, atau Claude/ChatGPT untuk membuat file .pptx).
4. Isi slide (teks) ditulis dalam bahasa Inggris karena juri Arbitrum Open House internasional. Speaker note juga bahasa Inggris, supaya bisa langsung dipakai untuk voice-over video demo.

**Pola dari deck referensi yang dipakai di sini:**
- **Centuari (Figma):** masalah diceritakan dalam beberapa slide berurutan dengan angka nyata. Satu bentuk khas dipakai berulang (di sini: lengkungan emerald). Slide gelap dan terang diselang-seling. Penutupnya kalimat manifesto: "We're not building X. We're building Y."
- **NoLoss Predict (Canva):** "How it works" dalam 3 langkah. Model bisnis dijelaskan dengan contoh hitungan nyata. Market size memakai angka konkret. Roadmap per kuartal.
- **Encoteki (Google Slides):** setiap slide punya judul dan satu baris klaim. TAM/SAM/SOM ditulis lengkap dengan definisi dan sumbernya. Detail ditaruh di appendix, bukan di slide utama.

**Kriteria juri (dari T&C Open House Buildathon):** Innovation · Technical implementation · Use of Arbitrum technology · Potential impact · Presentation quality, plus bonus untuk ide yang novel. Minimal 1 dari 3 hadiah tiap track dicadangkan untuk project di **Robinhood Chain**, jadi deploy kita di Robinhood harus terlihat jelas. 50% hadiah juga mensyaratkan **mainnet launch + KPI**, jadi roadmap harus menyebut keduanya.

---

=== PROMPT ===

## Role and goal

You are a senior pitch-deck designer and copywriter for early-stage fintech. Build a **15-slide pitch deck plus a 3-slide appendix** for **SafeDeposit Zero**, a hackathon project in the Arbitrum Open House Buildathon (Asia). Judges score: innovation, technical implementation, use of Arbitrum technology, potential impact, presentation quality. The deck must read clearly in 3 minutes without a speaker, and also work as the backdrop for a recorded demo with voice-over.

Follow the slide plan below exactly: slide order, headlines and numbers. You may tighten wording, but do not add claims, numbers, logos or partners that are not in this prompt. Anything marked `[ISI: …]` is a placeholder the founder fills in. If it is still a placeholder, leave the slot visibly empty. Never invent it.

## The product in one paragraph

Renters in Southeast Asia pay one to two months of rent as a cash deposit before moving in. The cash sits idle for the whole lease, and at move-out it often comes back late, cut, or not at all. **SafeDeposit Zero replaces the deposit with a guarantee.** The tenant pays a small monthly fee. A USDG pool on Arbitrum guarantees the landlord up to the full deposit amount. If there's damage, the pool pays the landlord within minutes of approval, and the tenant repays the pool in installments. Investors fund the pool and earn from tenant fees, tokenized T-bills and USDG rewards, not token emissions. Every rule (reserve minimum, payouts, evidence fingerprints) is enforced and visible on-chain.

## Writing rules

- **One idea per slide.** The headline is the claim, in at most 8 words, written as a sentence with a full stop. Not a topic label: "A deposit is a month of rent you can't use." beats "The Problem".
- **Body text: at most 25 words per slide** (tables and the market slide excepted). Use short lines, not paragraphs.
- **Numbers carry the slide.** One hero number per slide, set big. Every external number gets a tiny source line at the bottom of the slide.
- **Show the math once** with a worked example (slide 8), the way strong decks show "$100k pool → $500 yield → $75 fee".
- **Plain words.** Say "guarantee", "monthly fee", "pool", "repay". No "revolutionary", "seamless", "leverage", "game-changer", "Web3-native", "unlock the power", "next-gen", and no emoji.
- **Honest labels.** Illustrative numbers are labeled "Illustrative". Testnet yield is labeled "simulated". Don't call the product "insurance". It's a deposit guarantee.
- Tense: present for what is live, future for the roadmap. Never blur the two.

## Visual system (match the live product)

**Colors (exact hex, from the product's design tokens and logo):**

| Role | Hex | Use |
|---|---|---|
| Emerald 700 (brand) | `#086A4A` | Headline accents, key numbers, buttons, the signature arc |
| Emerald 500 | `#0F9468` | Charts, progress bars, positive numbers |
| Emerald 50 | `#E8F6F0` | Soft fills behind callouts |
| Violet 500 (accent) | `#9333EA` | **At most one small accent per slide**: a ring, an underline or one highlighted word. Never fills, never gradients |
| Graphite 800 | `#1F2327` | Dark slide background |
| Graphite 700 | `#2C3136` | Cards on dark slides |
| Paper | `#F4F5F6` | Light slide background |
| Ink | `#14171A` | Text on light slides |
| Muted | `#596068` | Secondary text, source lines |
| Line | `#E2E5E8` | Dividers and table rules |
| Marigold 400 | `#F5A623` | Only for "pending" or a risk callout. Never decorative |

**Type:** headlines in **Newsreader** (serif, weight 500–600). Body and numbers in **Hanken Grotesk** (400–700, tabular figures for numbers). Contract addresses in **JetBrains Mono**.

**Signature shape:** a thick, flat emerald quarter-circle arc (`#0F9468`) sweeping in from a corner, as on the product's landing page. Use it on the cover, section breaks and the closing slide. Use the same shape every time and nowhere else, the way Centuari repeats its star.

**Rhythm:** alternate dark (graphite) and light (paper) slides. Cover, solution, Arbitrum and closing are dark. Data-heavy slides are light.

**Logo:** steel "S" shield with a circuit board and a keyhole (transparent PNG at `frontend/public/brand/logo-512.png`). Show it on the cover and the closing slide, and small in the corner elsewhere.

**Don't:** stock photos of keys, handshakes or skylines; 3D icons; neon gradients; glassmorphism; more than one accent color per slide; a 6-icon feature grid; walls of text.

**Product visuals to use (screenshots from the live app):** the Deposit Guarantee certificate with its seal, the quote widget ("Cash you'd lock today $2,000 → Your monthly fee $15.00"), the investor pool page (reserve ratio bar, APY breakdown), the claim timeline with photo evidence.

---

## Slide plan

### 1 — Cover (dark)
- **Title:** SafeDeposit Zero
- **Headline:** Move in without a big deposit.
- **Sub:** Tenants pay a small monthly fee. An on-chain USDG pool guarantees the landlord.
- **Footer:** Built on Arbitrum · Live on Arbitrum Sepolia and Robinhood Chain · Paid in USDG
- **Visual:** logo, signature arc from the bottom-left corner.
- **Speaker note:** "Deposits lock up a month of rent or more. We replace them with a guarantee."

### 2 — Problem, part 1 (light)
- **Headline:** A deposit is a month of rent you can't use.
- **Hero numbers (3 columns):**
  - **1 month per year of lease**: the standard deposit in Singapore.
  - **1–2 months upfront**: a typical kos or apartment in Jakarta.
  - **0%**: what the tenant earns on it while it's held.
- **Example line:** Rent $1,000 with a 2-month deposit = **$2,000 extra on day one**, locked for 12 months.
- **Source line:** Singapore deposit convention: 99.co, StackedHomes.
- **Speaker note:** "For a young renter that's often their entire savings, parked with a stranger."

### 3 — Problem, part 2 (light)
- **Headline:** And getting it back is a fight.
- **Three short lines:**
  - Singapore has no escrow rule. The landlord holds the cash directly.
  - Neither side has a neutral record of the unit's condition.
  - Disputes come down to "he said, she said", and the tenant usually loses.
- **Visual:** a simple timeline: move in → 12 months → move out → "deposit: cut / late / missing" in muted red.
- **Source line:** Singapore escrow: 99.co tenancy guide.
- **Speaker note:** "Landlords don't actually need the cash. They need to know damage will be covered."

### 4 — Solution (dark)
- **Headline:** Pay a small monthly fee. Keep your deposit.
- **Hero comparison (the core visual of the deck):**

| | Cash deposit today | SafeDeposit Zero |
|---|---|---|
| Upfront | **$2,000** | **$0** |
| Monthly | — | **$15** |
| Landlord covered up to | $2,000 | $2,000, paid from the pool |
| Who pays for damage | Tenant | Still the tenant, in installments |

- **Kos line (Indonesia):** A Rp1,5 juta kos deposit becomes **Rp11.250/month**. *(9%/yr of coverage ÷ 12; tier B.)*
- **Visual:** the quote widget screenshot (deposit bar shrinking to a thin fee bar).
- **Speaker note:** "The tenant keeps their cash. The landlord keeps their protection. Damage is still the tenant's responsibility."

### 5 — How it works (light)
- **Headline:** Four steps, every one on-chain.
- **Steps (numbered, connected by an emerald line):**
  1. **Landlord sends an invite** with the deposit amount and check-in photos.
  2. **Tenant accepts and pays the first fee.** The landlord gets a guarantee certificate.
  3. **Move-out:** the landlord has 7 days to claim, with photos.
  4. **It settles.** No claim: nothing to do. Fair claim: the pool pays the landlord now, and the tenant repays in 6 installments. Disputed: a neutral arbiter decides.
- **Small print:** Photos are pinned to IPFS and fingerprinted on-chain, so nobody can swap them later.
- **Speaker note:** "The landlord is paid first. The tenant repays the pool, not the landlord."

### 6 — It's live (light)
- **Headline:** Live today on two Arbitrum chains.
- **Visual:** 3 product screenshots side by side: certificate · landlord claim with photos · investor pool page.
- **Proof row:**
  - **9 contracts** deployed and verified on **Arbitrum Sepolia** and **Robinhood Chain testnet**
  - **181 tests** passing · **99% line coverage** · invariant + fuzz tested
  - Demo time: 1 minute = 1 month, so a full lease runs in 12 minutes
- **Link:** `[ISI: link Vercel]` · github.com/LBRT87/SafeDepositZero
- **Speaker note:** "Everything you'll see in the demo is a real transaction on testnet."

### 7 — Why Arbitrum (dark)
- **Headline:** Rules a landlord can check, not trust.
- **Four tiles (one line each):**
  - **Reserve enforced in code:** new guarantees stop automatically if the pool holds less than 50% of active coverage.
  - **ERC-4626 pool:** investors hold sdUSDG shares; withdrawals beyond free capital wait in a FIFO queue.
  - **Stylus pricing engine:** the premium calculator is written in Rust for Arbitrum Stylus, with an identical Solidity version (the one running on testnet today); the pool can switch between them with one call.
  - **USDG on Arbitrum and Robinhood Chain:** a regulated dollar, cheap enough to pay a $15 fee every month (testnet uses a test USDG).
- **Speaker note:** "On Arbitrum a $15 monthly payment costs a fraction of a cent, and every reserve rule is public."

### 8 — Business model (light)
- **Headline:** We earn when guarantees are paid for.
- **Worked example (one $2,000 guarantee, 12 months, tier B):**

| Step | Amount / year |
|---|---|
| Tenant fees ($15 × 12) | **$180** |
| → Investor pool (75%) | $135 |
| → First-loss reserve (10%, until it reaches 5% of the pool) | $18 |
| → SafeDeposit treasury (15%, rising to 25% once the reserve is full) | $27 |

- **Second line:** Plus a 2% dispute fee (min $10), charged only when a tenant disputes and loses in full.
- **Pricing rule (small):** fee = coverage × 9% per year × lease factor (6 mo 1.10 · 12 mo 1.00) × tenant tier (A 0.8 · B 1.0 · C 1.3).
- **Speaker note:** "Our first-loss slice sits in front of investors, so we lose before they do."

### 9 — For investors (light)
- **Headline:** Yield from rent, not from emissions.
- **Hero number:** **≈10.4% APY**, *Illustrative: 1,000 leases × $2,000 on a $1M pool.*
- **Breakdown bars (one scale):**
  - Tenant fees to pool: +$135,000
  - Tokenized T-bills on capital above the liquidity target (~3.4%): +$20,400
  - USDG partner rewards on idle cash: +$12,000
  - Claims after tenant repayments (35% of fees): −$63,000
- **Risk line:** Investors only lose if net claims pass **~93% of all fees**. The maximum loss is the amount deposited. Landlords are still paid because the 50% reserve is enforced on-chain.
- **Source line:** Illustrative unit economics. T-bill and USDG rewards are simulated on testnet.
- **Speaker note:** "The cash flow comes from real rent, so it doesn't move with crypto prices."

### 10 — Market (light)
- **Headline:** $690M in deposits locked every year, in two markets.
- **Three nested circles or bars, each with its formula in small type:**

| | Value | How it's calculated |
|---|---|---|
| **TAM**: rental deposits in Indonesia + Singapore | **≈ US$690M** in deposits · **≈ US$62M/yr** in fees at 9% | Indonesia: 71.79M households × 5.06% renting = 3.63M × Rp1,5 jt ≈ **US$304M** ⚠ · Singapore: 88,523 private + 36,673 HDB new tenancies (2024) × 1 month's rent (S$4,300 / S$3,200) ≈ **S$498M ≈ US$388M** |
| **SAM**: digitally listed kos + Singapore private rentals | **≈ US$500M** deposits · **≈ US$45M/yr** in fees | 3M kos rooms on Mamikos × 80% occupied × Rp1,5 jt ≈ **US$201M** ⚠ · 88,523 private tenancies × S$4,300 ≈ **US$297M** |
| **SOM**: 3-year target | **10,000 active guarantees** · **US$7.4M** coverage · **US$664K/yr** in fees · **US$166K/yr** SafeDeposit revenue | 8,000 kos rooms (≈ 0.3% of occupied Mamikos rooms) + 2,000 Singapore units; 1.5% of SAM |

- **Footnote:** FX Oct 2026: US$1 = Rp17.900, S$1 = US$0.78 ⚠. Deposit = 1 month's rent. Fees at the 9%/yr base rate.
- **Context line (small):** The category is proven abroad: in the US, Rhino has covered 2M+ homes and says it saved renters $700M+. The UK held **£5.2B** across **4.59M** protected deposits (Sept 2023).
- **Speaker note:** "We start where deposits hurt most: young renters in Jakarta kos and Singapore condos."

### 11 — Competition (light)
- **Headline:** Deposit-free renting exists. Just not here.
- **Table:**

| | Cash deposit | Deposit insurance (Rhino, UK zero-deposit schemes) | **SafeDeposit Zero** |
|---|---|---|---|
| Upfront cost for tenant | 1–2 months' rent | Small fee | **Small fee** |
| Available in Southeast Asia | Yes | No | **Yes** |
| Can you see the reserves? | No | No (balance sheet of an insurer) | **Yes, live on-chain** |
| Claim payout speed | Landlord already holds cash | Days to weeks | **Minutes after approval** |
| Evidence tamper-proof | No | Varies | **Yes (IPFS + on-chain hash)** |

- **Speaker note:** "Rhino raised $95M proving renters want this in the US. We bring it to Southeast Asia with reserves anyone can audit."

### 12 — Traction and pilot (dark)
- **Headline:** Our first kos is ready to switch.
- **Pilot card: Kos Royal 12** *(fill in only what has actually been agreed)*
  - Location: `[ISI: kota / area]`
  - Rooms: `[ISI: jumlah kamar]` · Monthly rent: `[ISI: Rp …]` · Current deposit: `[ISI: Rp … / berapa bulan]`
  - Status: `[ISI: LOI ditandatangani / komitmen lisan / sedang diskusi, plus tanggal]`
  - Pilot plan: `[ISI: mis. X kamar pertama memakai SafeDeposit mulai bulan …]`
  - Quote (optional, only if the owner agreed to it): `[ISI: kutipan pemilik kos]`
- **Built in this buildathon:** 9 verified contracts × 2 chains · 181 tests · full web app with tenant, landlord, investor, arbiter and admin views.
- **Speaker note:** "This isn't a guess about demand. Kos Royal 12 [ISI: one sentence on why they want it]."

### 13 — Roadmap (light)
- **Headline:** From one kos to mainnet.
- **Quarters:**
  - **Q4 2026:** Pilot with Kos Royal 12 on testnet. Security review. Localized kos pricing in rupiah terms.
  - **Q1 2027:** Audit. **Mainnet launch on Arbitrum One** with USDG. Licensed insurance or guarantee partner for the landlord side.
  - **Q2 2027:** 10 kos operators in Jakarta; first Singapore co-living operator; operator dashboard (SaaS).
  - **Q3–Q4 2027:** Robinhood Chain integration for retail investors; tokenized T-bill allocation on mainnet (BUIDL / BENJI).
- **KPI line:** Mainnet KPI: **1,000 active guarantees and a 50%+ reserve ratio held for 6 months.**
- **Speaker note:** "We go mainnet on Arbitrum with a KPI we can be measured on."

### 14 — Team (light)
- **Headline:** `[ISI: satu kalimat tentang tim, mis. "Builders who rented kos ourselves."]`
- **Per person:** photo (black and white), name, role, one line of relevant proof. `[ISI]`
- Keep it to 2–4 people, no long bios.

### 15 — Close (dark)
- **Manifesto (three lines, bold the last words):**
  - We're not building another **DeFi vault**.
  - We're replacing the **rental deposit**.
  - Starting with the renters who need their cash **the most**.
- **Links:** `[ISI: link Vercel]` · github.com/LBRT87/SafeDepositZero · `[ISI: X / email]` + QR code to the live app.
- **Visual:** signature arc sweeping across, logo.

---

## Appendix

### A1 — Risk controls enforced on-chain
- 50% minimum reserve on active coverage; new guarantees pause below it.
- Concentration cap: one landlord ≤ max($20K, 10% of capacity).
- First-loss reserve (funded from fees, up to 5% of pool) covers tenant defaults before investors.
- Filed claims lower the share price immediately, so investors can't front-run a loss by withdrawing.
- FIFO withdrawal queue; tenants who default are blocked from new guarantees.
- Scenario table (illustrative, $1M pool): Normal **+10.4%** · Bad year **−1.3%** (≈ breakeven after first-loss) · Disaster **−43.3%**.

### A2 — Contract addresses (verified on Blockscout)

| Contract | Arbitrum Sepolia | Robinhood Chain testnet |
|---|---|---|
| GuaranteePool | `0x1A8E77B36EeeF1f6d2f84579d08548fe75eAeB98` | `0xcFa083349A227036472AA2ef63Bb43F027c38ce1` |
| PolicyManager | `0x8711B0F56c5F7e9d86Cd4e68908F1C0034306C1B` | `0x1A8E77B36EeeF1f6d2f84579d08548fe75eAeB98` |
| ClaimManager | `0xA09Dc5b515E09F69Ed27D2e9E2EB86E8D3D1947B` | `0x8711B0F56c5F7e9d86Cd4e68908F1C0034306C1B` |
| TenantRegistry | `0xcFa083349A227036472AA2ef63Bb43F027c38ce1` | `0x963Fd245e5FD69a107B60F42A0c1B862FC72A24B` |

(Same address can be a different contract on each chain; always label the chain.)

### A3 — Sources and market math
Show the formulas from slide 10 in full, with every source below listed by name.

=== END PROMPT ===

---

## Sumber data (untuk dicek dan dicantumkan)

| Angka | Nilai | Sumber |
|---|---|---|
| Rumah tangga yang sewa/kontrak, Indonesia 2024 | 5,06% | BPS, via [GoodStats](https://data.goodstats.id/statistic/hampir-85-rumah-tangga-memiliki-rumah-sendiri-di-2024-nc8v8) dan [Kompas](https://lestari.kompas.com/read/2024/02/14/140000486/jakarta-jadi-provinsi-yang-warganya-paling-banyak-ngontrak-rumah) |
| Rumah tangga sewa/kontrak di DKI Jakarta | 21,30% | BPS, via [GoodStats](https://data.goodstats.id/statistic/21-warga-jakarta-tinggal-di-rumah-kontrak-jE5tN) |
| Jumlah rumah tangga Indonesia 2023 | 71,79 juta ⚠ | Hasil pencarian yang mengutip BPS. **Cek di [bps.go.id](https://www.bps.go.id)**, karena Statista memakai angka berbeda (58,69 juta, proyeksi 2024) |
| Kamar kos di Mamikos | 3 juta kamar, 200 ribu pemilik, 150+ kota (Q1 2022) | [Warta Ekonomi](https://wartaekonomi.co.id/read425000/kuartal-i-2022-permintaan-hunian-sewa-di-mamikos-melonjak-125) |
| Harga kos standar Jakarta | Rp1,5–2 juta/bulan; okupansi 80% (2024) | [Mamikos](https://mamikos.com/info/berapa-gaji-yang-dibutuhkan-untuk-hidup-nyaman-di-jakarta-kry/?halaman=2), [IDN Times](https://www.idntimes.com/business/economy/harga-kos-di-jakarta-setara-cicilan-rumah-ini-4-alasannya-c1c2-01-67q5n-lmc7wn/amp) |
| Kontrak sewa rumah privat Singapura 2024 | 88.523 | URA, via [ERA](https://www.era.com.sg/4q2024-rental-report-era/) |
| Persetujuan sewa HDB 2024 | 36.673 | HDB, via [ERA](https://www.era.com.sg/4q2024-rental-report-era/) |
| Rumah tangga Singapura 2024 | 1.463,4 ribu; 90,8% milik sendiri | [SingStat](https://www.singstat.gov.sg/find-data/search-by-theme/households/resident-households/latest-data) |
| Sewa median Singapura | Privat ±S$4.300; HDB 3-room S$2.200–3.200, 4-room S$3.000–4.350 ⚠ | [Cove](https://blog.cove.sg/cost-to-rent-in-singapore/), [PropertyGuru](https://www.propertyguru.com.sg/property-guides/hdb-rental-prices-singapore-29827) |
| Konvensi deposit Singapura | 1 bulan per tahun sewa; tidak wajib escrow | [99.co](https://www.99.co/blog/singapore/tenancy-agreement-and-security-deposit/), [StackedHomes](https://stackedhomes.com/editorial/rental-security-deposit) |
| Rhino (AS) | 2 juta rumah, $700 juta+ dihemat penyewa, funding $95 juta (Tiger Global, 2021), target $45 miliar deposit | [Coverager](https://coverager.com/rhino-saves-american-renters-500-million-since-onset-of-pandemic/), [Insurance Business](https://www.insurancebusinessmag.com/us/news/technology/rental-deposit-insurance-startup-rhino-raises-95-million-245047.aspx), [REI-INK](https://rei-ink.com/rhino-hits-major-company-milestone/) |
| Deposit terlindungi di Inggris | £5,2 miliar, 4,59 juta deposit (Sep 2023) | [Property Reporter](https://www.propertyreporter.co.uk/landlords/4bn-remains-held-in-tenancy-deposits.html) |
| Kurs | US$1 = Rp17.900; S$1 = US$0,78 ⚠ | [Pluang](https://pluang.com/en/tools/currency-converter/usd-idr), [Pluang SGD](https://pluang.com/en/tools/currency-converter/sgd-usd). Cek ulang di hari presentasi |

**Rumus TAM/SAM/SOM (supaya bisa dicek ulang):**
- Indonesia TAM: 71,79 jt × 5,06% = 3,63 jt rumah tangga × Rp1,5 jt = Rp5,45 T ÷ 17.900 ≈ **US$304 jt**
- Singapura TAM: 88.523 × S$4.300 + 36.673 × S$3.200 = S$380,7 jt + S$117,4 jt = S$498 jt × 0,78 ≈ **US$388 jt**
- TAM ≈ **US$692 jt** deposit; × 9% ≈ **US$62 jt/tahun** biaya
- SAM: 3 jt kamar × 80% × Rp1,5 jt ÷ 17.900 ≈ US$201 jt + S$380,7 jt × 0,78 ≈ US$297 jt = **≈ US$498 jt**; × 9% ≈ **US$45 jt/tahun**
- SOM: 8.000 kamar kos × Rp1,5 jt ($83,80) = $670 rb + 2.000 unit × S$4.300 × 0,78 ($3.354) = $6,71 jt → **$7,38 jt coverage**; × 9% = **$664 rb/tahun** biaya; × 25% = **$166 rb/tahun** pendapatan SafeDeposit

**Catatan untuk kamu (bukan untuk AI):**
- **Kos Royal 12 tidak ditemukan di internet**, jadi semua detailnya harus dari kamu. Kalau belum ada kesepakatan tertulis, tulis statusnya jujur, misalnya "in talks", bukan "partner".
- **Harga kos Rp11.250/bulan hanya berlaku kalau biaya minimum diturunkan.** Di kontrak sekarang, `minMonthlyPremium` = 5 USDG (≈ Rp89.500). Untuk deposit kos Rp1,5 juta, biaya minimum itu terlalu mahal. Karena itu roadmap Q4 2026 memuat "localized kos pricing". Kalau ditanya juri, jawab bahwa minimum fee akan disesuaikan untuk segmen kos.
- Angka 71,79 juta rumah tangga perlu dicek ke publikasi BPS. Kalau angka resminya berbeda, hitung ulang TAM Indonesia dengan rumus di atas.
