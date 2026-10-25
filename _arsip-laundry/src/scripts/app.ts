/* Fara Wash — aplikasi kasir laundry (Astro + Dexie Cloud + PWA) */
import { navigate } from 'astro:transitions/client';
import { liveQuery } from 'dexie';
import { db, cdb, isCloud } from '../lib/db';
import { hashPassword, verifyPassword } from '../lib/auth';
import { lineChart, columnChart, hbars, C as CHC } from '../lib/charts';
import { toXLSX, toCSV, toTSV, zipCSV, type Dataset } from '../lib/export';

/* ================= KONSTANTA ================= */
const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/';
// Aplikasi berada di /app/ (halaman utama "/" adalah landing page)
const APP = 'app/';
const ROUTES: Record<string, string> = Object.fromEntries(Object.entries({
  home: '', orders: 'order/', kasir: 'kasir/', customers: 'pelanggan/', more: 'lainnya/',
  services: 'layanan/', finance: 'keuangan/', settings: 'pengaturan/', team: 'tim/', export: 'ekspor/',
}).map(([k, v]) => [k, APP + v]));
const OWNER_ONLY = ['finance', 'settings', 'team', 'export'];
const STATUSES = [
  { k: 'diterima', n: 'Diterima' }, { k: 'dicuci', n: 'Dicuci' }, { k: 'disetrika', n: 'Disetrika' },
  { k: 'siap', n: 'Siap Diambil' }, { k: 'diambil', n: 'Sudah Diambil' }];
const METHODS = ['Tunai', 'Transfer', 'QRIS'];
const EXP_CAT = ['Deterjen & Pewangi', 'Plastik & Kemasan', 'Listrik', 'Air', 'Gaji', 'Sewa', 'Perawatan Mesin', 'Lainnya'];
const COLORS = [['#2563eb', 'Biru'], ['#0ea5a4', 'Tosca'], ['#10b981', 'Mint'], ['#7c3aed', 'Ungu'], ['#ec4899', 'Pink'], ['#f97316', 'Oranye'], ['#ef4444', 'Merah'], ['#0f172a', 'Hitam']];
const DEFAULT_SERVICES = [['Cuci Kering Setrika', 'kg', 7000, 2], ['Cuci Kering', 'kg', 5000, 2], ['Setrika Saja', 'kg', 4000, 1], ['Bed Cover', 'pcs', 25000, 3], ['Selimut', 'pcs', 15000, 3], ['Jas / Blazer', 'pcs', 20000, 3], ['Sepatu', 'pasang', 30000, 3], ['Karpet', 'm2', 15000, 4]]
  .map(([name, unit, price, days]) => ({ name, unit, price, days }));
const ROLE_NAMES: Record<string, string> = { owner: 'Pemilik', admin: 'Admin', kasir: 'Kasir' };

/* ================= STATE ================= */
// UI state (dipakai handler inline lewat App.*)
const S: any = { auth: 'welcome', af: {}, authErr: '', authBusy: false, ordFilter: 'aktif', ordQ: '', custQ: '', finFrom: '', finTo: '', finTab: 'ringkas', cart: null, brand: {}, view: 'home' };
// Data outlet aktif (diisi liveQuery)
let D: any = { settings: null, services: [], customers: [], orders: [], expenses: [], members: [] };
// Sesi
const sess: any = {
  phase: 'boot', user: null, ui: null, sync: null, synced: false, realms: [], invites: [],
  userId: '', email: '', name: '', realmId: '', realm: null, role: 'owner', storeReady: false, setupFor: '',
  acc: null, accLoaded: false, intentBusy: false, loginErr: '',
};

/* ================= UTIL ================= */
const $ = (s: string) => document.querySelector(s) as any;
const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const rp = (n: number) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
const num = (v: any) => parseFloat(String(v).replace(',', '.')) || 0;
const pad = (n: number) => String(n).padStart(2, '0');
const dKey = (d: any) => { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const fDate = (d: any) => new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
const fShort = (d: any) => new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
const fDT = (d: any) => new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const today = () => dKey(new Date());
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
/* Umami: catat event (tanpa data pribadi — tidak ada nama, HP, password, atau nominal) */
function track(name: string, data?: Record<string, any>) { try { (window as any).umami?.track(name, data); } catch {} }
function toast(m: string) { const t = $('#toast'); if (!t) return; t.textContent = m; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2400); }
const isOwner = () => sess.role === 'owner' || sess.role === 'admin';
const cust = (id: string) => D.customers.find((c: any) => c.id === id) || { name: '(terhapus)', phone: '' };
const paid = (o: any) => (o.payments || []).reduce((a: number, p: any) => a + p.amount, 0);
const due = (o: any) => Math.max(0, o.total - paid(o));
function payStatus(o: any) { const p = paid(o); if (p >= o.total) return ['lunas', 'Lunas']; if (p > 0) return ['dp', 'DP']; return ['belum', 'Belum Bayar']; }
const stName = (k: string) => (STATUSES.find((s) => s.k === k) || ({} as any)).n || k;
const stIdx = (k: string) => STATUSES.findIndex((s) => s.k === k);
const badge = (k: string) => `<span class="badge s-${k}">${stName(k)}</span>`;
const pbadge = (o: any) => { const [c, n] = payStatus(o); return `<span class="badge p-${c}">${n}</span>`; };
const initials = (n: string) => String(n || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
const isLate = (o: any) => o.status !== 'diambil' && o.status !== 'siap' && new Date(o.dueAt) < new Date(today());
const waNum = (p: string) => { p = String(p || '').replace(/\D/g, ''); return p.startsWith('0') ? '62' + p.slice(1) : p; };
const greet = () => { const h = new Date().getHours(); return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'; };
const shopName = () => D.settings?.name || 'Laundry Saya';
const setg = () => D.settings || { name: '', tagline: '', address: '', phone: '', logo: '', color: '#2563eb', footer: '', prefix: 'LDR', expressPct: 50 };
const slug = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'laundry';
const byName = () => sess.name || sess.email || 'lokal';
const IC: Record<string, string> = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10 12 3l9 7v11h-6v-7H9v7H3z"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h16v18H4zM8 8h8M8 12h8M8 16h5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16M4 12h16"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a7 7 0 0 1 14 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a7 7 0 0 0-4-6.3"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h16v14H3zM3 6l13-3v3M15 13h2"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h8l10 10-8 8L3 11zM7.5 7.5h.01"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5M4 21h16"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H4V3h5M16 17l5-5-5-5M21 12H9"/></svg>',
  store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l2-6h14l2 6M3 9v12h18V9M3 9h18M9 21v-6h6v6"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v9h16v-9M12 3v13M7 8l5-5 5 5"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H3V9h18v9h-3M6 14h12v7H6z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V10a6 6 0 0 1 12 0v6l2 2H4zM10 21h4"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2h10v20H7zM11 18h2"/></svg>',
  crown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z"/></svg>',
  sheet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h16v18H4zM4 9h16M4 15h16M10 3v18"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2M17 6l3 3M14 9l2 2"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  logo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h16v18H4zM4 8h16M8 5.5h.01M11 5.5h.01"/><path d="M12 19a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z"/></svg>',
};

/* ================= DATABASE HELPERS ================= */
const T = (name: string) => (db as any)[name];
let waiters: any[] = [];
const nextStore = () => new Promise<void>((r) => { waiters.push(r); setTimeout(r, 1200); });
async function run<T>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> {
  const p = nextStore();
  try { const r = await fn(); await p; if (okMsg) toast(okMsg); return r; }
  catch (e: any) { console.error(e); toast('Gagal: ' + (e?.message || e)); return undefined; }
}
function addRow(table: string, obj: any) { obj.realmId = sess.realmId; if (!isCloud) obj.id = uid(); return T(table).add(obj); }
const updRow = (table: string, id: string, ch: any) => T(table).update(id, ch);
const delRow = (table: string, id: string) => T(table).delete(id);

/* ================= SHEET ================= */
function openSheet(html: string) {
  const s = $('#sheet'); initSheetDrag();
  s.innerHTML = '<div class="grip" title="Tarik ke bawah untuk menutup"><span></span></div>' + html;
  s.style.transform = ''; s.classList.remove('dragging');
  const bg = $('#sheetBg'); bg.style.opacity = ''; bg.classList.add('show');
  requestAnimationFrame(() => s.classList.add('show')); s.scrollTop = 0;
}
function closeSheet() {
  const s = $('#sheet'), bg = $('#sheetBg'); if (!s) return;
  s.classList.remove('dragging'); void s.offsetHeight; // aktifkan lagi transisi sebelum menutup
  s.style.transform = ''; s.classList.remove('show');
  if (bg) { bg.style.opacity = ''; bg.classList.remove('show'); }
}

/* ---------- Tarik sheet ke bawah untuk menutup (sentuh & mouse) ---------- */
let sheetDragReady = false;
function initSheetDrag() {
  const s = $('#sheet'); if (!s || sheetDragReady) return; sheetDragReady = true;
  let startY = 0, lastY = 0, lastT = 0, vel = 0, dy = 0, active = false, armed = false, fromHandle = false;
  const bg = () => $('#sheetBg');
  const isField = (t: any) => !!t?.closest?.('input,textarea,select,[contenteditable]');
  const begin = (y: number, target: any) => {
    if (!s.classList.contains('show') || isField(target)) return;
    fromHandle = !!target?.closest?.('.grip,h2');
    armed = fromHandle || s.scrollTop <= 0;          // boleh ditarik bila di puncak konten
    startY = lastY = y; lastT = performance.now(); vel = 0; dy = 0; active = false;
  };
  const move = (y: number, e: Event) => {
    if (!armed) return;
    const d = y - startY;
    if (!active) {
      if (d > 6 && (fromHandle || s.scrollTop <= 0)) { active = true; startY = y; s.classList.add('dragging'); }
      else if (d < -6 && !fromHandle) { armed = false; return; } // gulir konten ke atas seperti biasa
      else return;
    }
    e.cancelable && e.preventDefault();
    const raw = y - startY;
    dy = raw > 0 ? raw : -Math.pow(-raw, 0.6);       // efek karet saat ditarik ke atas
    const now = performance.now(), v = (y - lastY) / Math.max(1, now - lastT); vel = vel * 0.4 + v * 0.6; lastY = y; lastT = now;
    s.style.transform = `translate(-50%, ${dy}px)`;
    const h = s.offsetHeight || 1; const b = bg(); if (b) b.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / h));
  };
  const end = () => {
    if (!armed) return; armed = false;
    if (!active) return; active = false;
    const h = s.offsetHeight || 1;
    if (dy > Math.min(130, h * 0.25) || (vel > 0.35 && dy > 24)) { navigator.vibrate?.(10); closeSheet(); }
    else { s.classList.remove('dragging'); void s.offsetHeight; s.style.transform = ''; const b = bg(); if (b) b.style.opacity = ''; }
  };
  s.addEventListener('touchstart', (e: TouchEvent) => begin(e.touches[0].clientY, e.target), { passive: true });
  s.addEventListener('touchmove', (e: TouchEvent) => move(e.touches[0].clientY, e), { passive: false });
  s.addEventListener('touchend', end); s.addEventListener('touchcancel', end);
  // Mouse (desktop): tarik dari pegangan atau judul
  s.addEventListener('mousedown', (e: MouseEvent) => {
    if (!(e.target as any)?.closest?.('.grip,h2') || (e.target as any)?.closest?.('button')) return;
    begin(e.clientY, e.target); e.preventDefault();
    const mm = (ev: MouseEvent) => move(ev.clientY, ev);
    const mu = () => { end(); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
    window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && s.classList.contains('show')) closeSheet(); });
}

/* ================= BRANDING ================= */
function applyBrand() {
  const s = setg(), c = s.color || '#2563eb';
  document.documentElement.style.setProperty('--pri', c);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#f6f7fb');
  document.querySelector('meta[name=apple-mobile-web-app-title]')?.setAttribute('content', shopName());
  if (D.settings) document.title = shopName();
}
function pickLogo(input: HTMLInputElement) {
  const f = input.files?.[0]; if (!f) return; const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const N = 200, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d')!;
      const k = Math.max(N / img.width, N / img.height), w = img.width * k, h = img.height * k;
      x.fillStyle = '#fff'; x.fillRect(0, 0, N, N); x.drawImage(img, (N - w) / 2, (N - h) / 2, w, h);
      S.brand.logo = c.toDataURL('image/jpeg', 0.82); brandPreview();
    };
    img.onerror = () => toast('Gambar tidak bisa dibaca'); img.src = r.result as string;
  };
  r.readAsDataURL(f);
}
function brandFields() {
  const s = S.brand;
  return `<div class="f"><label>Logo (opsional)</label><div class="logo-pick"><div class="ph">${s.logo ? `<img src="${s.logo}">` : esc(initials(s.name || 'L'))}</div>
  <div><label class="btn sm sec" style="margin:0 0 6px;color:var(--tx)">Pilih gambar<input type="file" accept="image/*" style="display:none" onchange="App.pickLogo(this)"></label>
  ${s.logo ? `<button class="btn sm err" onclick="App.brandSet('logo','')">Hapus</button>` : ''}</div></div></div>
 <div class="f"><label>Nama laundry *</label><input id="bN" value="${esc(s.name)}" placeholder="mis. Bersih Kilat Laundry" oninput="App.brandSet('name',this.value,1)"></div>
 <div class="f"><label>Slogan / keterangan</label><input value="${esc(s.tagline)}" placeholder="mis. Cuci bersih, wangi, rapi" oninput="App.brandSet('tagline',this.value,1)"></div>
 <div class="f"><label>Alamat</label><input value="${esc(s.address)}" oninput="App.brandSet('address',this.value,1)"></div>
 <div class="f"><label>No. telp / WhatsApp</label><input type="tel" inputmode="tel" value="${esc(s.phone)}" placeholder="08xxxxxxxxxx" oninput="App.brandSet('phone',this.value,1)"></div>
 <div class="f"><label>Warna tema</label><div class="colors">${COLORS.map(([c, n]) => `<button title="${n}" style="background:${c}" class="${c === s.color ? 'on' : ''}" onclick="App.brandSet('color','${c}')"></button>`).join('')}</div></div>
 <div class="f"><label>Pratinjau</label><div class="preview" id="bPrev"></div></div>`;
}
function brandSet(k: string, v: string, light?: number) { S.brand[k] = v; brandPreview(!!light); }
function brandPreview(light = false) {
  const s = S.brand; document.documentElement.style.setProperty('--pri', s.color || '#2563eb');
  const pv = $('#bPrev');
  if (pv) pv.innerHTML = `<div class="bar">${s.logo ? `<img src="${s.logo}" >` : ''}<div><b>${esc(s.name || 'Nama Laundry')}</b><div style="font-size:12px;opacity:.85">${esc(s.tagline || 'Kasir Laundry')}</div></div></div>`;
  if (light) return;
  const box = $('#brandBox'); if (box) { box.innerHTML = brandFields(); brandPreview(true); }
}
function brandFromSettings() { const s = setg(); S.brand = { name: s.name, tagline: s.tagline, address: s.address, phone: s.phone, logo: s.logo, color: s.color || '#2563eb' }; }
function brandData() {
  const b = S.brand; return { name: (b.name || '').trim(), tagline: (b.tagline || '').trim(), address: (b.address || '').trim(), phone: (b.phone || '').trim(), logo: b.logo || '', color: b.color || '#2563eb' };
}

/* ================= AUTH / SESI ================= */
const ALERT_ID: Record<string, (p: any) => string> = {
  OTP_SENT: (p) => `Kode OTP sudah dikirim ke <b>${esc(p.email || 'email Anda')}</b>. Cek inbox / folder spam.`,
  INVALID_OTP: () => 'Kode OTP salah atau kedaluwarsa. Coba lagi.',
  INVALID_EMAIL: () => 'Format email tidak valid.',
  USER_NOT_REGISTERED: () => 'Email ini belum terdaftar.',
  USER_NOT_ACCEPTED: () => 'Email ini belum diizinkan masuk. Hubungi pemilik laundry.',
  NO_SEATS_AVAILABLE: () => 'Kuota pengguna paket Dexie Cloud sudah penuh.',
  LICENSE_LIMIT_REACHED: () => 'Batas lisensi Dexie Cloud tercapai.',
  USER_DEACTIVATED: () => 'Akun ini dinonaktifkan.',
  LOGOUT_CONFIRMATION: () => 'Masih ada data yang belum tersinkron ke server. Jika keluar sekarang, data tersebut akan hilang.',
};
function loginView(ui: any) {
  const titles: Record<string, string> = { email: 'Masuk', otp: 'Masukkan Kode OTP', 'logout-confirmation': 'Keluar dari akun?', 'message-alert': 'Informasi' };
  const sub: Record<string, string> = { email: 'Masukkan email Anda. Kami kirim kode OTP untuk masuk — tanpa password.', otp: '' };
  const submit: Record<string, string> = { email: 'Kirim Kode OTP', otp: 'Masuk', 'logout-confirmation': 'Tetap Keluar', 'message-alert': 'OK' };
  const cancel: Record<string, string> = { otp: 'Ganti email', 'logout-confirmation': 'Batal' };
  const alerts = (ui.alerts || []).map((a: any) => `<div class="alert ${a.type}">${ALERT_ID[a.messageCode] ? ALERT_ID[a.messageCode](a.messageParams || {}) : esc(a.message)}</div>`).join('');
  const fields = Object.entries(ui.fields || {}).map(([k, f]: any) => {
    if (ui.type === 'otp' || k === 'otp') return `<div class="f"><label>Kode OTP</label><input name="${k}" class="otp-input" type="text" inputmode="text" autocomplete="one-time-code" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="12" placeholder="Kode dari email" required oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'')"><div class="hint">Kode berisi huruf & angka — salin dari email lalu tempel di sini.</div></div>`;
    if (ui.type === 'email' || k === 'email') return `<div class="f"><label>Email</label><input name="${k}" type="email" inputmode="email" autocomplete="email" placeholder="nama@email.com" required value="${esc(localStorage.getItem('fw_last_email') || '')}"></div>`;
    return `<div class="f"><label>${esc(f.label || k)}</label><input name="${k}" type="${f.type === 'password' ? 'password' : 'text'}" placeholder="${esc(f.placeholder || '')}"></div>`;
  }).join('');
  return `<div class="in"><div class="auth-logo">${IC.logo}</div>
  <h1>${titles[ui.type] || esc(ui.title)}</h1>${sub[ui.type] ? `<p class="mut" style="margin-top:0">${sub[ui.type]}</p>` : '<div style="height:10px"></div>'}
  ${alerts}
  <form id="authForm" class="card" onsubmit="event.preventDefault();App.authSubmit()">${fields}
   <button class="btn blk" type="submit" id="authBtn">${submit[ui.type] || esc(ui.submitLabel)}</button>
   ${ui.cancelLabel && ui.type !== 'email' ? `<button class="btn sec blk" type="button" style="margin-top:8px" onclick="App.authCancel()">${cancel[ui.type] || esc(ui.cancelLabel)}</button>` : ''}
  </form>
  <p class="mut" style="font-size:12px;text-align:center">Data tersimpan aman & tersinkron antar perangkat.</p></div>`;
}
function authSubmit() {
  const ui = sess.ui; if (!ui) return;
  const params: any = {};
  document.querySelectorAll<HTMLInputElement>('#authForm input[name]').forEach((i) => (params[i.name] = i.name === 'otp' ? i.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : i.value.trim()));
  if (params.email) localStorage.setItem('fw_last_email', params.email);
  const b = $('#authBtn'); if (b) { b.disabled = true; b.textContent = 'Memproses…'; }
  ui.onSubmit(params);
}
function authCancel() { sess.ui?.onCancel(); }

