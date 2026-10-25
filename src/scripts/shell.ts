/* We POS — kerangka: navigasi, header, router halaman, notifikasi "siap diantar". */
import { navigate } from 'astro:transitions/client';
import { isCloud } from '../lib/db';
import {
  S, D, sess, VIEWS, reg, $, esc, IC, BASE, ROUTES, ROLE_NAMES, can, closeSheet, openSheet, avatar, setg, shopName,
  centerMsg, beep, applyTheme, orderTitle, fTime, updRow, run, today, dKey, isWide,
} from './core';

export const NAV: [string, string, string][] = [
  ['pos', 'pos', 'Kasir'], ['tables', 'table', 'Meja'], ['orders', 'list', 'Pesanan'], ['kitchen', 'chef', 'Dapur'],
  ['reserve', 'cal', 'Reservasi'], ['menu', 'food', 'Menu'], ['report', 'chart', 'Laporan'], ['more', 'menu', 'Lainnya'],
];
const SUB: Record<string, string> = { team: 'more', settings: 'more', export: 'more', closing: 'more', queue: 'more' };
const FULL = ['queue']; // halaman layar penuh tanpa navigasi

export function go(v: string) { closeSheet(); if (v === S.view && !S.forceNav) { renderPage(); return; } navigate(BASE + ROUTES[v]); }
function back() { if (history.length > 1) history.back(); else go('more'); }

export function applyBrand() {
  applyTheme(setg().color);
}
function renderNav() {
  const act = SUB[S.view] || S.view;
  const items = NAV.filter(([k]) => can(k));
  const rail = $('#rail'), bn = $('#nav');
  const s = setg();
  if (rail) rail.innerHTML = `<div class="rail-logo" title="${esc(shopName())}">${s.logo ? `<img src="${s.logo}" alt="">` : IC.logo}</div>
    <nav>${items.map(([k, i, n]) => `<button class="${act === k ? 'on' : ''}" onclick="App.go('${k}')">${IC[i]}<span>${n}</span>${badgeFor(k)}</button>`).join('')}</nav>
    <button class="rail-me" onclick="App.meSheet()" title="${esc(sess.name)}">${avatar(sess.staff)}</button>`;
  // HP: maksimal 5 tab (4 utama + Lainnya)
  const phone = items.filter(([k]) => k !== 'more').slice(0, 4).concat(items.filter(([k]) => k === 'more'));
  if (bn) bn.innerHTML = phone.map(([k, i, n]) => `<button class="${act === k || (!phone.some(([p]) => p === act) && k === 'more') ? 'on' : ''}" onclick="App.go('${k}')">${IC[i]}<span>${n}</span>${badgeFor(k)}</button>`).join('');
}
function badgeFor(k: string) {
  if (k === 'kitchen') { const n = kitchenCount(); return n ? `<i class="nb">${n}</i>` : ''; }
  if (k === 'tables') { const n = D.orders.filter((o: any) => o.status === 'open' && o.type === 'dine').length; return n ? `<i class="nb soft">${n}</i>` : ''; }
  return '';
}
export const kitchenCount = () => D.orders.reduce((a: number, o: any) => a + (o.status !== 'void' && o.lines.some((l: any) => l.status === 'cook') ? 1 : 0), 0);
export const readyOrders = () => D.orders.filter((o: any) => o.status !== 'void' && o.lines.some((l: any) => l.status === 'ready'));

import { qrPending, notifyQr } from './selfmenu';
export function setHeader(title: string, act = '') {
  const t = $('#title'); if (t) t.textContent = title;
  document.title = title + ' · ' + shopName();
  const ro = can('pos') ? readyOrders().length : 0;
  $('#hAct').innerHTML = (document.body.dataset.back ? `<button class="hb ghost" onclick="App.back()">${IC.back}<span>Kembali</span></button>` : '') + act
    + (can('pos') && qrPending().length ? `<button class="hb qrb" onclick="App.qrSheet()" title="Pesanan QR menunggu">${IC.phone}<span>Pesanan QR</span><i>${qrPending().length}</i></button>` : '')
    + (ro ? `<button class="hb bell" onclick="App.readySheet()" title="Siap diantar">${IC.bell}<i>${ro}</i></button>` : '')
    + `<span id="hSync" class="sync" hidden></span><button class="hb me" onclick="App.meSheet()">${avatar(sess.staff)}</button>`;
  renderSync();
}
export function renderSync() {
  const el = $('#hSync'); if (!el || !isCloud) return; el.hidden = false;
  const s = sess.sync || {}; const p = s.phase;
  el.className = 'sync ' + (s.error || p === 'error' ? 'err' : p === 'in-sync' ? 'ok' : p === 'offline' || s.status === 'offline' ? 'off' : 'busy');
  el.title = s.error ? 'Gagal sinkron' : p === 'in-sync' ? 'Tersinkron' : p === 'offline' ? 'Offline — data tersimpan & disinkron saat online' : 'Menyinkronkan…';
}
document.addEventListener('wp:sync', renderSync);

