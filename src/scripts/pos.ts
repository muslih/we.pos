/* We POS — layar Kasir: pilih menu → keranjang → kirim ke dapur / bayar → struk. */
import {
  S, D, sess, VIEWS, reg, $, esc, IC, rp, rk, num, fmtMoney, pad, dKey, today, fDT, uid, setg, shopName, calcTotals, canPay, isMgr,
  tableName, orderTitle, liveLines, paidAmt, openSheet, closeSheet, sheetOpen, toast, run, addRow, updRow, ask, prompt2,
  METHODS, NOTE_CHIPS, emptyBox, waNum, byName, track, isWide, T,
} from './core';
import { setHeader, go } from './shell';
import { qrSvg } from './selfmenu';
import { toDynamic, isQris, info as qrisInfo } from '../lib/qris';

/* ================= KERANJANG ================= */
export function newCart(preset: any = {}) {
  S.cart = { orderId: '', type: 'dine', tableId: '', guest: '', pax: 0, lines: [], discPct: 0, discAmt: 0, note: '', reservationId: '', ...preset };
}
const cart = () => { if (!S.cart) newCart(); return S.cart; };
const newLines = () => cart().lines.filter((l: any) => l.status === 'new');
function cartDiscount(c = cart()) {
  const sub = c.lines.filter((l: any) => l.status !== 'void').reduce((a: number, l: any) => a + l.price * l.qty, 0);
  return c.discPct ? Math.round((sub * c.discPct) / 100) : c.discAmt || 0;
}
export const cartTotals = (c = cart()) => calcTotals(c.lines, cartDiscount(c));

/** Muat pesanan terbuka ke keranjang (tambah item / bayar). */
export function loadOrder(id: string) {
  const o = D.orders.find((x: any) => x.id === id); if (!o) return;
  S.cart = { orderId: o.id, type: o.type, tableId: o.tableId, guest: o.guest || '', pax: o.pax || 0, lines: o.lines.map((l: any) => ({ ...l })),
    discPct: o.discountPct || 0, discAmt: o.discountPct ? 0 : o.discount || 0, note: o.note || '', reservationId: o.reservationId || '' };
}
function orderFor(tableId: string) {
  const open = D.orders.find((o: any) => o.status === 'open' && o.type === 'dine' && o.tableId === tableId);
  if (open) loadOrder(open.id); else newCart({ type: 'dine', tableId });
  closeSheet(); if (S.view === 'pos') VIEWS.pos(); else go('pos');
}