/* ---------- Layar pembuka: Masuk / Daftar Laundry ---------- */
const lslug = (s: string) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const unameOk = (u: string) => /^[a-z0-9._-]{3,24}$/.test(u);
const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
let localLaundries: any[] = [];
/** Tabel akun: lokal = accounts, cloud = staff (tersinkron). */
const STAFF = () => (isCloud ? db.staff : db.accounts);
const deviceOn = () => isCloud && !!sess.user?.isLoggedIn;
/** Daftar laundry yang bisa dimasuki di perangkat ini. */
function laundryList(): any[] {
  if (!isCloud) return localLaundries.map((l) => ({ id: l.id, name: l.name, slug: l.slug, rec: l }));
  const u = sess.user; if (!u?.isLoggedIn) return [];
  return (sess.realms || []).filter((r: any) => r.realmId !== u.userId && r.realmId !== 'rlm-public' && r.name)
    .map((r: any) => ({ id: r.realmId, name: r.name, slug: lslug(r.name), owner: r.owner }));
}
const findLaundry = (name: string) => { const sl = lslug(name); return laundryList().find((l) => l.slug === sl || l.name.toLowerCase() === name.trim().toLowerCase()); };
function recoveryCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', a = new Uint8Array(12); crypto.getRandomValues(a);
  const s = [...a].map((x) => A[x % A.length]).join(''); return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
const normCode = (c: string) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function welcomeView() {
  const list = laundryList();
  const dev = isCloud ? (deviceOn()
    ? `HP ini terhubung ke ${list.length ? '<b>' + list.map((l) => esc(l.name)).join(', ') + '</b>' : 'akun pemilik ' + esc(sess.user.email)}`
    : 'HP baru? Pemilik mengaktifkan sekali dengan email & kode OTP')
    : 'Mode lokal · akun & data tersimpan di perangkat ini';
  return `<div class="in welcome">
  <div class="auth-logo">${IC.logo}</div>
  <h1>Kelola laundry jadi gampang ✨</h1>
  <p class="mut">Catat order, lacak cucian, dan pantau keuangan — semua tercatat sesuai laundry & akun Anda.</p>
  <div class="feat">
   <div><span>${IC.list}</span>Order & nota WA</div><div><span>${IC.bell}</span>Status cucian</div><div><span>${IC.wallet}</span>Laporan keuangan</div>
  </div>
  ${S.authInfo ? `<div class="alert info">${S.authInfo}</div>` : ''}
  <button class="choice" onclick="App.authGo('login')"><span class="ci">${IC.users}</span><span class="cm"><b>Masuk</b><small>Pemilik, admin & kasir</small></span><span class="ca">${IC.chev}</span></button>
  <button class="choice pri" onclick="App.authGo('register')"><span class="ci">${IC.store}</span><span class="cm"><b>Daftar Laundry</b><small>Buat laundry & akun pemilik baru</small></span><span class="ca">${IC.chev}</span></button>
  <p class="mut foot-note">${dev}</p>
 </div>`;
}
function fld(k: string, label: string, opt: any = {}) {
  const v = S.af[k] ?? '';
  const pw = opt.type === 'password';
  return `<div class="f"><label for="af_${k}">${label}${opt.req ? ' *' : ''}</label>${pw ? '<div class="pw">' : ''}<input id="af_${k}" name="${k}" type="${opt.type || 'text'}" ${opt.list ? `list="${opt.list}"` : ''} ${opt.im ? `inputmode="${opt.im}"` : ''} autocomplete="${opt.ac || 'off'}" autocapitalize="${opt.cap || 'off'}" placeholder="${esc(opt.ph || '')}" value="${esc(v)}" oninput="App.afSet('${k}',this.value)">${pw ? `<button type="button" class="eye" onclick="App.togglePw(this)" aria-label="Lihat password">${IC.eye}</button></div>` : ''}${opt.hint ? `<div class="hint" id="hint_${k}">${opt.hint}</div>` : ''}</div>`;
}
function authFormView() {
  const a = S.auth;
  const slugHint = () => S.af.laundry ? `Kode laundry: <b>${esc(lslug(S.af.laundry) || '-')}</b>` : 'Nama ini dipakai saat masuk';
  const laundryF = (hint = 'Sesuai nama saat mendaftar') => fld('laundry', 'Nama laundry', { req: 1, ph: 'Nama / kode laundry', cap: 'words', list: 'dl_laundry', hint });
  const pw2 = (lbl = 'Password') => fld('password', lbl, { req: 1, type: 'password', ac: 'new-password', ph: 'Minimal 6 karakter' }) + fld('password2', 'Ulangi password', { req: 1, type: 'password', ac: 'new-password' });
  let title = '', sub = '', body = '', btn = '', icon = IC.users, foot = '';
  if (a === 'register') {
    title = 'Daftar Laundry'; icon = IC.store;
    sub = 'Buat laundry baru. Anda otomatis menjadi <b>Pemilik</b> dan bisa membuat akun kasir/admin nanti.';
    body = fld('laundry', 'Nama laundry', { req: 1, ph: 'mis. Bersih Kilat Laundry', cap: 'words', hint: slugHint() })
      + fld('name', 'Nama Anda (pemilik)', { req: 1, ph: 'mis. Fara', cap: 'words', ac: 'name' })
      + (isCloud ? fld('email', 'Email pemilik', { req: 1, type: 'email', im: 'email', ac: 'email', ph: 'nama@email.com', hint: 'Untuk verifikasi (kode OTP), mengaktifkan HP kasir & reset password' }) : '')
      + fld('username', 'Username', { req: 1, ph: 'mis. fara', ac: 'username', hint: 'Huruf kecil/angka, 3–24 karakter' }) + pw2()
      + fld('phone', 'No. WhatsApp laundry', { type: 'tel', im: 'tel', ph: '08xxxxxxxxxx' });
    btn = isCloud ? 'Daftar & kirim kode OTP' : 'Daftar Laundry';
    foot = `Sudah punya akun? <a onclick="App.authGo('login')">Masuk</a>`;
  } else if (a === 'login') {
    title = 'Masuk'; sub = 'Masuk dengan nama laundry, username & password Anda.';
    body = laundryF() + fld('username', 'Username', { req: 1, ac: 'username', ph: 'Username Anda' })
      + fld('password', 'Password', { req: 1, type: 'password', ac: 'current-password' });
    btn = 'Masuk';
    foot = `<a onclick="App.authGo('reset')">Lupa password pemilik?</a><br><span class="mut" style="font-size:12.5px">Kasir/admin lupa password? Minta pemilik reset di Tim & Akses.</span>
     <br><br>Belum punya laundry? <a onclick="App.authGo('register')">Daftar laundry</a>
     ${deviceOn() ? `<br><br><span class="mut" style="font-size:12.5px">Laundry lain? <a onclick="App.activateOther()">Aktifkan HP untuk laundry lain</a></span>` : ''}`;
  } else if (a === 'activate') {
    title = 'Aktifkan HP ini'; icon = IC.key;
    sub = `HP ini belum terhubung ke laundry <b>${esc(S.pending?.laundry || '')}</b>. <b>Pemilik</b> cukup memasukkan email-nya sekali, lalu kode OTP yang dikirim ke email pemilik. Setelah itu kasir bisa masuk dengan username & password.`;
    body = fld('email', 'Email pemilik laundry', { req: 1, type: 'email', im: 'email', ac: 'email', ph: 'email pemilik' });
    btn = 'Kirim kode OTP ke pemilik';
    foot = `<a onclick="App.authGo('login')">Batal</a>`;
  } else if (a === 'reset') {
    title = 'Reset password pemilik'; icon = IC.key;
    sub = isCloud ? 'Verifikasi lewat kode OTP yang dikirim ke email pemilik, lalu password baru langsung berlaku.'
      : 'Masukkan <b>kode pemulihan</b> yang ditampilkan saat mendaftar laundry.';
    body = laundryF('Laundry yang ingin di-reset')
      + (isCloud ? fld('email', 'Email pemilik', { req: 1, type: 'email', im: 'email', ac: 'email', ph: 'nama@email.com' })
        : fld('code', 'Kode pemulihan', { req: 1, ph: 'XXXX-XXXX-XXXX', cap: 'characters' }))
      + pw2('Password baru');
    btn = isCloud ? 'Kirim kode OTP' : 'Simpan password baru';
    foot = `<a onclick="App.authGo('login')">Kembali ke Masuk</a>`;
  }
  const legacy = a === 'register' && !isCloud && !localLaundries.length && S.hasLegacy;
  return `<div class="in">
  <button class="back" onclick="App.authGo('${a === 'activate' || a === 'reset' ? 'login' : 'welcome'}')">‹ Kembali</button>
  <div class="auth-logo">${icon}</div>
  <h1>${title}</h1>
  <p class="mut">${sub}</p>
  ${S.authErr ? `<div class="alert error">${S.authErr}</div>` : ''}
  ${legacy ? `<div class="alert info">Data yang sudah ada di perangkat ini akan otomatis masuk ke laundry yang Anda daftarkan.</div>` : ''}
  <form class="card" id="afForm" onsubmit="event.preventDefault();App.authSubmitForm()" autocomplete="on">
   ${body}
   <button class="btn blk" type="submit" id="afBtn" ${S.authBusy ? 'disabled' : ''}>${S.authBusy ? 'Memproses…' : btn}</button>
  </form>
  <p class="switch">${foot}</p>
  <datalist id="dl_laundry">${laundryList().map((l) => `<option value="${esc(l.name)}">`).join('')}</datalist>
 </div>`;
}
function recoveryView() {
  return `<div class="in"><div class="auth-logo">${IC.key}</div><h1>Simpan kode pemulihan</h1>
  <p class="mut">Kode ini satu-satunya cara mereset password <b>pemilik</b> bila lupa. Catat atau foto, lalu simpan di tempat aman.</p>
  <div class="card" style="text-align:center"><div class="mut" style="font-size:12.5px;margin-bottom:6px">Kode pemulihan · ${esc(S.recovery?.laundry || '')}</div>
   <div class="rcode">${esc(S.recovery?.code || '')}</div>
   <button class="btn sec sm" style="margin-top:12px" onclick="App.copyText('${esc(S.recovery?.code || '')}')">${IC.copy}Salin kode</button></div>
  <button class="btn blk" onclick="App.recoveryDone()">Sudah saya simpan, lanjutkan</button></div>`;
}
function authGo(v: string) {
  S.auth = v; S.authErr = ''; S.authBusy = false; S.authInfo = '';
  if (v === 'login' || v === 'reset') {
    const last = JSON.parse(localStorage.getItem('fw_last_login') || '{}');
    S.af = { laundry: S.af.laundry || last.laundry || '', username: v === 'login' ? last.username || '' : '', email: last.email || '' };
  } else if (v === 'register' || v === 'welcome') S.af = {};
  if (v !== 'activate') S.pending = null;
  renderOverlay(true);
}
function afSet(k: string, v: string) {
  S.af[k] = v;
  if (k === 'laundry' && S.auth === 'register') { const h = $('#hint_laundry'); if (h) h.innerHTML = v ? `Kode laundry: <b>${esc(lslug(v) || '-')}</b>` : 'Nama ini dipakai saat masuk'; }
}
function togglePw(b: any) { const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; b.classList.toggle('on', i.type === 'text'); }
function authFail(msg: string, focus?: string) { track('auth-gagal', { form: S.auth, kolom: focus || '-' }); S.authErr = msg; S.authBusy = false; renderOverlay(true); if (focus) setTimeout(() => $('#af_' + focus)?.focus(), 60); }
async function copyText(t: string) { try { await navigator.clipboard.writeText(t); toast('Disalin'); } catch { toast(t); } }

async function authSubmitForm() {
  if (S.authBusy) return;
  const f = S.af, a = S.auth;
  const laundry = String(f.laundry || '').trim(), name = String(f.name || '').trim();
  const username = String(f.username || '').trim().toLowerCase(), email = String(f.email || '').trim().toLowerCase();
  const password = String(f.password || '');
  if (a !== 'activate' && (!laundry || !lslug(laundry))) return authFail('Nama laundry wajib diisi.', 'laundry');
  if (a === 'register' && !name) return authFail('Nama Anda wajib diisi.', 'name');
  if ((a === 'register' || a === 'activate' || (a === 'reset' && isCloud)) && isCloud && !emailOk(email)) return authFail('Email tidak valid.', 'email');
  if ((a === 'register' || a === 'login') && !unameOk(username)) return authFail('Username 3–24 karakter: huruf kecil, angka, titik, - atau _.', 'username');
  if (a === 'login' && !password) return authFail('Password wajib diisi.', 'password');
  if (a === 'register' || a === 'reset') {
    if (password.length < 6) return authFail('Password minimal 6 karakter.', 'password');
    if (password !== f.password2) return authFail('Ulangi password tidak sama.', 'password2');
  }
  if (a === 'reset' && !isCloud && !normCode(f.code)) return authFail('Kode pemulihan wajib diisi.', 'code');
  S.authBusy = true; S.authErr = ''; renderOverlay(true);
  localStorage.setItem('fw_last_login', JSON.stringify({ laundry: laundry || S.pending?.laundry || '', username, email }));
  try {
    if (a === 'register') {
      const d = { laundry, name, username, email, phone: String(f.phone || '').trim(), pw: await hashPassword(password) };
      if (isCloud) await cloudStart({ type: 'register', ...d }); else await localRegister(d);
    } else if (a === 'login') {
      if (isCloud && !findLaundry(laundry)) {
        // HP belum terhubung ke laundry ini → aktivasi oleh pemilik
        S.pending = { type: 'login', laundry, username, password };
        S.auth = 'activate'; S.authBusy = false; S.af = { email: '' }; renderOverlay(true); return;
      }
      await staffLogin(laundry, username, password);
    } else if (a === 'activate') {
      await cloudStart({ ...S.pending, email });
    } else if (a === 'reset') {
      const pw = await hashPassword(password);
      if (isCloud) await cloudStart({ type: 'reset', laundry, email, pw }, true);
      else await localReset(laundry, f.code, pw);
    }
  } catch (e: any) { console.error(e); authFail(e?.message || String(e)); }
}

/* ---------- Masuk dengan username + password (kedua mode) ---------- */
async function staffLogin(laundry: string, username: string, password: string) {
  const l = findLaundry(laundry);
  if (!l) return authFail(isCloud ? `Laundry "${esc(laundry)}" tidak terhubung di HP ini.` : `Laundry "${esc(laundry)}" tidak ditemukan di perangkat ini. Periksa ejaan atau <a onclick="App.authGo('register')">daftar laundry</a>.`, 'laundry');
  const acc = await STAFF().where('[realmId+username]').equals([l.id, username]).first();
  if (!acc || !(await verifyPassword(password, acc))) return authFail('Username atau password salah.', 'password');
  if (!acc.active) return authFail('Akun ini dinonaktifkan oleh pemilik laundry.');
  await STAFF().update(acc.id, { lastLogin: new Date().toISOString() }).catch(() => {});
  await setSession(acc);
  track('login-berhasil', { mode: isCloud ? 'online' : 'lokal', peran: acc.role });
  toast(`Halo, ${acc.name}! 👋`);
}
async function setSession(acc: any) {
  localStorage.setItem('fw_session', acc.id);
  sess.acc = acc; sess.accLoaded = true; S.authBusy = false; S.af = {}; S.auth = 'welcome'; S.pending = null; S.authInfo = '';
  storeRealm = ''; sess.storeReady = false; if (!isCloud) await loadLocalLaundries();
  evaluate();
}
async function loadSession() {
  if (!isCloud) {
    await loadLocalLaundries();
    S.hasLegacy = (await db.settings.where('realmId').equals('local').count()) > 0 && !localLaundries.length;
  }
  const id = localStorage.getItem('fw_session');
  const acc = id ? await STAFF().get(id).catch(() => null) : null;
  sess.acc = acc && acc.active ? acc : null; sess.accLoaded = true;
  evaluate();
}

/* ---------- Mode lokal ---------- */
async function loadLocalLaundries() { try { localLaundries = await db.laundries.toArray(); } catch { localLaundries = []; } }
async function localRegister(d: any) {
  const slugv = lslug(d.laundry);
  if (await db.laundries.where('slug').equals(slugv).first()) return authFail(`Laundry "${esc(d.laundry)}" sudah terdaftar di perangkat ini. Silakan <a onclick="App.authGo('login')">Masuk</a>.`, 'laundry');
  const legacy = !localLaundries.length && (await db.settings.where('realmId').equals('local').count()) > 0;
  const realmId = legacy ? 'local' : 'lnd_' + uid();
  const now = new Date().toISOString();
  const code = recoveryCode(); const rec = await hashPassword(normCode(code));
  const acc = { id: 'acc_' + uid(), realmId, username: d.username, name: d.name, role: 'owner', ...d.pw, active: true, createdAt: now, lastLogin: now };
  await db.transaction('rw', [db.laundries, db.accounts, db.settings, db.services], async () => {
    await db.laundries.add({ id: realmId, slug: slugv, name: d.laundry, createdAt: now, recovery: rec });
    await db.accounts.add(acc as any);
    const st = await db.settings.where('realmId').equals(realmId).first();
    if (st) await db.settings.update(st.id, { name: d.laundry, ...(d.phone ? { phone: d.phone } : {}) });
    else await db.settings.add({ id: uid(), ...defaultSettings(d.laundry, d.phone), realmId } as any);
    if (!(await db.services.where('realmId').equals(realmId).count())) await db.services.bulkAdd(DEFAULT_SERVICES.map((s, i) => ({ ...s, sort: i, id: uid(), realmId })) as any);
  });
  track('daftar-berhasil', { mode: 'lokal' });
  S.recovery = { code, laundry: d.laundry, acc };
  S.auth = 'recovery'; S.authBusy = false; renderOverlay(true);
}
async function recoveryDone() {
  const r = S.recovery; S.recovery = null;
  if (r?.acc && r.acc.id !== sess.acc?.id) { await setSession(r.acc); toast(`Laundry ${r.laundry} siap dipakai! 👋`); }
  else { S.auth = 'welcome'; evaluate(); renderOverlay(true); }
}
async function localReset(laundry: string, code: string, pw: any) {
  const l = findLaundry(laundry);
  if (!l) return authFail(`Laundry "${esc(laundry)}" tidak ditemukan di perangkat ini.`, 'laundry');
  const rec = l.rec?.recovery;
  if (!rec) return authFail('Laundry ini belum punya kode pemulihan. Hubungi pengembang aplikasi untuk bantuan.');
  if (!(await verifyPassword(normCode(code), rec))) return authFail('Kode pemulihan salah.', 'code');
  const owner = await db.accounts.where('realmId').equals(l.id).filter((a: any) => a.role === 'owner').first();
  if (!owner) return authFail('Akun pemilik tidak ditemukan.');
  await db.accounts.update(owner.id, { ...pw, active: true });
  toast(`Password diganti. Masuk sebagai @${owner.username} 👋`);
  await setSession({ ...owner, ...pw, active: true });
}
async function newRecoveryCode() {
  const code = recoveryCode(); const rec = await hashPassword(normCode(code));
  await db.laundries.update(sess.realmId, { recovery: rec }); await loadLocalLaundries();
  closeSheet(); S.recovery = { code, laundry: shopName() }; S.auth = 'recovery';
  sess.phase = 'recovery'; renderOverlay(true);
}

