/* We POS — Laporan penjualan, pengeluaran, tutup kasir. */
import { db } from '../lib/db';
import { lineChart, columnChart, hbars, C as CHC } from '../lib/charts';
import {
  S, D, sess, VIEWS, reg, $, esc, num, fmtMoney, IC, rp, today, dKey, fDate, fDT, fTime, pad, openSheet, closeSheet, run, addRow, updRow, delRow, ask,
  emptyBox, toast, METHODS, EXP_CAT, liveLines, byName, setg, shopName, orderTitle,
} from './core';
import { setHeader, go } from './shell';

/* ---------- Periode ---------- */
export function presetRange(p: string): [string, string] {
  const d = new Date(), t = today();
  if (p === 'kemarin') { d.setDate(d.getDate() - 1); return [dKey(d), dKey(d)]; }
  if (p === '7') { d.setDate(d.getDate() - 6); return [dKey(d), t]; }
  if (p === 'bulan') return [dKey(new Date(d.getFullYear(), d.getMonth(), 1)), t];
  if (p === 'lalu') return [dKey(new Date(d.getFullYear(), d.getMonth() - 1, 1)), dKey(new Date(d.getFullYear(), d.getMonth(), 0))];
  return [t, t];
}
const PRESETS = [['hari', 'Hari ini'], ['kemarin', 'Kemarin'], ['7', '7 hari'], ['bulan', 'Bulan ini'], ['lalu', 'Bulan lalu']];
/** Ambil pesanan & pengeluaran untuk rentang tanggal langsung dari database (tidak terbatas 92 hari). */
export async function loadRange(from: string, to: string) {
  const a = new Date(from + 'T00:00:00'); a.setDate(a.getDate() - 1);
  const z = new Date(to + 'T00:00:00'); z.setDate(z.getDate() + 1);
  const rid = sess.realmId;
  const orders = await db.orders.where('createdAt').between(a.toISOString(), z.toISOString()).filter((o) => o.realmId === rid).toArray();
  const expenses = await db.expenses.where('date').between(from, to, true, true).filter((e) => e.realmId === rid).toArray();
  const inR = (iso: string) => { const k = dKey(iso); return k >= from && k <= to; };
  const paid = orders.filter((o) => o.status === 'paid' && inR(o.closedAt || o.createdAt));
  return { orders: orders.filter((o) => inR(o.createdAt)), paid, expenses, voids: orders.filter((o) => o.status === 'void' && inR(o.createdAt)) };
}

VIEWS.report = () => {
  CHC.s1 = getComputedStyle(document.documentElement).getPropertyValue('--pri').trim() || CHC.s1; // grafik ikut warna toko
  if (!S.repFrom) { [S.repFrom, S.repTo] = presetRange('hari'); S.repPreset = 'hari'; }
  setHeader('Laporan', `<button class="hb" onclick="App.go('export')">${IC.download}<span>Ekspor</span></button>`);
  const tabs = [['ringkas', 'Ringkasan'], ['menu', 'Menu terlaris'], ['biaya', 'Pengeluaran']];
  $('#main').innerHTML = `<div class="wrap">
   <div class="tbar wrapx"><div class="chips">${PRESETS.map(([k, n]) => `<button class="chip ${S.repPreset === k ? 'on' : ''}" onclick="App.repPreset('${k}')">${n}</button>`).join('')}</div>
    <div class="range"><input type="date" value="${S.repFrom}" onchange="App.repSet('repFrom',this.value)"><span>–</span><input type="date" value="${S.repTo}" onchange="App.repSet('repTo',this.value)"></div></div>
   <div class="seg tabs">${tabs.map(([k, n]) => `<button class="${S.repTab === k ? 'on' : ''}" onclick="App.repTab('${k}')">${n}</button>`).join('')}</div>
   <div id="repBody">${'<div class="center-msg"><div class="spin"></div></div>'}</div></div>`;
  const key = S.repFrom + S.repTo + S.repTab + D.orders.length + D.expenses.length;
  S.repKey = key;
  loadRange(S.repFrom, S.repTo).then((r) => { if (S.repKey === key && $('#repBody')) $('#repBody').innerHTML = S.repTab === 'menu' ? menuTab(r) : S.repTab === 'biaya' ? expTab(r) : summaryTab(r); });
};
function repPreset(p: string) { S.repPreset = p; [S.repFrom, S.repTo] = presetRange(p); VIEWS.report(); }
function repSet(k: string, v: string) { if (!v) return; S[k] = v; S.repPreset = ''; if (S.repFrom > S.repTo) [S.repFrom, S.repTo] = [S.repTo, S.repFrom]; VIEWS.report(); }
function repTab(k: string) { S.repTab = k; VIEWS.report(); }

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const card = (title: string, sub: string, body: string, cls = '') => `<div class="ccard ${cls}"><div class="ctitle"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div>${body}</div>`;
function days(from: string, to: string) { const out: string[] = []; for (let d = new Date(from + 'T00:00:00'); dKey(d) <= to && out.length < 400; d.setDate(d.getDate() + 1)) out.push(dKey(d)); return out; }