/* ================= TAMPILAN ================= */
VIEWS.pos = () => {
  const c = cart();
  const openCnt = D.orders.filter((o: any) => o.status === 'open').length;
  setHeader('Kasir', `<button class="hb" onclick="App.openBills()">${IC.list}<span>Tagihan terbuka</span>${openCnt ? `<i class="cnt">${openCnt}</i>` : ''}</button>`);
  const cats = D.categories;
  if (S.cat !== 'all' && !cats.some((x: any) => x.id === S.cat)) S.cat = 'all';
  $('#main').innerHTML = `<div class="pos">
   <section class="pos-menu">
    <div class="pos-tools">
     <label class="search">${IC.search}<input id="posQ" type="search" placeholder="Cari menu…" value="${esc(S.q)}" oninput="App.posSearch(this.value)" autocomplete="off"></label>
    </div>
    <div class="chips cats" id="posCats">
     <button class="chip ${S.cat === 'all' ? 'on' : ''}" onclick="App.posCat('all')">Semua</button>
     ${cats.map((x: any) => `<button class="chip ${S.cat === x.id ? 'on' : ''}" onclick="App.posCat('${x.id}')">${x.icon ? `<span>${x.icon}</span>` : ''}${esc(x.name)}</button>`).join('')}
    </div>
    <div class="menu-grid" id="posGrid"></div>
   </section>
   <aside class="pos-cart" id="posCart"></aside>
  </div>
  <button class="cartbar" id="cartBar" onclick="App.cartSheet()"></button>`;
  renderGrid(); renderCart();
  void c;
};
function renderGrid() {
  const g = $('#posGrid'); if (!g) return;
  const q = S.q.trim().toLowerCase();
  const inCart: Record<string, number> = {};
  newLines().forEach((l: any) => (inCart[l.itemId] = (inCart[l.itemId] || 0) + l.qty));
  const list = D.items.filter((i: any) => (S.cat === 'all' || i.categoryId === S.cat) && (!q || i.name.toLowerCase().includes(q)));
  if (!D.items.length) { g.innerHTML = emptyBox('food', 'Menu masih kosong', 'Tambahkan menu dulu supaya bisa mulai jualan.', isMgr() ? `<button class="btn" onclick="App.go('menu')">${IC.plus}Tambah menu</button>` : ''); return; }
  if (!list.length) { g.innerHTML = emptyBox('search', 'Menu tidak ditemukan', q ? `Tidak ada menu dengan kata “${esc(q)}”.` : 'Kategori ini belum punya menu.'); return; }
  g.innerHTML = list.map((i: any) => `<button class="mi ${i.available === false ? 'off' : ''} ${inCart[i.id] ? 'in' : ''}" ${i.available === false ? 'disabled' : ''} onclick="App.addItem('${i.id}')">
     <span class="mi-pic">${i.photo ? `<img src="${i.photo}" alt="" loading="lazy">` : `<em>${i.icon || '🍽️'}</em>`}</span>
     <span class="mi-name">${esc(i.name)}</span><span class="mi-price">${i.available === false ? 'Habis' : rp(i.price)}</span>
     ${inCart[i.id] ? `<i class="mi-qty">${inCart[i.id]}</i>` : ''}</button>`).join('');
}
const ST_LABEL: Record<string, string> = { cook: 'Dimasak', ready: 'Siap', served: 'Diantar', void: 'Batal' };
function cartHTML() {
  const c = cart(), t = cartTotals(c), s = setg();
  const nNew = newLines().length, editing = !!c.orderId;
  const order = editing ? D.orders.find((o: any) => o.id === c.orderId) : null;
  const lines = c.lines.map((l: any, i: number) => ({ l, i })).filter(({ l }: any) => l.status !== 'void');
  const tName = tableName(c.tableId);
  const head = editing
    ? `<div class="cart-edit"><div><b>#${order?.no ?? ''} · ${esc(orderTitle(c))}</b><small>Menambah ke pesanan berjalan</small></div><button class="btn sm ghost" onclick="App.cancelEdit()">Batal</button></div>`
    : `<div class="seg big"><button class="${c.type === 'dine' ? 'on' : ''}" onclick="App.setType('dine')">🍽️ Makan di sini</button><button class="${c.type === 'take' ? 'on' : ''}" onclick="App.setType('take')">🛍️ Bawa pulang</button></div>`;
  const who = `<div class="cart-who">
    ${c.type === 'dine' ? `<button class="pick ${tName ? 'set' : ''}" onclick="App.pickTable()">${IC.table}<span>${tName ? 'Meja ' + esc(tName) : 'Pilih meja'}</span>${IC.chev}</button>` : ''}
    <label class="pick inp">${IC.user}<input placeholder="${c.type === 'take' ? 'Nama pemesan' : 'Nama tamu'} (opsional)" value="${esc(c.guest)}" oninput="App.cartSet('guest',this.value)"></label></div>`;
  const body = lines.length ? `<div class="cart-lines">${lines.map(({ l, i }: any) => l.status === 'new'
      ? `<div class="cl"><button class="cl-m" onclick="App.lineSheet(${i})"><b>${esc(l.name)}</b>${l.note ? `<small class="note">${esc(l.note)}</small>` : `<small class="add-note">+ catatan</small>`}</button>
         <div class="step"><button onclick="App.stepLine(${i},-1)" aria-label="Kurangi">${IC.minus}</button><span>${l.qty}</span><button onclick="App.stepLine(${i},1)" aria-label="Tambah">${IC.plus}</button></div>
         <b class="cl-p">${rk(l.price * l.qty)}</b></div>`
      : `<div class="cl sent"><div class="cl-m"><b>${l.qty}× ${esc(l.name)}</b>${l.note ? `<small class="note">${esc(l.note)}</small>` : ''}</div><span class="st st-${l.status}">${ST_LABEL[l.status] || ''}</span><b class="cl-p">${rk(l.price * l.qty)}</b></div>`).join('')}</div>`
    : `<div class="cart-empty">${IC.cart}<b>Belum ada pesanan</b><p>Ketuk menu di ${isWide() ? 'kiri' : 'atas'} untuk menambahkan.</p></div>`;
  const sum = lines.length ? `<div class="cart-sum">
     <div><span>Subtotal</span><span>${rp(t.subtotal)}</span></div>
     <div><button class="link" onclick="App.discSheet()">${IC.tag}${t.discount ? `Diskon${c.discPct ? ' ' + c.discPct + '%' : ''}` : 'Tambah diskon'}</button><span>${t.discount ? '− ' + rp(t.discount) : ''}</span></div>
     ${s.servicePct ? `<div><span>Service ${s.servicePct}%</span><span>${rp(t.service)}</span></div>` : ''}
     ${s.taxPct ? `<div><span>Pajak ${s.taxPct}%</span><span>${rp(t.tax)}</span></div>` : ''}
     <div class="tot"><span>Total</span><span>${rp(t.total)}</span></div></div>` : '';
  const sendLbl = s.kds ? 'Kirim ke Dapur' : 'Simpan Pesanan';
  const acts = !lines.length ? '' : canPay()
    ? `<div class="cart-acts">${nNew ? `<button class="btn sec lg" onclick="App.sendOrder()">${s.kds ? IC.chef : IC.check}<span>${sendLbl}</span></button>` : ''}
       <button class="btn lg pay" onclick="App.payCart()"><span>Bayar</span><b>${rp(t.total)}</b></button></div>`
    : `<div class="cart-acts"><button class="btn lg" ${nNew ? '' : 'disabled'} onclick="App.sendOrder()">${IC.chef}<span>${sendLbl}</span></button></div>`;
  return `<div class="cart-head">${head}${who}</div>${body}${sum}${acts}${!editing && lines.length ? `<button class="link danger cart-clear" onclick="App.clearCart()">Kosongkan</button>` : ''}`;
}
function renderCart() {
  const html = cartHTML();
  const a = $('#posCart'); if (a) a.innerHTML = html;
  const sc = $('#sheetCart'); if (sc) sc.innerHTML = html;
  const bar = $('#cartBar');
  if (bar) {
    const c = cart(), n = liveLines(c).reduce((x: number, l: any) => x + l.qty, 0);
    const pre = [c.orderId ? '#' + (D.orders.find((o: any) => o.id === c.orderId)?.no ?? '') : '', c.tableId ? 'Meja ' + tableName(c.tableId) : '', c.guest].filter(Boolean).join(' · ');
    bar.hidden = !n && !pre;
    bar.innerHTML = `<span class="cb-n">${n}</span><span class="cb-t">${pre ? esc(pre) + ' · ' : ''}${n ? n + ' item' : 'pilih menu'}</span><b>${rp(cartTotals().total)}</b><span class="cb-go">Lihat ${IC.chev}</span>`;
  }
}
const markFrom = () => (S.fromCart = !!$('#sheetCart'));
function backToCart() { if (S.fromCart && !isWide()) cartSheet(); else closeSheet(); S.fromCart = false; }
function cartSheet() { openSheet(`<div id="sheetCart" class="pos-cart in-sheet"></div>`, { cls: 'cart-sheet' }); renderCart(); }

