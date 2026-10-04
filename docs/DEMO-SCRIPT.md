# Demo Video — SafeDeposit Zero (±3 menit)

Video direkam **onchain sungguhan di Arbitrum Sepolia** (website dengan `NEXT_PUBLIC_DATA_SOURCE=onchain`). Waktu tunggu dipotong saat editing. Profil demo memakai 1 menit = 1 bulan, jadi satu siklus sewa selesai dalam sekitar 20 menit nyata dan dipotong jadi 3 menit.

Narasi (voice-over) ditulis dalam bahasa Inggris karena jurinya internasional. Sekitar 380 kata, cukup untuk 3 menit dengan tempo santai.

---

## 1. Peran dan wallet

| Wallet | Peran di video | Kenapa |
|---|---|---|
| **A**: wallet deploy (`0xa5c3…a7a0`) | Investor + Arbiter + Admin | Wallet ini pemegang role admin dan arbiter di kontrak |
| **B**: akun MetaMask baru | Landlord | Landlord dan tenant harus wallet berbeda (kontrak menolak `SameParty`) |
| **C**: akun MetaMask baru | Tenant | Wallet baru otomatis tier B, jadi biayanya $15/bulan |

**Siapkan sebelum rekam:**
- [ ] Kirim sekitar 0,0003 ETH Arbitrum Sepolia dari A ke B dan ke C (per transaksi cuma sekitar 0,000005 ETH).
- [ ] Pakai 3 profil Chrome, masing-masing satu wallet, supaya tidak ganti akun di depan kamera.
- [ ] Mint test USDG di tiap profil lewat tombol "Mint test USDG".
- [ ] Siapkan foto: 2 foto check-in (kamar bersih) dan 2 foto check-out (misalnya dinding tergores).
- [ ] Siapkan teks catatan dispute tenant, siap di-copy-paste.
- [ ] Zoom browser 110%, sembunyikan bookmark bar, layar 1080p atau lebih.

---

## 2. Pipeline demo

Waktu "nyata" = jam dinding saat merekam. Waktu "video" = posisi di video jadi.

| # | Video | Nyata | Peran (wallet) | Halaman | Aksi | Yang dibuktikan | Kriteria juri |
|---|---|---|---|---|---|---|---|
| 0 | 0:00–0:15 | — | — | Landing `/` | Scroll hero dan quote widget ($2.000 → $15) | Masalah dan solusinya dalam satu layar | Impact, Presentation |
| 1 | 0:15–0:35 | 0:00 | **Investor** (A) | `/invest` | Deposit 5.000 USDG | Pool ERC-4626 menerima modal; reserve, first-loss dan share price tampil live dari kontrak | Technical, Arbitrum |
| 2 | 0:35–0:55 | 1:00 | **Landlord** (B) | `/landlord` | Buat invite: "Unit 12B, Orchard", sewa $2.000, deposit $2.000, 12 bulan, upload foto check-in | Foto tersimpan di IPFS, hash-nya dicatat onchain; kontrak mengecek kapasitas pool | Innovation, Technical |
| 3 | 0:55–1:20 | 2:30 | **Tenant** (C) | `/invite/<id>` | Buka link, lihat quote tier B, approve, bayar $15 pertama | Tenant masuk tanpa deposit; sertifikat ter-stamp; biaya otomatis terbagi pool/first-loss/treasury | Impact, Technical |
| 4 | 1:20–1:35 | 3:30 | **Tenant** (C) → **Admin** (A) | `/tenant` → `/admin` | Bayar bulan ke-2; Admin klik "Distribute rewards" | Biaya bulanan berjalan; reward USDG menaikkan share price | Arbitrum (USDG), Technical |
| — | *(dipotong)* | 3:30–15:30 | Tenant (C) | `/tenant` | Bayar sisa 10 bulan di muka, lalu tunggu lease selesai | — | — |
| 5 | 1:35–1:55 | ~15:30 | **Landlord** (B) | `/landlord/<id>` | Ajukan klaim $300 + foto check-out | Klaim dengan bukti; di `/invest` pending claim langsung menurunkan share price | Technical, Innovation |
| 6 | 1:55–2:25 | ~16:30 | **Tenant** (C) → **Arbiter** (A) | `/tenant` → `/arbiter` | Tenant dispute + catatan; arbiter membandingkan foto check-in dan check-out, lalu menyetujui $200 | Pool langsung bayar landlord; tenant berutang $200 dalam 6 cicilan, tanpa dispute fee karena keputusannya sebagian | Impact, Innovation |
| 7 | 2:25–2:40 | ~19:00 | **Tenant** (C) | `/tenant` | Bayar cicilan $70 | Uang kembali ke pool; aset pool naik | Technical |
| 8 | 2:40–3:00 | — | — | Blockscout + footer website | Buka 1 transaksi di Blockscout; tunjukkan address kedua chain di footer | Semuanya transaksi asli; juga live di Robinhood Chain | Arbitrum, Presentation |

