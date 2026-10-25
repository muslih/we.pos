/* We POS — Pesan Mandiri: menu cetak per meja (kertas + QR) dan pesanan dari HP pelanggan. */
import qrcode from 'qrcode-generator';
import { isCloud } from '../lib/db';
import {
  S, D, sess, reg, $, esc, IC, rp, rk, onColor, setg, shopName, isMgr, canPay, tableName, liveLines, openSheet, closeSheet, run, updRow, toast, beep, ask,
} from './core';
const AR = '<svg class="ar" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

/* ---------- Tautan & QR ---------- */
export const selfReady = () => isCloud && !!setg().selfOrder && !!setg().selfKey;
export function selfBase() { return String(setg().publicUrl || location.origin).replace(/\/+$/, ''); }
export function selfUrl(tableId: string) {
  const s = setg();
  return `${selfBase()}${import.meta.env.BASE_URL}pesan/?r=${encodeURIComponent(sess.realmId)}&t=${encodeURIComponent(tableId)}&k=${encodeURIComponent(s.selfKey || '')}`;
}
export function qrSvg(text: string) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
export function newSelfKey() {
  const A = 'abcdefghijkmnpqrstuvwxyz23456789', a = new Uint8Array(16); crypto.getRandomValues(a);
  return [...a].map((x) => A[x % A.length]).join('');
}

/* ================= CETAK MENU MEJA & QR ================= */
/* Isi: qr (QR saja) · qrmenu (QR + menu) · form (menu + lembar pesanan) · menu (menu saja)
   Gaya menu: klasik · modern · minimal · kafe. Kartu QR: 1/2/4/6 per halaman. */
