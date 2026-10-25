# We POS — Kasir Restoran (Astro + Dexie Cloud + PWA)

Aplikasi kasir restoran/kafe yang sederhana: **ketuk menu → kirim ke dapur → bayar**.
Jalan di HP, tablet, dan laptop; bisa offline; data tersinkron antar perangkat lewat **Dexie Cloud**.

## Isi
| Alamat | Isi |
|---|---|
| `/` | Landing page |
| `/panduan/` | Manual book (dengan pencarian & daftar isi) |
| `/app/` | Kasir (POS) |
| `/app/meja/` | Denah meja |
| `/app/pesanan/` | Riwayat & detail pesanan, pembatalan |
| `/app/dapur/` | Layar Dapur (KDS) — tiket, timer, bunyi, Dapur/Bar |
| `/app/antrian/` | Layar Antrian untuk TV (sedang disiapkan / silakan ambil) |
| `/app/reservasi/` | Reservasi tamu |
| `/app/menu/` | Menu, kategori, status habis |
| `/app/laporan/` | Laporan penjualan, menu terlaris, pengeluaran |
| `/app/tutup-kasir/` | Tutup kasir & selisih uang laci |
| `/app/lainnya/`, `tim/`, `pengaturan/`, `ekspor/` | Pengelolaan |

`/app/?daftar` membuka form daftar, `/app/?hubungkan` membuka form hubungkan perangkat (mode cloud).

## Cara cepat menjalankan
```bash
bash jalankan.sh          # cek Node.js, install dependency, jalankan di http://localhost:4321
bash jalankan.sh build    # versi produksi (PWA/offline)
```
Tanpa `PUBLIC_DEXIE_CLOUD_URL` / `dexie-cloud.json` aplikasi berjalan dalam **mode lokal** (data hanya di perangkat).
Paksa mode lokal: `PUBLIC_DEXIE_CLOUD_URL=local npm run dev`.

## Database online (Dexie Cloud)
> **Disarankan memakai database Dexie Cloud baru untuk We POS** (bukan database laundry lama), agar data tidak tercampur.
```bash
mv dexie-cloud.json dexie-cloud.laundry.json   # simpan konfigurasi lama (opsional)
bash setup-cloud.sh                            # buat database baru + whitelist + isi .env
bash setup-cloud.sh https://alamat-produksi.vercel.app
```
Aplikasi tetap mengabaikan realm milik aplikasi lain bila database dipakai bersama.

## Pesan mandiri (QR meja) & menu cetak
- **Menu → Cetak menu meja**: cetak per meja dari data menu terbaru (menu habis tidak dicetak).
  Isi: *QR saja* (kartu 1/2/4/6 per A4), *QR + menu* (QR besar di atas menu), *Menu + lembar pesanan* (pelanggan centang & isi jumlah, serahkan ke kasir), *Menu saja*.
  Gaya menu: Klasik, Modern, Minimalis, Kafe (warna mengikuti warna toko). Kertas A4/A5.
- **QR pesan dari HP** (mode online): pelanggan scan QR → `/pesan/?r=<realm>&t=<meja>&k=<kunci>` → pilih menu → kirim.
  Pesanan masuk ke **Kasir & Dapur** (langsung, atau menunggu tombol *Terima* bila memilih "Konfirmasi kasir dulu").
  Tambahan pesanan dari meja yang sama digabung ke tagihan meja yang masih terbuka. Pelanggan melihat status (dimasak/siap/diantar).
- Aktifkan di **Pengaturan → Pesan mandiri (QR meja)** dan isi *Alamat web publik* (mis. `https://we-pos.vercel.app`).
  *Buat ulang kode QR* membatalkan semua QR lama.

## QRIS dinamis (nominal otomatis)
- **Pengaturan → Struk & pembayaran → Unggah QRIS**: gambar dibaca dengan `jsqr`, isi QRIS divalidasi (CRC16) lalu disimpan sebagai `qrisPayload`
  (bisa juga ditempel manual). Nama merchant, kota & NMID ditampilkan untuk dicocokkan.