/* ================= AKSI KERANJANG ================= */
function posSearch(v: string) { S.q = v; renderGrid(); }
function posCat(id: string) { S.cat = id; document.querySelectorAll('#posCats .chip').forEach((b: any, i) => b.classList.toggle('on', (i === 0 && id === 'all') || b.getAttribute('onclick')?.includes(`'${id}'`))); renderGrid(); }
function addItem(id: string) {
  const it = D.items.find((x: any) => x.id === id); if (!it || it.available === false) return;
  const c = cart();
  const ex = c.lines.find((l: any) => l.status === 'new' && l.itemId === id && !l.note);
  if (ex) ex.qty++;
  else c.lines.push({ key: uid(), itemId: id, name: it.name, price: it.price, qty: 1, note: '', station: it.station || 'dapur', status: 'new', round: 0 });
  renderGrid(); renderCart();
  const bar = $('#cartBar'); if (bar && !isWide()) { bar.classList.remove('pop'); void bar.offsetWidth; bar.classList.add('pop'); }
}
function stepLine(i: number, d: number) {
  const l = cart().lines[i]; if (!l || l.status !== 'new') return;
  l.qty += d; if (l.qty <= 0) cart().lines.splice(i, 1);
  renderGrid(); renderCart();
}
function cartSet(k: string, v: any) { cart()[k] = v; }
function setType(t: string) { const c = cart(); c.type = t; if (t === 'take') c.tableId = ''; renderCart(); }
async function clearCart() { if (await ask('Kosongkan pesanan ini?')) { newCart(); renderGrid(); renderCart(); } }
function cancelEdit() { newCart(); renderGrid(); renderCart(); closeSheet(); }

