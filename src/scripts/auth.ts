/* We POS — perangkat, pendaftaran restoran, layar kunci (pilih staf + PIN), sinkron data. */
import { liveQuery } from 'dexie';
import { db, cdb, isCloud } from '../lib/db';
import { hashPassword, verifyPassword } from '../lib/auth';
import {
  S, D, sess, setD, emptyData, reg, $, esc, IC, toast, track, uid, defaultSettings, avatar, AV_COLORS, ROLE_NAMES,
  resolveWaiters, centerMsg, closeSheet, ask, copyText, dKey,
} from './core';
import { renderPage, onData, applyBrand, go } from './shell';

const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const pinOk = (p: string) => /^\d{4,6}$/.test(p);
const LS_REST = 'wp_rest', LS_STAFF = 'wp_staff';

/* ---------- Data contoh untuk restoran baru ---------- */
const STARTER: { cats: [string, string][]; items: [string, number, string, number, string?][]; tables: [string, string, number][] } = {
  cats: [['Makanan', '🍛'], ['Minuman', '🥤'], ['Camilan', '🍟']],
  items: [
    ['Nasi Goreng Spesial', 0, '🍛', 25000], ['Mie Goreng Jawa', 0, '🍜', 22000], ['Ayam Bakar Madu', 0, '🍗', 30000],
    ['Soto Ayam', 0, '🍲', 20000], ['Nasi Ayam Geprek', 0, '🍚', 23000], ['Sate Ayam (10 tusuk)', 0, '🍢', 28000],
    ['Es Teh Manis', 1, '🧋', 6000, 'bar'], ['Es Jeruk', 1, '🍊', 9000, 'bar'], ['Kopi Susu Gula Aren', 1, '☕', 18000, 'bar'],
    ['Air Mineral', 1, '💧', 5000, 'bar'], ['Kentang Goreng', 2, '🍟', 15000], ['Pisang Goreng Keju', 2, '🍌', 14000],
  ],
  tables: [['1', 'Dalam', 4], ['2', 'Dalam', 4], ['3', 'Dalam', 2], ['4', 'Dalam', 2], ['5', 'Dalam', 6], ['6', 'Dalam', 4], ['7', 'Teras', 4], ['8', 'Teras', 4]],
};
function recoveryCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', a = new Uint8Array(12); crypto.getRandomValues(a);
  const s = [...a].map((x) => A[x % A.length]).join(''); return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
const normCode = (c: string) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Buat isi restoran baru (settings, owner, menu contoh, meja). `put` menambah baris di tabel. */
async function seedRestaurant(realmId: string, d: any, put: (t: string, o: any) => Promise<any>) {
  const now = new Date().toISOString();
  const { code, recovery } = d.rec;
  await put('settings', { ...defaultSettings(d.resto, d.phone || ''), recovery, realmId });
  const ownerId = await put('staff', { realmId, name: d.name, role: 'owner', ...d.pin, pinLen: d.pinLen, active: true, color: AV_COLORS[0], email: d.email || '', createdAt: now, lastLogin: now });
  if (d.sample) {
    const catIds: string[] = [];
    for (const [i, [name, icon]] of STARTER.cats.entries()) catIds.push(await put('categories', { realmId, name, icon, sort: i }));
    for (const [i, [name, ci, icon, price, st]] of STARTER.items.entries())
      await put('items', { realmId, name, categoryId: catIds[ci], price, icon, photo: '', station: st || 'dapur', available: true, sort: i });
    for (const [i, [name, area, seats]] of STARTER.tables.entries()) await put('dtables', { realmId, name, area, seats, sort: i });
  } else {
    await put('categories', { realmId, name: 'Makanan', icon: '🍛', sort: 0 });
    await put('categories', { realmId, name: 'Minuman', icon: '🥤', sort: 1 });
  }
  return { code, ownerId };
}

/* ================= DAFTAR RESTORAN ================= */
const TABLES = ['settings', 'staff', 'categories', 'items', 'dtables'];
async function makeRecovery() { const code = recoveryCode(); return { code, recovery: await hashPassword(normCode(code)) }; }
async function localRegister(d: any) {
  d.rec = await makeRecovery();
  const realmId = 'rst_' + uid(); const now = new Date().toISOString();
  let res: any;
  await db.transaction('rw', [db.restaurants, ...TABLES.map((t) => (db as any)[t])], async () => {
    await db.restaurants.add({ id: realmId, name: d.resto, createdAt: now });
    res = await seedRestaurant(realmId, d, async (t, o) => { o.id = uid(); await (db as any)[t].add(o); return o.id; });
  });
  await loadRestaurants();
  localStorage.setItem(LS_REST, realmId);
  track('daftar-berhasil', { mode: 'lokal' });
  S.recovery = { code: res.code, resto: d.resto, ownerId: res.ownerId };
  S.auth = 'recovery'; S.authBusy = false; evaluate(); renderOverlay(true);
}
async function cloudRegister(p: any) {
  p.rec = await makeRecovery();
  let realmId = '', res: any;
  await db.transaction('rw', [cdb.realms, ...TABLES.map((t) => (db as any)[t])], async () => {
    realmId = await cdb.realms.add({ name: p.resto });
    res = await seedRestaurant(realmId, p, (t, o) => (db as any)[t].add(o));
  });
  sess.realms = await cdb.realms.toArray();
  localStorage.setItem(LS_REST, realmId);
  track('daftar-berhasil', { mode: 'online' });
  S.recovery = { code: res.code, resto: p.resto, ownerId: res.ownerId };
  S.auth = 'recovery';
}

