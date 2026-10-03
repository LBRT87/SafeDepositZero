# Checklist deploy SafeDeposit Zero (SPEC v3)

Centang `[x]` tiap langkah yang sudah selesai. Semua perintah di bawah **kamu jalankan sendiri**, karena butuh private key, faucet dan RPC. Detail per fungsi kontrak ada di [INTEGRATION.md](INTEGRATION.md).

Perintah ditulis untuk PowerShell dari folder project `D:\Project\SafeDepositZero`. Forge ada di `$HOME\.foundry\bin\forge.exe`. Biar singkat, jalankan sekali di awal:

```powershell
$env:Path = "$HOME\.foundry\bin;" + $env:Path
```

---

## A. Persiapan (sekali saja)

### Wallet dan dana
- [ ] Buat **wallet deployer** sebagai keystore Foundry (key tidak pernah ditulis ke file):
  ```powershell
  cast wallet import deployer --interactive
  ```
- [ ] Siapkan **5 wallet demo**: investor, landlord, tenant, tenant2 (untuk utang yang default), arbiter. Deployer boleh sekalian jadi arbiter dan admin.
- [ ] Isi **ETH testnet** ke semua wallet di Arbitrum Sepolia dan Robinhood Chain testnet (untuk gas).
- [ ] Pilih sumber USDG:
  - **Disarankan untuk demo: `USE_MOCK_USDG=true`.** MockUSDG bisa di-mint sendiri, dan cadangan yield simulasi (T-bill dan USDG rewards) langsung terisi otomatis.
  - **Atau USDG asli** dari faucet Paxos (https://faucet.paxos.com/). Investor butuh sekitar 5.000, tiap tenant sekitar 200, dan deployer sekitar 2.001 (1 untuk seed deposit, 1.000 untuk cadangan T-bill, 1.000 untuk cadangan rewards).

### Akun dan API
- [ ] **RPC URL** Arbitrum Sepolia dan Robinhood testnet (Alchemy, Infura, atau RPC publik).
- [ ] **API key Arbiscan/Etherscan** untuk verifikasi kontrak.
- [ ] **WalletConnect Project ID** di https://cloud.reown.com (hanya perlu kalau frontend dijalankan dalam mode onchain).
- [ ] **Pinata JWT** di https://app.pinata.cloud (opsional; tanpa ini foto bukti memakai CID tiruan).
- [ ] ⚠️ **Cek chain ID Robinhood Chain testnet.** Kode memakai `46630` sebagai default. Kalau berbeda, set `ROBINHOOD_CHAIN_ID` (kontrak) dan `NEXT_PUBLIC_ROBINHOOD_TESTNET_CHAIN_ID` (frontend).

### File env
- [ ] Salin `.env.example` ke `contracts/.env`, lalu isi `ARBITRUM_SEPOLIA_RPC_URL`, `ROBINHOOD_TESTNET_RPC_URL`, `ARBITER_ADDRESS`, `TREASURY_ADDRESS`, dan `USE_MOCK_USDG`.
- [ ] Pastikan `.env` **tidak** ikut ter-commit (sudah ada di `.gitignore`).
- [ ] Sebelum deploy, pastikan semua tes hijau:
  ```powershell
  cd contracts
  forge test
  ```
  Hasil terakhir: **181 tes lolos**, line coverage kontrak inti 99%.

---

## B. Deploy ke Arbitrum Sepolia (chain utama)

### B1. (Opsional) Stylus PremiumCalculator
Lewati kalau mau cepat: tanpa `STYLUS_CALCULATOR`, deploy script memasang `PremiumCalculatorSol` dengan ABI dan rumus yang sama persis. Kalau mau pamer Stylus:
- [ ] Deploy lewat Docker (PC ini belum punya linker MSVC). Buat `stylus-key.txt` berisi private key deployer (satu baris), lalu **hapus setelah deploy**:
  ```powershell
  cd D:\Project\SafeDepositZero\stylus\premium-calculator
  docker run --rm -it -v "${PWD}:/work" -w /work -e CARGO_TARGET_DIR=/tmp/target rust:1-bookworm bash -c "cargo install cargo-stylus --locked && cargo stylus check --endpoint <RPC> && cargo stylus deploy --endpoint <RPC> --private-key-path /work/stylus-key.txt --constructor-args 6 --no-verify"
  Remove-Item stylus-key.txt
  ```
- [ ] Catat alamatnya sebagai `STYLUS_CALCULATOR`, lalu tes. Hasilnya harus `15000000` dan `180000000`:
  ```powershell
  cast call <STYLUS_CALCULATOR> "quote(uint256,uint32,uint8)(uint256,uint256)" 2000000000 12 1 --rpc-url $env:ARBITRUM_SEPOLIA_RPC_URL
  ```

### B2. Kontrak Solidity
- [ ] Deploy sekaligus verify:
  ```powershell
  cd D:\Project\SafeDepositZero\contracts
  $env:USE_MOCK_USDG="true"          # hapus baris ini kalau pakai USDG asli
  $env:STYLUS_CALCULATOR="<alamat B1>" # hapus baris ini kalau lewati B1
  forge script script/Deploy.s.sol:Deploy --rpc-url arbitrum_sepolia --account deployer --broadcast --verify --etherscan-api-key <ARBISCAN_KEY>
  ```
- [ ] **Catat semua alamat** yang dicetak: `usdg, premiumCalculator, tenantRegistry, guaranteePool, policyManager, claimManager, mockTBillVault, tbillAdapter, gdnDistributor`.
- [ ] **Jangan pakai `deployBlock` dari log.** Di chain Arbitrum (termasuk Robinhood), `block.number` di dalam kontrak adalah blok L1. Ambil blok L2 dari receipt pertama: `node -e "console.log(parseInt(require('./broadcast/Deploy.s.sol/<chainId>/run-latest.json').receipts[0].blockNumber,16))"`.
- [ ] Kalau verifikasi gagal karena `Too many requests`, kontraknya tetap ter-deploy. Cek status di explorer dulu, banyak yang sebenarnya sudah lolos. Sisanya bisa dikirim ulang tanpa wallet: `forge verify-contract <alamat> <path:Nama> --verifier blockscout --verifier-url <explorer>/api/ --constructor-args <hex>`.

Script ini sudah: memberi semua role (pool, policy manager, claim manager, registry writer, rewards, arbiter), memasang adapter T-bill, seed deposit 1 USDG, dan (dengan MockUSDG) mengisi cadangan T-bill dan rewards masing-masing 1.000 USDG. Waktu memakai profil **demo: 1 menit = 1 bulan**.

### B3. Cek hasil deploy
- [ ] Pool hidup. Hasilnya harus `1000000` (1 USDG):
  ```powershell
  cast call <POOL> "totalAssets()(uint256)" --rpc-url $env:ARBITRUM_SEPOLIA_RPC_URL
  ```
- [ ] Harga premi benar. Hasilnya harus `15000000` ($15/bulan untuk deposit $2.000, 12 bulan, tier B):
  ```powershell
  cast call <POLICY_MANAGER> "quote(uint256,uint32,uint8)(uint256,uint256)" 2000000000 12 1 --rpc-url $env:ARBITRUM_SEPOLIA_RPC_URL
  ```
- [ ] Pembagian premi benar. Hasilnya harus `11250000, 1500000, 2250000` (pool, first-loss, treasury):
  ```powershell
  cast call <POLICY_MANAGER> "splitPremium(uint256)(uint256,uint256,uint256)" 15000000 --rpc-url $env:ARBITRUM_SEPOLIA_RPC_URL
  ```
  Catatan: first-loss baru terisi setelah ada deposit investor (batasnya 5% dari aset pool). Kalau pool masih 1 USDG, angka kedua kecil. Itu normal.

### B4. ⚠️ Cadangan yield simulasi (hanya kalau pakai USDG asli)
`MockTBillVault` dan `MockGdnRewardsDistributor` membayar yield simulasi dari saldo cadangannya sendiri. Kalau kosong, yield tidak bertambah, dan penarikan dari vault bisa gagal saat pool membayar klaim.
- [ ] Dengan MockUSDG: sudah otomatis, lewati.
- [ ] Dengan USDG asli, isi keduanya:
  ```powershell
  cast send <USDG> "approve(address,uint256)" <MOCK_TBILL_VAULT> 1000000000 --account deployer --rpc-url $env:ARBITRUM_SEPOLIA_RPC_URL
  cast send <MOCK_TBILL_VAULT> "fundYieldReserve(uint256)" 1000000000 --account deployer --rpc-url $env:ARBITRUM_SEPOLIA_RPC_URL
  cast send <USDG> "approve(address,uint256)" <GDN_DISTRIBUTOR> 1000000000 --account deployer --rpc-url $env:ARBITRUM_SEPOLIA_RPC_URL
  cast send <GDN_DISTRIBUTOR> "fund(uint256)" 1000000000 --account deployer --rpc-url $env:ARBITRUM_SEPOLIA_RPC_URL
  ```

---

## C. Deploy ke Robinhood Chain testnet

- [ ] Set chain ID kalau bukan `46630`, lalu deploy (kalkulator Solidity dipakai otomatis):
  ```powershell
  Remove-Item Env:STYLUS_CALCULATOR -ErrorAction SilentlyContinue
  $env:ROBINHOOD_CHAIN_ID="<chain id asli>"
  $env:USE_MOCK_USDG="true"   # atau $env:USDG_ADDRESS="0x7E955252E15c84f5768B83c41a71F9eba181802F"
  forge script script/Deploy.s.sol:Deploy --rpc-url robinhood_testnet --account deployer --broadcast
  ```
- [ ] Catat semua alamatnya.
- [ ] Ulangi cek B3 dengan `--rpc-url $env:ROBINHOOD_TESTNET_RPC_URL`.
- [ ] Verify di explorer Robinhood kalau tersedia (`forge verify-contract … --verifier-url <api explorer>`).

---

## D. Hubungkan frontend

- [ ] Tempel semua alamat (B dan C) ke `frontend/config/contracts.ts`, termasuk `tenantRegistry`, `gdnDistributor` dan `deployBlock`. Set `usdgIsMock: true` kalau memakai MockUSDG. Footer website langsung menampilkan alamat ini.
- [ ] Pilih mode frontend:
  - **Mode mock (siap sekarang, paling aman untuk judging):** semua alur bisa diklik tanpa wallet, angkanya mengikuti aturan kontrak persis. Kontrak yang ter-deploy dan ter-verify jadi bukti on-chain, plus link explorer di README.
  - **Mode onchain:** `frontend/lib/data/onchain.ts` masih berupa stub yang menuliskan panggilan kontrak per method. Implementasinya plus tombol RainbowKit belum dikerjakan. **Minta Claude mengerjakannya** setelah alamat ada; panduannya di INTEGRATION.md bagian 2–3.
- [ ] Buat `frontend/.env.local`:
  ```
  NEXT_PUBLIC_DATA_SOURCE=mock          # ganti ke onchain setelah onchain.ts selesai
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
  PINATA_JWT=                           # opsional, server-only
  ```
- [ ] Tes lokal:
  ```powershell
  cd D:\Project\SafeDepositZero\frontend
  npm run build
  npm run start
  ```
- [ ] Deploy frontend ke Vercel (root directory `frontend`), isi env yang sama di dashboard Vercel. `PINATA_JWT` jangan diberi prefix `NEXT_PUBLIC_`.

---

## E. Seed data on-chain (tepat sebelum demo)

Profil demo memakai menit, jadi seed dijalankan dalam 3 fase. Isi dulu di `contracts/.env`: `USDG_ADDRESS`, `POOL_ADDRESS`, `POLICY_MANAGER_ADDRESS`, `CLAIM_MANAGER_ADDRESS`, `USE_MOCK_USDG`, dan private key `INVESTOR`, `LANDLORD`, `TENANT`, `TENANT2` (hanya lokal, jangan di-commit).

- [ ] **Fase 1:** deposit investor 5.000, invite, tenant menerima dan bayar di muka.
  ```powershell
  forge script script/Seed.s.sol:SeedPhase1 --rpc-url arbitrum_sepolia --broadcast
  ```
  Catat `SEED_HAPPY_POLICY_ID`, `SEED_DISPUTED_POLICY_ID`, `SEED_DEFAULT_POLICY_ID` lalu set sebagai env.
- [ ] Tunggu **6–10 menit**, lalu **Fase 2:** lease berakhir, satu klaim di-dispute, satu klaim diterima (calon default), dan satu lease baru.
  ```powershell
  forge script script/Seed.s.sol:SeedPhase2 --rpc-url arbitrum_sepolia --broadcast
  ```
  Catat `SEED_ENDED_POLICY_ID` dan `SEED_DEFAULT_CLAIM_ID`.
- [ ] Tunggu **6–10 menit**, lalu **Fase 3:** lease bersih ditutup (tenant jadi tier A), utang dijadikan default dan ditutup oleh first-loss, satu lease dalam claim window.
  ```powershell
  forge script script/Seed.s.sol:SeedPhase3 --rpc-url arbitrum_sepolia --broadcast
  ```
- [ ] Pindahkan dana idle ke T-bill dan bayarkan rewards:
  ```powershell
  cast send <POOL> "rebalance()" --account deployer --rpc-url $env:ARBITRUM_SEPOLIA_RPC_URL
  cast send <GDN_DISTRIBUTOR> "distributeRewards()" --account deployer --rpc-url $env:ARBITRUM_SEPOLIA_RPC_URL
  ```
- [ ] Ulangi untuk Robinhood testnet kalau mau datanya juga ada di sana (ganti `--rpc-url robinhood_testnet`).

---

## F. Uji alur demo (skrip 3 menit, SPEC §9)

Di mode mock semua langkah ini sudah dites otomatis dan lolos. Di website: halaman Tenant pakai wallet "Ayu" (punya riwayat), link invite pakai wallet "Dimas" (penyewa baru, tier B).

- [ ] **Investor** deposit 5.000 USDG. Aset pool, reserve dan first-loss terlihat.
- [ ] **Landlord** membuat invite: "Unit 12B, Orchard", sewa $2.000, deposit $2.000, 12 bulan, foto check-in.
- [ ] **Tenant baru** buka `/invite/<id>`, bayar $15 pertama, sertifikat ter-stamp. Ledger: pool +$11,25, first-loss +$1,50, treasury +$2,25.
- [ ] Sebulan kemudian (1 menit di demo) tenant bayar lagi. Di **Admin**, klik "Distribute rewards": share price naik.
- [ ] Lease selesai, landlord **file claim** $300 dengan foto. Di halaman Investor, "Pending claims" menurunkan share price.
- [ ] Tenant **dispute**, arbiter membandingkan foto lalu menyetujui $200 sebagian. Pool langsung bayar landlord; utang tenant $200 dalam 6 cicilan (tanpa dispute fee karena keputusannya sebagian).
- [ ] Tenant bayar $70: aset pool naik.
- [ ] Tunjukkan utang yang default (seed): first-loss reserve menutupnya, tenant diblokir. Tutup di halaman Investor.

---

## G. Submission

- [ ] Isi tabel alamat kontrak di `README.md` untuk kedua chain.
- [ ] Ganti link GitHub di `frontend/components/footer.tsx` dan README.
- [ ] Rekam video demo (maks 3 menit), tempel link-nya di README.
- [ ] `git init`, commit, push ke GitHub. Pastikan `.env`, `.env.local` dan `stylus-key.txt` tidak ikut.
- [ ] Isi form HackQuest. Teks siap pakai ada di `KONTEKS/docs/UI-BRIEF.md` bagian 9.4.