const PM: any = { tables: null as null | Set<string>, layout: 'qrmenu', size: 'A4', style: 'klasik', per: 4 };
const KIND = [
  ['qr', 'QR saja', 'Kartu berisi QR & nomor meja. Pelanggan melihat menu & memesan dari HP.', true],
  ['qrmenu', 'QR + menu', 'Menu lengkap dengan QR besar di atas — bisa baca di kertas atau pesan dari HP.', true],
  ['form', 'Menu + lembar pesanan', 'Ada kotak centang & kolom jumlah untuk diisi pelanggan lalu diserahkan ke kasir.', false],
  ['menu', 'Menu saja', 'Daftar menu & harga tanpa QR.', false],
] as const;
const STYLES = [['klasik', 'Klasik', 'Garis tegas & titik-titik harga'], ['modern', 'Modern', 'Kepala berwarna toko, kartu kategori'], ['minimal', 'Minimalis', 'Rapi di tengah, huruf elegan'], ['kafe', 'Kafe', 'Ikon menu & label kategori berwarna']];
const PER = [[1, '1 besar', 'standing A5/A4'], [2, '2 per halaman', 'tenda meja'], [4, '4 per halaman', 'kartu sedang'], [6, '6 per halaman', 'stiker meja']];
function printSheet() {
  if (!PM.tables) PM.tables = new Set(D.tables.map((t: any) => t.id));
  const qr = selfReady();
  if (!qr && (PM.layout === 'qr' || PM.layout === 'qrmenu')) PM.layout = 'form';
  const isQr = PM.layout === 'qr';
  openSheet(`<h2>Cetak menu & QR meja</h2><p class="mut">Dibuat dari menu terbaru (menu yang sedang habis tidak dicetak). <a href="${import.meta.env.BASE_URL}panduan/#qr-cetak" target="_blank">Lihat panduan</a></p>
   ${!qr ? `<div class="alert info">${isCloud ? `QR pesan dari HP belum aktif. ${isMgr() ? `<a onclick="App.go('settings')">Aktifkan di Pengaturan ${AR} Pesan mandiri</a>.` : 'Minta Pemilik mengaktifkannya di Pengaturan.'}` : 'QR pesan dari HP tersedia mulai paket Pro (butuh database online). Di paket Gratis, menu & lembar pesanan kertas tetap bisa dicetak.'}</div>` : ''}
   <div class="sec-t">1 · Isi cetakan</div>
   <div class="rolepick pm-kinds">${KIND.map(([k, t, d, needQr]) => `<button class="${PM.layout === k ? 'on' : ''}" ${needQr && !qr ? 'disabled' : ''} onclick="App.pmSet('layout','${k}')"><b>${t}</b><small>${needQr && !qr ? (isCloud ? 'Aktifkan QR dulu' : 'Paket Pro ke atas') : d}</small></button>`).join('')}</div>
   ${isQr ? `<div class="sec-t">2 · Ukuran kartu QR</div><div class="rolepick pm-per">${PER.map(([n, t, d]) => `<button class="${PM.per === n ? 'on' : ''}" onclick="App.pmSet('per',${n})"><b>${t}</b><small>${d}</small></button>`).join('')}</div>`
    : `<div class="sec-t">2 · Gaya menu</div><div class="pm-styles">${STYLES.map(([k, t, d]) => `<button class="${PM.style === k ? 'on' : ''}" onclick="App.pmSet('style','${k}')"><span class="pm-thumb th-${k}"><i></i><i></i><i></i></span><b>${t}</b><small>${d}</small></button>`).join('')}</div>
      <div class="seg" style="max-width:260px;margin-top:10px">${['A4', 'A5'].map((z) => `<button class="${PM.size === z ? 'on' : ''}" onclick="App.pmSet('size','${z}')">Kertas ${z}</button>`).join('')}</div>`}
   <div class="sec-t">3 · Meja <a class="link" style="margin-left:auto" onclick="App.pmAll()">${PM.tables.size === D.tables.length ? 'Kosongkan' : 'Pilih semua'}</a></div>
   ${D.tables.length ? `<div class="tpick">${D.tables.map((t: any) => `<button class="${PM.tables.has(t.id) ? 'on' : ''}" onclick="App.pmTable('${t.id}')"><b>${esc(t.name)}</b><small>${esc(t.area || '')}</small></button>`).join('')}</div>`
    : '<p class="mut">Belum ada meja. Akan dicetak satu lembar tanpa nomor meja.</p>'}
   <div class="row2 mt"><button class="btn ghost" onclick="App.pmPreview()">${IC.list}Pratinjau</button><button class="btn" onclick="App.pmPrint()">${IC.print}Cetak ${D.tables.length ? PM.tables.size + ' meja' : ''}</button></div>`, { wide: true });
}
function pmSet(k: string, v: any) { PM[k] = v; printSheet(); }
function pmAll() { PM.tables = PM.tables.size === D.tables.length ? new Set() : new Set(D.tables.map((t: any) => t.id)); printSheet(); }
function pmTable(id: string) { PM.tables.has(id) ? PM.tables.delete(id) : PM.tables.add(id); printSheet(); }

