/* We POS — Lainnya, Tim (staf + PIN), Pengaturan, Ekspor, Backup, Data contoh. */
import { db, isCloud } from '../lib/db';
import { hashPassword } from '../lib/auth';
import { toXLSX, toCSV, toTSV, zipCSV, type Dataset } from '../lib/export';
import {
  S, D, sess, VIEWS, reg, $, esc, IC, rp, today, dKey, fDT, BASE, ROLE_NAMES, ROLE_DESC, COLORS, AV_COLORS, DEFAULT_COLOR, applyTheme, luminance, METHODS, can, isMgr,
  openSheet, closeSheet, run, addRow, updRow, delRow, ask, toast, avatar, setg, shopName, slug, download, shrinkImage, liveLines, orderTitle,
  track, uid, EXP_CAT, pad,
} from './core';
const AR = '<svg class="ar" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
import { setHeader, go, applyBrand } from './shell';
import { presetRange, loadRange } from './report';
import { newSelfKey, selfUrl, qrSvg } from './selfmenu';
import { isQris, info as qrisInfo } from '../lib/qris';

/* ================= LAINNYA ================= */
let deferredPrompt: any = null;
window.addEventListener('beforeinstallprompt', (e: any) => { e.preventDefault(); deferredPrompt = e; });
VIEWS.more = () => {
  setHeader('Lainnya');
  const L = (k: string, ic: string, t: string, d: string, act = `App.go('${k}')`) => can(k) || k === '' ? `<button class="tile" onclick="${act}"><span class="tile-ic">${IC[ic]}</span><b>${t}</b><small>${d}</small></button>` : '';
  const g = (title: string, body: string) => body.trim() ? `<div class="sec-t">${title}</div><div class="tiles">${body}</div>` : '';
  $('#main').innerHTML = `<div class="wrap narrow">
   <div class="me-card">${avatar(sess.staff, 'lg')}<div><b>${esc(sess.name)}</b><small>${ROLE_NAMES[sess.role]} · ${esc(shopName())}</small></div><button class="btn sec sm" onclick="App.lockNow()">${IC.lock}Kunci</button></div>
   ${g('Operasional', L('reserve', 'cal', 'Reservasi', 'Catat & atur tamu') + L('queue', 'tv', 'Layar Antrian', 'Untuk TV / tablet pelanggan') + L('kitchen', 'chef', 'Layar Dapur', 'Tiket pesanan dapur & bar') + L('closing', 'cash', 'Tutup Kasir', 'Hitung uang akhir shift'))}
   ${g('Kelola', L('menu', 'food', 'Menu & Harga', 'Tambah menu, tandai habis') + L('tables', 'table', 'Meja', 'Atur nomor & area meja', `App.tableEditGo()`) + L('team', 'users', 'Tim & PIN', 'Kasir, pelayan, dapur') + L('settings', 'gear', 'Pengaturan', 'Nama, struk, pajak, QRIS'))}
   ${g('Data', L('report', 'chart', 'Laporan', 'Penjualan & laba') + L('export', 'download', 'Ekspor Excel', 'Excel, CSV, Google Sheets') + (isMgr() ? `<button class="tile" onclick="App.backupSheet()"><span class="tile-ic">${IC.upload}</span><b>Backup & Pulihkan</b><small>Simpan salinan data</small></button>` : ''))}
   <div class="sec-t">Bantuan</div><div class="tiles">
    <a class="tile" href="${BASE}panduan/" target="_blank"><span class="tile-ic">${IC.book}</span><b>Panduan</b><small>Cara pakai langkah demi langkah</small></a>
    <button class="tile" onclick="App.doInstall()"><span class="tile-ic">${IC.phone}</span><b>Pasang Aplikasi</b><small>Ikon di layar utama</small></button>
    <button class="tile" onclick="App.changeMyPin()"><span class="tile-ic">${IC.key}</span><b>Ganti PIN saya</b><small>${esc(sess.name)}</small></button>
   </div>
   <div class="danger-zone">${sess.role === 'owner' ? (isCloud ? `<button class="link" onclick="App.disconnect()">Putuskan perangkat ini</button>` : '') : ''}<button class="link" onclick="App.switchResto()">Ganti restoran</button></div>
   <p class="mut small center">We POS · ${isCloud ? 'Tersinkron Dexie Cloud' : 'Mode lokal (data di perangkat ini)'}</p></div>`;
};
function tableEditGo() { S.tableEdit = isMgr(); go('tables'); }
function doInstall() { if (!deferredPrompt) return toast(`Buka menu browser ${AR} “Tambahkan ke Layar Utama” / “Install app”`); deferredPrompt.prompt(); deferredPrompt.userChoice.finally(() => (deferredPrompt = null)); }