function summaryTab(r: any) {
  const sales = sum(r.paid.map((o: any) => o.total)), n = r.paid.length, exp = sum(r.expenses.map((e: any) => e.amount));
  const disc = sum(r.paid.map((o: any) => o.discount || 0)), tax = sum(r.paid.map((o: any) => o.tax || 0)), svc = sum(r.paid.map((o: any) => o.service || 0));
  const items = sum(r.paid.flatMap((o: any) => liveLines(o).map((l: any) => l.qty)));
  const single = S.repFrom === S.repTo;
  // tren
  let trend = '';
  if (single) {
    const hrs = Array.from({ length: 18 }, (_, i) => i + 6), v = hrs.map(() => 0);
    r.paid.forEach((o: any) => { const h = new Date(o.closedAt || o.createdAt).getHours(); const i = hrs.indexOf(h); if (i >= 0) v[i] += o.total; });
    const pk = v.indexOf(Math.max(...v));
    trend = card('Penjualan per jam', v[pk] ? `tersibuk pukul ${pad(hrs[pk])}.00` : '', sum(v) ? columnChart(hrs.map((h, i) => ({ label: String(h), full: `${pad(h)}.00`, values: [v[i]] })), CHC.s1, { money: true }) : '<div class="cempty">Belum ada penjualan</div>', 'span2');
  } else {
    const ds = days(S.repFrom, S.repTo), v = ds.map((d) => sum(r.paid.filter((o: any) => dKey(o.closedAt || o.createdAt) === d).map((o: any) => o.total)));
    const best = v.indexOf(Math.max(...v));
    trend = card('Penjualan harian', v[best] ? `terbaik ${fDate(ds[best])} · ${rp(v[best])}` : '', sum(v) ? lineChart(ds.map((d, i) => ({ label: String(+d.slice(8)), full: fDate(d), values: [v[i]] })), [{ name: 'Penjualan', color: CHC.s1 }], { money: true, area: true }) : '<div class="cempty">Belum ada penjualan</div>', 'span2');
  }
  const hrs2 = Array.from({ length: 18 }, (_, i) => i + 6), hc = hrs2.map(() => 0);
  r.paid.forEach((o: any) => { const i = hrs2.indexOf(new Date(o.createdAt).getHours()); if (i >= 0) hc[i]++; });
  const met = METHODS.map((m) => ({ label: m, value: sum(r.paid.flatMap((o: any) => (o.payments || []).filter((p: any) => p.method === m).map((p: any) => p.amount))) })).filter((x) => x.value).map((x) => ({ ...x, sub: Math.round((x.value / (sales || 1)) * 100) + '%' }));
  const typ = [['dine', 'Makan di tempat'], ['take', 'Bawa pulang']].map(([k, l]) => { const os = r.paid.filter((o: any) => o.type === k); return { label: l, value: sum(os.map((o: any) => o.total)), sub: os.length + ' transaksi' }; });
  const by: Record<string, number> = {}; r.paid.forEach((o: any) => { const k = o.payments?.at(-1)?.by || o.createdBy || '-'; by[k] = (by[k] || 0) + o.total; });
  const cashier = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v }));
  return `<div class="kpis">
    <div class="kpi pri"><small>Penjualan</small><b>${rp(sales)}</b><span>${n} transaksi</span></div>
    <div class="kpi"><small>Rata-rata / transaksi</small><b>${rp(n ? sales / n : 0)}</b><span>${items} porsi terjual</span></div>
    <div class="kpi"><small>Pengeluaran</small><b>${rp(exp)}</b><span>${r.expenses.length} catatan</span></div>
    <div class="kpi ${sales - exp < 0 ? 'neg' : 'ok'}"><small>Laba kotor</small><b>${rp(sales - exp)}</b><span>penjualan − pengeluaran</span></div></div>
   ${n ? '' : `<div class="alert info">Belum ada transaksi lunas di periode ini.</div>`}
   <div class="cgrid">${trend}
    ${card('Jam ramai', 'jumlah pesanan per jam', sum(hc) ? columnChart(hrs2.map((h, i) => ({ label: String(h), full: `${pad(h)}.00`, values: [hc[i]] })), CHC.s2) : '<div class="cempty">Belum ada data</div>')}
    ${card('Metode pembayaran', rp(sales), hbars(met, { money: true }))}
    ${card('Tipe pesanan', '', hbars(typ, { money: true }))}
    ${card('Per kasir', '', hbars(cashier, { money: true }))}
    ${card('Rincian', '', `<table class="tbl"><tr><td>Diskon diberikan</td><td>${rp(disc)}</td></tr><tr><td>Service</td><td>${rp(svc)}</td></tr><tr><td>Pajak</td><td>${rp(tax)}</td></tr><tr><td>Pesanan dibatalkan</td><td>${r.voids.length} (${rp(sum(r.voids.map((o: any) => o.total)))})</td></tr><tr><td>Belum dibayar</td><td>${r.orders.filter((o: any) => o.status === 'open').length} pesanan</td></tr></table>`)}
   </div>`;
}
function menuTab(r: any) {
  const m: Record<string, { q: number; v: number; c: string }> = {};
  r.paid.forEach((o: any) => liveLines(o).forEach((l: any) => { const it = D.items.find((x: any) => x.id === l.itemId); const k = l.name; m[k] = m[k] || { q: 0, v: 0, c: it?.categoryId || '' }; m[k].q += l.qty; m[k].v += l.qty * l.price; }));
  const rows = Object.entries(m).sort((a, b) => b[1].q - a[1].q);
  if (!rows.length) return emptyBox('chart', 'Belum ada menu terjual di periode ini');
  const cat: Record<string, number> = {}; rows.forEach(([, x]) => { const n = D.categories.find((c: any) => c.id === x.c)?.name || 'Lainnya'; cat[n] = (cat[n] || 0) + x.v; });
  const unsold = D.items.filter((i: any) => !m[i.name]);
  return `<div class="cgrid">
   ${card('10 menu terlaris', 'berdasarkan porsi', hbars(rows.slice(0, 10).map(([k, x]) => ({ label: k, value: x.q, sub: rp(x.v) }))))}
   ${card('Penjualan per kategori', '', hbars(Object.entries(cat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v })), { money: true, color: CHC.s2 }))}
   ${card('Semua menu terjual', rows.length + ' menu', `<table class="tbl"><tr><th>Menu</th><th>Porsi</th><th>Nilai</th></tr>${rows.map(([k, x]) => `<tr><td>${esc(k)}</td><td>${x.q}</td><td>${rp(x.v)}</td></tr>`).join('')}</table>`, 'span2')}
   ${unsold.length ? card('Tidak terjual', 'pertimbangkan promo atau hapus dari menu', `<p class="mut">${unsold.map((i: any) => esc(i.name)).join(', ')}</p>`, 'span2') : ''}
  </div>`;
}
function expTab(r: any) {
  const total = sum(r.expenses.map((e: any) => e.amount));
  const cat: Record<string, number> = {}; r.expenses.forEach((e: any) => (cat[e.category] = (cat[e.category] || 0) + e.amount));
  const list = [...r.expenses].sort((a: any, b: any) => b.date.localeCompare(a.date));
  return `<div class="row-between"><div class="kpi-mini">Total pengeluaran <b>${rp(total)}</b></div><button class="btn" onclick="App.expForm('')">${IC.plus}Catat pengeluaran</button></div>
   ${list.length ? `<div class="cgrid">${card('Per kategori', '', hbars(Object.entries(cat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v, color: CHC.s2 })), { money: true }))}
    <div class="ccard"><div class="list flat">${list.map((e: any) => `<button class="li" onclick="App.expForm('${e.id}')"><div class="m"><b>${esc(e.category)}</b><small>${fDate(e.date)}${e.note ? ' · ' + esc(e.note) : ''}${e.cash ? ' · dari kas' : ''}</small></div><b>${rp(e.amount)}</b></button>`).join('')}</div></div></div>`
    : emptyBox('cash', 'Belum ada pengeluaran', 'Catat belanja bahan, gas, gaji, dll. supaya laba terhitung benar.')}`;
}
function expForm(id: string) {
  const e = D.expenses.find((x: any) => x.id === id) || { date: today(), category: EXP_CAT[0], note: '', amount: '', cash: true };
  openSheet(`<h2>${id ? 'Ubah pengeluaran' : 'Catat pengeluaran'}</h2>
   <div class="chips wrap">${EXP_CAT.map((c) => `<button class="chip ${c === e.category ? 'on' : ''}" onclick="App.expCat(this,'${c}')">${c}</button>`).join('')}</div>
   <div class="row2 mt"><label class="fl"><span>Jumlah (Rp)</span><input id="exA" type="text" inputmode="numeric" autocomplete="off" data-money value="${fmtMoney(e.amount)}" placeholder="0" autofocus></label><label class="fl"><span>Tanggal</span><input id="exD" type="date" value="${e.date}"></label></div>
   <label class="fl"><span>Keterangan</span><input id="exN" value="${esc(e.note)}" placeholder="mis. beras 25kg, gas 3 tabung"></label>
   <label class="check"><input id="exC" type="checkbox" ${e.cash ? 'checked' : ''}><span>Dibayar dari uang laci kasir <small>(mengurangi uang di Tutup Kasir)</small></span></label>
   <div class="row2 mt">${id ? `<button class="btn ghost danger" onclick="App.delExp('${id}')">${IC.trash}Hapus</button>` : '<span></span>'}<button class="btn" onclick="App.saveExp('${id}')">Simpan</button></div>`);
  S.expCat = e.category;
}
function expCat(b: any, c: string) { S.expCat = c; b.parentNode.querySelectorAll('.chip').forEach((x: any) => x.classList.toggle('on', x === b)); }
async function saveExp(id: string) {
  const amount = Math.round(num($('#exA').value)); if (amount <= 0) return toast('Jumlah belum diisi', 'err');
  const data = { amount, date: $('#exD').value || today(), note: $('#exN').value.trim(), category: S.expCat, cash: $('#exC').checked };
  closeSheet();
  if (id) await run(() => updRow('expenses', id, data), 'Pengeluaran disimpan');
  else await run(() => addRow('expenses', { ...data, by: byName(), createdAt: new Date().toISOString() }), 'Pengeluaran dicatat');
  if (S.view === 'report' || S.view === 'closing') VIEWS[S.view]();
}
async function delExp(id: string) { if (!(await ask('Hapus pengeluaran ini?', '', 'Hapus', true))) return; closeSheet(); await run(() => delRow('expenses', id), 'Dihapus'); if (S.view === 'report') VIEWS.report(); }