function menuGroups() {
  const items = D.items.filter((i: any) => i.available !== false);
  const groups = D.categories.map((c: any) => ({ c, items: items.filter((i: any) => i.categoryId === c.id) }));
  const rest = items.filter((i: any) => !D.categories.some((c: any) => c.id === i.categoryId));
  if (rest.length) groups.push({ c: { name: 'Lainnya', icon: '' }, items: rest });
  return groups.filter((g: any) => g.items.length);
}
const taxNote = (s: any, pre = '') => (s.taxPct || s.servicePct ? `${pre}Harga belum termasuk${s.servicePct ? ` service ${s.servicePct}%` : ''}${s.taxPct ? `${s.servicePct ? ' &' : ''} pajak ${s.taxPct}%` : ''}.` : '');
function pageHTML(t: any) {
  const s = setg(), L = PM.layout, form = L === 'form', st = PM.style;
  const qr = selfReady() && t && (L === 'qrmenu' || L === 'form');
  const head = `<div class="pm-head">${s.logo ? `<img src="${s.logo}" alt="">` : ''}<div class="pm-title"><b>${esc(s.name)}</b><small>${esc([s.address, s.phone].filter(Boolean).join(' · '))}</small></div>
    ${t ? `<div class="pm-table"><small>MEJA</small><b>${esc(t.name)}</b></div>` : ''}</div>`;
  const qrBox = qr ? `<div class="pm-qr ${L === 'qrmenu' ? 'big' : ''}">${qrSvg(selfUrl(t.id))}<div><b>${L === 'qrmenu' ? 'Pesan langsung dari HP' : 'Pesan dari HP'}</b><small>Scan QR ini dengan kamera HP ${AR} pilih menu ${AR} kirim. Pesanan langsung masuk ke kasir & dapur.</small>${L === 'qrmenu' && t ? `<em>Meja ${esc(t.name)}</em>` : ''}</div></div>` : '';
  const row = (i: any) => st === 'kafe'
    ? `<div class="pm-row">${form ? '<span class="pm-box"></span>' : ''}<span class="pm-ic">${i.icon || '🍽️'}</span><span class="pm-name">${esc(i.name)}</span><span class="pm-dots"></span><span class="pm-price">${rk(i.price)}</span>${form ? '<span class="pm-qty">Jml</span>' : ''}</div>`
    : `<div class="pm-row">${form ? '<span class="pm-box"></span>' : ''}<span class="pm-name">${esc(i.name)}</span><span class="pm-dots"></span><span class="pm-price">${rk(i.price)}</span>${form ? '<span class="pm-qty">Jml</span>' : ''}</div>`;
  const groups = menuGroups().map((g: any) => `<section class="pm-cat"><h3>${g.c.icon && st !== 'minimal' ? g.c.icon + ' ' : ''}${esc(g.c.name)}</h3>${g.items.map(row).join('')}</section>`).join('');
  const foot = form ? `<div class="pm-form"><div><span>Nama</span><i></i></div><div><span>Catatan</span><i></i></div>
     <p>Centang menu & tulis jumlahnya, lalu serahkan lembar ini ke kasir.${taxNote(s, ' ')}</p></div>`
    : `<p class="pm-note">Harga dalam ribuan rupiah.${taxNote(s, ' ')}${L === 'qrmenu' ? ' Pembayaran di kasir.' : ''}</p>`;
  return `<div class="pm-page size-${PM.size} st-${st}" style="--pm:${s.color || '#ea580c'};--pm-on:${onColor(s.color || '#ea580c')}">${head}${qrBox}<div class="pm-menu">${groups}</div>${foot}</div>`;
}
function qrCardsHTML(tables: any[]) {
  const s = setg(), per = PM.per;
  const card = (t: any) => `<div class="pm-card">${s.logo ? `<img src="${s.logo}" alt="">` : ''}<b class="pm-cname">${esc(s.name)}</b><div class="pm-cqr">${qrSvg(selfUrl(t.id))}</div>
    <div class="pm-ctable">Meja ${esc(t.name)}</div><small>Scan untuk lihat menu & pesan dari HP · Bayar di kasir</small></div>`;
  const pages: string[] = []; for (let i = 0; i < tables.length; i += per) pages.push(`<div class="pm-page pm-cards per-${per} size-A4" style="--pm:${s.color || '#ea580c'}">${tables.slice(i, i + per).map(card).join('')}</div>`);
  return pages.join('');
}
function buildPrint() {
  const tables = D.tables.length ? D.tables.filter((t: any) => PM.tables.has(t.id)) : [null];
  if (!tables.length || (PM.layout === 'qr' && !tables.filter(Boolean).length)) { toast('Pilih minimal satu meja', 'err'); return ''; }
  if (!menuGroups().length && PM.layout !== 'qr') { toast('Belum ada menu yang tersedia', 'err'); return ''; }
  return PM.layout === 'qr' ? qrCardsHTML(tables.filter(Boolean)) : tables.map(pageHTML).join('');
}
function pmPrint() {
  const html = buildPrint(); if (!html) return;
  const pa = $('#print-area'); pa.className = 'doc-' + (PM.layout === 'qr' ? 'A4' : PM.size); pa.innerHTML = html;
  closeSheet(); setTimeout(() => window.print(), 120);
}
function pmPreview() {
  const html = buildPrint(); if (!html) return;
  openSheet(`<h2>Pratinjau</h2><div class="pm-preview">${html}</div><button class="btn blk lg mt" onclick="App.pmPrint()">${IC.print}Cetak</button>
   <button class="btn ghost blk mt" onclick="App.printMenuSheet()">Kembali ke pilihan</button>`, { wide: true });
}