/* ---------- Mode cloud: HP diaktifkan pemilik (email + OTP Dexie Cloud) ---------- */
async function cloudStart(p: any, forceOtp = false) {
  S.pending = p; S.authErr = '';
  const u = sess.user;
  if (u?.isLoggedIn && !forceOtp && (u.email || '').toLowerCase() === p.email) { S.pendingGo = true; evaluate(); return; }
  if (u?.isLoggedIn) { try { await cdb.cloud.logout(); } catch (e) { console.error(e); } }
  sess.synced = false; S.pendingGo = true;
  try { await cdb.cloud.login({ email: p.email, grant_type: 'otp' }); }
  catch (e: any) {
    S.authBusy = false; S.pendingGo = false; const back = p.type === 'login' ? 'activate' : p.type;
    if (/cancel/i.test(e?.message || '')) { S.auth = back; renderOverlay(true); return; }
    S.auth = back; authFail('Gagal verifikasi: ' + (e?.message || e));
  }
}
async function processPending() {
  if (sess.intentBusy || !S.pending) return;
  const p = S.pending, u = sess.user; if (!u?.isLoggedIn) return;
  sess.intentBusy = true; S.pendingGo = false;
  const back = (auth: string, msg: string) => { S.auth = auth; S.authErr = msg; S.authBusy = false; };
  try {
    if (p.email && (u.email || '').toLowerCase() !== p.email) { back(p.type === 'login' ? 'activate' : p.type, 'Email yang diverifikasi berbeda.'); return; }
    const want = lslug(p.laundry);
    const mine = laundryList().filter((l) => l.owner === u.userId);
    if (p.type === 'register') {
      if (mine.some((l) => l.slug === want)) { S.af = { laundry: p.laundry, username: p.username }; back('login', `Laundry "${esc(p.laundry)}" sudah terdaftar atas email ini. Silakan masuk.`); return; }
      const realmId = await createCloudOutlet({ name: p.laundry, phone: p.phone || '' });
      const now = new Date().toISOString();
      const id = await db.staff.add({ realmId, username: p.username, name: p.name, role: 'owner', email: p.email, ...p.pw, active: true, createdAt: now, lastLogin: now } as any);
      const acc = await db.staff.get(id);
      S.pending = null; await setSession(acc); toast(`Laundry ${p.laundry} siap dipakai! 👋`);
    } else if (p.type === 'login') {
      const l = findLaundry(p.laundry);
      if (!l) { S.af = { email: '' }; back('activate', `Email <b>${esc(u.email)}</b> bukan pemilik laundry <b>${esc(p.laundry)}</b>. Gunakan email pemilik laundry tersebut.`); try { await cdb.cloud.logout(); } catch {} return; }
      S.pending = null; S.auth = 'login'; S.af = { laundry: p.laundry, username: p.username };
      await staffLogin(p.laundry, p.username, p.password);
    } else if (p.type === 'reset') {
      const l = mine.find((x) => x.slug === want);
      if (!l) { back('reset', `Email <b>${esc(u.email)}</b> bukan pemilik laundry <b>${esc(p.laundry)}</b>.`); return; }
      const owner = await db.staff.where('realmId').equals(l.id).filter((a: any) => a.role === 'owner').first();
      if (!owner) { back('reset', 'Akun pemilik tidak ditemukan.'); return; }
      await db.staff.update(owner.id, { ...p.pw, active: true });
      S.pending = null; toast(`Password diganti. Masuk sebagai @${owner.username} 👋`);
      await setSession({ ...owner, ...p.pw, active: true });
    }
  } catch (e: any) { console.error(e); back(p.type === 'login' ? 'activate' : p.type, 'Gagal: ' + e.message); }
  finally { sess.intentBusy = false; if (S.authErr && p.type !== 'login') S.pending = null; S.authBusy = false; evaluate(); renderOverlay(true); }
}
function activateOther() { S.pending = { type: 'login', laundry: S.af.laundry || '', username: S.af.username || '', password: S.af.password || '' }; if (!S.pending.laundry) return authFail('Isi nama laundry & akun dulu, lalu ketuk “Aktifkan HP untuk laundry lain”.', 'laundry'); S.auth = 'activate'; S.af = { email: '' }; S.authErr = ''; renderOverlay(true); }
function defaultSettings(name: string, phone = '') {
  return { name, tagline: '', address: '', phone, logo: '', color: '#2563eb', footer: 'Terima kasih! Cucian yang tidak diambil >30 hari di luar tanggung jawab kami.', prefix: (name.replace(/[^A-Za-z]/g, '').slice(0, 3) || 'LDR').toUpperCase(), expressPct: 50 };
}
async function createCloudOutlet(b: any) {
  let realmId = '';
  await db.transaction('rw', [cdb.realms, db.settings, db.services], async () => {
    realmId = await cdb.realms.add({ name: b.name });
    await db.settings.add({ ...defaultSettings(b.name, b.phone || ''), realmId } as any);
    await db.services.bulkAdd(DEFAULT_SERVICES.map((s, i) => ({ ...s, sort: i, realmId })) as any);
  });
  sess.realms = await cdb.realms.toArray();
  track('daftar-berhasil', { mode: 'online' });
  return realmId;
}
async function disconnectDevice() {
  if (!confirm('Putuskan HP ini dari akun pemilik? Kasir tidak bisa masuk di HP ini sampai diaktifkan lagi.')) return;
  closeSheet(); localStorage.removeItem('fw_session'); sess.acc = null;
  storeSub?.unsubscribe(); storeRealm = ''; sess.storeReady = false; D = { settings: null, services: [], customers: [], orders: [], expenses: [], members: [] };
  try { await cdb.cloud.logout(); } catch (e) { console.error(e); }
  S.auth = 'welcome'; evaluate(); renderOverlay(true); go('home');
}

function centerMsg(icon: string, title: string, sub = '') {
  return `<div class="in"><div class="center-msg">${icon === 'spin' ? '<div class="spin"></div>' : `<div class="ico">${IC[icon] || ''}</div>`}<b style="color:var(--tx);font-size:16px;font-weight:600">${title}</b>${sub ? `<div>${sub}</div>` : ''}</div></div>`;
}
function setupView() {
  return `<div class="in"><div class="auth-logo">${IC.logo}</div><h1>Selamat datang!</h1>
  <p class="mut" style="margin-top:0">Atur identitas laundry Anda. Nama, logo, dan warna tampil di aplikasi, nota, dan pesan WhatsApp. Bisa diubah kapan saja di Pengaturan.</p>
  <div class="card" id="brandBox">${brandFields()}</div>
  <button class="btn blk" id="setupBtn" onclick="App.finishSetup()">Mulai Pakai Aplikasi</button></div>`;
}
function renderOverlay(force = false) {
  const o = $('#overlay'); if (!o) return;
  let html = '';
  if (sess.ui && (sess.ui.type === 'otp' || sess.ui.type === 'email' || sess.ui.type === 'logout-confirmation' || sess.ui.type === 'message-alert')) html = loginView(sess.ui);
  else if (S.auth === 'recovery' && S.recovery) html = recoveryView();
  else if (sess.phase === 'login') html = S.auth === 'welcome' ? welcomeView() : authFormView();
  else if (sess.phase === 'boot') html = centerMsg('spin', 'Memuat…');
  else if (sess.phase === 'preparing') html = centerMsg('spin', S.pending?.type === 'register' ? 'Menyiapkan laundry Anda…' : 'Memeriksa akun…', 'Sebentar ya ✨');
  else if (sess.phase === 'syncing') html = centerMsg('spin', 'Menyinkronkan data…', 'Pertama kali butuh koneksi internet.');
  else if (sess.phase === 'setup') html = setupView();
  if (!html) { o.hidden = true; o.innerHTML = ''; o.dataset.k = ''; return; }
  const key = sess.phase + '|' + S.auth + '|' + (sess.ui ? sess.ui.type + JSON.stringify(sess.ui.alerts || []) : '') + '|' + laundryList().length;
  if (!force && o.dataset.k === key && !o.hidden) return;
  o.dataset.k = key; o.hidden = false; o.innerHTML = html;
  if (sess.phase === 'setup') brandPreview(true);
  o.scrollTop = 0;
  if (S.auth !== 'welcome' && S.auth !== 'recovery') setTimeout(() => { const i = [...o.querySelectorAll('input')].find((x: any) => !x.value) || o.querySelector('input'); i?.focus(); }, 80);
}

let storeSub: any = null, storeRealm = '';
function startStore(realmId: string) {
  if (storeRealm === realmId) return;
  storeSub?.unsubscribe(); storeRealm = realmId; sess.storeReady = false;
  storeSub = liveQuery(async () => {
    const [settings, services, customers, orders, expenses, members] = await Promise.all([
      db.settings.where('realmId').equals(realmId).first(),
      db.services.where('realmId').equals(realmId).toArray(),
      db.customers.where('realmId').equals(realmId).toArray(),
      db.orders.where('realmId').equals(realmId).toArray(),
      db.expenses.where('realmId').equals(realmId).toArray(),
      STAFF().where('realmId').equals(realmId).toArray(),
    ]);
    return { settings, services, customers, orders, expenses, members };
  }).subscribe((d: any) => {
    d.services.sort((a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name));
    D = d; sess.storeReady = true;
    waiters.splice(0).forEach((r) => r());
    // akun dinonaktifkan / dihapus pemilik (juga dari HP lain) → keluar
    if (sess.acc) {
      const me = d.members.find((m: any) => m.id === sess.acc.id);
      if (me && me.active) { sess.acc = me; sess.role = me.role; sess.name = me.name; }
      else if (me || sess.synced || !isCloud) { forceLogout(me ? 'Akun Anda dinonaktifkan oleh pemilik.' : 'Akun Anda sudah dihapus.'); return; }
    }
    evaluate(); if (sess.phase === 'ready') renderPage();
  }, (e: any) => { console.error(e); toast('Gagal memuat data: ' + e.message); });
}
function forceLogout(msg: string) {
  localStorage.removeItem('fw_session'); sess.acc = null; storeSub?.unsubscribe(); storeRealm = ''; sess.storeReady = false;
  D = { settings: null, services: [], customers: [], orders: [], expenses: [], members: [] };
  S.auth = 'welcome'; S.authInfo = msg; evaluate(); renderOverlay(true);
}

function evaluate() {
  const prev = sess.phase;
  const u = sess.user;
  if (isCloud) sess.email = u?.email || '';
  if (isCloud && !u) sess.phase = 'boot'; // menunggu status Dexie Cloud
  else if (isCloud && S.pending && S.pendingGo && u.isLoggedIn) {
    // setelah verifikasi OTP: tunggu sinkron pertama lalu proses daftar / aktivasi / reset
    if (!sess.synced) sess.phase = 'syncing';
    else { sess.phase = 'preparing'; setTimeout(processPending, 0); }
  } else {
    const a = sess.acc;
    const okRealm = !a || !isCloud || !sess.synced || laundryList().some((l) => l.id === a.realmId);
    if (!sess.accLoaded) sess.phase = 'boot';
    else if (!a || (isCloud && !u?.isLoggedIn) || !okRealm) {
      if (a) { localStorage.removeItem('fw_session'); sess.acc = null; }
      sess.phase = 'login'; storeSub?.unsubscribe(); storeRealm = ''; sess.storeReady = false;
    } else {
      sess.userId = a.id; sess.realmId = a.realmId; sess.role = a.role; sess.name = a.name; sess.username = a.username;
      sess.laundry = laundryList().find((l) => l.id === a.realmId);
      startStore(a.realmId);
      if (!sess.storeReady) sess.phase = isCloud && !sess.synced ? 'syncing' : 'boot';
      else if (!D.settings) {
        if (isCloud && !sess.synced) sess.phase = 'syncing';
        else if (isOwner()) { if (prev !== 'setup') { sess.setupFor = 'outlet'; brandFromSettings(); S.brand.name = sess.laundry?.name || ''; } sess.phase = 'setup'; }
        else sess.phase = 'ready';
      } else sess.phase = 'ready';
    }
  }
  if (sess.phase !== prev || sess.phase !== 'ready') renderOverlay();
  if (sess.phase === 'ready' && prev !== 'ready') { applyBrand(); renderPage(); }
}