/* ================= DAFTAR RESTORAN DI PERANGKAT ================= */
async function loadRestaurants() { if (!isCloud) { try { sess.restaurants = await db.restaurants.toArray(); } catch { sess.restaurants = []; } } }
export function restaurantList(): { id: string; name: string }[] {
  if (!isCloud) return sess.restaurants.map((r: any) => ({ id: r.id, name: r.name }));
  const u = sess.user; if (!u?.isLoggedIn) return [];
  // Hanya realm milik We POS (punya pengaturan restoran) — realm aplikasi lain di database yang sama diabaikan.
  const mine: Set<string> = sess.weposRealms || new Set();
  return (sess.realms || []).filter((r: any) => r.realmId !== u.userId && r.realmId !== 'rlm-public' && r.name && mine.has(r.realmId)).map((r: any) => ({ id: r.realmId, name: r.name }));
}

/* ================= STORE (liveQuery per restoran) ================= */
let storeSub: any = null, storeRealm = '';
export let storeReady = false;
function stopStore() { storeSub?.unsubscribe(); storeSub = null; storeRealm = ''; storeReady = false; setD(emptyData()); }
function startStore(realmId: string) {
  if (storeRealm === realmId) return;
  storeSub?.unsubscribe(); storeRealm = realmId; storeReady = false;
  const since = new Date(); since.setDate(since.getDate() - 92); const sinceIso = since.toISOString();
  const where = (t: string) => (db as any)[t].where('realmId').equals(realmId).toArray();
  storeSub = liveQuery(async () => {
    const [settings, categories, items, tables, recent, open, reservations, expenses, closings, staff] = await Promise.all([
      db.settings.where('realmId').equals(realmId).first(), where('categories'), where('items'), where('dtables'),
      db.orders.where('createdAt').aboveOrEqual(sinceIso).filter((o) => o.realmId === realmId).toArray(),
      db.orders.where('status').equals('open').filter((o) => o.realmId === realmId).toArray(),
      db.reservations.where('date').aboveOrEqual(dKey(since)).filter((o) => o.realmId === realmId).toArray(),
      db.expenses.where('date').aboveOrEqual(dKey(since)).filter((o) => o.realmId === realmId).toArray(),
      db.closings.where('realmId').equals(realmId).toArray(), where('staff'),
    ]);
    const ids = new Set(recent.map((o: any) => o.id)); const orders = [...recent, ...open.filter((o: any) => !ids.has(o.id))];
    return { settings, categories, items, tables, orders, reservations, expenses, closings, staff };
  }).subscribe((d: any) => {
    const bySort = (a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.name).localeCompare(String(b.name), 'id', { numeric: true });
    d.categories.sort(bySort); d.items.sort(bySort); d.tables.sort(bySort);
    d.orders.sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));
    d.staff.sort((a: any, b: any) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.name.localeCompare(b.name)));
    const prev = D; setD(d); storeReady = true;
    resolveWaiters();
    // staf dinonaktifkan / dihapus (juga dari perangkat lain) → kunci
    if (sess.staff) {
      const me = d.staff.find((m: any) => m.id === sess.staff.id);
      if (me && me.active) { sess.staff = me; sess.role = me.role; sess.name = me.name; }
      else if (me || sess.synced || !isCloud) { lockNow(me ? 'Akun Anda dinonaktifkan pemilik.' : 'Akun Anda sudah dihapus.'); return; }
    }
    evaluate();
    if (sess.phase === 'ready') onData(prev);
    else if (sess.phase === 'lock') renderOverlay(true);
  }, (e: any) => { console.error(e); toast('Gagal memuat data: ' + e.message, 'err'); });
}

