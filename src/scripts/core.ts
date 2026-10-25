/* We POS — inti: konstanta, state, util, ikon, helper database, sheet & toast. */
import { db, isCloud } from '../lib/db';

/* ================= KONSTANTA ================= */
export const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/';
export const ROUTES: Record<string, string> = {
  pos: 'app/', tables: 'app/meja/', orders: 'app/pesanan/', kitchen: 'app/dapur/', queue: 'app/antrian/',
  reserve: 'app/reservasi/', menu: 'app/menu/', report: 'app/laporan/', closing: 'app/tutup-kasir/',
  more: 'app/lainnya/', team: 'app/tim/', settings: 'app/pengaturan/', export: 'app/ekspor/',
};
export const ROLE_NAMES: Record<string, string> = { owner: 'Pemilik', admin: 'Manajer', kasir: 'Kasir', pelayan: 'Pelayan', dapur: 'Dapur' };
export const ROLE_DESC: Record<string, string> = {
  owner: 'Akses penuh', admin: 'Akses penuh kecuali hapus restoran',
  kasir: 'Terima pesanan, bayar, tutup kasir', pelayan: 'Catat pesanan & kirim ke dapur (tanpa bayar)', dapur: 'Layar dapur saja',
};
/** Halaman yang boleh dibuka per peran. */
export const ACCESS: Record<string, string[]> = {
  pos: ['owner', 'admin', 'kasir', 'pelayan'], tables: ['owner', 'admin', 'kasir', 'pelayan'], orders: ['owner', 'admin', 'kasir', 'pelayan'],
  kitchen: ['owner', 'admin', 'kasir', 'pelayan', 'dapur'], queue: ['owner', 'admin', 'kasir', 'pelayan', 'dapur'],
  reserve: ['owner', 'admin', 'kasir', 'pelayan'], menu: ['owner', 'admin', 'kasir'], report: ['owner', 'admin'],
  closing: ['owner', 'admin', 'kasir'], more: ['owner', 'admin', 'kasir', 'pelayan', 'dapur'],
  team: ['owner', 'admin'], settings: ['owner', 'admin'], export: ['owner', 'admin'],
};
export const METHODS = ['Tunai', 'QRIS', 'Transfer', 'Kartu'];
export const EXP_CAT = ['Bahan Baku', 'Minuman & Es', 'Gas & Listrik', 'Air', 'Gaji', 'Sewa', 'Kemasan', 'Perawatan', 'Lainnya'];
export const COLORS = [['#ea580c', 'Oranye'], ['#dc2626', 'Merah'], ['#db2777', 'Pink'], ['#9333ea', 'Ungu'], ['#2563eb', 'Biru'], ['#0284c7', 'Langit'],
  ['#0d9488', 'Tosca'], ['#16a34a', 'Hijau'], ['#ca8a04', 'Kuning'], ['#92400e', 'Cokelat'], ['#c4501e', 'Paprika'], ['#27272a', 'Arang']];
