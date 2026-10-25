# Fara Wash v2 — Kasir Laundry (Astro + Dexie Cloud + PWA)

Aplikasi kasir laundry untuk HP. Login dengan email (kode OTP, tanpa password), data tersinkron
antar perangkat lewat **Dexie Cloud**, tetap bisa dipakai **offline**, dan bisa di-install sebagai **PWA**.

## ⚡ Cara cepat menjalankan
Buka terminal di folder ini, lalu:
```bash
bash jalankan.sh          # cek Node.js, install dependency, jalankan di http://localhost:4321
```
Aplikasi langsung jalan dalam **mode lokal**. Untuk mengaktifkan login & sinkron (cukup sekali):
```bash
bash setup-cloud.sh       # buat database Dexie Cloud + whitelist + isi .env otomatis
bash jalankan.sh
```
Coba versi produksi (dengan PWA/offline): `bash jalankan.sh build`.
HP di Wi-Fi yang sama bisa membuka `http://IP-komputer:4321` (alamatnya ditampilkan saat skrip jalan).

## Deploy ke Vercel + database online
1. Sekali saja, izinkan domain Vercel mengakses database:
   ```bash
   bash setup-cloud.sh https://fara-wash.vercel.app
   ```
2. Pastikan `dexie-cloud.json` (berisi URL database, bukan rahasia) ikut di-commit, lalu `git push`.
   Saat build, aplikasi membaca URL dari file ini — tidak perlu `.env` di Vercel.
   Vercel otomatis build ulang (`vercel.json` sudah mengatur build & header service worker).
3. Buka https://fara-wash.vercel.app/app/ → **Daftar Laundry** memakai email → masukkan kode OTP.

Catatan:
- `dexie-cloud.key` adalah rahasia — jangan di-commit (sudah ada di `.gitignore`).
- Alamat *preview* Vercel (mis. `fara-wash-git-xxx.vercel.app`) perlu di-whitelist juga bila ingin dipakai.
- Alternatif: isi Environment Variable `PUBLIC_DEXIE_CLOUD_URL` di Vercel → Settings (prioritas lebih tinggi), lalu redeploy. Isi `local` untuk memaksa mode lokal.
- Kelola pengguna & kuota di https://manager.dexie.cloud (paket gratis: 3 pengguna produksi).

## Landing page
- `/` → landing page (perkenalan produk, fitur, cara kerja, tampilan, FAQ) dengan tombol **Daftar Laundry** & **Masuk**.
- `/app/` → aplikasi kasir. `/app/?daftar` membuka form daftar, `/app/?masuk` membuka form masuk.
- PWA yang sudah di-install langsung membuka `/app/`. Alamat lama (`/kasir/`, `/order/`, …) dialihkan otomatis ke `/app/...`.
- Gambar tampilan di landing: `public/landing-*.webp` (ganti dengan screenshot Anda sendiri bila perlu).

## Fitur
- **Login & sinkron** — Dexie Cloud (OTP email). Data tersimpan di IndexedDB HP, sinkron otomatis saat online.
- **Outlet & tim** — pemilik membuat outlet, lalu mengundang anggota lewat email.
  - **Pemilik / Admin**: akses penuh.
  - **Kasir**: buat order, tambah/edit pelanggan, ubah status, terima pembayaran.
    Tidak bisa membuka Keuangan, Pengaturan, Tim, dan tidak bisa menghapus data
    (dibatasi juga di server lewat role Dexie Cloud).
- Kasir (kiloan/satuan, express, diskon, DP/lunas, Tunai/Transfer/QRIS), status cucian, nota WA/cetak,
  pelanggan, layanan & harga, keuangan (laba, pengeluaran, piutang, export CSV), branding (nama, logo, warna).
- Setiap order/pembayaran/status mencatat siapa yang melakukannya.

## Masuk, akun & reset password
Semua orang masuk dengan **nama laundry + username + password**.

- **Daftar Laundry** (pemilik): nama laundry, nama, username, password (+ email pemilik di mode online → verifikasi kode OTP).
- **Tim & Akses** (pemilik/admin): buat akun kasir/admin (username + password, tanpa email), **reset password**, nonaktifkan, atau hapus. Akun dinonaktifkan/dihapus otomatis keluar.
- **Mode online (Dexie Cloud)**: HP kasir **diaktifkan pemilik sekali** (email pemilik + kode OTP). Setelah itu kasir masuk dengan username & password; satu HP bisa dipakai bergantian. Pemilik bisa *Putuskan HP ini* di Lainnya.
  Akun disimpan di tabel `staff` (tersinkron); hanya akun pemilik yang terhitung pengguna Dexie Cloud. Pembatasan akses kasir berlaku di aplikasi.
- **Lupa password pemilik**: layar Masuk → *Lupa password pemilik?*
  - Online: verifikasi kode OTP ke email pemilik, lalu password baru berlaku.
  - Lokal: pakai **kode pemulihan** yang ditampilkan saat daftar (bisa dibuat ulang di *Akun Saya*).