async function finishSetup() {
  const b = brandData(); if (!b.name) { toast('Nama laundry wajib diisi'); $('#bN')?.focus(); return; }
  const btn = $('#setupBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }
  try {
    await db.transaction('rw', [db.settings, db.services], async () => {
      await addRow('settings', { ...defaultSettings(b.name, b.phone), ...b });
      if (!D.services.length) for (const [i, s] of DEFAULT_SERVICES.entries()) await addRow('services', { ...s, sort: i });
    });
    sess.setupFor = ''; toast('Siap dipakai!');
  } catch (e: any) { console.error(e); toast('Gagal: ' + e.message); if (btn) { btn.disabled = false; btn.textContent = 'Mulai Pakai Aplikasi'; } }
  evaluate();
}
/** Keluar dari akun (HP tetap terhubung ke laundry). */
async function logout() {
  if (!confirm('Keluar dari akun ini?')) return;
  closeSheet();
  storeSub?.unsubscribe(); storeRealm = ''; sess.storeReady = false; sess.realmId = ''; D = { settings: null, services: [], customers: [], orders: [], expenses: [], members: [] };
  S.cart = null; S.auth = 'welcome'; S.af = {};
  localStorage.removeItem('fw_session'); sess.acc = null; if (!isCloud) await loadLocalLaundries();
  evaluate(); renderOverlay(true);
  if (!S.view || S.view !== 'home') go('home');
}

function initCloud() {
  cdb.cloud.userInteraction.subscribe((ui: any) => { sess.ui = ui; renderOverlay(true); });
  cdb.cloud.currentUser.subscribe((u: any) => { const was = sess.user?.userId; sess.user = u; if (u?.userId !== was) sess.synced = false; evaluate(); });
  cdb.cloud.syncState.subscribe((s: any) => {
    sess.sync = s;
    if (['in-sync', 'offline', 'error'].includes(s?.phase) || s?.status === 'offline') { if (!sess.synced) { sess.synced = true; evaluate(); } }
    renderSync();
  });
  cdb.cloud.events.syncComplete.subscribe(() => { if (!sess.synced) { sess.synced = true; evaluate(); } });
  liveQuery(() => cdb.realms.toArray()).subscribe((r: any) => { sess.realms = r; evaluate(); });
  db.open().then(loadSession).catch((e: any) => { console.error(e); toast('Gagal membuka database: ' + e.message); });
}
function renderSync() {
  const el = $('#hSync'); if (!el || !isCloud) return; el.hidden = false;
  const s = sess.sync || {}; const p = s.phase;
  el.className = 'sync ' + (s.error || p === 'error' ? 'err' : p === 'in-sync' ? 'ok' : p === 'offline' || s.status === 'offline' ? '' : 'busy');
  el.title = s.error ? 'Gagal sinkron' : p === 'in-sync' ? 'Tersinkron' : p === 'offline' ? 'Offline — data tersimpan di HP & disinkron saat online' : 'Menyinkronkan…';
}

/* ================= ROUTER ================= */
const TABS = [['home', 'home', 'Beranda'], ['orders', 'list', 'Order'], ['kasir', 'plus', 'Kasir'], ['customers', 'users', 'Pelanggan'], ['more', 'menu', 'Lainnya']];
const SUB: Record<string, string> = { services: 'more', finance: 'more', settings: 'more', team: 'more', export: 'more' };
function go(v: string) { closeSheet(); if (v === S.view) { renderPage(); return; } navigate(BASE + ROUTES[v]); }
function back() { if (history.length > 1) history.back(); else go('more'); }
function renderNav() {
  const act = SUB[S.view] || S.view;
  $('#nav').innerHTML = TABS.map(([k, i, n]) => k === 'kasir'
    ? `<button class="fab ${act === k ? 'on' : ''}" onclick="App.go('kasir')"><span class="c">${IC.plus}</span>${n}</button>`
    : `<button class="${act === k ? 'on' : ''}" onclick="App.go('${k}')">${IC[i]}${n}</button>`).join('');
}
function setHeader(t: string, act = '') {
  const home = S.view === 'home', s = setg();
  $('#title').textContent = home ? shopName() : t;
  const lg = $('#hLogo'); lg.hidden = !(home && s.logo); if (home && s.logo) lg.src = s.logo;
  const sb = $('#hSub'); sb.hidden = !home; sb.textContent = greet() + (sess.name ? ', ' + String(sess.name).split(' ')[0] : '') + ' 👋';
  $('#hAct').innerHTML = (document.body.dataset.back ? `<button class="hb" onclick="App.back()">‹ Kembali</button>` : '') + act;
}
const VIEWS: Record<string, () => void> = {};
function renderPage() {
  S.view = document.body.dataset.page || 'home';
  if (sess.phase !== 'ready') return;
  applyBrand(); renderNav(); renderSync();
  const pb = $('#paybar'); if (pb) pb.innerHTML = ''; $('#main').className = '';
  if (OWNER_ONLY.includes(S.view) && !isOwner()) {
    setHeader('Tidak ada akses');
    $('#main').innerHTML = centerMsg('lock', 'Halaman ini khusus Pemilik / Admin', `Anda masuk sebagai ${ROLE_NAMES[sess.role]}.`);
    return;
  }
  (VIEWS[S.view] || VIEWS.home)();
}

/* ================= BERANDA ================= */
VIEWS.home = () => {
  setHeader('');
  const t = today(), pays = D.orders.flatMap((o: any) => o.payments || []);
  const incToday = pays.filter((p: any) => dKey(p.date) === t).reduce((a: number, p: any) => a + p.amount, 0);
  const ordToday = D.orders.filter((o: any) => dKey(o.createdAt) === t).length;
  const proses = D.orders.filter((o: any) => stIdx(o.status) < 3), ready = D.orders.filter((o: any) => o.status === 'siap');
  const piut = D.orders.reduce((a: number, o: any) => a + due(o), 0), late = D.orders.filter(isLate);
  const days: string[] = []; for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(dKey(d)); }
  const inc = days.map((k) => pays.filter((p: any) => dKey(p.date) === k).reduce((a: number, p: any) => a + p.amount, 0)); const mx = Math.max(...inc, 1);
  const recent = [...D.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  $('#main').innerHTML = `
 <div class="install" id="installBox">${IC.phone.replace('<svg ','<svg width="20" height="20" ')}<div style="flex:1">Pasang aplikasi di layar utama</div><button class="btn sm" onclick="App.doInstall()">Pasang</button></div>
 ${!isCloud ? '<div class="banner">Mode lokal — data hanya di perangkat ini. Hubungkan Dexie Cloud untuk login & sinkron (lihat README).</div>' : ''}
 <div class="hero"><div class="l">Pemasukan hari ini</div><div class="v">${rp(incToday)}</div>
  <div class="s"><div><b>${ordToday}</b>order masuk</div><div><b>${proses.length}</b>diproses</div><div><b>${ready.length}</b>siap ambil</div></div></div>
 <div class="quick">
  <button onclick="App.go('kasir')"><span class="qi">${IC.plus}</span>Order Baru</button>
  <button onclick="App.ordersBy('siap')"><span class="qi">${IC.bell}</span>Siap Ambil${ready.length ? `<span class="nb">${ready.length}</span>` : ''}</button>
  <button onclick="App.go('customers')"><span class="qi">${IC.users}</span>Pelanggan</button>
  ${isOwner() ? `<button onclick="App.go('finance')"><span class="qi">${IC.wallet}</span>Laporan</button>` : `<button onclick="App.go('services')"><span class="qi">${IC.tag}</span>Harga</button>`}
 </div>
 <div class="stats">
  <div class="stat" onclick="App.ordersBy('siap')"><div class="l">Siap Diambil</div><div class="v">${ready.length}</div></div>
  <div class="stat" onclick="App.ordersBy('belum')"><div class="l">Piutang</div><div class="v" style="color:${piut ? 'var(--err)' : 'inherit'}">${rp(piut)}</div></div>
 </div>
 ${late.length ? `<div class="warnbox" onclick="App.ordersBy('telat')"><b>${late.length} order</b> melewati estimasi selesai. Ketuk untuk lihat.</div>` : ''}
 ${isOwner() ? `<div class="chart"><div class="hd"><span>Pemasukan 14 hari</span><span>${rp(inc.reduce((x, y) => x + y, 0))}</span></div>
  <div class="bars">${inc.map((v, i) => `<div class="b" onclick="App.toast('${fShort(days[i])}: ${rp(v)}')"><i style="height:${(v / mx) * 100}%"></i></div>`).join('')}</div>
  <div class="bars-x">${days.map((d, i) => `<span>${i % 2 ? '' : d.slice(8)}</span>`).join('')}</div></div>` : ''}
 <div class="sec-t">Status cucian</div>
 <div class="list">${STATUSES.map((s) => `<div class="li" onclick="App.ordersBy('${s.k}')"><div class="m">${badge(s.k)}</div><b class="amt">${D.orders.filter((o: any) => o.status === s.k).length}</b><span class="chev">›</span></div>`).join('')}</div>
 <div class="sec-t">Order terbaru <a onclick="App.ordersBy('aktif')">Lihat semua</a></div>
 ${orderList(recent)}`;
  if (deferredPrompt) $('#installBox').style.display = 'flex';
};

/* ================= ORDER ================= */
function ordersBy(f: string) { S.ordFilter = f; go('orders'); }
function orderList(list: any[]) {
  if (!list.length) return '<div class="list"><div class="empty">Belum ada order.</div></div>';
  return `<div class="list">${list.map((o) => {
    const c = cust(o.customerId), late = isLate(o);
    return `<div class="li" onclick="App.showOrder('${o.id}')">
   <div class="m"><div class="t">${esc(c.name)}</div><div class="d">${esc(o.code)}${o.express ? ' · Express' : ''}</div>
   <div class="d" ${late ? 'style="color:var(--err);font-weight:600"' : ''}>${late ? 'Terlambat · ' : 'Selesai '}${fShort(o.dueAt)}</div></div>
   <div class="r"><div class="amt">${rp(o.total)}</div><div style="margin-top:4px">${badge(o.status)}</div><div style="margin-top:3px">${pbadge(o)}</div></div></div>`;
  }).join('')}</div>`;
}
VIEWS.orders = () => {
  setHeader('Daftar Order');
  let list = [...D.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const f = S.ordFilter;
  if (f === 'aktif') list = list.filter((o) => o.status !== 'diambil');
  else if (f === 'belum') list = list.filter((o) => due(o) > 0);
  else if (f === 'telat') list = list.filter(isLate);
  else if (f !== 'semua') list = list.filter((o) => o.status === f);
  const q = S.ordQ.toLowerCase();
  if (q) list = list.filter((o) => { const c = cust(o.customerId); return (o.code + ' ' + c.name + ' ' + c.phone).toLowerCase().includes(q); });
  const tabs = [['aktif', 'Aktif'], ...STATUSES.map((s) => [s.k, s.n]), ['belum', 'Belum Lunas'], ['telat', 'Terlambat'], ['semua', 'Semua']];
  $('#main').innerHTML = `
 <div class="search">${IC.search}<input id="oq" type="search" placeholder="Cari nota, nama, no. HP" value="${esc(S.ordQ)}"></div>
 <div class="chips" id="ochips">${tabs.map(([k, n]) => `<button class="${f === k ? 'on' : ''}" onclick="App.setOrdFilter('${k}')">${n}</button>`).join('')}</div>
 <div class="count">${list.length} order</div>
 ${orderList(list)}`;
  $('#oq').oninput = (e: any) => {
    S.ordQ = e.target.value; clearTimeout((window as any)._oq);
    (window as any)._oq = setTimeout(() => { const sl = $('#ochips').scrollLeft; VIEWS.orders(); $('#ochips').scrollLeft = sl; const i = $('#oq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250);
  };
  $('#ochips .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
};
function setOrdFilter(k: string) { const sl = $('#ochips')?.scrollLeft || 0; S.ordFilter = k; VIEWS.orders(); $('#ochips').scrollLeft = sl; }
const findOrder = (id: string) => D.orders.find((x: any) => x.id === id);
function showOrder(id: string) {
  const o = findOrder(id); if (!o) return; const c = cust(o.customerId); const si = stIdx(o.status); const nx = STATUSES[si + 1];
  openSheet(`<h2><span>${esc(o.code)}</span><button class="x" onclick="App.closeSheet()">×</button></h2>
 <div class="row" style="flex-wrap:wrap;gap:6px">${badge(o.status)} ${pbadge(o)} ${o.express ? '<span class="badge p-dp">Express</span>' : ''}</div>
 <div class="prog">${STATUSES.map((s, i) => `<i class="${i <= si ? 'on' : ''}"></i>`).join('')}</div>
 ${nx ? `<button class="btn blk ${nx.k === 'diambil' ? 'ok' : ''}" style="margin-bottom:14px" onclick="App.advance('${o.id}')">Tandai: ${nx.n} ${IC.arrow}</button>` : ''}
 <div class="li" style="padding:10px 0;border-bottom:1px solid var(--bd)" onclick="App.showCust('${o.customerId}')"><div class="av">${esc(initials(c.name))}</div><div class="m"><div class="t">${esc(c.name)}</div><div class="d">${esc(c.phone)}</div></div><span class="mut">›</span></div>
 <div class="g2" style="margin:12px 0;font-size:13.5px"><div><div class="mut" style="font-size:12px">Masuk${o.createdBy ? ' · ' + esc(o.createdBy) : ''}</div>${fDT(o.createdAt)}</div><div><div class="mut" style="font-size:12px">Estimasi selesai</div><span ${isLate(o) ? 'style="color:var(--err);font-weight:600"' : ''}>${fDate(o.dueAt)}</span></div></div>
 <div class="box">
 ${o.items.map((i: any) => `<div class="kv"><span>${esc(i.name)}<br><small class="mut">${i.qty} ${esc(i.unit)} × ${rp(i.price)}</small></span><span>${rp(i.price * i.qty)}</span></div>`).join('')}
 ${o.expressFee ? `<div class="kv"><span>Biaya Express</span><span>${rp(o.expressFee)}</span></div>` : ''}
 ${o.discount ? `<div class="kv"><span>Diskon</span><span>- ${rp(o.discount)}</span></div>` : ''}
 <div class="kv b"><span>Total</span><span>${rp(o.total)}</span></div>
 <div class="kv"><span>Sudah dibayar</span><span>${rp(paid(o))}</span></div>
 <div class="kv"><span><b>Sisa</b></span><b style="color:${due(o) ? 'var(--err)' : 'var(--ok)'}">${rp(due(o))}</b></div></div>
 ${o.note ? `<div class="note">${esc(o.note)}</div>` : ''}
 ${due(o) > 0 ? `<div style="margin-bottom:14px"><label>Terima pembayaran</label><div class="row"><input id="pAmt" type="number" inputmode="numeric" class="grow" value="${due(o)}"><select id="pMet" style="width:110px">${METHODS.map((m) => `<option>${m}</option>`).join('')}</select></div><button class="btn ok blk" style="margin-top:8px" onclick="App.addPay('${o.id}')">Simpan Pembayaran</button></div>` : ''}
 <div class="g2" style="margin-bottom:8px">
  <button class="btn sec" onclick="App.sendWA('${o.id}','nota')">${IC.wa}Nota WA</button>
  <button class="btn sec" onclick="${o.status === 'siap' ? `App.sendWA('${o.id}','siap')` : `App.shareNota('${o.id}')`}">${o.status === 'siap' ? IC.bell + 'Info Siap' : IC.share + 'Bagikan'}</button>
  <button class="btn sec" onclick="App.printNota('${o.id}')">${IC.print}Cetak</button>
  <button class="btn sec" onclick="App.statusPicker('${o.id}')">${IC.refresh}Ubah Status</button>
 </div>
 ${o.payments?.length ? `<div class="sec-t" style="margin-left:0">Pembayaran</div><div class="timeline">${o.payments.map((p: any) => `<div>${fDT(p.date)} · ${p.method} · <b>${rp(p.amount)}</b>${p.by ? ` <span class="mut">· ${esc(p.by)}</span>` : ''}</div>`).join('')}</div>` : ''}
 <div class="sec-t" style="margin-left:0">Riwayat status</div><div class="timeline">${o.history.map((h: any) => `<div>${stName(h.status)} <span class="mut">· ${fDT(h.date)}${h.by ? ' · ' + esc(h.by) : ''}</span></div>`).join('')}</div>
 ${isOwner() ? `<button class="btn err blk" style="margin-top:14px" onclick="App.delOrder('${o.id}')">Hapus Order</button>` : ''}`);
}
function statusPicker(id: string) {
  const o = findOrder(id);
  openSheet(`<h2>Ubah Status<button class="x" onclick="App.showOrder('${id}')">×</button></h2><div class="list" style="border:1px solid var(--bd)">${STATUSES.map((s) => `<div class="li" onclick="App.pickStatus('${id}','${s.k}')"><div class="m">${badge(s.k)}</div>${s.k === o.status ? '<b style="color:var(--pri)">✓</b>' : ''}</div>`).join('')}</div>`);
}
async function setStatus(id: string, k: string, extra: any = {}) {
  const o = findOrder(id); if (!o || (o.status === k && !extra.payments)) return;
  const ch: any = { ...extra };
  if (o.status !== k) { ch.status = k; ch.history = [...o.history, { status: k, date: new Date().toISOString(), by: byName() }]; }
  await run(() => updRow('orders', id, ch), `${o.code}: ${stName(k)}`);
}
async function pickStatus(id: string, k: string) { await setStatus(id, k); showOrder(id); }
async function advance(id: string) {
  const o = findOrder(id); const n = STATUSES[stIdx(o.status) + 1]; if (!n) return;
  const extra: any = {};
  if (n.k === 'diambil' && due(o) > 0) {
    if (!confirm(`Masih ada sisa tagihan ${rp(due(o))}.\nCatat pelunasan TUNAI sekarang dan tandai diambil?`)) return;
    extra.payments = [...o.payments, { date: new Date().toISOString(), amount: due(o), method: 'Tunai', by: byName() }];
  }
  await setStatus(id, n.k, extra); showOrder(id);
  if (n.k === 'siap' && cust(o.customerId).phone && confirm('Kirim notifikasi WhatsApp "siap diambil" ke pelanggan?')) sendWA(id, 'siap');
}
async function addPay(id: string) {
  const o = findOrder(id); const a = Math.min(num($('#pAmt').value), due(o));
  if (a <= 0) return toast('Nominal tidak valid');
  await run(() => updRow('orders', id, { payments: [...o.payments, { date: new Date().toISOString(), amount: a, method: $('#pMet').value, by: byName() }] }), 'Pembayaran dicatat');
  showOrder(id);
}
async function delOrder(id: string) { if (!confirm('Hapus order ini? Data pembayarannya ikut terhapus.')) return; closeSheet(); await run(() => delRow('orders', id), 'Order dihapus'); }
function notaText(o: any) {
  const s = setg(), c = cust(o.customerId);
  let t = `*${shopName()}*\n${s.tagline ? s.tagline + '\n' : ''}${s.address ? s.address + '\n' : ''}${s.phone ? 'Telp: ' + s.phone + '\n' : ''}\nNota: *${o.code}*\nPelanggan: ${c.name}\nMasuk: ${fDT(o.createdAt)}\nEstimasi selesai: ${fDate(o.dueAt)}\n\n`;
  o.items.forEach((i: any) => (t += `${i.name}\n  ${i.qty} ${i.unit} x ${rp(i.price)} = ${rp(i.price * i.qty)}\n`));
  if (o.expressFee) t += `Express: ${rp(o.expressFee)}\n`;
  if (o.discount) t += `Diskon: -${rp(o.discount)}\n`;
  return t + `\n*Total: ${rp(o.total)}*\nDibayar: ${rp(paid(o))}\nSisa: ${rp(due(o))} (${payStatus(o)[1]})\n\n${s.footer || ''}`;
}
function sendWA(id: string, type: string) {
  const o = findOrder(id), c = cust(o.customerId);
  const msg = type === 'siap' ? `Halo ${c.name}, cucian Anda dengan nota *${o.code}* sudah *SIAP DIAMBIL* di ${shopName()}.\n${due(o) > 0 ? `Sisa pembayaran: *${rp(due(o))}*\n` : ''}\nTerima kasih 🙏` : notaText(o);
  window.open('https://wa.me/' + waNum(c.phone) + '?text=' + encodeURIComponent(msg), '_blank');
}
function shareNota(id: string) {
  const o = findOrder(id); const text = notaText(o).replace(/\*/g, '');
  if (navigator.share) navigator.share({ title: 'Nota ' + o.code, text }).catch(() => {});
  else { navigator.clipboard?.writeText(text); toast('Nota disalin'); }
}
function printNota(id: string) {
  const o = findOrder(id), c = cust(o.customerId), s = setg();
  const L = (a: string, b: string) => `<div class="l"><span>${a}</span><span>${b}</span></div>`;
  $('#print-area').innerHTML = `<div class="nota"><div class="c">${s.logo ? `<img src="${s.logo}">` : ''}<b style="font-size:15px">${esc(shopName())}</b>${s.tagline ? '<br>' + esc(s.tagline) : ''}${s.address ? '<br>' + esc(s.address) : ''}${s.phone ? '<br>Telp ' + esc(s.phone) : ''}</div><hr>
  ${L('Nota', esc(o.code))}${L('Pelanggan', esc(c.name))}${L('Masuk', fDT(o.createdAt))}${L('Selesai', fDate(o.dueAt))}<hr>
  ${o.items.map((i: any) => `<div>${esc(i.name)}</div>${L(`&nbsp;${i.qty} ${esc(i.unit)} x ${rp(i.price)}`, rp(i.price * i.qty))}`).join('')}<hr>
  ${o.expressFee ? L('Express', rp(o.expressFee)) : ''}${o.discount ? L('Diskon', '-' + rp(o.discount)) : ''}
  ${L('<b>TOTAL</b>', '<b>' + rp(o.total) + '</b>')}${L('Dibayar', rp(paid(o)))}${L('Sisa', rp(due(o)))}${L('Status', payStatus(o)[1].toUpperCase())}
  ${o.note ? `<hr>Catatan: ${esc(o.note)}` : ''}<hr><div class="c">${esc(s.footer || '')}</div></div>`;
  window.print();
}

/* ================= KASIR ================= */
function newCart() { S.cart = { customerId: '', items: [], express: false, discount: 0, note: '', payAmount: 0, method: 'Tunai' }; }
VIEWS.kasir = () => {
  if (!S.cart) newCart(); const cart = S.cart;
  setHeader('Order Baru', cart.items.length || cart.customerId ? `<button class="hb" onclick="App.resetCart()">Reset</button>` : '');
  const c = cart.customerId ? cust(cart.customerId) : null;
  $('#main').className = 'has-bar';
  $('#main').innerHTML = `
 <div class="sec-t" style="margin-top:4px">1 · Pelanggan</div>
 <div class="list">${c ? `<div class="li" onclick="App.pickCust()"><div class="av">${esc(initials(c.name))}</div><div class="m"><div class="t">${esc(c.name)}</div><div class="d">${esc(c.phone)}</div></div><span style="color:var(--pri);font-weight:600;font-size:14px">Ganti</span></div>`
    : `<div class="li" onclick="App.pickCust()"><div class="av">+</div><div class="m"><div class="t" style="color:var(--pri)">Pilih / tambah pelanggan</div></div><span class="mut">›</span></div>`}</div>
 <div class="sec-t">2 · Layanan</div>
 <div class="svc">${D.services.map((s: any) => { const it = cart.items.find((i: any) => i.serviceId === s.id); return `<button class="${it ? 'in' : ''}" onclick="App.addItem('${s.id}')">${it ? `<span class="cnt">${+it.qty}</span>` : ''}<b>${esc(s.name)}</b><small>${rp(s.price)}/${esc(s.unit)} · ${s.days}h</small></button>`; }).join('') || '<div class="empty">Belum ada layanan.</div>'}</div>
 ${cart.items.length ? `<div class="sec-t">3 · Rincian</div><div class="list">${cart.items.map((it: any, i: number) => {
    const dec = ['kg', 'm2'].includes(it.unit); return `<div class="li" style="cursor:default">
  <div class="m"><div class="t">${esc(it.name)}</div><div class="d" id="sub${i}">${rp(it.price * it.qty)}</div></div>
  <div class="stepper"><button onclick="App.stepQty(${i},-${dec ? 0.5 : 1})">−</button><input type="number" inputmode="decimal" step="${dec ? 0.1 : 1}" value="${it.qty}" oninput="App.setQty(${i},this.value)"><button onclick="App.stepQty(${i},${dec ? 0.5 : 1})">+</button></div>
  <span class="mut" style="font-size:12px;width:34px">${esc(it.unit)}</span></div>`;
  }).join('')}</div>
 <div class="card">
  <div class="tog"><div><b>Express</b><div class="mut" style="font-size:12.5px">+${setg().expressPct}%, selesai lebih cepat</div></div><label class="sw"><input type="checkbox" ${cart.express ? 'checked' : ''} onchange="App.cartSet('express',this.checked)"><span></span></label></div>
  <div class="g2" style="margin-top:12px"><div class="f"><label>Diskon (Rp)</label><input type="number" inputmode="numeric" value="${cart.discount || ''}" placeholder="0" oninput="App.cartSet('discount',App.num(this.value))"></div>
  <div class="f"><label>Estimasi selesai</label><input id="kDue" value="" disabled></div></div>
  <div class="f" style="margin:0"><label>Catatan</label><input value="${esc(cart.note)}" placeholder="noda, parfum, jumlah potong…" oninput="App.cartSet('note',this.value,1)"></div>
 </div>
 <div class="sec-t">4 · Pembayaran</div>
 <div class="card">
  <div class="seg" style="margin-bottom:12px">${METHODS.map((m) => `<button class="${m === cart.method ? 'on' : ''}" onclick="App.cartSet('method','${m}',1);this.parentNode.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b===this))">${m}</button>`).join('')}</div>
  <label>Dibayar sekarang</label><input id="kPay" type="number" inputmode="numeric" value="${cart.payAmount || ''}" placeholder="0" oninput="App.cartSet('payAmount',App.num(this.value))">
  <div class="row" style="margin-top:8px"><button class="btn sm sec grow" onclick="App.payFull()">Lunas</button><button class="btn sm sec grow" onclick="App.payLater()">Bayar nanti</button></div>
  <div id="kSum" style="margin-top:12px"></div>
 </div>` : '<div class="empty">Ketuk layanan di atas untuk menambahkan.</div>'}`;
  $('#paybar').innerHTML = `<div class="paybar"><div class="t"><small>Total</small><b id="kTot">Rp 0</b></div><button class="btn ok" id="kSave" style="padding:12px 22px" onclick="App.submitOrder()">Simpan Order</button></div>`;
  calc();
};
function resetCart() { if (confirm('Kosongkan order ini?')) { newCart(); VIEWS.kasir(); } }
function cartSet(k: string, v: any, silent?: number) { S.cart[k] = v; if (!silent) calc(); }
function payFull() { S.cart.payAmount = cartTotal().total; $('#kPay').value = S.cart.payAmount; calc(); }
function payLater() { S.cart.payAmount = 0; $('#kPay').value = ''; calc(); }
function pickCust() {
  const draw = (q = '') => {
    q = q.toLowerCase();
    const l = [...D.customers].filter((c) => (c.name + ' ' + c.phone).toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
    $('#pcl').innerHTML = l.length ? l.map((c) => `<div class="li" onclick="App.chooseCust('${c.id}')"><div class="av">${esc(initials(c.name))}</div><div class="m"><div class="t">${esc(c.name)}</div><div class="d">${esc(c.phone)}</div></div></div>`).join('') : '<div class="empty">Tidak ditemukan</div>';
  };
  openSheet(`<h2>Pilih Pelanggan<button class="x" onclick="App.closeSheet()">×</button></h2>
 <button class="btn blk" style="margin-bottom:10px" onclick="App.custForm('',1)">+ Pelanggan Baru</button>
 <div class="search">${IC.search}<input id="pcq" type="search" placeholder="Cari nama / no. HP" style="border-color:var(--bd)"></div>
 <div class="list" id="pcl" style="border:1px solid var(--bd)"></div>`);
  draw(); $('#pcq').oninput = (e: any) => draw(e.target.value);
}
function chooseCust(id: string) { if (!S.cart) newCart(); S.cart.customerId = id; closeSheet(); if (S.view === 'kasir') VIEWS.kasir(); else go('kasir'); }
function addItem(id: string) {
  const s = D.services.find((x: any) => x.id === id); const ex = S.cart.items.find((i: any) => i.serviceId === id);
  if (ex) ex.qty = +(ex.qty + 1).toFixed(2); else S.cart.items.push({ serviceId: s.id, name: s.name, unit: s.unit, price: s.price, days: s.days, qty: 1 });
  navigator.vibrate?.(15); VIEWS.kasir();
}
function stepQty(i: number, d: number) { const it = S.cart.items[i]; it.qty = +(it.qty + d).toFixed(2); if (it.qty <= 0) S.cart.items.splice(i, 1); VIEWS.kasir(); }
function setQty(i: number, v: string) { const it = S.cart.items[i]; it.qty = num(v); $('#sub' + i).textContent = rp(it.price * it.qty); calc(); }
function cartTotal() { const c = S.cart; const sub = c.items.reduce((a: number, i: any) => a + i.price * i.qty, 0); const exp = c.express ? Math.round((sub * setg().expressPct) / 100) : 0; return { sub, exp, total: Math.max(0, Math.round(sub + exp - (c.discount || 0))) }; }
function estDue() { const d = Math.max(1, ...S.cart.items.map((i: any) => i.days || 1)); const days = S.cart.express ? Math.floor(d / 2) : d; const r = new Date(); r.setDate(r.getDate() + days); return r; }
function calc() {
  const t = cartTotal(), p = S.cart.payAmount || 0;
  if ($('#kTot')) $('#kTot').textContent = rp(t.total);
  if ($('#kDue')) $('#kDue').value = fDate(estDue());
  if ($('#kSum')) $('#kSum').innerHTML = `<div class="kv"><span>Subtotal</span><span>${rp(t.sub)}</span></div>
  ${t.exp ? `<div class="kv"><span>Express</span><span>${rp(t.exp)}</span></div>` : ''}${S.cart.discount ? `<div class="kv"><span>Diskon</span><span>- ${rp(S.cart.discount)}</span></div>` : ''}
  <div class="kv b"><span>Total</span><span>${rp(t.total)}</span></div>
  ${p > t.total ? `<div class="kv" style="color:var(--ok)"><span>Kembalian</span><b>${rp(p - t.total)}</b></div>` : `<div class="kv"><span>Sisa tagihan</span><span>${rp(t.total - p)}</span></div>`}`;
}
function orderCode() {
  const d = new Date(), A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = ''; for (let i = 0; i < 4; i++) r += A[Math.floor(Math.random() * A.length)];
  return `${setg().prefix || 'LDR'}${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${r}`;
}
async function submitOrder() {
  const cart = S.cart;
  if (!cart.customerId) { toast('Pilih pelanggan dulu'); return pickCust(); }
  const items = cart.items.filter((i: any) => i.qty > 0); if (!items.length) return toast('Tambahkan minimal 1 layanan');
  const btn = $('#kSave'); if (btn) btn.disabled = true;
  const t = cartTotal(), now = new Date().toISOString(), pay = Math.min(cart.payAmount || 0, t.total), change = Math.max(0, (cart.payAmount || 0) - t.total);
  const o = {
    code: orderCode(), customerId: cart.customerId, items: items.map((i: any) => ({ name: i.name, unit: i.unit, price: i.price, qty: i.qty })),
    subtotal: t.sub, expressFee: t.exp, express: cart.express, discount: cart.discount || 0, total: t.total, note: cart.note,
    payments: pay > 0 ? [{ date: now, amount: pay, method: cart.method, by: byName() }] : [], status: 'diterima',
    history: [{ status: 'diterima', date: now, by: byName() }], createdAt: now, dueAt: estDue().toISOString(), createdBy: byName(),
  };
  const id = await run(() => addRow('orders', o));
  if (btn) btn.disabled = false;
  if (!id) return;
  track('order-simpan', { item: items.length, express: !!cart.express, bayar: pay >= t.total ? 'lunas' : pay > 0 ? 'dp' : 'belum', metode: pay > 0 ? cart.method : '-' });
  newCart(); VIEWS.kasir();
  toast(change ? `Tersimpan · Kembalian ${rp(change)}` : `Order ${o.code} tersimpan`);
  showOrder(id as string);
}

/* ================= PELANGGAN ================= */
VIEWS.customers = () => {
  setHeader('Pelanggan', `<button class="hb" onclick="App.custForm()">+ Baru</button>`);
  const q = S.custQ.toLowerCase();
  const list = D.customers.filter((c: any) => (c.name + ' ' + c.phone).toLowerCase().includes(q)).sort((a: any, b: any) => a.name.localeCompare(b.name));
  $('#main').innerHTML = `<div class="search">${IC.search}<input id="cq" type="search" placeholder="Cari nama / no. HP" value="${esc(S.custQ)}"></div>
 <div class="count">${list.length} pelanggan</div>
 <div class="list">${list.length ? list.map((c: any) => {
    const os = D.orders.filter((o: any) => o.customerId === c.id); const pi = os.reduce((a: number, o: any) => a + due(o), 0);
    return `<div class="li" onclick="App.showCust('${c.id}')"><div class="av">${esc(initials(c.name))}</div><div class="m"><div class="t">${esc(c.name)}</div><div class="d">${esc(c.phone)} · ${os.length} order</div></div>
  <div class="r">${pi ? `<div class="amt" style="color:var(--err);font-size:13px">${rp(pi)}</div><div class="mut" style="font-size:11px">piutang</div>` : '<span class="mut">›</span>'}</div></div>`;
  }).join('') : '<div class="empty">Belum ada pelanggan.</div>'}</div>`;
  $('#cq').oninput = (e: any) => { S.custQ = e.target.value; VIEWS.customers(); const i = $('#cq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
};
function showCust(id: string) {
  const c = D.customers.find((x: any) => x.id === id); if (!c) return;
  const os = D.orders.filter((o: any) => o.customerId === id).sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));
  openSheet(`<h2><span>${esc(c.name)}</span><button class="x" onclick="App.closeSheet()">×</button></h2>
 <div class="mut" style="margin-top:-8px;margin-bottom:12px">${esc(c.phone)}${c.address ? ' · ' + esc(c.address) : ''}</div>
 <div class="g2" style="margin-bottom:14px"><div class="box" style="margin:0"><div class="l">Total belanja</div><div class="v" style="font-size:17px">${rp(os.reduce((a: number, o: any) => a + o.total, 0))}</div></div>
 <div class="box" style="margin:0"><div class="l">Piutang</div><div class="v" style="font-size:17px">${rp(os.reduce((a: number, o: any) => a + due(o), 0))}</div></div></div>
 <div class="g2" style="margin-bottom:12px"><button class="btn" onclick="App.orderFor('${id}')">+ Order</button>
 ${c.phone ? `<button class="btn sec" onclick="window.open('https://wa.me/${waNum(c.phone)}','_blank')">${IC.wa}WhatsApp</button>` : '<span></span>'}</div>
 <div class="sec-t" style="margin-left:0">Riwayat order (${os.length})</div>
 <div class="list">${os.length ? os.map((o: any) => `<div class="li" onclick="App.showOrder('${o.id}')"><div class="m"><div class="t">${esc(o.code)}</div><div class="d">${fDate(o.createdAt)}</div></div><div class="r"><div class="amt">${rp(o.total)}</div>${badge(o.status)}</div></div>`).join('') : '<div class="empty">Belum ada order</div>'}</div>
 <div class="g2" style="margin-top:14px"><button class="btn sec" onclick="App.custForm('${id}')">Edit</button>${isOwner() ? `<button class="btn err" onclick="App.delCust('${id}')">Hapus</button>` : ''}</div>`);
}
function orderFor(id: string) { newCart(); S.cart.customerId = id; closeSheet(); go('kasir'); }
function custForm(id = '', fromKasir = 0) {
  const c = id ? D.customers.find((x: any) => x.id === id) : { name: '', phone: '', address: '' };
  openSheet(`<h2>${id ? 'Edit' : 'Tambah'} Pelanggan<button class="x" onclick="App.closeSheet()">×</button></h2>
 <div class="f"><label>Nama *</label><input id="cN" value="${esc(c.name)}" autocomplete="off"></div>
 <div class="f"><label>No. HP / WhatsApp</label><input id="cP" type="tel" inputmode="tel" value="${esc(c.phone)}" placeholder="08xxxxxxxxxx"></div>
 <div class="f"><label>Alamat</label><textarea id="cA" rows="2">${esc(c.address)}</textarea></div>
 <button class="btn blk" onclick="App.saveCust('${id}',${fromKasir ? 1 : 0})">Simpan</button>`);
  setTimeout(() => $('#cN')?.focus(), 300);
}
async function saveCust(id: string, fromKasir: number) {
  const name = $('#cN').value.trim(); if (!name) return toast('Nama wajib diisi');
  const phone = $('#cP').value.trim();
  if (phone && D.customers.some((x: any) => x.id !== id && String(x.phone).replace(/\D/g, '') === phone.replace(/\D/g, ''))) return toast('No. HP sudah terdaftar');
  const data = { name, phone, address: $('#cA').value.trim() };
  let newId: any;
  if (id) await run(() => updRow('customers', id, data), 'Pelanggan disimpan');
  else newId = await run(() => addRow('customers', { ...data, createdAt: new Date().toISOString() }), 'Pelanggan disimpan');
  closeSheet();
  if (fromKasir && newId) chooseCust(newId);
}
async function delCust(id: string) {
  if (D.orders.some((o: any) => o.customerId === id)) return toast('Tidak bisa dihapus: ada riwayat order');
  if (!confirm('Hapus pelanggan ini?')) return; closeSheet(); await run(() => delRow('customers', id), 'Pelanggan dihapus');
}

/* ================= LAINNYA ================= */
let deferredPrompt: any = null;
window.addEventListener('beforeinstallprompt', (e: any) => { e.preventDefault(); deferredPrompt = e; const b = $('#installBox'); if (b) b.style.display = 'flex'; });
function doInstall() { if (!deferredPrompt) return toast('Buka menu browser, lalu pilih "Tambahkan ke Layar Utama"'); deferredPrompt.prompt(); deferredPrompt.userChoice.finally(() => { deferredPrompt = null; renderPage(); }); }
VIEWS.more = () => {
  setHeader('Lainnya');
  const it = (ic: string, t: string, d: string, on: string) => `<div class="li" onclick="${on}"><div class="ic">${ic}</div><div class="m"><div class="t">${t}</div><div class="d">${d}</div></div><span class="mut">›</span></div>`;
  $('#main').innerHTML = `
 <div class="list"><div class="li" onclick="App.profileSheet()"><div class="av">${esc(initials(sess.name))}</div><div class="m"><div class="t">${esc(sess.name || '-')}</div><div class="d">@${esc(sess.username || '')} · ${esc(shopName())}</div></div><span class="role">${ROLE_NAMES[sess.role]}</span></div></div>
 <div class="list menu">
  ${isOwner() ? it(IC.wallet, 'Keuangan', 'Laporan, pengeluaran, piutang', "App.go('finance')") : ''}
  ${isOwner() ? it(IC.sheet, 'Export Data', 'Excel, CSV & Google Sheets', "App.go('export')") : ''}
  ${it(IC.tag, 'Layanan & Harga', D.services.length + ' layanan' + (isOwner() ? '' : ' · lihat saja'), "App.go('services')")}
  ${isOwner() ? it(IC.users, 'Tim & Akses', D.members.length + ' akun · tambah kasir/admin', "App.go('team')") : ''}
  ${isOwner() ? it(IC.gear, 'Pengaturan', 'Identitas laundry, backup data', "App.go('settings')") : ''}
 </div>
 <div class="list menu">${it(IC.phone, 'Pasang Aplikasi', 'Tambahkan ke layar utama HP', 'App.doInstall()')}
  ${isCloud && sess.role === 'owner' ? it(IC.phone, 'Perangkat ini', 'Terhubung ke ' + esc(sess.email || '-') + ' · putuskan', 'App.disconnectDevice()') : ''}
  ${it(IC.list, 'Panduan Penggunaan', 'Cara memakai semua fitur', "location.href='" + BASE + "panduan/'")}
  ${it(IC.logout, 'Keluar', 'Logout dari akun ' + esc(sess.name || ''), 'App.logout()')}</div>
 <p class="mut" style="text-align:center;font-size:12px">Fara Wash v2.0 · ${isCloud ? 'Dexie Cloud' : 'Mode lokal'}</p>`;
};

/* ================= LAYANAN ================= */
VIEWS.services = () => {
  setHeader('Layanan & Harga', isOwner() ? `<button class="hb" onclick="App.svcForm()">+ Baru</button>` : '');
  $('#main').innerHTML = `<div class="list">${D.services.length ? D.services.map((s: any) => `<div class="li" ${isOwner() ? `onclick="App.svcForm('${s.id}')"` : 'style="cursor:default"'}><div class="m"><div class="t">${esc(s.name)}</div><div class="d">Durasi ${s.days} hari</div></div><div class="r"><div class="amt">${rp(s.price)}</div><div class="mut" style="font-size:12px">per ${esc(s.unit)}</div></div></div>`).join('') : '<div class="empty">Belum ada layanan.</div>'}</div>
 <p class="mut" style="font-size:13px;padding:0 4px">Express menambah biaya ${setg().expressPct}% dan memangkas durasi jadi setengah.${isOwner() ? ' Atur di Pengaturan.' : ''}</p>`;
};
function svcForm(id = '') {
  const s = id ? D.services.find((x: any) => x.id === id) : { name: '', unit: 'kg', price: '', days: 2 };
  openSheet(`<h2>${id ? 'Edit' : 'Tambah'} Layanan<button class="x" onclick="App.closeSheet()">×</button></h2>
 <div class="f"><label>Nama layanan *</label><input id="sN" value="${esc(s.name)}" placeholder="mis. Cuci Kering Setrika"></div>
 <div class="g2"><div class="f"><label>Harga (Rp) *</label><input id="sP" type="number" inputmode="numeric" value="${s.price}"></div>
 <div class="f"><label>Satuan</label><select id="sU">${['kg', 'pcs', 'pasang', 'm2', 'set'].map((u) => `<option ${u === s.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div>
 <div class="f"><label>Durasi (hari)</label><input id="sD" type="number" inputmode="numeric" value="${s.days}"></div>
 <button class="btn blk" onclick="App.saveSvc('${id}')">Simpan</button>
 ${id ? `<button class="btn err blk" style="margin-top:8px" onclick="App.delSvc('${id}')">Hapus Layanan</button>` : ''}`);
}
async function saveSvc(id: string) {
  const name = $('#sN').value.trim(), price = num($('#sP').value); if (!name || price <= 0) return toast('Nama dan harga wajib diisi');
  const d = { name, unit: $('#sU').value, price, days: Math.max(0, parseInt($('#sD').value) || 0) };
  closeSheet();
  if (id) await run(() => updRow('services', id, d), 'Layanan disimpan'); else await run(() => addRow('services', { ...d, sort: D.services.length }), 'Layanan disimpan');
}
async function delSvc(id: string) { if (!confirm('Hapus layanan ini? Order lama tidak terpengaruh.')) return; closeSheet(); await run(() => delRow('services', id), 'Layanan dihapus'); }

/* ================= KEUANGAN ================= */
function setPeriod(p: string) {
  const d = new Date(); S.finPreset = p;
  if (p === 'hari') S.finFrom = S.finTo = today();
  else if (p === 'bulan') { S.finFrom = dKey(new Date(d.getFullYear(), d.getMonth(), 1)); S.finTo = today(); }
  else if (p === 'lalu') { S.finFrom = dKey(new Date(d.getFullYear(), d.getMonth() - 1, 1)); S.finTo = dKey(new Date(d.getFullYear(), d.getMonth(), 0)); }
  else if (p === '7') { const a = new Date(); a.setDate(a.getDate() - 6); S.finFrom = dKey(a); S.finTo = today(); }
  VIEWS.finance();
}
function finSet(k: string, v: string) { S[k] = v; if (k === 'finFrom' || k === 'finTo') S.finPreset = ''; VIEWS.finance(); }
/* ---------- Grafik laporan (bisa digeser kiri–kanan) ---------- */
const CH: Record<string, any> = {};
function bucketDays(from: string, to: string) {
  const days: string[] = []; const a = new Date(from + 'T00:00:00'), z = new Date(to + 'T00:00:00');
  for (let d = new Date(a); d <= z && days.length < 3700; d.setDate(d.getDate() + 1)) days.push(dKey(d));
  const mode = days.length <= 31 ? 'hari' : days.length <= 120 ? 'minggu' : 'bulan';
  const keyOf = (k: string) => {
    if (mode === 'hari') return k;
    if (mode === 'bulan') return k.slice(0, 7);
    const i = Math.floor(days.indexOf(k) / 7); return days[i * 7];
  };
  const keys = [...new Set(days.map(keyOf))];
  const lab = (k: string) => mode === 'hari' ? String(+k.slice(8)) : mode === 'minggu' ? `${+k.slice(8)}/${+k.slice(5, 7)}` : new Date(k + '-01T00:00:00').toLocaleDateString('id-ID', { month: 'short' });
  const full = (k: string) => mode === 'hari' ? fDate(k) : mode === 'minggu' ? `Minggu mulai ${fDate(k)}` : new Date(k + '-01T00:00:00').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  return { mode, keys, keyOf: (d: any) => keyOf(dKey(d)), lab, full, inSet: (d: any) => { const k = dKey(d); return k >= from && k <= to; } };
}
function financeCharts(c: { pays: any[]; exps: any[]; ordersIn: any[]; svcSum: any }) {
  const B = bucketDays(S.finFrom, S.finTo);
  const idx: Record<string, number> = {}; B.keys.forEach((k, i) => (idx[k] = i));
  const zero = () => B.keys.map(() => 0);
  const inc = zero(), out = zero(), cnt = zero();
  c.pays.forEach((p) => { const i = idx[B.keyOf(p.date)]; if (i != null) inc[i] += p.amount; });
  c.exps.forEach((e) => { const i = idx[B.keyOf(e.date + 'T00:00:00')]; if (i != null) out[i] += e.amount; });
  c.ordersIn.forEach((o) => { const i = idx[B.keyOf(o.createdAt)]; if (i != null) cnt[i]++; });
  const P = (vals: number[][]) => B.keys.map((k, i) => ({ label: B.lab(k), full: B.full(k), values: vals.map((v) => v[i]) }));
  const per = B.mode === 'hari' ? 'per hari' : B.mode === 'minggu' ? 'per minggu' : 'per bulan';
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const profit = inc.map((v, i) => v - out[i]);
  // jam ramai
  const hours = Array.from({ length: 16 }, (_, i) => i + 6); const hc = hours.map(() => 0);
  c.ordersIn.forEach((o) => { const h = new Date(o.createdAt).getHours(); const i = hours.indexOf(h); if (i >= 0) hc[i]++; });
  const peak = hc.indexOf(Math.max(...hc));
  // metode
  const totalInc = sum(inc) || 1;
  const met = METHODS.map((m) => ({ label: m, value: c.pays.filter((p) => p.method === m).reduce((a, p) => a + p.amount, 0) })).map((r) => ({ ...r, sub: Math.round((r.value / totalInc) * 100) + '% dari pemasukan' }));
  const svc = Object.entries(c.svcSum).sort((a: any, b: any) => b[1].v - a[1].v).slice(0, 6).map(([n, s]: any) => ({ label: n, value: s.v, sub: `${+s.q.toFixed(2)} ${s.u}` }));
  const cat: Record<string, number> = {}; c.exps.forEach((e) => (cat[e.category] = (cat[e.category] || 0) + e.amount));
  const cats = Object.entries(cat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v, color: CHC.s2 }));
  const st = STATUSES.slice(0, 4).map((s, i) => ({ label: s.n, value: D.orders.filter((o: any) => o.status === s.k).length, color: CHC.ord[i + 1] }));
  const cu: Record<string, number> = {}; c.ordersIn.forEach((o) => (cu[o.customerId] = (cu[o.customerId] || 0) + o.total));
  const tops = Object.entries(cu).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, v]) => ({ label: cust(id).name, value: v, sub: c.ordersIn.filter((o) => o.customerId === id).length + ' order' }));

  const slides: any[] = [
    { k: 'arus', t: 'Pemasukan & pengeluaran', s: `${per} · masuk ${rp(sum(inc))} · keluar ${rp(sum(out))}`, legend: [['Pemasukan', CHC.s1], ['Pengeluaran', CHC.s2]],
      pts: P([inc, out]), series: [{ name: 'Pemasukan', color: CHC.s1 }, { name: 'Pengeluaran', color: CHC.s2 }], money: true, kind: 'line' },
    { k: 'laba', t: 'Laba bersih', s: `${per} · total ${rp(sum(profit))}`, legend: [['Untung', CHC.s1], ['Rugi', CHC.neg]], pts: P([profit]), series: [{ name: 'Laba', color: CHC.s1 }], money: true, kind: 'col', diverging: true },
    { k: 'order', t: 'Jumlah order', s: `${per} · total ${sum(cnt)} order`, pts: P([cnt]), series: [{ name: 'Order', color: CHC.s1 }], kind: 'col' },
    { k: 'jam', t: 'Jam ramai', s: hc[peak] ? `paling ramai pukul ${String(hours[peak]).padStart(2, '0')}.00` : 'order masuk per jam', pts: hours.map((h, i) => ({ label: String(h), full: `Pukul ${String(h).padStart(2, '0')}.00–${String(h).padStart(2, '0')}.59`, values: [hc[i]] })), series: [{ name: 'Order', color: CHC.s1 }], kind: 'col' },
    { k: 'metode', t: 'Metode pembayaran', s: `total ${rp(sum(inc))}`, rows: met, money: true },
    { k: 'layanan', t: 'Layanan terlaris', s: 'nilai penjualan, 6 teratas', rows: svc, money: true },
    { k: 'biaya', t: 'Pengeluaran per kategori', s: `total ${rp(sum(out))}`, rows: cats, money: true, color: CHC.s2, empty: 'Belum ada pengeluaran di periode ini' },
    { k: 'pelanggan', t: 'Pelanggan teratas', s: 'total belanja, 5 teratas', rows: tops, money: true },
    { k: 'status', t: 'Cucian dalam proses', s: 'kondisi saat ini (semua tanggal)', rows: st, empty: 'Tidak ada cucian dalam proses' },
  ];
  const fmtV = (v: number, money: boolean) => (money ? rp(v) : Math.round(v).toLocaleString('id-ID'));
  const table = (sl: any) => {
    if (sl.rows) return `<table><tr><th>${sl.k === 'pelanggan' ? 'Pelanggan' : 'Kategori'}</th><th>${sl.money ? 'Nilai' : 'Jumlah'}</th></tr>${sl.rows.map((r: any) => `<tr><td>${esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</td><td>${fmtV(r.value, sl.money)}</td></tr>`).join('') || '<tr><td colspan="2">-</td></tr>'}</table>`;
    return `<table><tr><th>${sl.k === 'jam' ? 'Jam' : 'Periode'}</th>${sl.series.map((s: any) => `<th>${esc(s.name)}</th>`).join('')}</tr>${sl.pts.map((p: any) => `<tr><td>${esc(p.full)}</td>${p.values.map((v: number) => `<td>${fmtV(v, !!sl.money)}</td>`).join('')}</tr>`).join('')}</table>`;
  };
  const body = (sl: any) => {
    if (sl.rows) return hbars(sl.rows, { money: sl.money, color: sl.color, empty: sl.empty });
    CH[sl.k] = sl;
    const has = sl.pts.some((p: any) => p.values.some((v: number) => v));
    if (!has) return `<div class="cempty">Belum ada data di periode ini</div>`;
    return sl.kind === 'line' ? lineChart(sl.pts, sl.series, { money: sl.money }) : columnChart(sl.pts, sl.series[0].color, { money: sl.money, diverging: sl.diverging });
  };
  const i0 = Math.min(S.chartIdx || 0, slides.length - 1);
  return `<div class="charts" id="charts">
   <div class="chead"><b>Grafik laporan</b><span class="ccount" id="ccount">${i0 + 1}/${slides.length}</span>
    <button class="carr" aria-label="Sebelumnya" onclick="App.chartGo(-1)">${IC.chev.replace('<svg ', '<svg style="transform:rotate(180deg)" ')}</button><button class="carr" aria-label="Berikutnya" onclick="App.chartGo(1)">${IC.chev}</button></div>
   <div class="cslides" id="cslides">${slides.map((sl) => `<section class="cslide" data-k="${sl.k}">
     <div class="ctitle"><b>${sl.t}</b><small>${esc(sl.s)}</small></div>
     ${sl.legend ? `<div class="clegend">${sl.legend.map(([n, col]: any) => `<span><i style="background:${col}"></i>${n}</span>`).join('')}</div>` : ''}
     <div class="cbody" data-k="${sl.k}">${body(sl)}</div>
     <div class="ctable" hidden>${table(sl)}</div>
     <button class="ctab" onclick="App.chartTable(this)">${IC.list}Lihat tabel</button>
     <div class="ctip" hidden></div></section>`).join('')}</div>
   <div class="cdots">${slides.map((sl, i) => `<button class="${i === i0 ? 'on' : ''}" aria-label="${sl.t}" onclick="App.chartTo(${i})"></button>`).join('')}</div>
   <p class="chint">Geser untuk grafik lain · ketuk grafik untuk lihat angka</p>
  </div>`;
}
function chartTo(i: number, smooth = true) {
  const el = $('#cslides'); if (!el) return;
  const n = el.children.length; i = Math.max(0, Math.min(n - 1, i)); S.chartIdx = i;
  el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  fitChart(i);
}
/** Tinggi carousel mengikuti slide yang tampil (tidak ada ruang kosong). */
function fitChart(i = S.chartIdx || 0) { const el = $('#cslides'); const c = el?.children[i] as HTMLElement; if (c) el.style.height = c.offsetHeight + 'px'; }
function chartGo(d: number) { chartTo((S.chartIdx || 0) + d); }
function chartTable(b: any) {
  const sl = b.closest('.cslide'); const t = sl.querySelector('.ctable'), c = sl.querySelector('.cbody'), lg = sl.querySelector('.clegend');
  const show = t.hidden; t.hidden = !show; c.hidden = show; if (lg) lg.hidden = show;
  b.innerHTML = show ? `${IC.sheet}Lihat grafik` : `${IC.list}Lihat tabel`;
  fitChart();
}
function bindCharts() {
  const el = $('#cslides'); if (!el) return;
  const n = el.children.length;
  requestAnimationFrame(() => chartTo(S.chartIdx || 0, false));
  let raf = 0;
  el.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth)); S.chartIdx = i;
      $('#ccount') && ($('#ccount').textContent = `${i + 1}/${n}`);
      document.querySelectorAll('.cdots button').forEach((b, j) => b.classList.toggle('on', j === i));
      document.querySelectorAll('.ctip').forEach((t: any) => (t.hidden = true));
      fitChart(i);
    });
  }, { passive: true });
  addEventListener('resize', () => fitChart(), { passive: true });
  el.querySelectorAll('svg.chart-svg').forEach((svg: any) => {
    const k = svg.closest('.cbody').dataset.k, sl = CH[k]; if (!sl) return;
    const xs = svg.dataset.xs.split(',').map(Number), kind = svg.dataset.kind;
    const ys = kind === 'line' ? svg.dataset.ys.split('|').map((r: string) => r.split(',').map(Number)) : null;
    const tip = svg.closest('.cslide').querySelector('.ctip');
    let cur = -1;
    const show = (i: number) => {
      cur = i; const p = sl.pts[i]; if (!p) return;
      if (kind === 'line') {
        svg.querySelector('.xh').setAttribute('x1', xs[i]); svg.querySelector('.xh').setAttribute('x2', xs[i]);
        svg.querySelectorAll('.hd').forEach((d: any) => { const s = +d.dataset.s; d.setAttribute('cx', xs[i]); d.setAttribute('cy', ys![s][i]); });
      } else {
        const band = +svg.dataset.band; svg.querySelector('.xb').setAttribute('x', String(xs[i] - band / 2));
        svg.querySelectorAll('.bar').forEach((b: any) => b.classList.toggle('dim', +b.dataset.i !== i));
      }
      tip.replaceChildren();
      const h = document.createElement('div'); h.className = 'tt'; h.textContent = p.full; tip.appendChild(h);
      sl.series.forEach((s: any, si: number) => {
        const v = p.values[si]; const r = document.createElement('div'); r.className = 'tr';
        const key = document.createElement('i'); key.style.background = sl.diverging && v < 0 ? CHC.neg : s.color;
        const b = document.createElement('b'); b.textContent = sl.money ? rp(v) : `${Math.round(v)}`;
        const nm = document.createElement('span'); nm.textContent = sl.diverging ? (v < 0 ? 'Rugi' : 'Laba') : s.name;
        r.append(key, b, nm); tip.appendChild(r);
      });
      tip.hidden = false;
      const box = svg.getBoundingClientRect(), host = svg.closest('.cslide').getBoundingClientRect();
      // tooltip di sisi berlawanan dari titik agar tidak menutupi data yang disentuh
      const px = box.left - host.left + (xs[i] / 340) * box.width, tw = tip.offsetWidth;
      tip.style.left = (px > host.width / 2 ? Math.max(8, px - tw - 14) : Math.min(host.width - tw - 8, px + 14)) + 'px';
      tip.style.top = (box.top - host.top + 4) + 'px';
    };
    const pick = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * 340;
      let bi = 0, bd = 1e9; xs.forEach((v: number, i: number) => { const d = Math.abs(v - x); if (d < bd) { bd = d; bi = i; } });
      if (bi !== cur) show(bi);
    };
    const hide = () => { cur = -1; tip.hidden = true; svg.querySelector('.xh')?.setAttribute('x1', '-10'); svg.querySelector('.xh')?.setAttribute('x2', '-10'); svg.querySelectorAll('.hd').forEach((d: any) => d.setAttribute('cx', '-20')); svg.querySelector('.xb')?.setAttribute('x', '-50'); svg.querySelectorAll('.bar').forEach((b: any) => b.classList.remove('dim')); };
    svg.addEventListener('pointermove', pick); svg.addEventListener('pointerdown', pick);
    svg.addEventListener('pointerleave', (e: PointerEvent) => { if (e.pointerType === 'mouse') hide(); });
    svg.tabIndex = 0; svg.setAttribute('aria-label', sl.t + ' — gunakan panah kiri/kanan');
    svg.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); show(Math.max(0, Math.min(sl.pts.length - 1, (cur < 0 ? sl.pts.length - 1 : cur) + (e.key === 'ArrowRight' ? 1 : -1)))); }
      if (e.key === 'Escape') hide();
    });
    svg.addEventListener('blur', hide);
  });
  document.addEventListener('pointerdown', (e: any) => { if (!e.target.closest?.('.chart-svg')) document.querySelectorAll('.ctip').forEach((t: any) => (t.hidden = true)); }, { once: true });
}

VIEWS.finance = () => {
  setHeader('Keuangan', `<button class="hb" onclick="App.expForm()">+ Biaya</button>`);
  if (!S.finFrom) { const d = new Date(); S.finFrom = dKey(new Date(d.getFullYear(), d.getMonth(), 1)); S.finTo = today(); S.finPreset = 'bulan'; }
  const inR = (d: any) => { const k = dKey(d); return k >= S.finFrom && k <= S.finTo; };
  const pays = D.orders.flatMap((o: any) => (o.payments || []).map((p: any) => ({ ...p, o }))).filter((p: any) => inR(p.date)).sort((a: any, b: any) => b.date.localeCompare(a.date));
  const income = pays.reduce((a: number, p: any) => a + p.amount, 0);
  const exps = D.expenses.filter((e: any) => e.date >= S.finFrom && e.date <= S.finTo).sort((a: any, b: any) => b.date.localeCompare(a.date));
  const expTot = exps.reduce((a: number, e: any) => a + e.amount, 0);
  const ordersIn = D.orders.filter((o: any) => inR(o.createdAt));
  const piut = D.orders.filter((o: any) => due(o) > 0).sort((a: any, b: any) => a.createdAt.localeCompare(b.createdAt));
  const svcSum: any = {}; ordersIn.forEach((o: any) => o.items.forEach((i: any) => { const s = (svcSum[i.name] = svcSum[i.name] || { q: 0, v: 0, u: i.unit }); s.q += i.qty; s.v += i.price * i.qty; }));
  const per = [['hari', 'Hari ini'], ['7', '7 hari'], ['bulan', 'Bulan ini'], ['lalu', 'Bulan lalu']];
  let body = '';
  if (S.finTab === 'ringkas') body = `
  <div class="list">${METHODS.map((m) => `<div class="li" style="cursor:default"><div class="m"><div class="t">${m}</div></div><div class="amt">${rp(pays.filter((p: any) => p.method === m).reduce((a: number, p: any) => a + p.amount, 0))}</div></div>`).join('')}</div>
  <div class="sec-t">Layanan terlaris</div>
  <div class="list">${Object.keys(svcSum).length ? Object.entries(svcSum).sort((a: any, b: any) => b[1].v - a[1].v).map(([n, s]: any) => `<div class="li" style="cursor:default"><div class="m"><div class="t">${esc(n)}</div><div class="d">${+s.q.toFixed(2)} ${esc(s.u)}</div></div><div class="amt">${rp(s.v)}</div></div>`).join('') : '<div class="empty">Belum ada data</div>'}</div>
  <button class="btn sec blk" onclick="App.exportFromFinance()">${IC.sheet}Export ke Excel / CSV / Sheets</button>`;
  else if (S.finTab === 'masuk') body = `<div class="list">${pays.length ? pays.map((p: any) => `<div class="li" onclick="App.showOrder('${p.o.id}')"><div class="m"><div class="t">${esc(cust(p.o.customerId).name)}</div><div class="d">${esc(p.o.code)} · ${p.method} · ${fShort(p.date)}${p.by ? ' · ' + esc(p.by) : ''}</div></div><div class="amt" style="color:var(--ok)">+${rp(p.amount)}</div></div>`).join('') : '<div class="empty">Tidak ada pemasukan</div>'}</div>`;
  else if (S.finTab === 'keluar') body = `<button class="btn blk" style="margin-bottom:12px" onclick="App.expForm()">+ Catat Pengeluaran</button><div class="list">${exps.length ? exps.map((e: any) => `<div class="li" onclick="App.expForm('${e.id}')"><div class="m"><div class="t">${esc(e.category)}</div><div class="d">${esc(e.note || '-')} · ${fShort(e.date)}</div></div><div class="amt" style="color:var(--err)">-${rp(e.amount)}</div></div>`).join('') : '<div class="empty">Belum ada pengeluaran</div>'}</div>`;
  else body = `<div class="card" style="display:flex;justify-content:space-between"><span>Total piutang</span><b style="color:var(--err)">${rp(piut.reduce((a: number, o: any) => a + due(o), 0))}</b></div>
  <div class="list">${piut.length ? piut.map((o: any) => `<div class="li" onclick="App.showOrder('${o.id}')"><div class="m"><div class="t">${esc(cust(o.customerId).name)}</div><div class="d">${esc(o.code)} · ${fShort(o.createdAt)}</div></div><div class="r"><div class="amt" style="color:var(--err)">${rp(due(o))}</div><div class="mut" style="font-size:11px">dari ${rp(o.total)}</div></div></div>`).join('') : '<div class="empty">Semua order sudah lunas</div>'}</div>`;
  $('#main').innerHTML = `
 <div class="chips">${per.map(([k, n]) => `<button class="${S.finPreset === k ? 'on' : ''}" onclick="App.setPeriod('${k}')">${n}</button>`).join('')}</div>
 <div class="g2" style="margin-bottom:12px"><input type="date" value="${S.finFrom}" onchange="App.finSet('finFrom',this.value)"><input type="date" value="${S.finTo}" onchange="App.finSet('finTo',this.value)"></div>
 <div class="hero"><div class="l">Laba bersih</div><div class="v">${rp(income - expTot)}</div>
  <div class="s"><div><b>${rp(income)}</b>masuk</div><div><b>${rp(expTot)}</b>keluar</div><div><b>${ordersIn.length}</b>order</div></div></div>
 ${financeCharts({ pays, exps, ordersIn, svcSum })}
 <div class="seg" style="margin-bottom:12px">${[['ringkas', 'Ringkas'], ['masuk', 'Masuk'], ['keluar', 'Keluar'], ['piutang', 'Piutang']].map(([k, n]) => `<button class="${S.finTab === k ? 'on' : ''}" onclick="App.finSet('finTab','${k}')">${n}</button>`).join('')}</div>
 ${body}`;
  bindCharts();
};
function expForm(id = '') {
  const e = id ? D.expenses.find((x: any) => x.id === id) : { date: today(), category: EXP_CAT[0], note: '', amount: '' };
  openSheet(`<h2>${id ? 'Edit' : 'Catat'} Pengeluaran<button class="x" onclick="App.closeSheet()">×</button></h2>
 <div class="f"><label>Jumlah (Rp) *</label><input id="eA" type="number" inputmode="numeric" value="${e.amount}"></div>
 <div class="g2"><div class="f"><label>Tanggal</label><input id="eD" type="date" value="${e.date}"></div>
 <div class="f"><label>Kategori</label><select id="eC">${EXP_CAT.map((c) => `<option ${c === e.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div>
 <div class="f"><label>Keterangan</label><input id="eN" value="${esc(e.note)}"></div>
 <button class="btn blk" onclick="App.saveExp('${id}')">Simpan</button>
 ${id ? `<button class="btn err blk" style="margin-top:8px" onclick="App.delExp('${id}')">Hapus</button>` : ''}`);
}
async function saveExp(id: string) {
  const amount = num($('#eA').value); if (amount <= 0) return toast('Jumlah wajib diisi');
  const d = { date: $('#eD').value || today(), category: $('#eC').value, note: $('#eN').value.trim(), amount };
  closeSheet();
  if (id) await run(() => updRow('expenses', id, d), 'Pengeluaran disimpan'); else await run(() => addRow('expenses', d), 'Pengeluaran dicatat');
}
async function delExp(id: string) { if (!confirm('Hapus pengeluaran ini?')) return; closeSheet(); await run(() => delRow('expenses', id), 'Pengeluaran dihapus'); }
function download(name: string, content: BlobPart, type: string) {
  const blob = new Blob([content], { type });
  try { const f = new File([blob], name, { type }); if (navigator.canShare?.({ files: [f] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) { navigator.share({ files: [f], title: name }).catch(() => {}); return; } } catch (e) { /* abaikan */ }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ================= EXPORT DATA ================= */
const EXP_SETS = [
  { k: 'orders', n: 'Order', d: 'Satu baris per order: pelanggan, layanan, total, status, pembayaran', p: true },
  { k: 'items', n: 'Rincian Layanan', d: 'Satu baris per layanan dalam order (kg/pcs, harga)', p: true },
  { k: 'payments', n: 'Pembayaran', d: 'Semua uang masuk: tanggal, metode, kasir', p: true },
  { k: 'expenses', n: 'Pengeluaran', d: 'Biaya operasional per kategori', p: true },
  { k: 'daily', n: 'Ringkasan Harian', d: 'Order, omzet, pemasukan, pengeluaran & laba per hari', p: true },
  { k: 'piutang', n: 'Piutang', d: 'Order yang belum lunas (semua tanggal)', p: false },
  { k: 'customers', n: 'Pelanggan', d: 'Daftar pelanggan + total belanja & piutang', p: false },
  { k: 'services', n: 'Layanan & Harga', d: 'Daftar layanan, satuan, harga, durasi', p: false },
];
const EX: any = { from: '', to: '', all: false, fmt: 'xlsx', sel: { orders: true, payments: true, expenses: true, daily: true } };
function exPeriod(p: string) {
  const d = new Date(); EX.all = false;
  if (p === 'hari') EX.from = EX.to = today();
  else if (p === '7') { const a = new Date(); a.setDate(a.getDate() - 6); EX.from = dKey(a); EX.to = today(); }
  else if (p === 'bulan') { EX.from = dKey(new Date(d.getFullYear(), d.getMonth(), 1)); EX.to = today(); }
  else if (p === 'lalu') { EX.from = dKey(new Date(d.getFullYear(), d.getMonth() - 1, 1)); EX.to = dKey(new Date(d.getFullYear(), d.getMonth(), 0)); }
  else if (p === 'tahun') { EX.from = `${d.getFullYear()}-01-01`; EX.to = today(); }
  else if (p === 'semua') EX.all = true;
  EX.preset = p; VIEWS.export();
}
function exportFromFinance() { EX.from = S.finFrom; EX.to = S.finTo; EX.all = false; EX.preset = ''; go('export'); }
function exRange() {
  if (!EX.all) return [EX.from, EX.to];
  const ds = [...D.orders.map((o: any) => dKey(o.createdAt)), ...D.orders.flatMap((o: any) => (o.payments || []).map((p: any) => dKey(p.date))), ...D.expenses.map((e: any) => e.date)].sort();
  return [ds[0] || today(), today()];
}
function buildSet(k: string): Dataset {
  const [from, to] = exRange();
  const inR = (d: any) => { if (EX.all) return true; const x = dKey(d); return x >= from && x <= to; };
  const methods = (o: any) => [...new Set((o.payments || []).map((p: any) => p.method))].join(', ');
  const orderCols = [
    { h: 'No. Nota', t: 's', w: 18, v: (o: any) => o.code },
    { h: 'Tanggal Masuk', t: 'dt', v: (o: any) => o.createdAt },
    { h: 'Estimasi Selesai', t: 'd', w: 14, v: (o: any) => o.dueAt },
    { h: 'Pelanggan', t: 's', w: 20, v: (o: any) => cust(o.customerId).name },
    { h: 'No. HP', t: 's', w: 15, v: (o: any) => cust(o.customerId).phone },
    { h: 'Layanan', t: 's', w: 34, v: (o: any) => o.items.map((i: any) => `${i.name} (${i.qty} ${i.unit})`).join(', ') },
    { h: 'Status', t: 's', w: 14, v: (o: any) => stName(o.status) },
    { h: 'Express', t: 's', w: 9, v: (o: any) => (o.express ? 'Ya' : 'Tidak') },
    { h: 'Subtotal', t: 'n', v: (o: any) => o.subtotal },
    { h: 'Biaya Express', t: 'n', v: (o: any) => o.expressFee || 0 },
    { h: 'Diskon', t: 'n', v: (o: any) => o.discount || 0 },
    { h: 'Total', t: 'n', v: (o: any) => o.total },
    { h: 'Dibayar', t: 'n', v: (o: any) => paid(o) },
    { h: 'Sisa', t: 'n', v: (o: any) => due(o) },
    { h: 'Status Bayar', t: 's', w: 13, v: (o: any) => payStatus(o)[1] },
    { h: 'Metode Bayar', t: 's', w: 16, v: methods },
    { h: 'Catatan', t: 's', w: 24, v: (o: any) => o.note || '' },
    { h: 'Dibuat Oleh', t: 's', w: 16, v: (o: any) => o.createdBy || '' },
  ] as any;
  const byDate = (a: any, b: any, f: string) => String(a[f]).localeCompare(String(b[f]));
  switch (k) {
    case 'orders': return { key: k, name: 'Order', cols: orderCols, rows: D.orders.filter((o: any) => inR(o.createdAt)).sort((a: any, b: any) => byDate(a, b, 'createdAt')) };
    case 'piutang': return { key: k, name: 'Piutang', cols: orderCols.filter((c: any) => !['Biaya Express', 'Diskon', 'Subtotal', 'Express', 'Dibuat Oleh'].includes(c.h)), rows: D.orders.filter((o: any) => due(o) > 0).sort((a: any, b: any) => byDate(a, b, 'createdAt')) };
    case 'items': return {
      key: k, name: 'Rincian Layanan', cols: [
        { h: 'No. Nota', t: 's', w: 18, v: (r: any) => r.o.code }, { h: 'Tanggal', t: 'dt', v: (r: any) => r.o.createdAt },
        { h: 'Pelanggan', t: 's', w: 20, v: (r: any) => cust(r.o.customerId).name }, { h: 'Layanan', t: 's', w: 22, v: (r: any) => r.i.name },
        { h: 'Jumlah', t: 'n', w: 9, v: (r: any) => r.i.qty }, { h: 'Satuan', t: 's', w: 9, v: (r: any) => r.i.unit },
        { h: 'Harga', t: 'n', v: (r: any) => r.i.price }, { h: 'Subtotal', t: 'n', v: (r: any) => r.i.price * r.i.qty },
        { h: 'Status', t: 's', w: 14, v: (r: any) => stName(r.o.status) }] as any,
      rows: D.orders.filter((o: any) => inR(o.createdAt)).sort((a: any, b: any) => byDate(a, b, 'createdAt')).flatMap((o: any) => o.items.map((i: any) => ({ o, i }))),
    };
    case 'payments': return {
      key: k, name: 'Pembayaran', cols: [
        { h: 'Tanggal', t: 'dt', v: (r: any) => r.date }, { h: 'No. Nota', t: 's', w: 18, v: (r: any) => r.o.code },
        { h: 'Pelanggan', t: 's', w: 20, v: (r: any) => cust(r.o.customerId).name }, { h: 'Metode', t: 's', w: 11, v: (r: any) => r.method },
        { h: 'Jumlah', t: 'n', v: (r: any) => r.amount }, { h: 'Diterima Oleh', t: 's', w: 16, v: (r: any) => r.by || '' }] as any,
      rows: D.orders.flatMap((o: any) => (o.payments || []).map((p: any) => ({ ...p, o }))).filter((p: any) => inR(p.date)).sort((a: any, b: any) => byDate(a, b, 'date')),
    };
    case 'expenses': return {
      key: k, name: 'Pengeluaran', cols: [
        { h: 'Tanggal', t: 'd', v: (e: any) => e.date + 'T00:00:00' }, { h: 'Kategori', t: 's', w: 20, v: (e: any) => e.category },
        { h: 'Keterangan', t: 's', w: 28, v: (e: any) => e.note }, { h: 'Jumlah', t: 'n', v: (e: any) => e.amount }] as any,
      rows: D.expenses.filter((e: any) => EX.all || (e.date >= from && e.date <= to)).sort((a: any, b: any) => byDate(a, b, 'date')),
    };
    case 'daily': {
      const days: string[] = []; const a = new Date(from + 'T00:00:00'), z = new Date(to + 'T00:00:00');
      for (let d = new Date(a); d <= z && days.length < 3700; d.setDate(d.getDate() + 1)) days.push(dKey(d));
      const m: any = Object.fromEntries(days.map((d) => [d, { d, n: 0, omzet: 0, inc: 0, exp: 0 }]));
      D.orders.forEach((o: any) => { const x = m[dKey(o.createdAt)]; if (x) { x.n++; x.omzet += o.total; } (o.payments || []).forEach((p: any) => { const y = m[dKey(p.date)]; if (y) y.inc += p.amount; }); });
      D.expenses.forEach((e: any) => { const y = m[e.date]; if (y) y.exp += e.amount; });
      return {
        key: k, name: 'Ringkasan Harian', cols: [
          { h: 'Tanggal', t: 'd', v: (r: any) => r.d + 'T00:00:00' }, { h: 'Order Masuk', t: 'n', w: 12, v: (r: any) => r.n },
          { h: 'Omzet Order', t: 'n', v: (r: any) => r.omzet }, { h: 'Pemasukan', t: 'n', v: (r: any) => r.inc },
          { h: 'Pengeluaran', t: 'n', v: (r: any) => r.exp }, { h: 'Laba Bersih', t: 'n', v: (r: any) => r.inc - r.exp }] as any,
        rows: days.map((d) => m[d]),
      };
    }
    case 'customers': return {
      key: k, name: 'Pelanggan', cols: [
        { h: 'Nama', t: 's', w: 22, v: (c: any) => c.name }, { h: 'No. HP', t: 's', w: 15, v: (c: any) => c.phone },
        { h: 'Alamat', t: 's', w: 26, v: (c: any) => c.address }, { h: 'Terdaftar', t: 'd', v: (c: any) => c.createdAt },
        { h: 'Jumlah Order', t: 'n', w: 12, v: (c: any) => c._os.length }, { h: 'Total Belanja', t: 'n', v: (c: any) => c._os.reduce((a: number, o: any) => a + o.total, 0) },
        { h: 'Piutang', t: 'n', v: (c: any) => c._os.reduce((a: number, o: any) => a + due(o), 0) },
        { h: 'Order Terakhir', t: 'd', w: 14, v: (c: any) => c._os.map((o: any) => o.createdAt).sort().pop() || '' }] as any,
      rows: [...D.customers].sort((a: any, b: any) => a.name.localeCompare(b.name)).map((c: any) => ({ ...c, _os: D.orders.filter((o: any) => o.customerId === c.id) })),
    };
    default: return {
      key: 'services', name: 'Layanan & Harga', cols: [
        { h: 'Layanan', t: 's', w: 24, v: (s: any) => s.name }, { h: 'Satuan', t: 's', w: 9, v: (s: any) => s.unit },
        { h: 'Harga', t: 'n', v: (s: any) => s.price }, { h: 'Durasi (hari)', t: 'n', w: 12, v: (s: any) => s.days }] as any,
      rows: D.services,
    };
  }
}
VIEWS.export = () => {
  setHeader('Export Data');
  if (!EX.from) { const d = new Date(); EX.from = dKey(new Date(d.getFullYear(), d.getMonth(), 1)); EX.to = today(); EX.preset = 'bulan'; }
  const per = [['hari', 'Hari ini'], ['7', '7 hari'], ['bulan', 'Bulan ini'], ['lalu', 'Bulan lalu'], ['tahun', 'Tahun ini'], ['semua', 'Semua']];
  const n = EXP_SETS.filter((x) => EX.sel[x.k]).length;
  $('#main').innerHTML = `
 <div class="sec-t" style="margin-top:6px!important">1 · Periode</div>
 <div class="chips">${per.map(([k, t]) => `<button class="${EX.preset === k ? 'on' : ''}" onclick="App.exPeriod('${k}')">${t}</button>`).join('')}</div>
 ${EX.all ? '<div class="count">Semua data sejak awal</div>' : `<div class="g2"><input type="date" value="${EX.from}" onchange="App.exSet('from',this.value)"><input type="date" value="${EX.to}" onchange="App.exSet('to',this.value)"></div>`}
 <div class="sec-t">2 · Pilih data <a onclick="App.exAll()">${n === EXP_SETS.length ? 'Kosongkan' : 'Pilih semua'}</a></div>
 <div class="list">${EXP_SETS.map((x) => {
    const c = buildSet(x.k).rows.length;
    return `<div class="li" onclick="App.exToggle('${x.k}')"><span class="ck ${EX.sel[x.k] ? 'on' : ''}">${IC.check}</span>
   <div class="m"><div class="t">${x.n}</div><div class="d" style="white-space:normal">${x.d}</div></div>
   <div class="r"><b class="amt" style="font-size:14px">${c}</b><span class="mut" style="font-size:11px">${x.p ? 'baris' : 'semua'}</span></div></div>`;
  }).join('')}</div>
 <div class="sec-t">3 · Format</div>
 <div class="seg">${[['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV'], ['sheets', 'Google Sheets']].map(([k, t]) => `<button class="${EX.fmt === k ? 'on' : ''}" onclick="App.exSet('fmt','${k}')">${t}</button>`).join('')}</div>
 <div class="card" style="margin-top:12px;font-size:13.5px;color:var(--tx2)">${EX.fmt === 'xlsx'
    ? `Satu file Excel, <b>tiap data jadi satu sheet</b> lengkap dengan format Rupiah, tanggal, filter & header terkunci. Bisa dibuka di Excel, WPS, atau Google Sheets (<i class="path">File ${IC.chev} Impor ${IC.chev} Upload</i>).`
    : EX.fmt === 'csv' ? `File CSV (UTF-8). ${n > 1 ? 'Karena memilih beberapa data, CSV dikumpulkan dalam satu file <b>.zip</b>.' : 'Satu file CSV.'} Cocok untuk diolah di aplikasi lain.`
      : `Salin data lalu <b>tempel langsung</b> di Google Sheets (buka sheets.new, lalu tekan tempel). Pilih satu data per salinan.`}</div>
 ${EX.fmt === 'sheets'
    ? `<div class="list">${EXP_SETS.filter((x) => EX.sel[x.k]).map((x) => `<div class="li" onclick="App.exCopy('${x.k}')"><div class="ic" style="width:42px;height:42px;border-radius:6px;display:flex;align-items:center;justify-content:center;background:var(--ok-l);color:var(--ok)">${IC.sheet}</div><div class="m"><div class="t">Salin ${x.n}</div><div class="d">${buildSet(x.k).rows.length} baris · tempel di Google Sheets</div></div><span class="btn sm sec">Salin</span></div>`).join('') || '<div class="empty">Pilih data dulu di atas</div>'}</div>
  <button class="btn blk sec" onclick="window.open('https://sheets.new','_blank')">${IC.share}Buka Google Sheets baru</button>`
    : `<button class="btn blk" ${n ? '' : 'disabled'} onclick="App.exRun()">${IC.download}Download ${EX.fmt === 'xlsx' ? 'Excel' : n > 1 ? 'CSV (.zip)' : 'CSV'}${n ? ` · ${n} data` : ''}</button>`}`;
};
function exSet(k: string, v: string) { EX[k] = v; if (k === 'from' || k === 'to') { EX.preset = ''; if (EX.from > EX.to) [EX.from, EX.to] = [EX.to, EX.from]; } VIEWS.export(); }
function exToggle(k: string) { EX.sel[k] = !EX.sel[k]; VIEWS.export(); }
function exAll() { const all = EXP_SETS.every((x) => EX.sel[x.k]); EXP_SETS.forEach((x) => (EX.sel[x.k] = !all)); VIEWS.export(); }
function exName(ext: string) { const [f, t] = exRange(); return `${slug(shopName())}_${EX.all ? 'semua' : f === t ? f : f + '_sd_' + t}.${ext}`; }
function exRun() {
  const sets = EXP_SETS.filter((x) => EX.sel[x.k]).map((x) => buildSet(x.k));
  if (!sets.length) return toast('Pilih minimal 1 data');
  try {
    if (EX.fmt === 'xlsx') download(exName('xlsx'), toXLSX(sets, getComputedStyle(document.documentElement).getPropertyValue('--pri').trim() || '#2563eb'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    else if (sets.length === 1) download(exName('csv').replace('.csv', '_' + slug(sets[0].name) + '.csv'), toCSV(sets[0]), 'text/csv;charset=utf-8');
    else download(exName('zip'), zipCSV(sets), 'application/zip');
    track('export-download', { format: EX.fmt, data: sets.length });
    toast('File export siap');
  } catch (e: any) { console.error(e); toast('Gagal export: ' + e.message); }
}
async function exCopy(k: string) {
  const ds = buildSet(k); const txt = toTSV(ds);
  try { await navigator.clipboard.writeText(txt); }
  catch { const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  toast(`${ds.name} (${ds.rows.length} baris) disalin — tempel di Google Sheets`);
}

/* ================= TIM & AKSES ================= */
/* ---------- Tim (mode lokal): akun username + password per laundry ---------- */
function localTeamView() {
  const ms = [...D.members].sort((a: any, b: any) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.name.localeCompare(b.name)));
  $('#main').innerHTML = `
 <div class="card" style="font-size:13.5px;color:var(--tx2)">Setiap orang masuk dengan <b>nama laundry “${esc(shopName())}”</b> + username & password masing-masing. Semua order, pembayaran & status tercatat atas nama akunnya.${isCloud ? ' Kasir masuk di HP yang sudah <b>diaktifkan pemilik</b> (email + kode OTP, sekali per HP).' : ''}</div>
 <div class="list">${ms.map((m: any) => `<div class="li" onclick="${m.role === 'owner' && sess.role !== 'owner' ? `App.toast('Akun pemilik hanya bisa diubah oleh pemilik')` : `App.localUserForm('${m.id}')`}"><div class="av">${m.role === 'owner' ? IC.crown : esc(initials(m.name))}</div>
  <div class="m"><div class="t">${esc(m.name)}${m.id === sess.userId ? ' (Anda)' : ''}</div><div class="d">@${esc(m.username)}${m.active ? '' : ' · <span style="color:var(--err)">nonaktif</span>'}${m.lastLogin ? ' · login ' + fShort(m.lastLogin) : ''}</div></div>
  <span class="role">${ROLE_NAMES[m.role]}</span></div>`).join('')}</div>
 <button class="btn blk" onclick="App.localUserForm()">${IC.plus}Tambah Akun Kasir / Admin</button>
 <div class="card" style="font-size:13px;margin-top:12px"><b>Hak akses</b><p style="margin:8px 0 0"><span class="role">Kasir</span> buat order, pelanggan, ubah status & terima pembayaran. Tanpa Keuangan, Export, Pengaturan, Tim & hapus data.</p><p style="margin:8px 0 0"><span class="role">Admin</span> akses penuh seperti pemilik.</p></div>`;
}
function localUserForm(id = '') {
  const m = id ? D.members.find((x: any) => x.id === id) : { name: '', username: '', role: 'kasir', active: true };
  if (!m) return;
  const isOwnerAcc = m.role === 'owner';
  openSheet(`<h2>${id ? 'Edit Akun' : 'Tambah Akun'}<button class="x" onclick="App.closeSheet()">×</button></h2>
 <div class="f"><label>Nama</label><input id="uN" value="${esc(m.name)}" placeholder="mis. Rina" autocapitalize="words"></div>
 <div class="f"><label>Username</label><input id="uU" value="${esc(m.username)}" placeholder="mis. rina" autocapitalize="off" ${id ? 'disabled' : ''}>${id ? '' : '<div class="hint">Huruf kecil/angka, 3–24 karakter</div>'}</div>
 ${isOwnerAcc ? '' : `<div class="f"><label>Peran</label><div class="seg" id="uR"><button class="${m.role !== 'admin' ? 'on' : ''}" data-r="kasir" onclick="App.segPick(this)">Kasir</button><button class="${m.role === 'admin' ? 'on' : ''}" data-r="admin" onclick="App.segPick(this)">Admin</button></div></div>`}
 <div class="f"><label>${id ? (id === sess.userId ? 'Password baru (kosongkan jika tidak diganti)' : 'Reset password (kosongkan jika tidak diganti)') : 'Password'}</label><div class="pw"><input id="uP" type="password" autocomplete="new-password" placeholder="Minimal 6 karakter"><button type="button" class="eye" onclick="App.togglePw(this)">${IC.eye}</button></div></div>
 ${id && !isOwnerAcc && id !== sess.userId ? `<div class="tog" style="margin-bottom:14px"><div><b>Akun aktif</b><div class="mut" style="font-size:12.5px">Nonaktifkan agar tidak bisa masuk</div></div><label class="sw"><input type="checkbox" id="uA" ${m.active ? 'checked' : ''}><span></span></label></div>` : ''}
 <button class="btn blk" id="uSave" onclick="App.saveLocalUser('${id}')">Simpan</button>
 ${id && !isOwnerAcc && id !== sess.userId ? `<button class="btn err blk" style="margin-top:8px" onclick="App.delLocalUser('${id}')">Hapus Akun</button>` : ''}`);
}
async function saveLocalUser(id: string) {
  const name = $('#uN').value.trim(), username = ($('#uU').value || '').trim().toLowerCase(), pw = $('#uP').value;
  if (!name) return toast('Nama wajib diisi');
  if (!id && !unameOk(username)) return toast('Username 3–24 karakter: huruf kecil, angka, . - _');
  if ((!id || pw) && pw.length < 6) return toast('Password minimal 6 karakter');
  const role = $('#uR .on')?.dataset.r; const active = $('#uA') ? $('#uA').checked : true;
  const btn = $('#uSave'); if (btn) btn.disabled = true;
  try {
    const ch: any = { name, active }; if (role) ch.role = role;
    if (pw) Object.assign(ch, await hashPassword(pw));
    if (id) { await STAFF().update(id, ch); if (id === sess.userId) { sess.acc = { ...sess.acc, ...ch }; sess.name = name; } }
    else {
      if (await STAFF().where('[realmId+username]').equals([sess.realmId, username]).first()) { if (btn) btn.disabled = false; return toast('Username sudah dipakai di laundry ini'); }
      await STAFF().add({ ...(isCloud ? {} : { id: 'acc_' + uid() }), realmId: sess.realmId, username, role: role || 'kasir', createdAt: new Date().toISOString(), ...ch } as any);
    }
    closeSheet(); toast(id ? (pw ? 'Password direset & akun diperbarui' : 'Akun diperbarui') : `Akun @${username} dibuat`);
  } catch (e: any) { toast('Gagal: ' + e.message); if (btn) btn.disabled = false; }
}
async function delLocalUser(id: string) {
  const m = D.members.find((x: any) => x.id === id); if (!m || !confirm(`Hapus akun @${m.username}? Riwayat order tetap tersimpan.`)) return;
  closeSheet(); await STAFF().delete(id); toast('Akun dihapus');
}
function profileSheet() {
  openSheet(`<h2>Akun Saya<button class="x" onclick="App.closeSheet()">×</button></h2>
 <div class="li" style="padding:0 0 14px;cursor:default"><div class="av">${esc(initials(sess.name))}</div><div class="m"><div class="t">${esc(sess.name)}</div><div class="d">@${esc(sess.username)} · ${esc(shopName())}</div></div><span class="role">${ROLE_NAMES[sess.role]}</span></div>
 <div class="f"><label>Nama tampilan</label><input id="pN" value="${esc(sess.name)}" autocapitalize="words"><div class="hint">Nama ini tercatat di setiap order & pembayaran yang Anda buat</div></div>
 ${`<div class="f"><label>Password lama</label><div class="pw"><input id="pO" type="password" autocomplete="current-password" placeholder="Isi jika ingin ganti password"><button type="button" class="eye" onclick="App.togglePw(this)">${IC.eye}</button></div></div>
 <div class="f"><label>Password baru</label><div class="pw"><input id="pP" type="password" autocomplete="new-password" placeholder="Minimal 6 karakter"><button type="button" class="eye" onclick="App.togglePw(this)">${IC.eye}</button></div></div>`}
 <button class="btn blk" onclick="App.saveProfile()">Simpan</button>
 ${sess.role === 'owner' ? (isCloud
    ? `<div class="card" style="margin-top:14px;font-size:13px"><b>Lupa password?</b><div class="mut" style="margin-top:4px">Di layar Masuk pilih “Lupa password pemilik?”, lalu verifikasi dengan kode OTP ke <b>${esc(sess.email || 'email pemilik')}</b>.</div></div>
       <button class="btn sec blk" style="margin-top:8px" onclick="App.disconnectDevice()">${IC.phone}Putuskan HP ini dari akun pemilik</button>`
    : `<button class="btn sec blk" style="margin-top:14px" onclick="App.newRecoveryCode()">${IC.key}Buat kode pemulihan baru</button><div class="hint" style="text-align:center">Kode lama otomatis tidak berlaku</div>`) : ''}
 <button class="btn err blk" style="margin-top:8px" onclick="App.logout()">${IC.logout}Keluar</button>`);
}
async function saveProfile() {
  const name = $('#pN').value.trim(); if (!name) return toast('Nama wajib diisi');
  try {
    const ch: any = { name }; const o = $('#pO').value, n = $('#pP').value;
    if (n || o) {
      if (n.length < 6) return toast('Password baru minimal 6 karakter');
      if (!(await verifyPassword(o, sess.acc))) return toast('Password lama salah');
      Object.assign(ch, await hashPassword(n));
    }
    await STAFF().update(sess.userId, ch); sess.acc = { ...sess.acc, ...ch };
    sess.name = name; closeSheet(); toast(n ? 'Password diganti' : 'Akun disimpan'); renderPage();
  } catch (e: any) { toast('Gagal: ' + e.message); }
}

VIEWS.team = () => {
  setHeader('Tim & Akses', `<button class="hb" onclick="App.localUserForm()">+ Akun</button>`);
  localTeamView();
};
function segPick(b: any) { b.parentNode.querySelectorAll('button').forEach((x: any) => x.classList.toggle('on', x === b)); }
/* ================= PENGATURAN ================= */
VIEWS.settings = () => {
  setHeader('Pengaturan'); const s = setg(); brandFromSettings();
  const hasOld = (() => { try { return !!localStorage.getItem('farawash_v1'); } catch { return false; } })();
  $('#main').innerHTML = `<div class="sec-t" style="margin-top:4px">Identitas laundry</div>
 <div class="card"><div id="brandBox">${brandFields()}</div>
  <div class="f"><label>Pesan bawah nota</label><textarea id="tF" rows="2">${esc(s.footer)}</textarea></div>
  <div class="g2"><div class="f"><label>Prefix no. nota</label><input id="tX" value="${esc(s.prefix)}"></div><div class="f"><label>Biaya express (%)</label><input id="tE" type="number" inputmode="numeric" value="${s.expressPct}"></div></div>
  <button class="btn blk" onclick="App.saveSet()">Simpan Pengaturan</button>
 </div>
 <div class="sec-t">Backup & data</div>
 <div class="card">
  <p class="mut" style="margin-top:0;font-size:13.5px">${isCloud ? 'Data tersinkron otomatis ke Dexie Cloud. Backup tetap dianjurkan sebagai arsip.' : 'Data tersimpan di HP ini. Backup rutin agar aman jika HP rusak/ganti.'}</p>
  <p style="font-size:13.5px">${D.customers.length} pelanggan · ${D.orders.length} order · ${D.services.length} layanan · ${D.expenses.length} pengeluaran</p>
  <button class="btn blk" style="margin-bottom:8px" onclick="App.backup()">${IC.download}Backup Data (JSON)</button>
  <label class="btn sec blk" style="margin:0 0 8px;color:var(--tx)">${IC.upload}Impor dari Backup<input type="file" accept=".json,application/json" style="display:none" onchange="App.importFile(this.files[0])"></label>
  ${hasOld ? `<button class="btn sec blk" style="margin-bottom:8px" onclick="App.importOld()">Impor data versi lama (v1)</button>` : ''}
  <button class="btn sec blk" onclick="App.seedDemo()">Isi Data Contoh</button>
 </div>`;
  brandPreview(true);
};
async function saveSet() {
  const b = brandData(); if (!b.name) { toast('Nama laundry wajib diisi'); return; }
  const ch = { ...b, footer: $('#tF').value.trim(), prefix: $('#tX').value.trim().toUpperCase() || 'LDR', expressPct: Math.max(0, num($('#tE').value)) };
  await run(() => updRow('settings', D.settings.id, ch), 'Pengaturan disimpan');
  if (isCloud && sess.realm?.owner === sess.userId) cdb.realms.update(sess.realmId, { name: b.name }).catch(() => {});
  applyBrand(); renderPage();
}
function backup() {
  const strip = (a: any[]) => a.map(({ realmId, owner, $ts, ...r }: any) => r);
  const data = { app: 'farawash', version: 2, exportedAt: new Date().toISOString(), settings: strip([D.settings])[0], services: strip(D.services), customers: strip(D.customers), orders: strip(D.orders), expenses: strip(D.expenses) };
  download(`backup_${slug(shopName())}_${today()}.json`, JSON.stringify(data), 'application/json');
}
async function importData(d: any) {
  if (!d || !Array.isArray(d.orders) || !Array.isArray(d.customers)) throw new Error('Format backup tidak dikenali');
  if (!confirm(`Impor ${d.customers.length} pelanggan, ${d.orders.length} order, ${(d.services || []).length} layanan, ${(d.expenses || []).length} pengeluaran ke outlet ini?\n(Data yang ada tidak dihapus.)`)) return;
  toast('Mengimpor…');
  const map: Record<string, string> = {};
  await db.transaction('rw', [db.customers, db.orders, db.services, db.expenses, db.settings], async () => {
    for (const c of d.customers) { const { id, realmId, owner, ...r } = c; map[id] = (await addRow('customers', { createdAt: new Date().toISOString(), address: '', phone: '', ...r })) as string; }
    for (const o of d.orders) { const { id, realmId, owner, change, ...r } = o; await addRow('orders', { ...r, customerId: map[o.customerId] || o.customerId }); }
    const names = new Set(D.services.map((s: any) => s.name.toLowerCase()));
    for (const s of d.services || []) { const { id, realmId, owner, ...r } = s; if (!names.has(String(r.name).toLowerCase())) await addRow('services', r); }
    for (const e of d.expenses || []) { const { id, realmId, owner, ...r } = e; await addRow('expenses', r); }
    if (d.settings && D.settings) {
      const { id, realmId, owner, setupDone, ...r } = d.settings;
      const keep = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== '' && v != null));
      await db.settings.update(D.settings.id, keep);
    }
  });
  toast('Impor selesai');
}
function importFile(f: File) {
  if (!f) return; const r = new FileReader();
  r.onload = async () => { try { await importData(JSON.parse(r.result as string)); } catch (e: any) { toast('Gagal impor: ' + e.message); } };
  r.readAsText(f);
}
async function importOld() { try { await importData(JSON.parse(localStorage.getItem('farawash_v1') || '{}')); } catch (e: any) { toast('Gagal impor: ' + e.message); } }
async function seedDemo() {
  if (!confirm('Tambahkan data contoh (6 pelanggan, 28 order, 3 pengeluaran)?')) return;
  const names = [['Budi Santoso', '081234567801'], ['Siti Aminah', '081234567802'], ['Andi Wijaya', '081234567803'], ['Rina Marlina', '081234567804'], ['Dewi Lestari', '081234567805'], ['Agus Salim', '081234567806']];
  await run(() => db.transaction('rw', [db.customers, db.orders, db.expenses], async () => {
    const ids: string[] = [];
    for (const [n, p] of names) ids.push((await addRow('customers', { name: n, phone: p, address: '', createdAt: new Date().toISOString() })) as string);
    for (let i = 0; i < 28; i++) {
      const d = new Date(); d.setDate(d.getDate() - Math.floor(Math.random() * 20)); d.setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60));
      const s = D.services[Math.floor(Math.random() * D.services.length)];
      const qty = s.unit === 'kg' ? +(2 + Math.random() * 6).toFixed(1) : 1 + Math.floor(Math.random() * 2);
      const total = Math.round(s.price * qty), age = (Date.now() - d.getTime()) / 864e5;
      const status = age > 4 ? 'diambil' : age > 2 ? (Math.random() < 0.5 ? 'siap' : 'diambil') : STATUSES[Math.floor(Math.random() * 3)].k;
      const pr = Math.random(), pay = status === 'diambil' || pr < 0.5 ? total : pr < 0.75 ? Math.round(total / 2 / 1000) * 1000 : 0;
      const du = new Date(d); du.setDate(du.getDate() + s.days);
      const code = `${setg().prefix}${dKey(d).slice(2).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await addRow('orders', { code, customerId: ids[i % ids.length], items: [{ name: s.name, unit: s.unit, price: s.price, qty }], subtotal: total, expressFee: 0, express: false, discount: 0, total, note: '',
        payments: pay ? [{ date: d.toISOString(), amount: pay, method: METHODS[Math.floor(Math.random() * 3)] }] : [], status, history: [{ status: 'diterima', date: d.toISOString() }], createdAt: d.toISOString(), dueAt: du.toISOString() });
    }
    for (const [i, [c, n, a]] of ([['Deterjen & Pewangi', 'Deterjen 5L x2', 180000], ['Listrik', 'Token listrik', 250000], ['Plastik & Kemasan', 'Plastik laundry', 60000]] as any).entries()) {
      const d = new Date(); d.setDate(d.getDate() - i * 3); await addRow('expenses', { date: dKey(d), category: c, note: n, amount: a });
    }
  }), 'Data contoh ditambahkan');
  go('home');
}

/* ================= EKSPOS KE HTML ================= */
const App: any = {
  go, back, toast, num, closeSheet, ordersBy, setOrdFilter, showOrder, statusPicker, pickStatus, advance, addPay, delOrder, sendWA, shareNota, printNota,
  resetCart, cartSet, payFull, payLater, pickCust, chooseCust, addItem, stepQty, setQty, submitOrder,
  showCust, orderFor, custForm, saveCust, delCust, doInstall, svcForm, saveSvc, delSvc,
  setPeriod, finSet, expForm, saveExp, delExp, exportFromFinance, chartTo, chartGo, chartTable, exPeriod, exSet, exToggle, exAll, exRun, exCopy,
  segPick,
  saveSet, backup, importFile, importOld, seedDemo, pickLogo, brandSet,
  authSubmit, authCancel, authGo, afSet, togglePw, authSubmitForm, profileSheet, saveProfile, localUserForm, saveLocalUser, delLocalUser, finishSetup, logout, copyText, recoveryDone, newRecoveryCode, activateOther, disconnectDevice,
  _debug: { D: () => D, sess, S, db },
};
/* Event klik tombol penting → Umami. Nilai: nama event, atau fungsi (argumen) → [nama, data]. */
const TRACK: Record<string, string | ((...a: any[]) => [string, any?])> = {
  authGo: (v) => ['app-auth-buka', { form: v }],
  authSubmitForm: () => ['app-auth-kirim', { form: S.auth }],
  ordersBy: (f) => ['app-order-filter', { filter: f }],
  setOrdFilter: (f) => ['app-order-filter', { filter: f }],
  advance: () => 'status-lanjut',
  pickStatus: (_id, k) => ['status-ubah', { status: k }],
  addPay: () => 'pembayaran-tambah',
  delOrder: () => 'order-hapus',
  sendWA: (_id, type) => ['nota-wa', { jenis: type }],
  shareNota: () => 'nota-bagikan',
  printNota: () => 'nota-cetak',
  resetCart: () => 'kasir-reset',
  payFull: () => 'kasir-bayar-lunas',
  payLater: () => 'kasir-bayar-nanti',
  pickCust: () => 'kasir-pilih-pelanggan',
  submitOrder: () => 'kasir-simpan-klik',
  orderFor: () => 'pelanggan-buat-order',
  custForm: (id) => ['pelanggan-form', { baru: !id }],
  saveCust: (id) => ['pelanggan-simpan', { baru: !id }],
  delCust: () => 'pelanggan-hapus',
  doInstall: () => 'pwa-install',
  svcForm: (id) => ['layanan-form', { baru: !id }],
  saveSvc: (id) => ['layanan-simpan', { baru: !id }],
  delSvc: () => 'layanan-hapus',
  setPeriod: (p) => ['keuangan-periode', { periode: p }],
  expForm: (id) => ['pengeluaran-form', { baru: !id }],
  saveExp: (id) => ['pengeluaran-simpan', { baru: !id }],
  delExp: () => 'pengeluaran-hapus',
  exportFromFinance: () => 'keuangan-ke-export',
  chartGo: (d) => ['grafik-geser', { arah: d > 0 ? 'kanan' : 'kiri' }],
  chartTo: (i, smooth) => (smooth === false ? ['', undefined] : ['grafik-pilih', { slide: i }]),
  chartTable: () => 'grafik-tabel',
  exPeriod: (p) => ['export-periode', { periode: p }],
  exRun: () => ['export-klik', { format: EX.fmt }],
  exCopy: (k) => ['export-salin-sheets', { data: k }],
  saveSet: () => 'pengaturan-simpan',
  backup: () => 'backup-download',
  importFile: () => 'backup-impor',
  seedDemo: () => 'data-demo',
  profileSheet: () => 'akun-saya',
  saveProfile: () => 'akun-simpan',
  localUserForm: (id) => ['tim-form', { baru: !id }],
  saveLocalUser: (id) => ['tim-simpan', { baru: !id }],
  delLocalUser: () => 'tim-hapus',
  newRecoveryCode: () => 'kode-pemulihan-baru',
  activateOther: () => 'aktivasi-hp-lain',
  disconnectDevice: () => 'putuskan-hp',
  logout: () => 'logout',
};
for (const [k, spec] of Object.entries(TRACK)) {
  const fn = App[k]; if (typeof fn !== 'function') continue;
  App[k] = function (this: any, ...a: any[]) {
    const r = typeof spec === 'string' ? [spec] : spec(...a);
    const [name, data] = Array.isArray(r) ? r : [r];
    if (name) track(name, data);
    return fn.apply(this, a);
  };
}
App.track = track;
(window as any).App = App;

/* ================= BOOT ================= */
{
  const q = new URLSearchParams(location.search);
  if (q.has('daftar') || q.has('masuk')) {
    S.auth = q.has('daftar') ? 'register' : 'login';
    const last = JSON.parse(localStorage.getItem('fw_last_login') || '{}');
    S.af = S.auth === 'login' ? { laundry: last.laundry || '', username: last.username || '', email: last.email || '' } : {};
    history.replaceState(history.state, '', location.pathname);
  }
}
document.addEventListener('astro:page-load', () => {
  $('#sheetBg')?.addEventListener('click', closeSheet);
  S.view = document.body.dataset.page || 'home';
  if (sess.phase === 'ready') renderPage(); else { $('#overlay').dataset.k = ''; renderOverlay(); }
});
document.addEventListener('astro:before-swap', () => closeSheet());
window.addEventListener('popstate', () => closeSheet());

if (isCloud) initCloud(); else { evaluate(); db.open().then(loadSession).catch((e) => toast('Gagal membuka database: ' + e.message)); }

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(BASE + 'sw.js').catch(() => {}));
}