/* ================= EVALUASI FASE ================= */
export function evaluate() {
  const prev = sess.phase, u = sess.user;
  if (isCloud && !u) sess.phase = 'boot';
  else if (isCloud && S.pending && u?.isLoggedIn) {
    if (!sess.synced) sess.phase = 'syncing';
    else { sess.phase = 'preparing'; setTimeout(processPending, 0); }
  } else if (S.auth === 'recovery' && S.recovery) sess.phase = 'recovery';
  else {
    const list = restaurantList();
    let rid = localStorage.getItem(LS_REST) || '';
    const known = list.some((r) => r.id === rid);
    if (isCloud && u?.isLoggedIn && !sess.synced && !known) sess.phase = 'syncing';
    else if (!known) {
      if (rid) { localStorage.removeItem(LS_REST); rid = ''; }
      stopStore();
      if (isCloud && u?.isLoggedIn && list.length === 1) { localStorage.setItem(LS_REST, list[0].id); return evaluate(); }
      sess.phase = isCloud && u?.isLoggedIn && list.length > 1 ? 'pick' : 'welcome';
    } else {
      sess.realmId = rid; sess.resto = list.find((r) => r.id === rid);
      startStore(rid);
      if (!storeReady || !D.settings) sess.phase = isCloud && !sess.synced ? 'syncing' : 'boot';
      else {
        const id = localStorage.getItem(LS_STAFF);
        const me = id ? D.staff.find((s: any) => s.id === id && s.active) : null;
        if (me) { sess.staff = me; sess.role = me.role; sess.name = me.name; sess.phase = 'ready'; }
        else { sess.staff = null; sess.role = ''; sess.name = ''; sess.phase = 'lock'; }
      }
    }
  }
  if (sess.phase !== prev || sess.phase !== 'ready') renderOverlay();
  if (sess.phase === 'ready' && prev !== 'ready') { applyBrand(); renderPage(); }
}

