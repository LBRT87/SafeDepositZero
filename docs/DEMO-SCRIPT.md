# Demo Video — SafeDeposit Zero (±3 menit)

Video direkam **onchain sungguhan di Arbitrum Sepolia** di `https://safe-deposit-zero.vercel.app`. Waktu tunggu dipotong saat editing. Profil demo memakai 1 menit = 1 bulan, jadi satu siklus sewa selesai dalam sekitar 20 menit nyata dan dipotong jadi 3 menit.

Narasi (voice-over) ditulis dalam bahasa Inggris karena jurinya internasional. Teksnya ada di bagian 5.

---

## 1. Kenapa butuh 3 wallet

Di blockchain, **wallet = identitas**. Kontrak mengenali siapa yang bertindak dari address yang menandatangani transaksi, dan beberapa aturannya memang mengharuskan orangnya berbeda:

- **Landlord dan tenant wajib berbeda.** Kontrak menolak kalau address-nya sama (`SameParty`). Di dunia nyata pemilik kos tidak menjamin dirinya sendiri.
- **Hanya tenant yang diundang yang bisa accept dan dispute.** Hanya landlord pemilik policy yang bisa mengajukan klaim.
- **Hanya address dengan role arbiter yang bisa memutuskan sengketa.** Role ini dipegang wallet A sejak deploy.
- **Uang mengalir ke address masing-masing.** Tenant membayar dari wallet-nya, klaim dibayar ke wallet landlord. Juri bisa melihat saldo tiap pihak berubah.

| Kode | Wallet | Peran di video | Jaringan | Butuh ETH? | Butuh USDG? |
|---|---|---|---|---|---|
| **A** | `0xa5c3…a7a0` (wallet deploy) | Investor + Arbiter + Admin | Arbitrum Sepolia | Ya (sudah ada 0,0003) | Ya (sudah ada 9.000) |
| **B** | wallet baru | Landlord | Arbitrum Sepolia saja | Ya, ±0,0001 | **Tidak** |
| **C** | wallet baru | Tenant | Arbitrum Sepolia saja | Ya, ±0,0002 | Ya, 1.000 |

**B dan C cukup di Arbitrum Sepolia**, tidak perlu Robinhood.

**Kenapa B dan C butuh ETH:** setiap aksi di blockchain (membuat invite, accept, bayar, klaim) adalah transaksi yang perlu ongkos gas, dibayar dengan ETH testnet. ETH-nya gratis dari faucet dan tidak bernilai uang.

**Kenapa hanya C yang butuh USDG:** tenant membayar biaya bulanan dan cicilan dalam USDG. Landlord tidak membayar apa-apa, dia malah menerima USDG saat klaim dibayar.

---

## 2. Persiapan (sebelum rekam)

### Wallet
- [ ] Di Rabby: **Add address → Create new address** dua kali. Beri nama "B Landlord" dan "C Tenant" supaya tidak tertukar.
- [ ] Isi ETH Arbitrum Sepolia ke B (±0,0001) dan C (±0,0002) dari faucet, misalnya Alchemy, QuickNode, atau Chainlink faucet untuk Arbitrum Sepolia. Beberapa faucet minta login atau saldo kecil di mainnet. **Jangan ambil dari wallet A**, karena ETH-nya mepet untuk transaksinya sendiri.
- [ ] Mint 1.000 USDG ke C dari terminal (gas dibayar A, jumlahnya kecil):
  ```powershell
  C:\Users\EJ\.foundry\bin\cast.exe send 0x216f1d0698D56F8A8D789B73F3ffc9F9784F2b73 "mint(address,uint256)" <ADDRESS_C> 1000000000 --rpc-url https://sepolia-rollup.arbitrum.io/rpc --account deployer3
  ```

### Pool
- [ ] Dengan wallet A di `/invest`, deposit 4.000 USDG lagi supaya pool berisi ±5.000. Pool wajib menyimpan cadangan 50% dari total jaminan, jadi dengan 1.000 USDG saja invite $2.000 terlalu mepet. Ini bisa dilakukan sebelum rekam. Di video cukup tunjukkan deposit kecil, atau rekam deposit 4.000 ini sebagai adegan 1.

### Materi
- [ ] 2 foto check-in (kamar bersih) dan 2 foto check-out (misalnya dinding tergores).
- [ ] Teks catatan dispute siap di-copy-paste: *"The scratch was already there at move-in. See my move-in note."*
- [ ] Teks alasan arbiter: *"Check-out photos show new damage on the wall, but part of it matches the move-in photos. Approving $200 of $300."*

### Layar
- [ ] Brave/Chrome di 1920×1080, zoom 110%, bookmark bar disembunyikan, tab lain ditutup.
- [ ] Siapkan 4 tab: `/invest`, `/landlord`, `/tenant`, `/arbiter`.

---

## 3. Cara ganti wallet saat rekam

Pakai **satu Rabby dengan 3 address**, lalu ganti address sesuai peran:

1. Klik ikon Rabby di toolbar browser.
2. Klik nama account di kiri atas Rabby, lalu pilih address peran berikutnya (A, B, atau C).
3. Kembali ke website. Website otomatis membaca address baru. **Selalu cek tombol wallet di kanan atas website**: address dan saldonya harus sesuai peran (misalnya C menunjukkan ±$1.000) sebelum klik apa pun.
4. Kalau website masih menampilkan address lama, refresh halaman (F5).
5. Kalau Rabby minta "Connect to this site" untuk address baru, setujui.

**Saat editing:** potong momen ganti wallet. Ganti dengan caption peran di pojok, misalnya **"Now: Tenant (wallet C)"**.

**Halaman `/invest` bisa dibuka dari wallet mana pun**, karena datanya publik. Untuk menunjukkan efek ke pool (pending claim, share price), tidak perlu ganti ke wallet A.

---

## 4. Shot list detail

Jam "nyata" dihitung dari saat tenant accept (T). Batas waktu kontrak ditandai ⏱.

### Adegan 0: Pembuka (video 0:00–0:15) · tanpa wallet
1. Buka `/`. Diamkan 2 detik di headline "Move in without a big deposit."
2. Scroll pelan ke quote widget. Biarkan animasinya jalan: "Cash you'd lock today $2,000.00" → "Your monthly fee $15.00".
3. **Zoom ke $15.00.** Voice-over [0].

### Adegan 1: Investor deposit (video 0:15–0:35) · **wallet A**
1. Buka `/invest`. Tunjukkan baris atas: Pool assets, Active coverage, Utilization, Net APY.
2. Di panel "Your position", tab **Deposit**, ketik `4000` (atau jumlah lain yang kamu pilih).
3. Klik **Approve 4,000.00 USDG**, lalu konfirmasi di Rabby.
4. Klik **Deposit USDG**, lalu konfirmasi di Rabby. Muncul toast "Deposited".
5. **Zoom ke:** Pool assets naik, "Your shares" (sdUSDG), dan Reserve ratio. Voice-over [1].

### Adegan 2: Landlord membuat invite (video 0:35–0:55) · **ganti ke wallet B**
1. Buka `/landlord`, isi form **Create invite**:
   - Property: `Unit 12B, Orchard`
   - Monthly rent: `2000`
   - Deposit to guarantee: `2000`
   - Lease length: **12 months**
   - Tenant wallet (optional): **address C** (supaya hanya C yang bisa accept)
   - Check-in photos: upload 2 foto
2. Klik **Create invite**, lalu konfirmasi di Rabby. Muncul toast "Invite created".
3. Klik **Copy invite link**. **Zoom ke link** `/invite/1`. Voice-over [2].

### Adegan 3: Tenant menerima (video 0:55–1:20) · **ganti ke wallet C**
1. Tempel link invite di address bar, lalu Enter.
2. Tunjukkan quote: **$15.00/month, Tier B**, plus "Covered up to $2,000".
3. Klik **Approve 15.00 USDG**, lalu konfirmasi.
4. Klik **Accept and pay first fee**, lalu konfirmasi. **⏱ Catat jam ini = T.**
5. Sertifikat muncul dan segelnya ter-stamp. **Zoom ke sertifikat.** Voice-over [3].
6. (Opsional) Buka `/invest` dan zoom ke Premium income +$11.25 dan First-loss reserve $1.50.

### Adegan 4: Bulan ke-2 + reward (video 1:20–1:35)
1. **Wallet C** di `/tenant`: klik **Approve 15.00 USDG** (kalau diminta), lalu **Pay this month's fee**. Muncul toast "Fee paid".
2. **Ganti ke wallet A**, buka `/admin`: klik **Distribute rewards**, konfirmasi, lalu **Rebalance**, konfirmasi.
3. Buka `/invest`. **Zoom ke share price yang naik** dan "In tokenized T-bills". Voice-over [4].

### Di luar kamera: bayar sisa premi · **wallet C** (⏱ mulai paling lambat T+2 menit)
- Di `/tenant`, ulangi **Pay this month's fee** sampai bulan 12 lunas (10 kali lagi). Jangan ditunda: tiap bulan jatuh tempo per 1 menit dengan grace 1 menit, dan kalau lewat, policy-nya lapsed.
- Tunggu sampai **T+12 menit** (lease selesai). Sambil menunggu, siapkan foto check-out dan teks dispute.

**Caption di video:** "12 months later (12 minutes on testnet)"

### Adegan 5: Klaim (video 1:35–1:55) · **wallet B** (⏱ maksimal T+17 menit)
1. Buka `/landlord`, lalu klik policy "Unit 12B, Orchard".
2. Kalau tombol **End lease** muncul, klik dan konfirmasi.
3. Di **File a claim**:
   - Type of claim: Damage
   - Amount to claim: `300`
   - What was damaged?: `Scratched wall in the bedroom`
   - Check-out photos: upload 2 foto
4. Klik **File a claim**, lalu konfirmasi. Muncul toast "Claim filed". **⏱ Catat jam ini = K.**
5. Buka `/invest` (tanpa ganti wallet). **Zoom ke Pending claims −$300** dan share price yang turun. Voice-over [5].