/* ---------- Catatan & jumlah per item ---------- */
function lineSheet(i: number) {
  const l = cart().lines[i]; if (!l) return;
  markFrom(); S.lineIdx = i; S.lineQty = l.qty;
  const has = (n: string) => l.note.split(',').map((x: string) => x.trim()).includes(n);
  openSheet(`<h2>${esc(l.name)}</h2><p class="mut">${rp(l.price)} / porsi</p>
   <div class="qty-big"><button onclick="App.lineQty(-1)">${IC.minus}</button><b id="lqv">${l.qty}</b><button onclick="App.lineQty(1)">${IC.plus}</button></div>
   <label class="fl"><span>Catatan untuk dapur</span><textarea id="lnNote" rows="2" placeholder="mis. pedas level 2, tanpa bawang">${esc(l.note)}</textarea></label>
   <div class="chips wrap">${NOTE_CHIPS.map((n) => `<button class="chip ${has(n) ? 'on' : ''}" onclick="App.noteChip(this,'${n}')">${n}</button>`).join('')}</div>
   <div class="row2 mt"><button class="btn ghost danger" onclick="App.lineRemove()">${IC.trash}Hapus</button><button class="btn" onclick="App.lineSave()">Simpan</button></div>`);
}
function lineQty(d: number) { S.lineQty = Math.max(1, S.lineQty + d); $('#lqv').textContent = S.lineQty; }
function noteChip(b: any, n: string) {
  const t = $('#lnNote'); let parts = t.value.split(',').map((x: string) => x.trim()).filter(Boolean);
  if (parts.includes(n)) parts = parts.filter((x: string) => x !== n); else parts.push(n);
  t.value = parts.join(', '); b.classList.toggle('on');
}
function lineSave() { const l = cart().lines[S.lineIdx]; if (l) { l.qty = S.lineQty; l.note = $('#lnNote').value.trim(); } backToCart(); renderGrid(); renderCart(); }
function lineRemove() { cart().lines.splice(S.lineIdx, 1); backToCart(); renderGrid(); renderCart(); }

/* ---------- Meja ---------- */
function pickTable() {
  markFrom();
  const open: Record<string, any> = {}; D.orders.filter((o: any) => o.status === 'open' && o.type === 'dine').forEach((o: any) => (open[o.tableId] = o));
  if (!D.tables.length) { openSheet(`<h2>Pilih meja</h2>${emptyBox('table', 'Belum ada meja', 'Tambahkan meja di halaman Meja.', isMgr() ? `<button class="btn" onclick="App.go('tables')">Atur meja</button>` : '')}`); return; }
  const areas = [...new Set(D.tables.map((t: any) => t.area || 'Lainnya'))] as string[];
  openSheet(`<h2>Pilih meja</h2>${areas.map((a) => `<div class="sec-t">${esc(a)}</div><div class="tpick">${D.tables.filter((t: any) => (t.area || 'Lainnya') === a).map((t: any) => {
    const o = open[t.id], me = t.id === cart().tableId;
    return `<button class="${o ? 'busy' : ''} ${me ? 'on' : ''}" onclick="App.chooseTable('${t.id}')"><b>${esc(t.name)}</b><small>${o ? '#' + o.no + ' · terisi' : t.seats + ' kursi'}</small></button>`;
  }).join('')}</div>`).join('')}
   <button class="btn ghost blk mt" onclick="App.chooseTable('')">Tanpa meja</button>`, { wide: true });
}
async function chooseTable(id: string) {
  const c = cart();
  const o = id && D.orders.find((x: any) => x.status === 'open' && x.type === 'dine' && x.tableId === id && x.id !== c.orderId);
  if (o) {
    if (!(await ask(`Meja ${esc(tableName(id))} sedang terisi`, `Ada pesanan berjalan #${o.no}. Tambahkan item ini ke pesanan tersebut?`, 'Ya, gabungkan'))) return;
    const extra = newLines(); loadOrder(o.id); S.cart.lines.push(...extra);
  } else c.tableId = id;
  backToCart(); renderCart();
}