/* ================= TUTUP KASIR ================= */
function shiftStart() {
  const last = [...D.closings].sort((a: any, b: any) => b.to.localeCompare(a.to))[0];
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return last && last.to > start.toISOString() ? last.to : start.toISOString();
}
function shiftData() {
  const from = shiftStart(), to = new Date().toISOString();
  const paid = D.orders.filter((o: any) => o.status === 'paid' && (o.closedAt || o.createdAt) > from);
  const byMethod: Record<string, number> = {}; METHODS.forEach((m) => (byMethod[m] = 0));
  paid.forEach((o: any) => (o.payments || []).forEach((p: any) => (byMethod[p.method] = (byMethod[p.method] || 0) + p.amount)));
  const cashExpense = sum(D.expenses.filter((e: any) => e.cash && (e.createdAt || e.date + 'T12:00:00') > from).map((e: any) => e.amount));
  return { from, to, paid, byMethod, sales: sum(paid.map((o: any) => o.total)), cashSales: byMethod['Tunai'] || 0, cashExpense };
}
VIEWS.closing = () => {
  setHeader('Tutup Kasir', `<button class="hb" onclick="App.expForm('')">${IC.cash}<span>Catat pengeluaran</span></button>`);
  const d = shiftData(), open = D.orders.filter((o: any) => o.status === 'open');
  const opening = +(localStorage.getItem('wp_opening') || 0);
  const hist = [...D.closings].sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
  $('#main').innerHTML = `<div class="wrap narrow">
   <div class="ccard"><div class="ctitle"><b>Shift berjalan</b><small>sejak ${fDT(d.from)}</small></div>
    <div class="kpis two"><div class="kpi pri"><small>Penjualan</small><b>${rp(d.sales)}</b><span>${d.paid.length} transaksi</span></div><div class="kpi"><small>Tunai masuk</small><b>${rp(d.cashSales)}</b><span>non-tunai ${rp(d.sales - d.cashSales)}</span></div></div>
    <table class="tbl">${METHODS.map((m) => `<tr><td>${m}</td><td>${rp(d.byMethod[m] || 0)}</td></tr>`).join('')}</table></div>
   ${open.length ? `<div class="alert warn">${open.length} pesanan belum dibayar (${rp(sum(open.map((o: any) => o.total)))}). <a onclick="App.ordTab('open');App.go('orders')">Lihat</a></div>` : ''}
   <div class="ccard"><div class="ctitle"><b>Hitung uang di laci</b><small>isi lalu tekan Tutup Kasir</small></div>
    <div class="row2"><label class="fl"><span>Modal awal (uang kembalian)</span><input id="clO" type="text" inputmode="numeric" autocomplete="off" data-money value="${fmtMoney(opening)}" placeholder="0" oninput="App.closeCalc()"></label>
    <label class="fl"><span>Uang fisik di laci</span><input id="clC" type="text" inputmode="numeric" autocomplete="off" data-money placeholder="hitung lalu isi" oninput="App.closeCalc()"></label></div>
    <div class="calc" id="clCalc"></div>
    <label class="fl"><span>Catatan (opsional)</span><input id="clN" placeholder="mis. selisih karena …"></label>
    <button class="btn blk xl" onclick="App.doClose()">${IC.lock}Tutup Kasir</button></div>
   ${hist.length ? `<div class="sec-t">Riwayat tutup kasir</div><div class="list">${hist.map((c: any) => `<button class="li" onclick="App.closingSheet('${c.id}')"><div class="m"><b>${fDT(c.createdAt)} · ${esc(c.by)}</b><small>Penjualan ${rp(c.sales)} · ${c.orders} transaksi</small></div><span class="badge ${c.diff === 0 ? 'paid' : c.diff > 0 ? 'ok' : 'void'}">${c.diff === 0 ? 'Pas' : (c.diff > 0 ? '+' : '−') + rp(Math.abs(c.diff))}</span></button>`).join('')}</div>` : ''}
  </div>`;
  closeCalc();
};
function closeCalc() {
  const d = shiftData(), o = num($('#clO')?.value), c = $('#clC')?.value;
  const exp = o + d.cashSales - d.cashExpense;
  const diff = c === '' || c == null ? null : num(c) - exp;
  const el = $('#clCalc'); if (!el) return;
  el.innerHTML = `<div><span>Modal awal</span><b>${rp(o)}</b></div><div><span>+ Penjualan tunai</span><b>${rp(d.cashSales)}</b></div><div><span>− Pengeluaran dari kas</span><b>${rp(d.cashExpense)}</b></div>
   <div class="tot"><span>Seharusnya di laci</span><b>${rp(exp)}</b></div>
   ${diff == null ? '' : `<div class="diff ${diff === 0 ? 'ok' : diff > 0 ? 'plus' : 'neg'}"><span>${diff === 0 ? 'Uang pas 👍' : diff > 0 ? 'Lebih' : 'Kurang'}</span><b>${diff === 0 ? '' : rp(Math.abs(diff))}</b></div>`}`;
}
async function doClose() {
  const d = shiftData(), opening = num($('#clO').value), cv = $('#clC').value;
  if (cv === '') { toast('Isi dulu jumlah uang fisik di laci', 'err'); $('#clC').focus(); return; }
  const counted = num(cv), expected = opening + d.cashSales - d.cashExpense;
  if (!(await ask('Tutup kasir sekarang?', `Penjualan ${rp(d.sales)} · selisih ${rp(counted - expected)}`, 'Tutup Kasir'))) return;
  localStorage.setItem('wp_opening', String(opening));
  const rec = { date: today(), from: d.from, to: d.to, opening, cashSales: d.cashSales, cashExpense: d.cashExpense, expected, counted, diff: counted - expected,
    sales: d.sales, byMethod: d.byMethod, orders: d.paid.length, note: $('#clN').value.trim(), by: byName(), createdAt: new Date().toISOString() };
  const id = await run(() => addRow('closings', rec), 'Kasir ditutup'); if (!id) return;
  VIEWS.closing(); closingSheet(id as string);
}
function closingHTML(c: any) {
  return `<div class="rc"><div class="c b big">${esc(shopName())}</div><div class="c b">LAPORAN TUTUP KASIR</div><hr>
   <div class="r"><span>Dari</span><span>${fDT(c.from)}</span></div><div class="r"><span>Sampai</span><span>${fDT(c.to)}</span></div><div class="r"><span>Oleh</span><span>${esc(c.by)}</span></div><hr>
   <div class="r"><span>Transaksi</span><span>${c.orders}</span></div><div class="r b"><span>Penjualan</span><span>${rp(c.sales)}</span></div>
   ${Object.entries(c.byMethod || {}).map(([m, v]: any) => `<div class="r"><span>  ${m}</span><span>${rp(v)}</span></div>`).join('')}<hr>
   <div class="r"><span>Modal awal</span><span>${rp(c.opening)}</span></div><div class="r"><span>Tunai masuk</span><span>${rp(c.cashSales)}</span></div><div class="r"><span>Pengeluaran kas</span><span>-${rp(c.cashExpense)}</span></div>
   <div class="r b"><span>Seharusnya</span><span>${rp(c.expected)}</span></div><div class="r b"><span>Uang fisik</span><span>${rp(c.counted)}</span></div><div class="r b big"><span>Selisih</span><span>${rp(c.diff)}</span></div>
   ${c.note ? `<hr><div>${esc(c.note)}</div>` : ''}<hr><div class="c small">Dicetak ${fDT(new Date())}</div></div>`;
}
function closingSheet(id: string) {
  const c = D.closings.find((x: any) => x.id === id); if (!c) return;
  openSheet(`<h2>Tutup kasir</h2><div class="receipt-preview">${closingHTML(c)}</div>
   <button class="btn blk lg" onclick="App.printClosing('${id}')">${IC.print}Cetak</button>`);
}
function printClosing(id: string) {
  const c = D.closings.find((x: any) => x.id === id); if (!c) return;
  const pa = $('#print-area'); pa.className = 'paper-' + (setg().paper || '58'); pa.innerHTML = closingHTML(c); setTimeout(() => window.print(), 60);
}
reg({ repPreset, repSet, repTab, expForm, expCat, saveExp, delExp, closeCalc, doClose, closingSheet, printClosing });
void go; void fTime; void orderTitle;