### Adegan 6: Dispute + arbiter (video 1:55–2:25)
1. **Ganti ke wallet C** (⏱ maksimal K+3 menit), buka `/tenant`. Di kartu klaim, klik **Dispute claim**, isi "Why do you disagree?" dengan teks yang sudah disiapkan, lalu konfirmasi. Muncul toast "Claim disputed".
2. **Ganti ke wallet A** (⏱ maksimal 5 menit setelah dispute), buka `/arbiter`. Tunjukkan foto check-in vs check-out dan catatan tenant.
3. Isi **Reason for your decision**. Klik **Approve partial amount**, isi **Amount to approve** `200`, lalu klik **Approve partial amount** lagi.
4. Di dialog, klik **Approve 200.00 USDG**, lalu konfirmasi. Muncul toast "Claim approved: $200.00 paid to the landlord."
5. **Zoom ke toast** dan status "Partially approved". Voice-over [6].

### Adegan 7: Tenant mencicil (video 2:25–2:40) · **ganti ke wallet C**
1. Buka `/tenant`, bagian **Repayments**. Tunjukkan Amount owed $200 dan jadwal 6 cicilan.
2. Di "Or repay another amount", ketik `70`. Klik approve lalu repay, dan konfirmasi. Muncul toast "Repaid".
3. Buka `/invest`. **Zoom ke Recoveries +$70.** Voice-over [7].

### Adegan 8: Bukti + penutup (video 2:40–3:00)
1. Klik link transaksi atau address di website, lalu buka di Blockscout. Tunjukkan status **Success** dan kontrak **verified**.
2. Scroll ke footer website dan tunjukkan daftar address **Arbitrum Sepolia** dan **Robinhood Chain testnet**.
3. Tutup di hero landing atau logo. Voice-over [8].

**Batas waktu kontrak:**

| Aksi | Batas |
|---|---|
| Bayar premi berikutnya | Jatuh tempo +1 menit grace (bayar langsung semua setelah accept) |
| Landlord klaim | 5 menit setelah lease selesai (T+12 → T+17) |
| Tenant dispute | **3 menit** setelah klaim (lewat = klaim bisa diterima otomatis) |
| Arbiter memutuskan | 5 menit setelah dispute |

---

## 5. Script voice-over

**[0] Landing**
> Before you move in, your landlord asks for a deposit: a month of rent or more, locked up for the whole lease. SafeDeposit Zero replaces it with a guarantee. Two thousand dollars upfront becomes fifteen dollars a month.

**[1] Investor deposit**
> It starts with the pool. An investor deposits USDG into an ERC-4626 vault on Arbitrum and receives sdUSDG shares. Everything here is read live from the contract: the reserve, the first-loss buffer, and the share price.

**[2] Landlord invite**
> The landlord creates an invite for a two-thousand-dollar deposit and uploads check-in photos. The photos go to IPFS, and their fingerprint is stored on-chain, so nobody can swap them later.

**[3] Tenant accepts**
> The tenant opens the link. They're new to SafeDeposit, so they pay the standard rate: fifteen dollars. One transaction later the landlord holds a guarantee certificate. Of the fee, seventy-five percent goes to the pool, ten to the first-loss reserve, and fifteen to the treasury.

**[4] Month two + rewards**
> On testnet one minute is one month. The tenant pays month two. USDG partner rewards flow into the pool, and the share price ticks up.

**[5] Claim**
> The lease ends. The landlord finds a damaged wall and claims three hundred dollars with photos. Investors see it right away: the pending claim already counts against the share price, so nobody can withdraw ahead of a loss.

**[6] Dispute + arbiter**
> The tenant disputes it. A neutral arbiter compares the check-in and check-out photos and approves two hundred. The pool pays the landlord instantly. The tenant now owes the pool two hundred dollars, in six installments. Damage is still the tenant's responsibility. They just don't need the cash on day one.

**[7] Repayment**
> The tenant repays seventy dollars, and the money goes straight back to the pool.

**[8] Proof + close**
> Every step was a real transaction, verifiable on Blockscout. SafeDeposit Zero is live on Arbitrum Sepolia and Robinhood Chain. Yield from rent, not emissions. Move in without a big deposit.

---

## 6. Tips editing

- Potong semua waktu tunggu konfirmasi Rabby dan blok. Cukup tampilkan klik "Confirm" lalu langsung hasilnya.
- Pasang caption peran di pojok sepanjang adegan: **Investor (A)**, **Landlord (B)**, **Tenant (C)**, **Arbiter (A)**.
- Zoom (crop) ke angka penting: $15.00, sertifikat, share price, Pending claims −$300, "$200.00 paid to the landlord", Recoveries +$70.
- Rekam voice-over terpisah setelah video dipotong, supaya tempo bicara pas.
- **Lakukan gladi bersih dulu tanpa merekam.** Setelah lancar, ulangi dengan invite baru untuk rekaman final. Invite baru akan bernomor `/invite/2`, dan itu tidak masalah.