/* ================= LAYAR (overlay) ================= */
const ALERT_ID: Record<string, (p: any) => string> = {
  OTP_SENT: (p) => `Kode OTP dikirim ke <b>${esc(p.email || 'email Anda')}</b>. Cek folder Spam bila tidak ada.`,
  INVALID_OTP: () => 'Kode OTP salah. Coba lagi.', INVALID_EMAIL: () => 'Email tidak valid.',
  LICENSE_LIMIT_REACHED: () => 'Batas lisensi Dexie Cloud tercapai.', USER_DEACTIVATED: () => 'Akun ini dinonaktifkan.',
  LOGOUT_CONFIRMATION: () => 'Masih ada data yang belum tersinkron. Jika keluar sekarang, data tersebut akan hilang.',
};
function brandTop(sub = '') {
  return `<div class="auth-brand"><span class="auth-logo">${IC.logo}</span><b>We POS</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
}
function cloudUiView(ui: any) {
  const titles: Record<string, string> = { email: 'Masukkan email', otp: 'Masukkan kode OTP', 'logout-confirmation': 'Putuskan perangkat?', 'message-alert': 'Informasi' };
  const alerts = (ui.alerts || []).map((a: any) => `<div class="alert ${a.type}">${ALERT_ID[a.messageCode] ? ALERT_ID[a.messageCode](a.messageParams || {}) : esc(a.message)}</div>`).join('');
  const fields = Object.entries(ui.fields || {}).map(([k]: any) => k === 'otp' || ui.type === 'otp'
    ? `<label class="fl"><span>Kode OTP</span><input name="${k}" class="otp-input" autocomplete="one-time-code" autocapitalize="characters" maxlength="12" placeholder="Kode dari email" required oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'')"></label>`
    : `<label class="fl"><span>Email</span><input name="${k}" type="email" inputmode="email" autocomplete="email" required value="${esc(localStorage.getItem('wp_last_email') || '')}"></label>`).join('');
  return `<div class="auth-card">${brandTop()}<h1>${titles[ui.type] || esc(ui.title)}</h1>${alerts}
   <form id="cloudForm" onsubmit="event.preventDefault();App.cloudSubmit()">${fields}
    <button class="btn blk lg" type="submit" id="cloudBtn">${ui.type === 'otp' ? 'Verifikasi' : esc(ui.submitLabel || 'Lanjut')}</button>
    ${ui.cancelLabel ? `<button class="btn ghost blk" type="button" onclick="App.cloudCancel()">${ui.type === 'otp' ? 'Batal' : esc(ui.cancelLabel)}</button>` : ''}</form></div>`;
}
function welcomeView() {
  const list = restaurantList();
  return `<div class="auth-split"><div class="auth-hero">
    <span class="auth-logo xl">${IC.logo}</span>
    <h2>Kasir restoran yang<br>bisa dipakai siapa saja.</h2>
    <ul><li>${IC.pos}Ketuk menu, kirim ke dapur, bayar — selesai</li><li>${IC.chef}Layar dapur & antrian otomatis</li><li>${IC.cal}Meja & reservasi dalam satu tempat</li><li>${IC.cloud}Tetap jalan saat offline</li></ul>
   </div><div class="auth-card">${brandTop('Kasir Restoran')}
   <h1>Selamat datang 👋</h1><p class="mut">Mulai dengan mendaftarkan restoran Anda. Gratis, kurang dari 1 menit.</p>
   ${S.authInfo ? `<div class="alert info">${S.authInfo}</div>` : ''}
   <button class="choice pri" onclick="App.authGo('register')"><span class="ci">${IC.store}</span><span class="cm"><b>Daftar Restoran Baru</b><small>Anda menjadi Pemilik</small></span><span class="ca">${IC.chev}</span></button>
   ${isCloud ? `<button class="choice" onclick="App.authGo('connect')"><span class="ci">${IC.key}</span><span class="cm"><b>Hubungkan Perangkat Ini</b><small>Sudah punya restoran? Masuk dengan email pemilik</small></span><span class="ca">${IC.chev}</span></button>`
    : list.map((r) => `<button class="choice" onclick="App.pickResto('${r.id}')"><span class="ci">${IC.store}</span><span class="cm"><b>${esc(r.name)}</b><small>Buka restoran di perangkat ini</small></span><span class="ca">${IC.chev}</span></button>`).join('')}
   <p class="foot-note">${isCloud ? 'Data tersinkron aman antar perangkat.' : 'Mode lokal · data tersimpan di perangkat ini.'} <a href="${import.meta.env.BASE_URL}panduan/">Panduan</a></p>
  </div></div>`;
}
function fld(k: string, label: string, o: any = {}) {
  return `<label class="fl"><span>${label}</span><input id="af_${k}" type="${o.type || 'text'}" ${o.im ? `inputmode="${o.im}"` : ''} ${o.max ? `maxlength="${o.max}"` : ''} autocomplete="${o.ac || 'off'}" placeholder="${esc(o.ph || '')}" value="${esc(S.af[k] ?? '')}" oninput="App.afSet('${k}',this.value)">${o.hint ? `<small>${o.hint}</small>` : ''}</label>`;
}
function registerView() {
  const connect = S.auth === 'connect';
  const body = connect
    ? fld('email', 'Email pemilik', { type: 'email', im: 'email', ac: 'email', ph: 'nama@email.com', hint: 'Kami kirim kode OTP ke email ini.' })
    : fld('resto', 'Nama restoran', { ph: 'mis. Warung Bu Sri', ac: 'organization' })
      + fld('name', 'Nama Anda', { ph: 'mis. Sri', ac: 'name' })
      + (isCloud ? fld('email', 'Email', { type: 'email', im: 'email', ac: 'email', ph: 'nama@email.com', hint: 'Untuk verifikasi & menghubungkan perangkat lain.' }) : '')
      + `<div class="row2">${fld('pin', 'PIN 4–6 angka', { type: 'password', im: 'numeric', max: 6, ph: '••••' })}${fld('pin2', 'Ulangi PIN', { type: 'password', im: 'numeric', max: 6, ph: '••••' })}</div>`
      + `<label class="check"><input type="checkbox" ${S.af.sample !== false ? 'checked' : ''} onchange="App.afSet('sample',this.checked)"><span>Isi contoh menu & 8 meja <small>(bisa diubah nanti)</small></span></label>`;
  return `<div class="auth-card"><button class="link-back" onclick="App.authGo('welcome')">${IC.back}Kembali</button>${brandTop()}
   <h1>${connect ? 'Hubungkan perangkat' : 'Daftar restoran'}</h1>
   <p class="mut">${connect ? 'Masukkan email pemilik restoran. Cukup sekali per perangkat — setelah itu staf masuk dengan PIN.' : 'PIN dipakai untuk masuk ke kasir. Anda bisa menambah staf (kasir, pelayan, dapur) nanti.'}</p>
   ${S.authErr ? `<div class="alert error">${S.authErr}</div>` : ''}
   <form onsubmit="event.preventDefault();App.authSubmit()">${body}
    <button class="btn blk lg" type="submit" ${S.authBusy ? 'disabled' : ''}>${S.authBusy ? 'Memproses…' : connect ? 'Kirim kode OTP' : isCloud ? 'Daftar & kirim kode OTP' : 'Daftar & mulai'}</button></form></div>`;
}
function recoveryView() {
  const r = S.recovery || {};
  return `<div class="auth-card">${brandTop()}<div class="big-ico ok">${IC.check}</div><h1>${esc(r.resto)} siap dipakai!</h1>
   <p class="mut">Simpan <b>kode pemulihan</b> ini. Kode dipakai bila pemilik lupa PIN. Catat atau foto, lalu simpan di tempat aman.</p>
   <div class="rcode">${esc(r.code)}</div>
   <button class="btn ghost blk" onclick="App.copyText('${esc(r.code)}')">${IC.copy}Salin kode</button>
   <button class="btn blk lg" onclick="App.recoveryDone()">Sudah disimpan, mulai jualan</button></div>`;
}
function pickView() {
  return `<div class="auth-card">${brandTop()}<h1>Pilih restoran</h1><p class="mut">Akun ${esc(sess.user?.email || '')} memiliki beberapa restoran.</p>
   ${restaurantList().map((r) => `<button class="choice" onclick="App.pickResto('${r.id}')"><span class="ci">${IC.store}</span><span class="cm"><b>${esc(r.name)}</b></span><span class="ca">${IC.chev}</span></button>`).join('')}
   <button class="choice" onclick="App.authGo('register')"><span class="ci">${IC.plus}</span><span class="cm"><b>Daftar restoran baru</b></span><span class="ca">${IC.chev}</span></button>
   <p class="foot-note"><a onclick="App.disconnect()">Putuskan perangkat ini</a></p></div>`;
}
/* ---------- Layar kunci: pilih staf → PIN ---------- */
function lockView() {
  const s = D.settings || {};
  const staff = D.staff.filter((x: any) => x.active);
  const who = S.lockWho && staff.find((x: any) => x.id === S.lockWho);
  const head = `<div class="lock-head">${s.logo ? `<img src="${s.logo}" alt="">` : `<span class="auth-logo">${IC.logo}</span>`}<div><b>${esc(s.name || sess.resto?.name || '')}</b><small>${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}</small></div></div>`;
  if (S.lockMode === 'reset') {
    return `<div class="lock">${head}<div class="auth-card"><button class="link-back" onclick="App.lockBack()">${IC.back}Kembali</button>
     <h1>Reset PIN pemilik</h1><p class="mut">Masukkan kode pemulihan yang ditampilkan saat mendaftar.</p>
     ${S.authErr ? `<div class="alert error">${S.authErr}</div>` : ''}
     <form onsubmit="event.preventDefault();App.resetPin()">${fld('code', 'Kode pemulihan', { ph: 'XXXX-XXXX-XXXX' })}
     <div class="row2">${fld('pin', 'PIN baru', { type: 'password', im: 'numeric', max: 6 })}${fld('pin2', 'Ulangi PIN', { type: 'password', im: 'numeric', max: 6 })}</div>
     <button class="btn blk lg" ${S.authBusy ? 'disabled' : ''}>Simpan PIN baru</button></form>
     <p class="foot-note mut">Staf lain lupa PIN? Pemilik/Manajer bisa mengganti PIN di menu Tim.</p></div></div>`;
  }
  if (who) {
    const n = who.pinLen || 4, v = S.pin || '';
    return `<div class="lock">${head}<div class="pin-card ${S.pinErr ? 'shake' : ''}">
      <button class="link-back" onclick="App.lockBack()">${IC.back}Ganti orang</button>
      ${avatar(who, 'xl')}<h2>${esc(who.name)}</h2><small class="mut">${ROLE_NAMES[who.role]}</small>
      <div class="dots">${Array.from({ length: n }, (_, i) => `<i class="${i < v.length ? 'on' : ''}"></i>`).join('')}</div>
      <div class="pin-msg">${S.pinErr ? 'PIN salah, coba lagi' : S.authBusy ? 'Memeriksa…' : 'Masukkan PIN'}</div>
      <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => `<button onclick="App.pinKey('${k}')">${k}</button>`).join('')}
       <button class="soft" onclick="App.pinKey('c')">Hapus</button><button onclick="App.pinKey('0')">0</button><button class="soft" onclick="App.pinKey('b')" aria-label="Hapus satu">${IC.backspace}</button></div>
      ${who.role === 'owner' ? `<button class="link" onclick="App.lockReset()">Lupa PIN?</button>` : ''}
    </div></div>`;
  }
  return `<div class="lock">${head}<div class="who"><h1>Siapa yang bertugas?</h1>
    ${S.authInfo ? `<div class="alert info">${S.authInfo}</div>` : ''}
    <div class="who-grid">${staff.map((x: any) => `<button onclick="App.lockPick('${x.id}')">${avatar(x, 'lg')}<b>${esc(x.name)}</b><small>${ROLE_NAMES[x.role]}</small></button>`).join('')}</div>
    <p class="foot-note">${isCloud ? `${IC.cloud} Tersinkron · ` : ''}<a onclick="App.switchResto()">Ganti restoran</a></p></div></div>`;
}
export function renderOverlay(force = false) {
  const o = $('#overlay'); if (!o) return;
  let html = '';
  const ui = sess.ui;
  if (ui && ['otp', 'email', 'logout-confirmation', 'message-alert'].includes(ui.type)) html = cloudUiView(ui);
  else if (sess.phase === 'recovery') html = recoveryView();
  else if (sess.phase === 'welcome') html = S.auth === 'register' || S.auth === 'connect' ? registerView() : welcomeView();
  else if (sess.phase === 'pick') html = S.auth === 'register' ? registerView() : pickView();
  else if (sess.phase === 'lock') html = lockView();
  else if (sess.phase === 'boot') html = centerMsg('spin', 'Memuat…');
  else if (sess.phase === 'preparing') html = centerMsg('spin', 'Menyiapkan restoran Anda…', 'Sebentar ya ✨');
  else if (sess.phase === 'syncing') html = centerMsg('spin', 'Menyinkronkan data…', 'Pertama kali butuh koneksi internet.');
  if (!html) { o.hidden = true; o.innerHTML = ''; o.dataset.k = ''; document.body.classList.remove('locked'); return; }
  document.body.classList.add('locked');
  const key = sess.phase + '|' + S.auth + '|' + (ui ? ui.type + JSON.stringify(ui.alerts || []) : '') + '|' + restaurantList().length;
  if (!force && o.dataset.k === key && !o.hidden) return;
  o.dataset.k = key; o.hidden = false; o.innerHTML = html;
  setTimeout(() => { const i = [...o.querySelectorAll('input:not([type=checkbox])')].find((x: any) => !x.value) as HTMLElement; i?.focus(); }, 60);
}