- Saat bayar QRIS (dan di *Cetak tagihan* meja terbuka), `src/lib/qris.ts` → `toDynamic(payload, total)`: tag 01 → `12`, sisipkan tag 54 (nominal),
  hitung ulang CRC16-CCITT (tag 63). Logika mengikuti [razisek/Qris-Dinamis](https://github.com/razisek/Qris-Dinamis) (MIT).
- Tidak ada callback pembayaran: kasir tetap mengecek dana masuk di aplikasi merchant sebelum *Konfirmasi Bayar*.

### Server QR (Vercel Functions di folder `api/`)
HP pelanggan tidak login, jadi pesanan dikirim lewat fungsi server kecil yang memakai kunci Dexie Cloud.
Isi **Environment Variables** di Vercel → Settings:
```
DEXIE_CLOUD_DB_URL=https://xxxxxxxx.dexie.cloud        # sama dengan dexie-cloud.json
DEXIE_CLOUD_CLIENT_ID=...                              # dari file dexie-cloud.key
DEXIE_CLOUD_CLIENT_SECRET=...                          # dari file dexie-cloud.key (RAHASIA)
```
Lalu redeploy. Endpoint: `GET /api/menu`, `POST /api/order`, `GET /api/status`. Harga & nama selalu diambil dari database,
menu habis ditolak, ada batas jumlah permintaan per IP, dan kunci QR wajib cocok.
Uji lokal: isi ketiga variabel di file `.env`, lalu `npm run dev -- --host`. Saat dev, `astro.config.mjs` ikut menjalankan folder `api/`
(plugin `wepos-dev-api`). Di Pengaturan › Pesan mandiri isi *Alamat web publik* dengan IP laptop, mis. `http://192.168.1.10:4321`,
lalu scan QR dari HP di Wi-Fi yang sama. (`npx vercel dev` juga bisa.)

## Model akses
- **Perangkat** dihubungkan sekali oleh pemilik (email + kode OTP Dexie Cloud). Hanya akun pemilik yang terhitung pengguna Dexie Cloud.
- **Staf** masuk dengan *ketuk nama + PIN 4–6 angka* (tabel `staff`, PIN di-hash PBKDF2/SHA-256 iteratif).
- **Peran**: Pemilik, Manajer (admin), Kasir, Pelayan (tanpa bayar), Dapur (hanya layar dapur & antrian).
- Pembatalan item yang sudah di dapur & pembatalan transaksi meminta **PIN Manajer**.
- Lupa PIN pemilik → **kode pemulihan** (tampil saat daftar; bisa dibuat ulang di Tim & PIN).

## Alur data pesanan
`orders.lines[].status`: `new` (belum dikirim) → `cook` (di dapur) → `ready` (siap diantar) → `served` | `void`.
Setiap kiriman ke dapur menambah `round` sehingga tambahan pesanan tampil sebagai tiket baru.
`orders.status`: `open` (tagihan terbuka) → `paid` | `void`. Meja dianggap terisi bila ada pesanan `open` di meja itu.
Bila *Pakai layar dapur* dimatikan, item langsung `served`.

## Struktur
```
src/
  layouts/AppLayout.astro    kerangka aplikasi (rail kiri di layar lebar, nav bawah di HP)
  layouts/SiteLayout.astro   kerangka landing & panduan
  pages/index.astro          landing page
  pages/panduan.astro        manual book
  pages/app/*.astro          halaman aplikasi
  scripts/main.ts            titik masuk
  scripts/core.ts            konstanta, state, util, ikon, sheet/dialog/toast, helper DB
  scripts/auth.ts            daftar restoran, hubungkan perangkat, layar kunci & PIN, liveQuery
  scripts/shell.ts           navigasi, header, router, notifikasi "siap diantar"
  scripts/pos.ts             kasir, keranjang, pembayaran, struk
  scripts/tables.ts          meja & pesanan
  scripts/kitchen.ts         layar dapur, layar antrian, reservasi
  scripts/menu.ts            menu & kategori
  scripts/report.ts          laporan, pengeluaran, tutup kasir
  scripts/admin.ts           lainnya, tim, pengaturan, ekspor, backup, data contoh
  lib/db.ts                  skema Dexie (+ Dexie Cloud)
  lib/auth.ts                hash PIN
  lib/charts.ts              grafik SVG ringan
  lib/export.ts              penulis XLSX/CSV mini
public/img/                  screenshot untuk landing & panduan
scripts/build-sw.mjs         membuat service worker (offline) setelah build
_arsip-laundry/              salinan kode aplikasi laundry sebelumnya
```

## Deploy
Upload `dist/` ke hosting statis (Vercel/Netlify/Cloudflare Pages). `vercel.json` sudah mengatur build & header service worker.
Jangan commit `dexie-cloud.key`.

## Catatan
- Gambar lama laundry di `public/` (`guide-*.webp`, `landing-*.webp`) dan `src/scripts/app.ts` tidak dipakai lagi — boleh dihapus.
- `src/components/Umami.astro` masih memakai `data-domains="fara-wash.vercel.app"`; ubah ke domain We POS bila memakai Umami.