/* ---------- Diskon ---------- */
function discSheet() {
  markFrom();
  const c = cart(), t = cartTotals();
  openSheet(`<h2>Diskon</h2><p class="mut">Subtotal ${rp(t.subtotal)}</p>
   <div class="chips wrap">${[5, 10, 15, 20, 25, 50].map((p) => `<button class="chip lg ${c.discPct === p ? 'on' : ''}" onclick="App.setDisc(${p},0)">${p}%</button>`).join('')}</div>
   <label class="fl mt"><span>Atau potongan rupiah</span><input id="discRp" type="text" inputmode="numeric" autocomplete="off" data-money placeholder="mis. 5.000" value="${fmtMoney(c.discAmt)}"></label>
   <div class="row2"><button class="btn ghost" onclick="App.setDisc(0,0)">Hapus diskon</button><button class="btn" onclick="App.setDisc(0,App.num(document.getElementById('discRp').value))">Pakai</button></div>`);
}
function setDisc(pct: number, amt: number) { const c = cart(); c.discPct = pct; c.discAmt = pct ? 0 : Math.max(0, amt || 0); backToCart(); renderCart(); }

/* ================= SIMPAN & BAYAR ================= */
function nextNo() { const t = today(); return 1 + D.orders.filter((o: any) => dKey(o.createdAt) === t).reduce((m: number, o: any) => Math.max(m, o.no || 0), 0); }
/** Simpan keranjang jadi pesanan. `pay` → sekaligus lunas. Kembalikan id pesanan. */
async function saveCart(pay?: any): Promise<string | undefined> {
  const c = cart(), s = setg(), now = new Date().toISOString();
  const prev = c.orderId ? D.orders.find((o: any) => o.id === c.orderId) : null;
  const round = (prev?.round || 0) + (newLines().length ? 1 : 0);
  const lines = c.lines.map((l: any) => l.status !== 'new' ? l : { ...l, round, status: s.kds ? 'cook' : 'served', sentAt: now, ...(s.kds ? {} : { readyAt: now }) });
  const t = calcTotals(lines, cartDiscount(c));
  const data: any = { type: c.type, tableId: c.type === 'dine' ? c.tableId : '', guest: c.guest.trim(), pax: c.pax || 0, lines, round,
    ...t, discountPct: c.discPct || 0, note: c.note || '' };
  if (pay) Object.assign(data, { status: 'paid', closedAt: now, payments: [...(prev?.payments || []), { ...pay, date: now, by: byName() }] });
  return run(async () => {
    let id = c.orderId;
    if (prev) await updRow('orders', id, data);
    else {
      const no = nextNo(), d = new Date();
      id = await addRow('orders', { ...data, no, code: `${s.prefix || 'WP'}${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(no).padStart(3, '0')}`,
        status: data.status || 'open', payments: data.payments || [], day: today(), createdAt: now, createdBy: byName(), reservationId: c.reservationId || '' }) as string;
    }
    if (c.reservationId) await updRow('reservations', c.reservationId, { status: 'seated', orderId: id });
    return id;
  });
}
async function sendOrder() {
  if (!newLines().length) return toast('Belum ada item baru');
  const c = cart();
  if (c.type === 'dine' && !c.tableId && D.tables.length && !(await ask('Belum pilih meja', 'Simpan pesanan tanpa nomor meja?', 'Simpan saja'))) return;
  const id = await saveCart(); if (!id) return;
  track('pesanan-kirim', { tipe: c.type });
  const o = D.orders.find((x: any) => x.id === id);
  toast(`${IC.check} Pesanan #${o?.no ?? ''} ${setg().kds ? 'terkirim ke dapur' : 'tersimpan'}`, 'ok');
  newCart(); closeSheet(); renderGrid(); renderCart();
}
function payCart() {
  const c = cart(); if (!liveLines(c).length) return;
  paySheet({ total: cartTotals().total, title: c.orderId ? `#${D.orders.find((o: any) => o.id === c.orderId)?.no} · ${orderTitle(c)}` : orderTitle(c) + (c.guest ? ' · ' + c.guest : ''), fromCart: true });
}
/* ---------- Lembar pembayaran ---------- */
export function payOrder(id: string) {
  const o = D.orders.find((x: any) => x.id === id); if (!o) return;
  if (o.lines.some((l: any) => l.status === 'new')) { loadOrder(id); return payCart(); }
  paySheet({ total: o.total - paidAmt(o), title: `#${o.no} · ${orderTitle(o)}`, orderId: id });
}
function quickCash(total: number) {
  const out = new Set<number>([total]);
  [5000, 10000, 20000, 50000, 100000].forEach((u) => { const v = Math.ceil(total / u) * u; if (v > total) out.add(v); });
  [50000, 100000].forEach((v) => v > total && out.add(v));
  return [...out].sort((a, b) => a - b).slice(0, 5);
}
function paySheet(p: any) {
  S.pay = { ...p, method: 'Tunai', received: 0 };
  const qris = setg().qris, dyn = qrisDyn(p.total);
  openSheet(`<div class="paybox"><small class="mut">${esc(p.title)}</small><h2 class="pay-total">${rp(p.total)}</h2>
   <div class="methods">${METHODS.map((m) => `<button class="${m === 'Tunai' ? 'on' : ''}" onclick="App.payMethod(this,'${m}')">${IC[{ Tunai: 'cash', QRIS: 'phone', Transfer: 'upload', Kartu: 'tag' }[m] as string]}<span>${m}</span></button>`).join('')}</div>
   <div id="payCash"><label class="fl"><span>Uang diterima</span><input id="payIn" class="money" type="text" inputmode="numeric" autocomplete="off" data-money placeholder="0" oninput="App.payRecv(this.value)" autofocus></label>
    <div class="chips wrap">${quickCash(p.total).map((v, i) => `<button class="chip lg" onclick="App.payRecv(${v},1)">${i === 0 ? 'Uang pas' : rk(v)}</button>`).join('')}</div>
    <div class="change" id="payChange"></div></div>
   <div id="payOther" hidden>${dyn ? `<div class="qris dyn" id="payQris"><div class="qris-code">${dyn.svg}</div><b>${esc(dyn.merchant)}</b><span class="qris-amt">${rp(p.total)}</span><small>QRIS dinamis · nominal sudah terisi otomatis</small></div>` : qris ? `<div class="qris" id="payQris"><img src="${qris}" alt="QRIS"><small>Tunjukkan QRIS ini ke pelanggan · minta pelanggan mengetik ${rp(p.total)}</small></div>` : ''}<p class="mut center" id="payHint">Pastikan pembayaran sudah diterima sebelum konfirmasi.</p></div>
   <button class="btn blk xl" id="payBtn" onclick="App.payConfirm()">Konfirmasi Bayar</button></div>`, { cls: 'pay-sheet' });
  payRecv('0');
}
/** QRIS dinamis untuk nominal tertentu (null bila belum diatur / dimatikan). */
export function qrisDyn(total: number) {
  const s = setg(); if (!s.qrisPayload || s.qrisDynamic === false || !isQris(s.qrisPayload) || !(total > 0)) return null;
  try { return { svg: qrSvg(toDynamic(s.qrisPayload, total)), merchant: qrisInfo(s.qrisPayload).merchant || shopName() }; } catch { return null; }
}
function payMethod(b: any, m: string) {
  S.pay.method = m; b.parentNode.querySelectorAll('button').forEach((x: any) => x.classList.toggle('on', x === b));
  $('#payCash').hidden = m !== 'Tunai'; $('#payOther').hidden = m === 'Tunai';
  const q = $('#payQris'); if (q) q.hidden = m !== 'QRIS';
  payRecv(m === 'Tunai' ? $('#payIn').value : '0');
}
function payRecv(v: any, set = 0) {
  const p = S.pay; p.received = typeof v === 'number' ? v : num(v); if (set) $('#payIn').value = fmtMoney(p.received);
  const ch = p.received - p.total, el = $('#payChange'), btn = $('#payBtn');
  if (p.method === 'Tunai') {
    el.className = 'change ' + (p.received && ch < 0 ? 'neg' : p.received ? 'ok' : '');
    el.innerHTML = p.received ? (ch >= 0 ? `<span>Kembalian</span><b>${rp(ch)}</b>` : `<span>Kurang</span><b>${rp(-ch)}</b>`) : '<span>Ketuk “Uang pas” bila uangnya pas</span>';
    btn.disabled = !p.received || ch < 0;
  } else btn.disabled = false;
}
async function payConfirm() {
  const p = S.pay; if (!p) return;
  const cash = p.method === 'Tunai';
  const pay = { amount: p.total, method: p.method, ...(cash ? { received: p.received, change: p.received - p.total } : {}) };
  $('#payBtn').disabled = true;
  let id: string | undefined;
  if (p.fromCart) id = await saveCart(pay);
  else {
    const o = D.orders.find((x: any) => x.id === p.orderId); if (!o) return;
    const now = new Date().toISOString();
    const ok = await run(() => updRow('orders', o.id, { status: 'paid', closedAt: now, payments: [...(o.payments || []), { ...pay, date: now, by: byName() }] }));
    id = ok === undefined ? undefined : o.id;
  }
  if (!id) { $('#payBtn').disabled = false; return; }
  track('bayar', { metode: p.method });
  newCart(); S.pay = null;
  if (S.view === 'pos') { renderGrid(); renderCart(); }
  doneSheet(id, cash ? pay.change || 0 : -1);
}
function doneSheet(id: string, change: number) {
  const o = D.orders.find((x: any) => x.id === id);
  openSheet(`<div class="donebox"><div class="big-ico ok">${IC.check}</div><h2>Pembayaran berhasil</h2>
   <p class="mut">#${o?.no} · ${esc(o ? orderTitle(o) : '')} · ${rp(o?.total || 0)}</p>
   ${change >= 0 ? `<div class="change ok big"><span>Kembalian</span><b>${rp(change)}</b></div>` : ''}
   <div class="row2"><button class="btn sec" onclick="App.printReceipt('${id}')">${IC.print}Cetak struk</button><button class="btn sec" onclick="App.waReceipt('${id}')">${IC.wa}Kirim WA</button></div>
   <button class="btn blk xl" onclick="App.closeSheet();App.go('pos')">Pesanan baru</button></div>`);
}