export function renderPage() {
  S.view = document.body.dataset.page || 'pos';
  if (sess.phase !== 'ready') return;
  applyBrand();
  document.body.classList.toggle('full', FULL.includes(S.view));
  renderNav();
  $('#main').className = 'pg-' + S.view;
  if (!can(S.view)) {
    setHeader('Tidak ada akses');
    $('#main').innerHTML = centerMsg('lock', 'Halaman ini bukan untuk peran Anda', `Anda masuk sebagai ${ROLE_NAMES[sess.role]}.`, `<button class="btn" onclick="App.go('${sess.role === 'dapur' ? 'kitchen' : 'pos'}')">Ke halaman utama</button>`);
    return;
  }
  (VIEWS[S.view] || VIEWS.pos)();
}

/* ---------- Data berubah → bunyi & render ulang ---------- */
let pendingRender = false;
export function onData(prev: any) {
  // Bunyi: tiket dapur baru / pesanan siap / pesanan QR baru
  notifyQr(prev, S.view);
  if (prev?.settings) {
    // Bandingkan kunci item (bukan jumlah) agar tiket baru tetap terdeteksi walau ada item lain yang dibatalkan
    const keys = (d: any, st: string) => new Set<string>(d.orders.flatMap((o: any) => o.lines.filter((l: any) => l.status === st).map((l: any) => o.id + ':' + l.key + ':' + (l.sentAt || ''))));
    const added = (st: string) => { const before = keys(prev, st); return [...keys(D, st)].some((k) => !before.has(k)); };
    if (S.view === 'kitchen' && added('cook')) beep('new');
    else if (['queue', 'pos', 'tables', 'orders'].includes(S.view) && added('ready')) beep('ready');
  }
  rerender();
}
const FORM_VIEWS = ['settings', 'closing', 'export', 'report'];
export function rerender(fromData = true) {
  // Halaman berisi formulir tidak dirender ulang otomatis supaya isian tidak hilang
  if (fromData && FORM_VIEWS.includes(S.view)) { renderNav(); return; }
  const a = document.activeElement as HTMLElement;
  if (a && $('#main')?.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) {
    if (!pendingRender) { pendingRender = true; a.addEventListener('blur', () => { pendingRender = false; setTimeout(renderPage, 30); }, { once: true }); }
    return;
  }
  renderPage();
}
// Timer di dapur/meja/antrian diperbarui tiap 30 detik
setInterval(() => { if (sess.phase === 'ready' && ['kitchen', 'tables', 'queue', 'orders'].includes(S.view) && !document.hidden) rerender(); }, 30000);

/* ---------- Siap diantar ---------- */
function readySheet() {
  const list = readyOrders();
  if (!list.length) { closeSheet(); return; }
  openSheet(`<h2>Siap diantar</h2><p class="mut">Pesanan sudah selesai dimasak. Ketuk <b>Sudah diantar</b> setelah diantar ke meja / diambil pelanggan.</p>
   <div class="list">${list.map((o: any) => `<div class="li"><div class="m"><b>#${o.no} · ${esc(orderTitle(o))}${o.guest ? ' · ' + esc(o.guest) : ''}</b>
     <small>${o.lines.filter((l: any) => l.status === 'ready').map((l: any) => `${l.qty}× ${esc(l.name)}`).join(', ')}</small></div>
     <button class="btn sm" onclick="App.markServed('${o.id}')">${IC.check}Sudah diantar</button></div>`).join('')}</div>`);
}
async function markServed(id: string) {
  const o = D.orders.find((x: any) => x.id === id); if (!o) return;
  const lines = o.lines.map((l: any) => (l.status === 'ready' ? { ...l, status: 'served' } : l));
  await run(() => updRow('orders', id, { lines }), 'Ditandai sudah diantar');
  if ($('#sheet').classList.contains('show')) readySheet();
}

/* ---------- Akun saya ---------- */
function meSheet() {
  const s = sess.staff;
  openSheet(`<div class="me-head">${avatar(s, 'lg')}<div><b>${esc(s?.name)}</b><small>${ROLE_NAMES[sess.role]} · ${esc(shopName())}</small></div></div>
   <div class="list">
    <button class="li" onclick="App.lockNow()"><span class="li-ic">${IC.lock}</span><div class="m"><b>Kunci / Ganti pengguna</b><small>Serahkan perangkat ke staf lain</small></div>${IC.chev}</button>
    <button class="li" onclick="App.changeMyPin()"><span class="li-ic">${IC.key}</span><div class="m"><b>Ganti PIN saya</b></div>${IC.chev}</button>
    <a class="li" href="${BASE}panduan/" target="_blank"><span class="li-ic">${IC.book}</span><div class="m"><b>Panduan pemakaian</b></div>${IC.chev}</a>
   </div>
   ${isCloud ? `<p class="mut small center">${IC.cloud} ${esc(sess.user?.email || '')} · ${sess.sync?.phase === 'in-sync' ? 'Tersinkron' : 'Menyinkronkan / offline'}</p>` : `<p class="mut small center">Mode lokal · data hanya di perangkat ini</p>`}`);
}

export const todayOrders = () => D.orders.filter((o: any) => dKey(o.createdAt) === today());
reg({ go, back, readySheet, markServed, meSheet, fTime });
void isWide;