/* ================= PESANAN QR DI KASIR ================= */
export const qrPending = () => D.orders.filter((o: any) => o.status === 'open' && o.qrPending);
export function qrSheet() {
  const list = qrPending();
  if (!list.length) { closeSheet(); return; }
  openSheet(`<h2>Pesanan dari QR</h2><p class="mut">Pelanggan memesan lewat HP. Periksa lalu <b>Terima</b> agar masuk ke dapur.</p>
   <div class="list">${list.map((o: any) => {
     const ls = o.lines.filter((l: any) => l.status === 'new' && l.by === 'qr');
     return `<div class="li qr-li"><div class="m"><b>#${o.no} · Meja ${esc(tableName(o.tableId))}${o.guest ? ' · ' + esc(o.guest) : ''}</b>
       <small>${ls.map((l: any) => `${l.qty}× ${esc(l.name)}${l.note ? ` (${esc(l.note)})` : ''}`).join(', ')}</small>${o.note ? `<small class="note">${esc(o.note)}</small>` : ''}</div>
       <b>${rp(ls.reduce((a: number, l: any) => a + l.qty * l.price, 0))}</b>
       <button class="btn sm ghost danger" onclick="App.qrReject('${o.id}')">Tolak</button><button class="btn sm" onclick="App.qrAccept('${o.id}')">Terima</button></div>`;
   }).join('')}</div>`, { wide: true });
}
async function qrAccept(id: string) {
  const o = D.orders.find((x: any) => x.id === id); if (!o) return;
  const s = setg(), now = new Date().toISOString();
  const lines = o.lines.map((l: any) => (l.status === 'new' && l.by === 'qr' ? { ...l, status: s.kds ? 'cook' : 'served', sentAt: now, ...(s.kds ? {} : { readyAt: now }) } : l));
  await run(() => updRow('orders', id, { lines, qrPending: false }), s.kds ? `Pesanan #${o.no} dikirim ke dapur` : `Pesanan #${o.no} diterima`);
  qrSheet();
}
async function qrReject(id: string) {
  const o = D.orders.find((x: any) => x.id === id); if (!o) return;
  if (!(await ask(`Tolak pesanan QR #${o.no}?`, 'Item dari HP pelanggan akan dibatalkan. Beri tahu pelanggan di meja.', 'Tolak', true))) return;
  const lines = o.lines.map((l: any) => (l.status === 'new' && l.by === 'qr' ? { ...l, status: 'void', voidBy: sess.name } : l));
  const live = lines.filter((l: any) => l.status !== 'void');
  const sub = live.reduce((a: number, l: any) => a + l.price * l.qty, 0);
  const s = setg(), service = Math.round((sub * (s.servicePct || 0)) / 100), tax = Math.round(((sub + service) * (s.taxPct || 0)) / 100);
  await run(() => updRow('orders', id, { lines, qrPending: false, subtotal: sub, discount: 0, service, tax, total: sub + service + tax, ...(live.length ? {} : { status: 'void', voidReason: 'Pesanan QR ditolak', closedAt: new Date().toISOString() }) }), 'Pesanan QR ditolak');
  qrSheet();
}

/** Dipanggil saat data berubah: beri tahu kasir bila ada pesanan QR baru. */
export function notifyQr(prev: any, view: string) {
  if (!prev?.settings || !canPay() && sess.role !== 'pelayan') return;
  const keys = (d: any) => new Set<string>(d.orders.flatMap((o: any) => o.lines.filter((l: any) => l.by === 'qr').map((l: any) => o.id + l.key)));
  const before = keys(prev);
  const fresh = D.orders.filter((o: any) => o.lines.some((l: any) => l.by === 'qr' && !before.has(o.id + l.key)));
  if (!fresh.length) return;
  if (view !== 'kitchen') beep('ready');
  const o = fresh[0];
  toast(`${IC.bell} Pesanan QR baru · Meja ${esc(tableName(o.tableId))}${o.qrPending ? ' — perlu konfirmasi' : ' — sudah masuk dapur'}`, 'ok');
}
export const qrBadge = (o: any) => (o.source === 'qr' ? '<span class="badge qr">QR</span>' : '');

reg({ printMenuSheet: printSheet, pmSet, pmAll, pmTable, pmPrint, pmPreview, qrSheet, qrAccept, qrReject });
void liveLines; void shopName; void S;