/* ================= AKSI ================= */
function authGo(v: string) {
  S.auth = v; S.authErr = ''; S.authBusy = false; S.authInfo = '';
  if (v === 'register') S.af = { sample: true }; else if (v === 'connect') S.af = { email: localStorage.getItem('wp_last_email') || '' }; else S.af = {};
  renderOverlay(true);
}
function afSet(k: string, v: any) { S.af[k] = v; }
function authFail(msg: string, focus?: string) {
  track('auth-gagal', { form: S.auth, kolom: focus || '-' }); S.authErr = msg; S.authBusy = false; renderOverlay(true);
  if (focus) setTimeout(() => $('#af_' + focus)?.focus(), 60);
}
async function authSubmit() {
  if (S.authBusy) return;
  const f = S.af; const email = String(f.email || '').trim().toLowerCase();
  if (S.auth === 'connect') {
    if (!emailOk(email)) return authFail('Email tidak valid.', 'email');
    localStorage.setItem('wp_last_email', email);
    S.authBusy = true; renderOverlay(true);
    return cloudLogin(email, null);
  }
  const resto = String(f.resto || '').trim(), name = String(f.name || '').trim();
  if (!resto) return authFail('Nama restoran wajib diisi.', 'resto');
  if (!name) return authFail('Nama Anda wajib diisi.', 'name');
  if (isCloud && !emailOk(email)) return authFail('Email tidak valid.', 'email');
  if (!pinOk(f.pin)) return authFail('PIN harus 4–6 angka.', 'pin');
  if (f.pin !== f.pin2) return authFail('Ulangi PIN tidak sama.', 'pin2');
  S.authBusy = true; S.authErr = ''; renderOverlay(true);
  const d = { resto, name, email, phone: '', sample: f.sample !== false, pin: await hashPassword(f.pin), pinLen: f.pin.length };
  try {
    if (isCloud) { localStorage.setItem('wp_last_email', email); await cloudLogin(email, { type: 'register', ...d }); }
    else await localRegister(d);
  } catch (e: any) { console.error(e); authFail(e?.message || String(e)); }
}
async function cloudLogin(email: string, pending: any) {
  const u = sess.user;
  S.pending = pending;
  if (u?.isLoggedIn && (u.email || '').toLowerCase() === email) { S.authBusy = false; evaluate(); return; }
  if (u?.isLoggedIn) { try { await cdb.cloud.logout(); } catch (e) { console.error(e); } }
  sess.synced = false;
  try { await cdb.cloud.login({ email, grant_type: 'otp' }); }
  catch (e: any) { S.pending = null; if (/cancel/i.test(e?.message || '')) { S.authBusy = false; renderOverlay(true); return; } authFail('Gagal verifikasi: ' + (e?.message || e)); }
  S.authBusy = false;
}
async function processPending() {
  if (S.busyPending || !S.pending) return;
  const p = S.pending; S.busyPending = true;
  try { if (p.type === 'register') await cloudRegister(p); }
  catch (e: any) { console.error(e); S.authErr = 'Gagal: ' + e.message; S.auth = 'register'; }
  finally { S.pending = null; S.busyPending = false; S.authBusy = false; evaluate(); renderOverlay(true); }
}
function cloudSubmit() {
  const ui = sess.ui; if (!ui) return; const params: any = {};
  document.querySelectorAll<HTMLInputElement>('#cloudForm input[name]').forEach((i) => (params[i.name] = i.name === 'otp' ? i.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : i.value.trim()));
  const b = $('#cloudBtn'); if (b) { b.disabled = true; b.textContent = 'Memproses…'; }
  ui.onSubmit(params);
}
function cloudCancel() { sess.ui?.onCancel(); S.authBusy = false; }
async function recoveryDone() {
  const r = S.recovery; S.recovery = null; S.auth = 'welcome';
  if (r?.ownerId) localStorage.setItem(LS_STAFF, r.ownerId);
  evaluate(); renderOverlay(true);
  setTimeout(() => toast('Selamat jualan! Ketuk menu untuk mulai pesanan pertama.', 'ok'), 300);
}
function pickResto(id: string) { localStorage.setItem(LS_REST, id); localStorage.removeItem(LS_STAFF); S.lockWho = ''; S.auth = 'welcome'; evaluate(); renderOverlay(true); }
async function switchResto() {
  localStorage.removeItem(LS_REST); localStorage.removeItem(LS_STAFF); stopStore(); S.auth = 'welcome'; S.lockWho = '';
  evaluate(); renderOverlay(true);
}
async function disconnect() {
  if (!(await ask('Putuskan perangkat ini?', 'Staf tidak bisa masuk di perangkat ini sampai pemilik menghubungkannya lagi dengan email.', 'Putuskan', true))) return;
  closeSheet(); localStorage.removeItem(LS_REST); localStorage.removeItem(LS_STAFF); stopStore(); sess.staff = null;
  try { await cdb.cloud.logout(); } catch (e) { console.error(e); }
  S.auth = 'welcome'; evaluate(); renderOverlay(true);
}