export const DEFAULT_COLOR = '#ea580c';
/** Kecerahan relatif (0–1) dari warna hex. */
export function luminance(hex: string) {
  const h = hex.replace('#', ''); const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.padEnd(6, '0');
  const c = [0, 2, 4].map((i) => { const v = parseInt(n.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** Teks di atas warna toko: putih untuk warna gelap/sedang, hitam untuk warna terang. */
export const onColor = (hex: string) => (1.05 / (luminance(hex) + 0.05) >= 3 ? '#ffffff' : '#18191b');
/** Terapkan warna toko ke seluruh UI (dipakai juga untuk pratinjau di Pengaturan). */
export function applyTheme(color?: string) {
  const c = /^#[0-9a-f]{6}$/i.test(color || '') ? (color as string) : DEFAULT_COLOR;
  const r = document.documentElement.style;
  r.setProperty('--pri', c); r.setProperty('--on-pri', onColor(c));
  try { localStorage.setItem('wp_theme', c); } catch {}
  return c;
}
export const AV_COLORS = ['#c4501e', '#2e5677', '#4f7a3a', '#6b3f5e', '#b07a2a', '#2f6b62', '#a3301f', '#57514a'];
export const FOOD_ICONS = ['🍛', '🍚', '🍜', '🍝', '🍲', '🥘', '🍗', '🍖', '🥩', '🍔', '🍟', '🌭', '🍕', '🥪', '🌮', '🥗', '🍤', '🐟', '🦐', '🥚', '🍳', '🥟', '🍢', '🍡', '🍰', '🍮', '🍨', '🍧', '🍩', '🍪', '🥐', '🍞', '☕', '🍵', '🧋', '🥤', '🧃', '🍹', '🥛', '🍺', '🧊', '🍊', '🥥', '🌶️', '🍽️'];
export const NOTE_CHIPS = ['Pedas', 'Tidak pedas', 'Tanpa es', 'Es sedikit', 'Kurang manis', 'Tanpa sayur', 'Bungkus', 'Dipisah'];

/* ================= STATE ================= */
/** UI state */
export const S: any = { view: 'pos', cat: 'all', q: '', cart: null, ordTab: 'open', ordQ: '', area: 'Semua', resDate: '', station: 'all', repTab: 'ringkas', brand: {} };
/** Data restoran aktif (diisi liveQuery) */
export let D: any = emptyData();
export function emptyData() { return { settings: null, categories: [], items: [], tables: [], orders: [], reservations: [], expenses: [], closings: [], staff: [] }; }
export function setD(d: any) { D = d; }
/** Sesi */
export const sess: any = {
  phase: 'boot', user: null, ui: null, sync: null, synced: false, realms: [],
  realmId: '', staff: null, role: '', name: '', restaurants: [],
};
export const VIEWS: Record<string, () => void> = {};
/** Fungsi yang dipanggil dari HTML (onclick="App.x()") */
export const App: any = {};
export const reg = (o: Record<string, any>) => Object.assign(App, o);

/* ================= UTIL ================= */
export const $ = (s: string) => document.querySelector(s) as any;
export const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const rp = (n: number) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
export const rk = (n: number) => Math.round(n || 0).toLocaleString('id-ID');
export const num = (v: any) => parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0;
/** Format angka rupiah dengan pemisah ribuan untuk ditampilkan di input (tanpa "Rp"). */
export const fmtMoney = (v: any) => { const n = Math.round(num(v)); return n ? n.toLocaleString('id-ID') : ''; };
/** Input uang: <input data-money> otomatis diberi pemisah ribuan saat diketik, posisi kursor tetap. Baca nilainya dengan num(). */
document.addEventListener('input', (e: any) => {
  const el = e.target as HTMLInputElement; if (!el?.matches?.('input[data-money]')) return;
  const raw = el.value, pos = el.selectionStart ?? raw.length;
  const digitsBefore = raw.slice(0, pos).replace(/\D/g, '').length;
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 12);
  const out = digits ? Number(digits).toLocaleString('id-ID') : '';
  if (out === raw) return;
  el.value = out;
  let i = 0, seen = 0; while (i < out.length && seen < digitsBefore) { if (/\d/.test(out[i])) seen++; i++; }
  try { el.setSelectionRange(i, i); } catch {}
}, true);
export const pad = (n: number) => String(n).padStart(2, '0');
export const dKey = (d: any) => { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
export const today = () => dKey(new Date());
export const fDate = (d: any) => new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
export const fDay = (d: any) => new Date(d).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
export const fTime = (d: any) => new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
export const fDT = (d: any) => new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const initials = (n: string) => String(n || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
export const waNum = (p: string) => { p = String(p || '').replace(/\D/g, ''); return p.startsWith('0') ? '62' + p.slice(1) : p; };
export const mins = (d: any) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 60000));
export const ago = (d: any) => { const m = mins(d); return m < 1 ? 'baru saja' : m < 60 ? m + ' mnt' : Math.floor(m / 60) + ' j ' + (m % 60) + ' m'; };
export const setg = () => D.settings || defaultSettings('Restoran Saya');
export const shopName = () => D.settings?.name || 'Restoran Saya';
export const slug = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'resto';
export const byName = () => sess.name || 'lokal';
export const can = (page: string, role = sess.role) => (ACCESS[page] || []).includes(role);
export const isMgr = (role = sess.role) => role === 'owner' || role === 'admin';
export const canPay = () => ['owner', 'admin', 'kasir'].includes(sess.role);
export const tableName = (id: string) => D.tables.find((t: any) => t.id === id)?.name || '';
export const orderTitle = (o: any) => o.type === 'dine' ? (tableName(o.tableId) ? 'Meja ' + tableName(o.tableId) : 'Makan di tempat') : 'Bawa pulang';
export const liveLines = (o: any) => (o.lines || []).filter((l: any) => l.status !== 'void');
export const paidAmt = (o: any) => (o.payments || []).reduce((a: number, p: any) => a + p.amount, 0);
export const isWide = () => window.matchMedia('(min-width: 900px)').matches;

export function track(name: string, data?: Record<string, any>) { try { (window as any).umami?.track(name, data); } catch {} }
export function toast(m: string, kind = '') {
  const t = $('#toast'); if (!t) return;
  t.innerHTML = m; t.className = 'toast show ' + kind; clearTimeout(t._t);
  t._t = setTimeout(() => (t.className = 'toast'), 2600);
}
export function defaultSettings(name: string, phone = ''): any {
  return {
    name, tagline: '', address: '', phone, logo: '', color: DEFAULT_COLOR,
    footer: 'Terima kasih atas kunjungan Anda!', prefix: (name.replace(/[^A-Za-z]/g, '').slice(0, 3) || 'WP').toUpperCase(),
    taxPct: 0, servicePct: 0, kds: true, paper: '58',
  };
}
/** Hitung total pesanan (diskon → service → pajak). */
export function calcTotals(lines: any[], discount = 0, s = setg()) {
  const subtotal = lines.filter((l) => l.status !== 'void').reduce((a, l) => a + l.price * l.qty, 0);
  const disc = Math.min(subtotal, Math.round(discount || 0));
  const base = subtotal - disc;
  const service = Math.round((base * (s.servicePct || 0)) / 100);
  const tax = Math.round(((base + service) * (s.taxPct || 0)) / 100);
  return { subtotal, discount: disc, service, tax, total: base + service + tax };
}

/* ================= IKON (stroke, 24px) ================= */
const sv = (d: string, w = 1.9) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const IC: Record<string, string> = {
  pos: sv('<path d="M4 4h16v10H4zM8 18h8M12 14v4M7 8h4"/>'),
  cart: sv('<path d="M3 4h2l2.4 11h10.2L20 7H6.2"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>'),
  table: sv('<path d="M3 9h18M5 9v11M19 9v11M8 9V5h8v4"/>'),
  list: sv('<path d="M5 3h14v18H5zM9 8h6M9 12h6M9 16h4"/>'),
  chef: sv('<path d="M7 14a4 4 0 0 1-.6-7.96A5 5 0 0 1 16 5a4 4 0 0 1 1 8v0M7 14v6h10v-7M7 17h10"/>'),
  tv: sv('<path d="M3 5h18v12H3zM8 21h8M12 17v4"/>'),
  cal: sv('<path d="M4 5h16v16H4zM4 10h16M9 3v4M15 3v4"/>'),
  book: sv('<path d="M4 4h6a3 3 0 0 1 3 3v14a2 2 0 0 0-2-2H4zM20 4h-5a2 2 0 0 0-2 2"/><path d="M20 4v15h-7"/>'),
  menu: sv('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  food: sv('<path d="M5 3v8a3 3 0 0 0 3 3v7M8 3v6M11 3v8a3 3 0 0 1-3 3M17 21V3c-2 1-3 4-3 8h3"/>'),
  chart: sv('<path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6"/>'),
  cash: sv('<path d="M3 7h18v10H3z"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>'),
  users: sv('<path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a7 7 0 0 1 14 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a7 7 0 0 0-4-6.3"/>'),
  gear: sv('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  download: sv('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>'),
  upload: sv('<path d="M12 15V3M7 8l5-5 5 5M4 21h16"/>'),
  lock: sv('<path d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4"/>'),
  logout: sv('<path d="M9 21H4V3h5M16 17l5-5-5-5M21 12H9"/>'),
  search: sv('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
  plus: sv('<path d="M12 5v14M5 12h14"/>', 2.2),
  minus: sv('<path d="M5 12h14"/>', 2.2),
  x: sv('<path d="M6 6l12 12M18 6 6 18"/>', 2.2),
  check: sv('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.6),
  chev: sv('<path d="M9 6l6 6-6 6"/>', 2.2),
  back: sv('<path d="M15 6l-6 6 6 6"/>', 2.2),
  bell: sv('<path d="M6 16V10a6 6 0 0 1 12 0v6l2 2H4zM10 21h4"/>'),
  print: sv('<path d="M6 9V3h12v6M6 18H3V9h18v9h-3M6 14h12v7H6z"/>'),
  wa: sv('<path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1c-1-.5-1.5-1-2-2l1-1-1-2z"/>'),
  edit: sv('<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>'),
  trash: sv('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>'),
  note: sv('<path d="M5 3h10l4 4v14H5zM14 3v5h5M9 13h6M9 17h4"/>'),
  move: sv('<path d="M5 12h14M15 8l4 4-4 4M9 16l-4-4 4-4"/>'),
  clock: sv('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  user: sv('<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/>'),
  pax: sv('<circle cx="9" cy="8" r="3.2"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5.2a3 3 0 0 1 0 5.6M21 20v-1a6 6 0 0 0-3.5-5.4"/>'),
  phone: sv('<path d="M7 2h10v20H7zM11 18h2"/>'),
  cloud: sv('<path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z"/>'),
  full: sv('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  sound: sv('<path d="M4 9h4l5-4v14l-5-4H4zM17 8a5 5 0 0 1 0 8M19.5 5.5a8.5 8.5 0 0 1 0 13"/>'),
  mute: sv('<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/>'),
  key: sv('<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2M17 6l3 3M14 9l2 2"/>'),
  copy: sv('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  sheet: sv('<path d="M4 3h16v18H4zM4 9h16M4 15h16M10 3v18"/>'),
  store: sv('<path d="M3 9l2-6h14l2 6M3 9v12h18V9M3 9h18M9 21v-6h6v6"/>'),
  tag: sv('<path d="M3 3h8l10 10-8 8L3 11zM7.5 7.5h.01"/>'),
  percent: sv('<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>'),
  info: sv('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>'),
  backspace: sv('<path d="M8 5h13v14H8l-6-7zM12 9l6 6M18 9l-6 6"/>'),
  logo: '<svg viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="7" fill="currentColor"/><path d="M9 10v5.5a3 3 0 0 0 3 3V23M12 10v4.5M15 10v5.5a3 3 0 0 1-3 3" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M22.5 23V9c-2 .8-3 3.5-3 7h3" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/* ================= DATABASE HELPERS ================= */
export const T = (name: string) => (db as any)[name];
let waiters: any[] = [];
export const resolveWaiters = () => waiters.splice(0).forEach((r) => r());
const nextStore = () => new Promise<void>((r) => { waiters.push(r); setTimeout(r, 1200); });
/** Jalankan perubahan data, tunggu liveQuery memuat ulang, tampilkan toast. */
export async function run<R>(fn: () => Promise<R>, okMsg?: string): Promise<R | undefined> {
  const p = nextStore();
  try { const r = await fn(); await p; if (okMsg) toast(okMsg, 'ok'); return r; }
  catch (e: any) { console.error(e); toast('Gagal: ' + (e?.message || e), 'err'); return undefined; }
}
export function addRow(table: string, obj: any) { obj.realmId = sess.realmId; if (!isCloud) obj.id = uid(); return T(table).add(obj); }
export const updRow = (table: string, id: string, ch: any) => T(table).update(id, ch);
export const delRow = (table: string, id: string) => T(table).delete(id);

/* ================= SHEET (bottom sheet di HP, modal di layar lebar) ================= */
let sheetStack: string[] = [];
export function openSheet(html: string, opt: { wide?: boolean; cls?: string } = {}) {
  const s = $('#sheet'); if (!s) return;
  s.className = 'sheet' + (opt.wide ? ' wide' : '') + (opt.cls ? ' ' + opt.cls : '');
  s.innerHTML = `<div class="grip"><span></span></div><button class="sheet-x" aria-label="Tutup" onclick="App.closeSheet()">${IC.x}</button>` + html;
  s.style.transform = '';
  const bg = $('#sheetBg'); bg.classList.add('show');
  requestAnimationFrame(() => s.classList.add('show')); s.scrollTop = 0;
  sheetStack = [html];
  setTimeout(() => { const f = s.querySelector('[autofocus]') as HTMLElement; if (f && isWide()) f.focus(); }, 120);
}
export function closeSheet() {
  const s = $('#sheet'), bg = $('#sheetBg'); if (!s) return;
  s.style.transform = ''; s.classList.remove('show'); bg?.classList.remove('show'); sheetStack = [];
}
export const sheetOpen = () => $('#sheet')?.classList.contains('show');

/** Konfirmasi gaya aplikasi (Promise<boolean>). */
export function ask(title: string, msg = '', okText = 'Ya, lanjutkan', danger = false): Promise<boolean> {
  return new Promise((res) => {
    const d = $('#dialog'); if (!d) return res(confirm(title));
    d.innerHTML = `<div class="dlg"><h3>${title}</h3>${msg ? `<p>${msg}</p>` : ''}<div class="row2">
      <button class="btn ghost" data-v="0">Batal</button><button class="btn ${danger ? 'danger' : ''}" data-v="1">${okText}</button></div></div>`;
    d.hidden = false;
    d.onclick = (e: any) => { const v = e.target.closest('[data-v]')?.dataset.v; if (v == null && e.target !== d) return; d.hidden = true; d.innerHTML = ''; res(v === '1'); };
  });
}
/** Input teks sederhana gaya aplikasi. */
export function prompt2(title: string, label: string, val = '', type = 'text'): Promise<string | null> {
  return new Promise((res) => {
    const d = $('#dialog'); if (!d) return res(prompt(title, val));
    d.innerHTML = `<div class="dlg"><h3>${title}</h3><label class="fl"><span>${label}</span><input id="dlgIn" type="${type}" value="${esc(val)}" ${type === 'number' ? 'inputmode="numeric"' : ''}></label>
      <div class="row2"><button class="btn ghost" data-v="0">Batal</button><button class="btn" data-v="1">Simpan</button></div></div>`;
    d.hidden = false; const i = $('#dlgIn'); setTimeout(() => { i.focus(); i.select(); }, 50);
    const done = (ok: boolean) => { const v = i.value; d.hidden = true; d.innerHTML = ''; res(ok ? v : null); };
    i.onkeydown = (e: any) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
    d.onclick = (e: any) => { const v = e.target.closest('[data-v]')?.dataset.v; if (v == null && e.target !== d) return; done(v === '1'); };
  });
}

/* ================= SUARA (WebAudio, tanpa file) =================
   Browser hanya mengizinkan suara setelah ada sentuhan/klik di halaman. Karena itu AudioContext
   "dibuka" pada interaksi pertama (unlockAudio) dan layar dapur menampilkan pengingat bila belum aktif. */
let actx: AudioContext | null = null;
function audioCtx() { actx = actx || new (window.AudioContext || (window as any).webkitAudioContext)(); return actx; }
export const soundMuted = () => localStorage.getItem('wp_mute') === '1';
export const audioReady = () => !!actx && actx.state === 'running';
export function unlockAudio() {
  try {
    const c = audioCtx(); if (c.state !== 'running') c.resume();
    const b = c.createBuffer(1, 1, 22050), src = c.createBufferSource(); src.buffer = b; src.connect(c.destination); src.start(0);
  } catch {}
}
for (const ev of ['pointerdown', 'keydown', 'touchend']) {
  document.addEventListener(ev, () => {
    if (audioReady()) return;
    unlockAudio(); setTimeout(() => document.dispatchEvent(new CustomEvent('wp:audio')), 150);
  }, { capture: true, passive: true });
}
/** Bunyi notifikasi. new = tiket dapur baru (3 nada naik, diulang 2×), ready = pesanan siap (ding-dong). */
export function beep(kind: 'new' | 'ready' = 'new', force = false) {
  if (soundMuted() && !force) return;
  try {
    const c = audioCtx(); if (c.state === 'suspended') c.resume();
    const seq = kind === 'new' ? [[784, 0], [988, .15], [1319, .3], [784, .65], [988, .8], [1319, .95]] : [[1047, 0], [784, .28]];
    const len = kind === 'new' ? 0.18 : 0.45;
    for (const [f, d] of seq) {
      const t = c.currentTime + 0.02 + d;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + len + 0.02);
    }
  } catch {}
}

/** Kecilkan gambar (logo/foto menu) jadi dataURL. */
export function shrinkImage(file: File, size = 240): Promise<string> {
  return new Promise((res, rej) => {
    if (!file) return rej(new Error('Tidak ada file'));
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); const k = Math.min(1, size / Math.max(img.width, img.height));
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        const webp = c.toDataURL('image/webp', 0.82);
        res(webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => rej(new Error('Gambar tidak bisa dibaca'));
      img.src = r.result as string;
    };
    r.readAsDataURL(file);
  });
}
export async function copyText(t: string) { try { await navigator.clipboard.writeText(t); toast('Disalin', 'ok'); } catch { toast(t); } }
export function download(name: string, content: BlobPart, type: string) {
  const b = new Blob([content], { type }); const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export function centerMsg(icon: string, title: string, sub = '', extra = '') {
  return `<div class="center-msg">${icon === 'spin' ? '<div class="spin"></div>' : `<div class="ico">${IC[icon] || icon}</div>`}<b>${title}</b>${sub ? `<p>${sub}</p>` : ''}${extra}</div>`;
}
export const avatar = (s: any, cls = '') => `<span class="av ${cls}" style="--c:${s?.color || '#64748b'}">${esc(initials(s?.name))}</span>`;
export const emptyBox = (icon: string, t: string, sub = '', act = '') => `<div class="empty">${IC[icon] ? `<div class="ei">${IC[icon]}</div>` : ''}<b>${t}</b>${sub ? `<p>${sub}</p>` : ''}${act}</div>`;

reg({ closeSheet, toast, copyText, num });