**Batas waktu kontrak (jangan sampai lewat):**
- **Premi:** jatuh tempo tiap 1 menit, ditambah grace 1 menit. Karena itu sisa premi dibayar di muka setelah adegan 4.
- **Klaim landlord:** maksimal 5 menit setelah lease selesai.
- **Respons tenant:** maksimal 3 menit setelah klaim diajukan. Kalau lewat, klaim bisa diterima otomatis dan adegan dispute hilang.
- **Arbiter:** maksimal 5 menit setelah dispute.

Adegan 5–7 harus dikerjakan berurutan dalam sekitar 4 menit nyata. Siapkan foto dan teks dispute sebelum lease selesai.

**Opsional, adegan default:** tunjukkan utang yang gagal bayar ditutup oleh first-loss reserve dan tenant-nya diblokir. Ini butuh wallet tenant keempat dan lease kedua yang disiapkan sekitar 30 menit sebelum rekam. Lewati kalau mau versi ringkas.

---

## 3. Script voice-over

**[0] Landing (15 dtk)**
> Before you move in, your landlord asks for a deposit: a month of rent or more, locked up for the whole lease. SafeDeposit Zero replaces it with a guarantee. Two thousand dollars upfront becomes fifteen dollars a month.

**[1] Investor deposit (20 dtk)**
> It starts with the pool. An investor deposits five thousand USDG into an ERC-4626 vault on Arbitrum. Everything you see here is read live from the contract: the reserve, the first-loss buffer, and the share price.

**[2] Landlord invite (20 dtk)**
> The landlord creates an invite for a two-thousand-dollar deposit and uploads check-in photos. The photos go to IPFS, and their fingerprint is stored on-chain, so nobody can swap them later.

**[3] Tenant accepts (25 dtk)**
> The tenant opens the link. They're new to SafeDeposit, so they pay the standard rate: fifteen dollars. One transaction later the landlord holds a guarantee certificate. Of the fee, seventy-five percent goes to the pool, ten to the first-loss reserve, and fifteen to the treasury.

**[4] Month two + rewards (15 dtk)**
> On testnet one minute is one month. The tenant pays month two. USDG partner rewards flow into the pool, and the share price ticks up.

**[Caption: "12 months later (12 minutes on testnet)"]**

**[5] Claim (20 dtk)**
> The lease ends. The landlord finds a damaged wall and claims three hundred dollars with photos. Investors see it right away: the pending claim already counts against the share price, so nobody can withdraw ahead of a loss.

**[6] Dispute + arbiter (30 dtk)**
> The tenant disputes it. A neutral arbiter compares the check-in and check-out photos and approves two hundred. The pool pays the landlord instantly. The tenant now owes the pool two hundred dollars, in six installments. Damage is still the tenant's responsibility. They just don't need the cash on day one.

**[7] Repayment (15 dtk)**
> The tenant repays seventy dollars, and the money goes straight back to the pool.

**[8] Proof + close (20 dtk)**
> Every step was a real transaction, verifiable on Blockscout. SafeDeposit Zero is live on Arbitrum Sepolia and Robinhood Chain. Yield from rent, not emissions. Move in without a big deposit.

---

## 4. Tips editing

- Potong semua waktu tunggu konfirmasi MetaMask dan blok. Cukup tampilkan klik "Confirm" lalu langsung hasilnya.
- Tambahkan caption kecil di pojok untuk setiap peran yang sedang aktif: **Investor**, **Landlord**, **Tenant**, **Arbiter**. Juri harus selalu tahu siapa yang sedang bertindak.
- Zoom in (crop) ke angka penting: $15.00, share price, "Pending claims −$300", "Paid to landlord $200".
- Musik latar pelan atau tanpa musik. Suara narasi yang jelas lebih penting.