/* ================= TAGIHAN TERBUKA ================= */
function openBills() {
  const list = D.orders.filter((o: any) => o.status === 'open');
  openSheet(`<h2>Tagihan terbuka</h2><p class="mut">Pesanan yang belum dibayar. Ketuk untuk menambah item atau membayar.</p>
   ${list.length ? `<div class="list">${list.map((o: any) => `<div class="li"><div class="m"><b>#${o.no} · ${esc(orderTitle(o))}${o.guest ? ' · ' + esc(o.guest) : ''}</b><small>${liveLines(o).reduce((a: number, l: any) => a + l.qty, 0)} item · ${fDT(o.createdAt)}</small></div>
     <b>${rp(o.total)}</b><button class="btn sm sec" onclick="App.editOrder('${o.id}')">Tambah</button>${canPay() ? `<button class="btn sm" onclick="App.payOrder('${o.id}')">Bayar</button>` : ''}</div>`).join('')}</div>` : emptyBox('check', 'Semua tagihan sudah dibayar')}`, { wide: true });
}
function editOrder(id: string) { loadOrder(id); closeSheet(); if (S.view === 'pos') VIEWS.pos(); else go('pos'); }

/* ================= STRUK ================= */
export function receiptHTML(o: any, kitchen = false) {
  const s = setg(), lines = liveLines(o);
  if (kitchen) {
    return `<div class="rc"><div class="c b big">${esc(orderTitle(o))}</div><div class="c">#${o.no} · ${fDT(new Date())}${o.guest ? '<br>' + esc(o.guest) : ''}</div><hr>
     ${lines.filter((l: any) => l.status === 'cook').map((l: any) => `<div class="b big">${l.qty}× ${esc(l.name)}</div>${l.note ? `<div>  › ${esc(l.note)}</div>` : ''}`).join('')}<hr></div>`;
  }
  const pays = o.payments || [];
  return `<div class="rc">${s.logo ? `<div class="c"><img src="${s.logo}" class="rlogo" alt=""></div>` : ''}
   <div class="c b big">${esc(s.name)}</div>${s.address ? `<div class="c">${esc(s.address)}</div>` : ''}${s.phone ? `<div class="c">${esc(s.phone)}</div>` : ''}<hr>
   <div class="r"><span>${esc(o.code)}</span><span>#${o.no}</span></div><div class="r"><span>${fDT(o.closedAt || o.createdAt)}</span><span>${esc(orderTitle(o))}</span></div>
   ${o.guest ? `<div>Tamu: ${esc(o.guest)}</div>` : ''}<div>Kasir: ${esc(pays.at(-1)?.by || o.createdBy || '')}</div><hr>
   ${lines.map((l: any) => `<div>${esc(l.name)}</div><div class="r"><span>  ${l.qty} x ${rk(l.price)}</span><span>${rk(l.qty * l.price)}</span></div>`).join('')}<hr>
   <div class="r"><span>Subtotal</span><span>${rk(o.subtotal)}</span></div>
   ${o.discount ? `<div class="r"><span>Diskon</span><span>-${rk(o.discount)}</span></div>` : ''}
   ${o.service ? `<div class="r"><span>Service</span><span>${rk(o.service)}</span></div>` : ''}
   ${o.tax ? `<div class="r"><span>Pajak</span><span>${rk(o.tax)}</span></div>` : ''}
   <div class="r b big"><span>TOTAL</span><span>${rk(o.total)}</span></div>
   ${pays.map((p: any) => `<div class="r"><span>${esc(p.method)}</span><span>${rk(p.received || p.amount)}</span></div>${p.change ? `<div class="r"><span>Kembali</span><span>${rk(p.change)}</span></div>` : ''}`).join('')}
   ${o.status === 'open' ? `<div class="c b">— BELUM DIBAYAR —</div>${(() => { const q = qrisDyn(o.total - paidAmt(o)); return q ? `<div class="c rqris">${q.svg}<div>Scan QRIS · ${rk(o.total - paidAmt(o))}</div></div>` : ''; })()}` : ''}${o.status === 'void' ? '<div class="c b">— DIBATALKAN —</div>' : ''}<hr>
   <div class="c">${esc(s.footer || 'Terima kasih!')}</div><div class="c small">We POS</div></div>`;
}
export function printReceipt(id: string, kitchen = false) {
  const o = D.orders.find((x: any) => x.id === id); if (!o) return;
  const pa = $('#print-area'); pa.className = 'paper-' + (setg().paper || '58'); pa.innerHTML = receiptHTML(o, kitchen);
  setTimeout(() => window.print(), 60);
}
export function receiptText(o: any) {
  const s = setg(), lines = liveLines(o);
  return `*${s.name}*\n${o.code} · #${o.no}\n${fDT(o.closedAt || o.createdAt)} · ${orderTitle(o)}\n\n` +
    lines.map((l: any) => `${l.qty}x ${l.name} — ${rp(l.qty * l.price)}`).join('\n') +
    `\n\nSubtotal: ${rp(o.subtotal)}${o.discount ? `\nDiskon: -${rp(o.discount)}` : ''}${o.service ? `\nService: ${rp(o.service)}` : ''}${o.tax ? `\nPajak: ${rp(o.tax)}` : ''}\n*Total: ${rp(o.total)}*` +
    `${o.status === 'paid' ? `\nDibayar: ${(o.payments || []).map((p: any) => p.method).join(', ')}` : '\n_Belum dibayar_'}\n\n${s.footer || 'Terima kasih!'}`;
}
async function waReceipt(id: string) {
  const o = D.orders.find((x: any) => x.id === id); if (!o) return;
  const ph = await prompt2('Kirim struk via WhatsApp', 'Nomor WhatsApp pelanggan', localStorage.getItem('wp_last_wa') || '', 'tel');
  if (ph == null) return;
  if (ph) localStorage.setItem('wp_last_wa', ph);
  window.open(`https://wa.me/${waNum(ph)}?text=${encodeURIComponent(receiptText(o))}`, '_blank');
}

reg({ posSearch, posCat, addItem, stepLine, cartSet, setType, clearCart, cancelEdit, cartSheet, lineSheet, lineQty, noteChip, lineSave, lineRemove,
  pickTable, chooseTable, discSheet, setDisc, sendOrder, payCart, payOrder, payMethod, payRecv, payConfirm, openBills, editOrder, orderFor,
  printReceipt, waReceipt, shopName });
void sess; void T; void sheetOpen; void num;