/* ================= TIM ================= */
VIEWS.team = () => {
  setHeader('Tim & PIN', `<button class="hb pri" onclick="App.staffForm('')">${IC.plus}<span>Staf</span></button>`);
  $('#main').innerHTML = `<div class="wrap narrow">
   <div class="alert info">Setiap staf masuk dengan <b>mengetuk namanya lalu PIN</b>. Peran menentukan halaman yang bisa dibuka.</div>
   <div class="list">${D.staff.map((s: any) => `<button class="li ${s.active ? '' : 'off'}" onclick="App.staffForm('${s.id}')">${avatar(s)}
     <div class="m"><b>${esc(s.name)}${s.id === sess.staff?.id ? ' <span class="mut">(Anda)</span>' : ''}</b><small>${ROLE_NAMES[s.role]} · ${s.active ? (s.lastLogin ? 'terakhir masuk ' + fDT(s.lastLogin) : 'belum pernah masuk') : 'nonaktif'}</small></div>${IC.chev}</button>`).join('')}</div>
   <div class="sec-t">Hak akses per peran</div>
   <div class="roles">${Object.keys(ROLE_NAMES).map((r) => `<div><b>${ROLE_NAMES[r]}</b><small>${ROLE_DESC[r]}</small></div>`).join('')}</div></div>`;
};
function staffForm(id: string) {
  const s = D.staff.find((x: any) => x.id === id) || { name: '', role: 'kasir', active: true };
  const owner = s.role === 'owner';
  S.sfRole = s.role;
  openSheet(`<h2>${id ? 'Ubah staf' : 'Tambah staf'}</h2>
   <label class="fl"><span>Nama</span><input id="sfN" value="${esc(s.name)}" placeholder="mis. Rina" autofocus></label>
   ${owner ? '<p class="mut small">Peran Pemilik tidak bisa diubah.</p>' : `<label class="fl"><span>Peran</span></label><div class="rolepick">${['admin', 'kasir', 'pelayan', 'dapur'].map((r) => `<button class="${s.role === r ? 'on' : ''}" onclick="App.sfRole(this,'${r}')"><b>${ROLE_NAMES[r]}</b><small>${ROLE_DESC[r]}</small></button>`).join('')}</div>`}
   <div class="row2"><label class="fl"><span>${id ? 'PIN baru (kosongkan bila tetap)' : 'PIN 4–6 angka'}</span><input id="sfP" type="password" inputmode="numeric" maxlength="6" placeholder="••••"></label>
    <label class="fl"><span>Ulangi PIN</span><input id="sfP2" type="password" inputmode="numeric" maxlength="6" placeholder="••••"></label></div>
   ${id && !owner && id !== sess.staff?.id ? `<label class="check"><input id="sfA" type="checkbox" ${s.active ? 'checked' : ''}><span>Aktif (bisa masuk)</span></label>` : ''}
   <div class="row2 mt">${id && !owner && id !== sess.staff?.id ? `<button class="btn ghost danger" onclick="App.delStaff('${id}')">${IC.trash}Hapus</button>` : '<span></span>'}<button class="btn" onclick="App.saveStaff('${id}')">Simpan</button></div>
   ${owner && sess.role === 'owner' ? `<button class="link blk mt" onclick="App.newRecovery()">${IC.key} Buat kode pemulihan baru</button>` : ''}`);
}
function sfRole(b: any, r: string) { S.sfRole = r; b.parentNode.querySelectorAll('button').forEach((x: any) => x.classList.toggle('on', x === b)); }
async function saveStaff(id: string) {
  const name = $('#sfN').value.trim(), p = $('#sfP').value, p2 = $('#sfP2').value;
  if (!name) return toast('Nama wajib diisi', 'err');
  if ((!id || p) && !/^\d{4,6}$/.test(p)) return toast('PIN harus 4–6 angka', 'err');
  if (p !== p2) return toast('Ulangi PIN tidak sama', 'err');
  const prev = D.staff.find((x: any) => x.id === id);
  const data: any = { name };
  if (prev?.role !== 'owner') data.role = S.sfRole;
  if (p) Object.assign(data, await hashPassword(p), { pinLen: p.length });
  const a = $('#sfA'); if (a) data.active = a.checked;
  closeSheet();
  if (id) await run(() => updRow('staff', id, data), 'Staf disimpan');
  else await run(() => addRow('staff', { ...data, active: true, color: AV_COLORS[D.staff.length % AV_COLORS.length], createdAt: new Date().toISOString() }), `${name} ditambahkan`);
}
async function delStaff(id: string) {
  if (!(await ask('Hapus staf ini?', 'Riwayat transaksinya tetap tersimpan.', 'Hapus', true))) return;
  closeSheet(); await run(() => delRow('staff', id), 'Staf dihapus');
}
function changeMyPin() {
  openSheet(`<h2>Ganti PIN saya</h2><div class="row2"><label class="fl"><span>PIN baru</span><input id="mpP" type="password" inputmode="numeric" maxlength="6" autofocus></label>
   <label class="fl"><span>Ulangi PIN</span><input id="mpP2" type="password" inputmode="numeric" maxlength="6"></label></div><button class="btn blk lg" onclick="App.saveMyPin()">Simpan PIN</button>`);
}
async function saveMyPin() {
  const p = $('#mpP').value; if (!/^\d{4,6}$/.test(p)) return toast('PIN harus 4–6 angka', 'err'); if (p !== $('#mpP2').value) return toast('Ulangi PIN tidak sama', 'err');
  const h = await hashPassword(p); closeSheet(); await run(() => updRow('staff', sess.staff.id, { ...h, pinLen: p.length }), 'PIN diganti');
}