/* ---------- PIN ---------- */
function lockPick(id: string) { S.lockWho = id; S.pin = ''; S.pinErr = false; S.authInfo = ''; renderOverlay(true); }
function lockBack() { S.lockWho = ''; S.lockMode = ''; S.pin = ''; S.authErr = ''; renderOverlay(true); }
function lockReset() { S.lockMode = 'reset'; S.af = {}; S.authErr = ''; renderOverlay(true); }
async function pinKey(k: string) {
  if (S.authBusy) return;
  const who = D.staff.find((x: any) => x.id === S.lockWho); if (!who) return;
  S.pinErr = false;
  if (k === 'b') S.pin = (S.pin || '').slice(0, -1);
  else if (k === 'c') S.pin = '';
  else if ((S.pin || '').length < (who.pinLen || 6)) S.pin = (S.pin || '') + k;
  renderOverlay(true);
  if (S.pin.length === (who.pinLen || 4)) {
    S.authBusy = true; renderOverlay(true);
    let ok = false; try { ok = await verifyPassword(S.pin, who); } catch (e: any) { toast(e.message, 'err'); }
    S.authBusy = false;
    if (!ok) { S.pin = ''; S.pinErr = true; renderOverlay(true); if (navigator.vibrate) navigator.vibrate(120); return; }
    await signIn(who);
  }
}
async function signIn(who: any) {
  localStorage.setItem(LS_STAFF, who.id); S.pin = ''; S.lockWho = ''; S.cart = null;
  await db.staff.update(who.id, { lastLogin: new Date().toISOString() }).catch(() => {});
  track('masuk-pin', { peran: who.role });
  evaluate();
  toast(`Halo, ${esc(who.name.split(' ')[0])}! 👋`);
  if (who.role === 'dapur' && document.body.dataset.page !== 'kitchen') go('kitchen');
}
document.addEventListener('keydown', (e) => {
  if (sess.phase !== 'lock' || !S.lockWho || S.lockMode) return;
  if (/^\d$/.test(e.key)) pinKey(e.key); else if (e.key === 'Backspace') pinKey('b');
});
async function resetPin() {
  const f = S.af;
  if (!normCode(f.code)) return authFail('Kode pemulihan wajib diisi.', 'code');
  if (!pinOk(f.pin)) return authFail('PIN harus 4–6 angka.', 'pin');
  if (f.pin !== f.pin2) return authFail('Ulangi PIN tidak sama.', 'pin2');
  const rec = D.settings?.recovery;
  if (!rec || !(await verifyPassword(normCode(f.code), rec))) return authFail('Kode pemulihan salah.', 'code');
  const owner = D.staff.find((x: any) => x.role === 'owner'); if (!owner) return authFail('Akun pemilik tidak ditemukan.');
  const pin = await hashPassword(f.pin);
  await db.staff.update(owner.id, { ...pin, pinLen: f.pin.length, active: true });
  S.lockMode = ''; toast('PIN pemilik diganti', 'ok'); await signIn({ ...owner, ...pin });
}
/** Kunci layar (ganti pengguna). */
export function lockNow(info = '') {
  closeSheet(); localStorage.removeItem(LS_STAFF); sess.staff = null; S.lockWho = ''; S.authInfo = info; S.cart = null;
  evaluate(); renderOverlay(true);
}
/** Buat kode pemulihan baru (pemilik). */
async function newRecovery() {
  const code = recoveryCode(); const recovery = await hashPassword(normCode(code));
  await db.settings.update(D.settings.id, { recovery });
  closeSheet(); S.recovery = { code, resto: D.settings.name }; S.auth = 'recovery'; evaluate();
}
/** Verifikasi PIN manajer/pemilik untuk aksi sensitif (void, batal bayar). */
export function managerPin(reason: string): Promise<any> {
  return new Promise((res) => {
    const mgrs = D.staff.filter((x: any) => x.active && (x.role === 'owner' || x.role === 'admin'));
    if (sess.role === 'owner' || sess.role === 'admin') return res(sess.staff);
    const d = $('#dialog'); let who = mgrs[0], pin = '';
    const draw = (msg = '') => {
      d.innerHTML = `<div class="dlg"><h3>Butuh persetujuan Manajer</h3><p>${esc(reason)}</p>
       <label class="fl"><span>Manajer</span><select id="mgrSel">${mgrs.map((m: any) => `<option value="${m.id}" ${m.id === who?.id ? 'selected' : ''}>${esc(m.name)} · ${ROLE_NAMES[m.role]}</option>`).join('')}</select></label>
       <label class="fl"><span>PIN</span><input id="mgrPin" type="password" inputmode="numeric" maxlength="6" value="${pin}"></label>
       ${msg ? `<div class="alert error">${msg}</div>` : ''}
       <div class="row2"><button class="btn ghost" data-v="0">Batal</button><button class="btn" data-v="1">Setujui</button></div></div>`;
      d.hidden = false; setTimeout(() => $('#mgrPin')?.focus(), 40);
    };
    draw();
    d.onclick = async (e: any) => {
      const v = e.target.closest('[data-v]')?.dataset.v; if (v == null) return;
      if (v === '0') { d.hidden = true; d.innerHTML = ''; return res(null); }
      who = mgrs.find((m: any) => m.id === $('#mgrSel').value); pin = $('#mgrPin').value;
      if (who && (await verifyPassword(pin, who))) { d.hidden = true; d.innerHTML = ''; res(who); }
      else { pin = ''; draw('PIN salah'); }
    };
  });
}