- Password tidak disimpan polos (PBKDF2-SHA256 / SHA-256 iteratif).

## Panduan penggunaan
Halaman `/panduan/` berisi langkah lengkap semua fitur (dengan pencarian & daftar isi). Gambar: `public/guide-*.webp`.

## Export data (Excel / CSV / Google Sheets)
Menu **Lainnya → Export Data** (khusus Pemilik/Admin), atau tombol export di halaman Keuangan.
- Pilih periode (hari ini, 7 hari, bulan ini, bulan lalu, tahun ini, semua, atau tanggal bebas).
- Pilih data: Order, Rincian Layanan, Pembayaran, Pengeluaran, Ringkasan Harian, Piutang, Pelanggan, Layanan & Harga.
- **Excel (.xlsx)**: satu file, tiap data jadi sheet (format Rupiah & tanggal, filter, header terkunci). Bisa diimpor ke Google Sheets.
- **CSV**: satu file per data (UTF-8); bila memilih lebih dari satu data, dikumpulkan dalam .zip.
- **Google Sheets**: tombol *Salin* menyalin data, lalu tempel langsung di sheets.new.

## Struktur
```
src/
  layouts/AppLayout.astro   kerangka halaman (header, bottom nav, sheet)
  pages/index.astro         landing page
  pages/panduan.astro       panduan penggunaan
  pages/app/*.astro         aplikasi: /app/ order/ kasir/ pelanggan/ lainnya/ layanan/ keuangan/ pengaturan/ tim/ ekspor/
  pages/<lama>.astro        pengalihan alamat lama ke /app/
  scripts/app.ts            logika aplikasi (auth, data, semua tampilan)
  lib/db.ts                 skema Dexie + konfigurasi Dexie Cloud
  styles/global.css
public/                     manifest.webmanifest, ikon
scripts/build-sw.mjs        membuat service worker (offline) setelah build
```

## 1. Instal
Butuh Node.js 22.12 atau lebih baru.
```bash
npm install
```

## 2. Buat database Dexie Cloud (sekali saja)
```bash
npx dexie-cloud create
```
Masukkan email Anda, lalu kode OTP yang dikirim. Perintah ini membuat `dexie-cloud.json`
(berisi URL database) dan `dexie-cloud.key` (rahasia, **jangan di-commit**; sudah ada di .gitignore).

Izinkan alamat aplikasi mengakses database:
```bash
npx dexie-cloud whitelist http://localhost:4321          # untuk development
npx dexie-cloud whitelist https://nama-app-anda.netlify.app   # alamat produksi
```

Salin `.env.example` menjadi `.env`, lalu isi URL dari `dexie-cloud.json`:
```
PUBLIC_DEXIE_CLOUD_URL=https://xxxxxxxx.dexie.cloud
```

> Tanpa `.env` aplikasi berjalan dalam **mode lokal** (tanpa login & sinkron). Mode ini cocok untuk mencoba tampilan.

## 3. Jalankan
```bash
npm run dev       # http://localhost:4321
npm run build     # hasil di folder dist/ (+ dist/sw.js)
npm run preview   # coba hasil build
```

## 4. Deploy (HTTPS wajib untuk PWA)
Upload folder `dist/` ke hosting statis (Netlify, Vercel, Cloudflare Pages, GitHub Pages).
Jangan lupa `npx dexie-cloud whitelist <url-produksi>`.
Jika di-deploy di sub-folder, isi `base` di `astro.config.mjs` (mis. `'/fara-wash/'`).

## Alur pemakaian
1. **Pemilik** membuka aplikasi, login dengan email, lalu memilih **Buat Outlet Baru**
   dan mengisi nama/logo/warna laundry.
2. Di **Lainnya → Tim & Akses → Undang**, pemilik memasukkan email kasir dan memilih peran (Kasir/Admin).
3. **Kasir** membuka aplikasi yang sama, lalu login dengan email yang diundang.
   Undangan muncul dan cukup ditekan **Terima**.
4. Semua perangkat melihat data yang sama. Saat offline, data disimpan di HP dan disinkron ketika online lagi.

## Paket Dexie Cloud
Gratis untuk 3 pengguna produksi dan 100 MB. Lebih dari itu pakai paket Pro (per pengguna/bulan).
Cek https://dexie.org/pricing.

## Pindah dari versi 1 (HTML tunggal)
Di versi lama, buka Pengaturan → **Backup Data**. Di versi baru, buka Pengaturan → **Impor dari Backup**.
Jika versi baru dibuka di alamat (domain) yang sama dengan versi lama, akan muncul tombol
**Impor data versi lama (v1)**.

## Catatan
- Setelah build, `sw.js` otomatis punya versi baru, jadi HP yang sudah install akan mengambil update.
- Kasir secara teknis tetap bisa *membaca* data keuangan lewat database (Dexie Cloud membatasi tulis, bukan baca, per role).
  Menu keuangan disembunyikan dari kasir.