/* ================= PENGATURAN ================= */
VIEWS.settings = () => {
  setHeader('Pengaturan');
  const s = setg(); S.brand = { logo: s.logo || '', qris: s.qris || '', qrisPayload: s.qrisPayload || '', color: s.color || DEFAULT_COLOR };
  $('#main').innerHTML = `<div class="wrap narrow"><form onsubmit="event.preventDefault();App.saveSettings()">
   <div class="ccard"><div class="ctitle"><b>Profil restoran</b><small>tampil di aplikasi & struk</small></div>
    <div class="logo-row"><button type="button" class="logo-pick" id="stLogo" onclick="document.getElementById('stLogoF').click()">${s.logo ? `<img src="${s.logo}" alt="">` : IC.store}</button>
     <div><button type="button" class="btn sm sec" onclick="document.getElementById('stLogoF').click()">${IC.upload}Ganti logo</button> ${s.logo ? `<button type="button" class="btn sm ghost" onclick="App.stImg('logo','')">Hapus</button>` : ''}<input id="stLogoF" type="file" accept="image/*" hidden onchange="App.stImgFile('logo',this.files[0])"></div></div>
    <label class="fl"><span>Nama restoran</span><input id="stN" value="${esc(s.name)}" required></label>
    <div class="row2"><label class="fl"><span>No. telepon / WA</span><input id="stP" value="${esc(s.phone)}" type="tel"></label><label class="fl"><span>Kode pesanan</span><input id="stX" value="${esc(s.prefix)}" maxlength="5"></label></div>
    <label class="fl"><span>Alamat</span><input id="stA" value="${esc(s.address)}"></label>
    </div>
   <div class="ccard"><div class="ctitle"><b>Warna toko</b><small>Satu warna ${AR} tombol, menu aktif, meja terisi & badge ikut berubah. Langsung terlihat, simpan untuk semua perangkat.</small></div>
    <div class="theme-pick" id="stColors">${COLORS.map(([c, n]) => `<button type="button" title="${n}" aria-label="${n}" class="${c.toLowerCase() === S.brand.color.toLowerCase() ? 'on' : ''}" style="--c:${c}" onclick="App.stColor('${c}')"></button>`).join('')}
     <label class="custom" title="Warna sendiri"><input type="color" id="stCustom" value="${S.brand.color}" oninput="App.stColor(this.value)">Warna sendiri</label></div>
    <div class="theme-prev" aria-hidden="true"><div class="tp-side"><i class="on"></i><i></i><i></i><i></i></div>
     <div class="tp-main"><div class="tp-row"><span class="tp-chip on">Semua</span><span class="tp-chip">Makanan</span><span class="tp-chip">Minuman</span><span class="tp-badge">Siap</span></div>
      <div class="tp-row"><span class="tp-btn">Bayar Rp 45.000</span><span class="tp-btn2">Kirim ke Dapur</span></div></div></div>
    <div class="contrast-note" id="stNote"></div></div>
   <div class="ccard"><div class="ctitle"><b>Pajak & service</b><small>dihitung otomatis di kasir (0 = tidak dipakai)</small></div>
    <div class="row2"><label class="fl"><span>Service charge (%)</span><input id="stSv" type="number" step="0.5" min="0" value="${s.servicePct || 0}"></label><label class="fl"><span>Pajak / PB1 (%)</span><input id="stTx" type="number" step="0.5" min="0" value="${s.taxPct || 0}"></label></div></div>
   <div class="ccard"><div class="ctitle"><b>Dapur</b></div>
    <label class="check"><input id="stK" type="checkbox" ${s.kds !== false ? 'checked' : ''}><span>Pakai layar dapur <small>Pesanan masuk ke tablet/HP dapur dan ditandai “siap” oleh koki. Matikan bila dapur cukup memakai struk/lisan.</small></span></label></div>
   <div class="ccard"><div class="ctitle"><b>Pesan mandiri (QR meja)</b><small>Pelanggan scan QR di meja ${AR} pilih menu di HP ${AR} pesanan masuk ke kasir & dapur.</small></div>
    ${isCloud ? `<label class="check"><input id="stQ" type="checkbox" ${s.selfOrder ? 'checked' : ''}><span>Aktifkan pesan lewat QR</span></label>
    <div class="seg" id="stQA">${[['1', 'Langsung ke dapur'], ['0', 'Konfirmasi kasir dulu']].map(([v, n]) => `<button type="button" class="${(s.selfAuto !== false ? '1' : '0') === v ? 'on' : ''}" data-v="${v}" onclick="App.segPick(this)">${n}</button>`).join('')}</div>
    <label class="fl"><span>Alamat web publik (untuk QR)</span><input id="stPU" value="${esc(s.publicUrl || (/localhost|127\.0\.0\.1|192\.168\./.test(location.host) ? '' : location.origin))}" placeholder="https://nama-aplikasi.vercel.app"><small>Alamat yang bisa dibuka dari HP pelanggan (bukan localhost). Server perlu kunci Dexie Cloud — lihat README.</small></label>
    ${s.selfOrder && s.selfKey && D.tables[0] ? `<div class="qr-test"><div class="qr-mini">${qrSvg(selfUrl(D.tables[0].id))}</div><div><b>Contoh QR · Meja ${esc(D.tables[0].name)}</b><small><a href="${selfUrl(D.tables[0].id)}" target="_blank">Buka halaman pesan</a> untuk mencoba.</small>
      <button type="button" class="btn sm ghost mt" onclick="App.rotateSelfKey()">${IC.refresh || IC.key}Buat ulang kode QR</button></div></div>` : ''}
    <p class="mut small">Cetak QR & lembar pesanan di <b>Menu ${AR} Cetak menu meja</b>.</p>`
    : `<div class="alert info"><b>Tersedia mulai paket Pro.</b> Paket Gratis menyimpan data hanya di perangkat ini (database lokal), sehingga HP pelanggan tidak bisa mengirim pesanan ke sini. Upgrade ke Pro agar data tersinkron online dan QR meja bisa dipakai. Lembar pesanan kertas tetap bisa dicetak di <b>Menu ${AR} Cetak menu meja</b>.</div>`}</div>
   <div class="ccard"><div class="ctitle"><b>Struk & pembayaran</b></div>
    <label class="fl"><span>Lebar kertas printer</span></label><div class="seg" id="stPaper">${['58', '80'].map((w) => `<button type="button" class="${(s.paper || '58') === w ? 'on' : ''}" onclick="App.segPick(this)" data-v="${w}">${w} mm</button>`).join('')}</div>
    <label class="fl mt"><span>Catatan kaki struk</span><input id="stF" value="${esc(s.footer)}"></label>
    <label class="fl"><span>Gambar QRIS (ditampilkan saat bayar QRIS)</span></label>
    <div class="logo-row"><button type="button" class="logo-pick sq" id="stQris" onclick="document.getElementById('stQrisF').click()">${s.qris ? `<img src="${s.qris}" alt="">` : IC.phone}</button>
     <div><button type="button" class="btn sm sec" onclick="document.getElementById('stQrisF').click()">${IC.upload}Unggah QRIS</button> ${s.qris ? `<button type="button" class="btn sm ghost" onclick="App.stImg('qris','')">Hapus</button>` : ''}<input id="stQrisF" type="file" accept="image/*" hidden onchange="App.stImgFile('qris',this.files[0])"></div></div>
    <div id="stQrisInfo">${qrisBox()}</div>
    <label class="check"><input id="stQD" type="checkbox" ${s.qrisDynamic !== false ? 'checked' : ''}><span>QRIS dinamis (nominal otomatis) <small>Saat bayar QRIS, kasir menampilkan QR dengan nominal tagihan sudah terisi ${AR} pelanggan tidak perlu mengetik jumlah. Tetap cek notifikasi dana masuk sebelum konfirmasi.</small></span></label>
    <details class="mt"><summary class="small mut">Gambar tidak terbaca? Tempel kode QRIS manual</summary>
     <label class="fl"><span>Isi kode QRIS (diawali 000201…)</span><textarea id="stQP" rows="3" placeholder="00020101021126…6304XXXX" oninput="App.stQrisText(this.value)">${esc(s.qrisPayload || '')}</textarea><small>Bisa didapat dari aplikasi pemindai QR di HP: scan QRIS toko lalu salin teksnya.</small></label></details></div>
   <button class="btn blk xl" type="submit">Simpan pengaturan</button></form>
   <div class="sec-t">Data</div><div class="tiles">
    <button class="tile" onclick="App.backupSheet()"><span class="tile-ic">${IC.upload}</span><b>Backup & Pulihkan</b><small>File JSON</small></button>
    <button class="tile" onclick="App.seedDemo()"><span class="tile-ic">${IC.chart}</span><b>Isi transaksi contoh</b><small>Untuk mencoba laporan</small></button></div></div>`;
  stColor(S.brand.color);
};
function stColor(c: string) {
  S.brand.color = applyTheme(c);
  document.querySelectorAll('#stColors button').forEach((x: any) => x.classList.toggle('on', x.style.getPropertyValue('--c').toLowerCase() === S.brand.color.toLowerCase()));
  const ci = $('#stCustom'); if (ci && ci.value !== S.brand.color) ci.value = S.brand.color;
  const L = luminance(S.brand.color), n = $('#stNote');
  if (n) n.textContent = 1.05 / (L + 0.05) < 3 ? 'Warna terang: teks di atas tombol otomatis memakai warna gelap agar tetap terbaca.' : L < 0.03 ? 'Warna sangat gelap: tetap terbaca, tetapi tombol & menu aktif akan tampak kurang menonjol.' : '';
}
async function stImgFile(k: string, f: File) {
  try {
    if (k === 'qris' && f) {
      const raw = await readQrisImage(f); S.brand.qrisPayload = raw || '';
      const ta = $('#stQP'); if (ta) ta.value = S.brand.qrisPayload; qrisRefresh();
      if (!raw) toast('Gambar tersimpan, tetapi kode QRIS tidak terbaca. Pakai foto yang lebih jelas atau tempel kodenya manual.', 'err');
    }
    stImg(k, await shrinkImage(f, k === 'qris' ? 640 : 256));
  } catch (e: any) { toast(e.message, 'err'); }
}
/* Baca isi QR dari gambar QRIS (jsQR dimuat saat dibutuhkan). Coba beberapa ukuran agar foto besar/kecil tetap terbaca. */
async function readQrisImage(f: File): Promise<string> {
  const { default: jsQR } = await import('jsqr');
  const url = URL.createObjectURL(f);
  try {
    const img: HTMLImageElement = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('Gambar tidak bisa dibuka')); i.src = url; });
    for (const max of [1000, 1600, 600, img.naturalWidth]) {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!;
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      const r = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
      if (r?.data && isQris(r.data)) return r.data.trim();
    }
    return '';
  } finally { URL.revokeObjectURL(url); }
}
function qrisBox() {
  const v = S.brand.qrisPayload;
  if (!v) return S.brand.qris ? `<div class="alert warn small">Kode QRIS belum terbaca dari gambar ${AR} QRIS dinamis tidak tersedia, kasir menampilkan gambar statis.</div>` : '';
  if (!isQris(v)) return `<div class="alert warn small">Kode QRIS tidak valid (cek ulang, harus diawali 000201 dan diakhiri kode CRC).</div>`;
  const i = qrisInfo(v);
  return `<div class="qris-ok">${IC.check}<div><b>${esc(i.merchant || 'QRIS terbaca')}</b><small>${[i.city, i.nmid].filter(Boolean).map(esc).join(' · ')}${i.dynamic ? ' · kode ini sudah dinamis' : ''}</small></div></div>`;
}
function qrisRefresh() { const el = $('#stQrisInfo'); if (el) el.innerHTML = qrisBox(); }
function stQrisText(v: string) { S.brand.qrisPayload = v.replace(/\s+/g, ''); qrisRefresh(); }
function stImg(k: string, v: string) { S.brand[k] = v; if (k === 'qris' && !v) { S.brand.qrisPayload = ''; const ta = $('#stQP'); if (ta) ta.value = ''; qrisRefresh(); } const el = $(k === 'logo' ? '#stLogo' : '#stQris'); el.innerHTML = v ? `<img src="${v}" alt="">` : IC[k === 'logo' ? 'store' : 'phone']; }
function segPick(b: any) { b.parentNode.querySelectorAll('button').forEach((x: any) => x.classList.toggle('on', x === b)); }
async function saveSettings() {
  const name = $('#stN').value.trim(); if (!name) return toast('Nama restoran wajib diisi', 'err');
  if (S.brand.qrisPayload && !isQris(S.brand.qrisPayload)) return toast('Kode QRIS tidak valid — perbaiki atau kosongkan', 'err');
  const data = { name, phone: $('#stP').value.trim(), prefix: ($('#stX').value.trim() || 'WP').toUpperCase(), address: $('#stA').value.trim(), color: S.brand.color,
    logo: S.brand.logo, qris: S.brand.qris, qrisPayload: isQris(S.brand.qrisPayload) ? S.brand.qrisPayload : '', qrisDynamic: $('#stQD').checked, servicePct: Math.max(0, +$('#stSv').value || 0), taxPct: Math.max(0, +$('#stTx').value || 0),
    kds: $('#stK').checked, paper: ($('#stPaper .on')?.dataset.v || '58'), footer: $('#stF').value.trim() } as any;
  if ($('#stQ')) {
    data.selfOrder = $('#stQ').checked; data.selfAuto = ($('#stQA .on')?.dataset.v || '1') === '1';
    data.publicUrl = $('#stPU').value.trim().replace(/\/+$/, '');
    if (data.selfOrder && !D.settings.selfKey) data.selfKey = newSelfKey();
    if (data.selfOrder && data.publicUrl && !/^https?:\/\//.test(data.publicUrl)) return toast('Alamat web harus diawali https://', 'err');
  }
  await run(() => updRow('settings', D.settings.id, data), 'Pengaturan disimpan'); applyBrand(); VIEWS.settings();
}

/* ================= EKSPOR ================= */
const EXP_SETS = [
  { k: 'orders', n: 'Transaksi', d: 'Satu baris per pesanan: meja, total, metode bayar, kasir' },
  { k: 'items', n: 'Rincian Menu', d: 'Satu baris per item yang terjual' },
  { k: 'daily', n: 'Ringkasan Harian', d: 'Penjualan, transaksi, pengeluaran & laba per hari' },
  { k: 'expenses', n: 'Pengeluaran', d: 'Biaya operasional per kategori' },
  { k: 'closings', n: 'Tutup Kasir', d: 'Riwayat tutup kasir & selisih uang' },
  { k: 'menu', n: 'Daftar Menu', d: 'Menu, kategori, harga (semua)' },
];
const EX: any = { fmt: 'xlsx', sel: { orders: true, items: true, daily: true, expenses: true }, preset: 'bulan', data: null };
function buildSet(k: string, r: any, from: string, to: string): Dataset {
  const cat = (id: string) => D.categories.find((c: any) => c.id === id)?.name || '';
  const pays = (o: any) => [...new Set((o.payments || []).map((p: any) => p.method))].join(', ');
  const ord = [...r.orders].sort((a: any, b: any) => a.createdAt.localeCompare(b.createdAt));
  switch (k) {
    case 'orders': return { key: k, name: 'Transaksi', cols: [
      { h: 'Kode', t: 's', w: 18, v: (o: any) => o.code }, { h: 'No', t: 'n', w: 6, v: (o: any) => o.no }, { h: 'Waktu', t: 'dt', v: (o: any) => o.createdAt },
      { h: 'Tipe', t: 's', w: 14, v: (o: any) => orderTitle(o) }, { h: 'Tamu', t: 's', w: 16, v: (o: any) => o.guest },
      { h: 'Item', t: 's', w: 36, v: (o: any) => liveLines(o).map((l: any) => `${l.qty}x ${l.name}`).join(', ') },
      { h: 'Subtotal', t: 'n', v: (o: any) => o.subtotal }, { h: 'Diskon', t: 'n', v: (o: any) => o.discount || 0 }, { h: 'Service', t: 'n', v: (o: any) => o.service || 0 },
      { h: 'Pajak', t: 'n', v: (o: any) => o.tax || 0 }, { h: 'Total', t: 'n', v: (o: any) => o.total },
      { h: 'Status', t: 's', w: 12, v: (o: any) => ({ open: 'Belum bayar', paid: 'Lunas', void: 'Batal' } as any)[o.status] },
      { h: 'Metode', t: 's', w: 12, v: pays }, { h: 'Kasir', t: 's', w: 14, v: (o: any) => o.payments?.at(-1)?.by || o.createdBy || '' }] as any, rows: ord };
    case 'items': return { key: k, name: 'Rincian Menu', cols: [
      { h: 'Kode', t: 's', w: 18, v: (x: any) => x.o.code }, { h: 'Waktu', t: 'dt', v: (x: any) => x.o.createdAt }, { h: 'Menu', t: 's', w: 26, v: (x: any) => x.l.name },
      { h: 'Kategori', t: 's', w: 14, v: (x: any) => cat(D.items.find((i: any) => i.id === x.l.itemId)?.categoryId) }, { h: 'Qty', t: 'n', w: 6, v: (x: any) => x.l.qty },
      { h: 'Harga', t: 'n', v: (x: any) => x.l.price }, { h: 'Subtotal', t: 'n', v: (x: any) => x.l.price * x.l.qty }, { h: 'Catatan', t: 's', w: 20, v: (x: any) => x.l.note }] as any,
      rows: r.paid.flatMap((o: any) => liveLines(o).map((l: any) => ({ o, l }))) };
    case 'daily': {
      const days: string[] = []; for (let d = new Date(from + 'T00:00:00'); dKey(d) <= to && days.length < 800; d.setDate(d.getDate() + 1)) days.push(dKey(d));
      const m: any = Object.fromEntries(days.map((d) => [d, { d, n: 0, s: 0, e: 0 }]));
      r.paid.forEach((o: any) => { const x = m[dKey(o.closedAt || o.createdAt)]; if (x) { x.n++; x.s += o.total; } });
      r.expenses.forEach((e: any) => { const x = m[e.date]; if (x) x.e += e.amount; });
      return { key: k, name: 'Ringkasan Harian', cols: [{ h: 'Tanggal', t: 'd', v: (x: any) => x.d + 'T00:00:00' }, { h: 'Transaksi', t: 'n', w: 10, v: (x: any) => x.n },
        { h: 'Penjualan', t: 'n', v: (x: any) => x.s }, { h: 'Pengeluaran', t: 'n', v: (x: any) => x.e }, { h: 'Laba Kotor', t: 'n', v: (x: any) => x.s - x.e }] as any, rows: days.map((d) => m[d]) };
    }
    case 'expenses': return { key: k, name: 'Pengeluaran', cols: [{ h: 'Tanggal', t: 'd', v: (e: any) => e.date + 'T00:00:00' }, { h: 'Kategori', t: 's', w: 18, v: (e: any) => e.category },
      { h: 'Keterangan', t: 's', w: 28, v: (e: any) => e.note }, { h: 'Jumlah', t: 'n', v: (e: any) => e.amount }, { h: 'Dari kas', t: 's', w: 9, v: (e: any) => (e.cash ? 'Ya' : 'Tidak') }] as any,
      rows: [...r.expenses].sort((a: any, b: any) => a.date.localeCompare(b.date)) };
    case 'closings': return { key: k, name: 'Tutup Kasir', cols: [{ h: 'Waktu', t: 'dt', v: (c: any) => c.createdAt }, { h: 'Oleh', t: 's', w: 14, v: (c: any) => c.by },
      { h: 'Penjualan', t: 'n', v: (c: any) => c.sales }, { h: 'Tunai', t: 'n', v: (c: any) => c.cashSales }, { h: 'Modal', t: 'n', v: (c: any) => c.opening },
      { h: 'Seharusnya', t: 'n', v: (c: any) => c.expected }, { h: 'Uang Fisik', t: 'n', v: (c: any) => c.counted }, { h: 'Selisih', t: 'n', v: (c: any) => c.diff }, { h: 'Catatan', t: 's', w: 20, v: (c: any) => c.note }] as any,
      rows: D.closings.filter((c: any) => c.date >= from && c.date <= to) };
    default: return { key: 'menu', name: 'Daftar Menu', cols: [{ h: 'Menu', t: 's', w: 26, v: (i: any) => i.name }, { h: 'Kategori', t: 's', w: 16, v: (i: any) => cat(i.categoryId) },
      { h: 'Harga', t: 'n', v: (i: any) => i.price }, { h: 'Dibuat di', t: 's', w: 10, v: (i: any) => (i.station === 'bar' ? 'Bar' : 'Dapur') }, { h: 'Tersedia', t: 's', w: 9, v: (i: any) => (i.available !== false ? 'Ya' : 'Habis') }] as any, rows: D.items };
  }
}
VIEWS.export = () => {
  setHeader('Ekspor Data');
  if (!EX.from) [EX.from, EX.to] = presetRange('bulan');
  const per = [['hari', 'Hari ini'], ['7', '7 hari'], ['bulan', 'Bulan ini'], ['lalu', 'Bulan lalu']];
  const n = EXP_SETS.filter((x) => EX.sel[x.k]).length;
  $('#main').innerHTML = `<div class="wrap narrow">
   <div class="sec-t">1 · Periode</div>
   <div class="tbar wrapx"><div class="chips">${per.map(([k, t]) => `<button class="chip ${EX.preset === k ? 'on' : ''}" onclick="App.exPreset('${k}')">${t}</button>`).join('')}</div>
    <div class="range"><input type="date" value="${EX.from}" onchange="App.exSet('from',this.value)"><span>–</span><input type="date" value="${EX.to}" onchange="App.exSet('to',this.value)"></div></div>
   <div class="sec-t">2 · Pilih data</div>
   <div class="list" id="exList">${EXP_SETS.map((x) => `<button class="li" onclick="App.exToggle('${x.k}')"><span class="ck ${EX.sel[x.k] ? 'on' : ''}">${IC.check}</span><div class="m"><b>${x.n}</b><small>${x.d}</small></div><b class="exc" data-k="${x.k}">…</b></button>`).join('')}</div>
   <div class="sec-t">3 · Format</div>
   <div class="seg">${[['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV'], ['sheets', 'Google Sheets']].map(([k, t]) => `<button class="${EX.fmt === k ? 'on' : ''}" onclick="App.exSet('fmt','${k}')">${t}</button>`).join('')}</div>
   <p class="mut small">${EX.fmt === 'xlsx' ? 'Satu file Excel, tiap data jadi satu sheet (format Rupiah & tanggal, filter, header terkunci).' : EX.fmt === 'csv' ? 'File CSV UTF-8; bila lebih dari satu data dikumpulkan dalam .zip.' : 'Ketuk “Salin”, lalu tempel di Google Sheets (sheets.new).'}</p>
   ${EX.fmt === 'sheets' ? `<div class="list">${EXP_SETS.filter((x) => EX.sel[x.k]).map((x) => `<button class="li" onclick="App.exCopy('${x.k}')"><span class="li-ic">${IC.sheet}</span><div class="m"><b>Salin ${x.n}</b></div><span class="btn sm sec">Salin</span></button>`).join('')}</div>
     <button class="btn sec blk" onclick="window.open('https://sheets.new','_blank')">Buka Google Sheets baru</button>`
    : `<button class="btn blk xl" ${n ? '' : 'disabled'} onclick="App.exRun()">${IC.download}Download ${EX.fmt === 'xlsx' ? 'Excel' : 'CSV'}${n ? ' · ' + n + ' data' : ''}</button>`}</div>`;
  loadRange(EX.from, EX.to).then((r) => { EX.data = r; document.querySelectorAll('.exc').forEach((el: any) => (el.textContent = buildSet(el.dataset.k, r, EX.from, EX.to).rows.length)); });
};
function exPreset(p: string) { EX.preset = p; [EX.from, EX.to] = presetRange(p); VIEWS.export(); }
function exSet(k: string, v: string) { if (!v) return; EX[k] = v; if (k === 'from' || k === 'to') { EX.preset = ''; if (EX.from > EX.to) [EX.from, EX.to] = [EX.to, EX.from]; } VIEWS.export(); }
function exToggle(k: string) { EX.sel[k] = !EX.sel[k]; VIEWS.export(); }
async function exSets() { const r = EX.data || (await loadRange(EX.from, EX.to)); return EXP_SETS.filter((x) => EX.sel[x.k]).map((x) => buildSet(x.k, r, EX.from, EX.to)); }
async function exRun() {
  const sets = await exSets(); if (!sets.length) return toast('Pilih minimal 1 data');
  const name = (ext: string) => `${slug(shopName())}_${EX.from === EX.to ? EX.from : EX.from + '_sd_' + EX.to}.${ext}`;
  try {
    if (EX.fmt === 'xlsx') download(name('xlsx'), toXLSX(sets, setg().color || '#c4501e') as any, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    else if (sets.length === 1) download(name('csv'), toCSV(sets[0]), 'text/csv;charset=utf-8');
    else download(name('zip'), zipCSV(sets) as any, 'application/zip');
    track('ekspor', { format: EX.fmt }); toast('File siap diunduh', 'ok');
  } catch (e: any) { toast('Gagal ekspor: ' + e.message, 'err'); }
}
async function exCopy(k: string) {
  const r = EX.data || (await loadRange(EX.from, EX.to)); const ds = buildSet(k, r, EX.from, EX.to);
  try { await navigator.clipboard.writeText(toTSV(ds)); toast(`${ds.name} (${ds.rows.length} baris) disalin`, 'ok'); } catch { toast('Gagal menyalin', 'err'); }
}

/* ================= BACKUP ================= */
const BK_TABLES = ['settings', 'categories', 'items', 'dtables', 'orders', 'reservations', 'expenses', 'closings', 'staff'];
function backupSheet() {
  openSheet(`<h2>Backup & pulihkan</h2><p class="mut">Simpan salinan seluruh data restoran ke file. Pulihkan untuk memindahkan data ke perangkat/akun lain.</p>
   <button class="btn blk lg" onclick="App.backup()">${IC.download}Download backup (.json)</button>
   <label class="btn sec blk lg mt">${IC.upload}Pulihkan dari file<input type="file" accept=".json,application/json" hidden onchange="App.restore(this.files[0])"></label>
   <p class="mut small">Pulihkan akan <b>menambahkan</b> data dari file (menu, meja, transaksi). Data yang sama tidak digandakan.</p>`);
}
async function backup() {
  const out: any = { app: 'wepos', v: 1, at: new Date().toISOString(), name: shopName() };
  for (const t of BK_TABLES) out[t] = await (db as any)[t].where('realmId').equals(sess.realmId).toArray();
  download(`backup_${slug(shopName())}_${today()}.json`, JSON.stringify(out), 'application/json'); toast('Backup diunduh', 'ok');
}
async function restore(f: File) {
  if (!f) return;
  try {
    const d = JSON.parse(await f.text()); if (d.app !== 'wepos') throw new Error('Bukan file backup We POS');
    if (!(await ask('Pulihkan data?', `Dari backup “${esc(d.name)}” (${fDT(d.at)}).`, 'Pulihkan'))) return;
    const ids: Record<string, string> = {};
    await run(async () => {
      for (const t of ['categories', 'items', 'dtables', 'staff', 'reservations', 'expenses', 'closings', 'orders']) {
        const existing = new Set((await (db as any)[t].where('realmId').equals(sess.realmId).toArray()).map((x: any) => x.code || x.name + '|' + (x.createdAt || x.date || '')));
        for (const row of d[t] || []) {
          const key = row.code || row.name + '|' + (row.createdAt || row.date || '');
          if (existing.has(key)) continue;
          const { id, realmId, owner, ...rest } = row; void realmId; void owner;
          if (t === 'items') rest.categoryId = ids[rest.categoryId] || rest.categoryId;
          if (t === 'orders' || t === 'reservations') rest.tableId = ids[rest.tableId] || rest.tableId;
          if (t === 'orders') rest.lines = (rest.lines || []).map((l: any) => ({ ...l, itemId: ids[l.itemId] || l.itemId }));
          if (t === 'staff' && rest.role === 'owner') rest.role = 'admin';
          ids[id] = (await addRow(t, rest)) as string;
        }
      }
    }, 'Data dipulihkan');
    closeSheet();
  } catch (e: any) { toast('Gagal: ' + e.message, 'err'); }
}

/* ================= DATA CONTOH ================= */
async function seedDemo() {
  if (!D.items.length) return toast('Tambahkan menu dulu', 'err');
  if (!(await ask('Isi transaksi contoh?', 'Menambahkan ±120 transaksi 14 hari terakhir, beberapa pengeluaran & reservasi. Cocok untuk mencoba laporan.', 'Isi contoh'))) return;
  const s = setg(), names = ['Andi', 'Budi', 'Citra', 'Dewi', 'Eka', 'Fajar', 'Gita', ''];
  await run(() => db.transaction('rw', [db.orders, db.expenses, db.reservations], async () => {
    for (let day = 13; day >= 0; day--) {
      const cnt = 5 + Math.floor(Math.random() * 6) + (day % 7 < 2 ? 4 : 0);
      for (let k = 0; k < cnt; k++) {
        const d = new Date(); d.setDate(d.getDate() - day);
        const h = [11, 12, 12, 13, 13, 18, 19, 19, 20, 15, 10, 21][Math.floor(Math.random() * 12)];
        d.setHours(h, Math.floor(Math.random() * 60), 0, 0); if (d > new Date()) continue;
        const lines = Array.from({ length: 1 + Math.floor(Math.random() * 4) }, () => {
          const it = D.items[Math.floor(Math.random() * D.items.length)];
          return { key: uid(), itemId: it.id, name: it.name, price: it.price, qty: 1 + Math.floor(Math.random() * 2), note: '', station: it.station, status: 'served', round: 1, sentAt: d.toISOString(), readyAt: d.toISOString() };
        });
        const sub = lines.reduce((a, l) => a + l.price * l.qty, 0), disc = Math.random() < 0.1 ? Math.round(sub * 0.1) : 0;
        const base = sub - disc, svc = Math.round(base * (s.servicePct || 0) / 100), tax = Math.round((base + svc) * (s.taxPct || 0) / 100), total = base + svc + tax;
        const dine = Math.random() < 0.6 && D.tables.length, closed = new Date(d.getTime() + (20 + Math.random() * 40) * 60000);
        const m = METHODS[Math.random() < 0.5 ? 0 : Math.random() < 0.7 ? 1 : Math.floor(Math.random() * 4)];
        const no = k + 1;
        await addRow('orders', { code: `${s.prefix}${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-D${pad(no)}`, no, type: dine ? 'dine' : 'take',
          tableId: dine ? D.tables[Math.floor(Math.random() * D.tables.length)].id : '', guest: names[Math.floor(Math.random() * names.length)], pax: 2, lines, round: 1,
          subtotal: sub, discount: disc, service: svc, tax, total, status: 'paid', payments: [{ date: closed.toISOString(), amount: total, method: m, by: sess.name }],
          note: '', createdAt: d.toISOString(), closedAt: closed.toISOString(), createdBy: sess.name });
      }
      if (day % 3 === 0) { const d = new Date(); d.setDate(d.getDate() - day); await addRow('expenses', { date: dKey(d), category: EXP_CAT[Math.floor(Math.random() * 4)], note: 'Contoh', amount: 50000 + Math.floor(Math.random() * 20) * 10000, cash: true, by: sess.name, createdAt: d.toISOString() }); }
    }
    const t = today();
    await addRow('reservations', { name: 'Keluarga Hendra', phone: '081234567890', date: t, time: '19:00', pax: 6, tableId: D.tables[4]?.id || '', note: 'Ulang tahun', status: 'booked', createdAt: new Date().toISOString() });
    await addRow('reservations', { name: 'Bu Lina', phone: '081298765432', date: t, time: '20:00', pax: 2, tableId: D.tables[2]?.id || '', note: '', status: 'booked', createdAt: new Date().toISOString() });
  }), 'Transaksi contoh ditambahkan');
}

async function rotateSelfKey() {
  if (!(await ask('Buat ulang kode QR?', 'Semua QR yang sudah dicetak tidak berlaku lagi. Cetak ulang QR untuk setiap meja.', 'Buat ulang', true))) return;
  await run(() => updRow('settings', D.settings.id, { selfKey: newSelfKey() }), 'Kode QR baru dibuat — cetak ulang QR meja'); VIEWS.settings();
}
reg({ rotateSelfKey, tableEditGo, doInstall, staffForm, sfRole, saveStaff, delStaff, changeMyPin, saveMyPin, stColor, stImgFile, stImg, stQrisText, segPick, saveSettings,
  exPreset, exSet, exToggle, exRun, exCopy, backupSheet, backup, restore, seedDemo });
void rp; void BASE;