/* ================= BOOT ================= */
export function initAuth() {
  if (isCloud) {
    cdb.cloud.userInteraction.subscribe((ui: any) => { sess.ui = ui; renderOverlay(true); });
    cdb.cloud.currentUser.subscribe((u: any) => { const was = sess.user?.userId; sess.user = u; if (u?.userId !== was) sess.synced = false; evaluate(); });
    cdb.cloud.syncState.subscribe((s: any) => {
      sess.sync = s;
      if (['in-sync', 'offline', 'error'].includes(s?.phase) || s?.status === 'offline') { if (!sess.synced) { sess.synced = true; evaluate(); } }
      document.dispatchEvent(new CustomEvent('wp:sync'));
    });
    cdb.cloud.events.syncComplete.subscribe(() => { if (!sess.synced) { sess.synced = true; evaluate(); } });
    liveQuery(() => cdb.realms.toArray()).subscribe((r: any) => { sess.realms = r; evaluate(); });
    liveQuery(() => db.settings.toArray()).subscribe((l: any[]) => { sess.weposRealms = new Set(l.filter((x) => x.kds !== undefined).map((x) => x.realmId)); evaluate(); });
    db.open().catch((e: any) => toast('Gagal membuka database: ' + e.message, 'err'));
  } else {
    db.open().then(loadRestaurants).then(() => evaluate()).catch((e: any) => toast('Gagal membuka database: ' + e.message, 'err'));
  }
  const q = new URLSearchParams(location.search);
  if (q.has('daftar')) { S.auth = 'register'; S.af = { sample: true }; history.replaceState(history.state, '', location.pathname); }
  else if (q.has('hubungkan') && isCloud) { S.auth = 'connect'; S.af = {}; history.replaceState(history.state, '', location.pathname); }
}

reg({ authGo, afSet, authSubmit, cloudSubmit, cloudCancel, recoveryDone, pickResto, switchResto, disconnect, lockPick, lockBack, lockReset, pinKey, resetPin, lockNow: () => lockNow(), newRecovery, copyText });
