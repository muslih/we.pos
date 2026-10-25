/* We POS — Meja (denah sederhana) & Pesanan (riwayat + detail). */
import {
  S, D, VIEWS, reg, $, esc, IC, rp, today, fTime, fDT, dKey, ago, mins, isMgr, canPay, tableName, orderTitle, liveLines, paidAmt,
  openSheet, closeSheet, run, addRow, updRow, delRow, ask, prompt2, emptyBox, calcTotals, byName, toast, num,
} from './core';
import { setHeader } from './shell';
import { payOrder, printReceipt, loadOrder } from './pos';
import { managerPin } from './auth';
import { go } from './shell';
import { qrBadge } from './selfmenu';

/* ================= MEJA ================= */
const openByTable = () => { const m: Record<string, any> = {}; D.orders.filter((o: any) => o.status === 'open' && o.type === 'dine' && o.tableId).forEach((o: any) => (m[o.tableId] = o)); return m; };
/** Reservasi hari ini yang belum datang, per meja (yang paling dekat). */
const resvByTable = () => {
  const m: Record<string, any> = {}, t = today();
  D.reservations.filter((r: any) => r.date === t && r.status === 'booked' && r.tableId).sort((a: any, b: any) => a.time.localeCompare(b.time)).forEach((r: any) => { if (!m[r.tableId]) m[r.tableId] = r; });
  return m;
};
VIEWS.tables = () => {
  const edit = !!S.tableEdit && isMgr();
  setHeader('Meja', isMgr() ? `<button class="hb ${edit ? 'on' : ''}" onclick="App.toggleTableEdit()">${edit ? IC.check + '<span>Selesai atur</span>' : IC.edit + '<span>Atur meja</span>'}</button>` : '');
  const areas = ['Semua', ...new Set(D.tables.map((t: any) => t.area || 'Lainnya'))] as string[];
  if (!areas.includes(S.area)) S.area = 'Semua';
  const open = openByTable(), resv = resvByTable();
  const list = D.tables.filter((t: any) => S.area === 'Semua' || (t.area || 'Lainnya') === S.area);
  const busy = D.tables.filter((t: any) => open[t.id]).length;
  const tile = (t: any) => {
    const o = open[t.id], r = resv[t.id];
    if (edit) return `<button class="tt edit" onclick="App.tableForm('${t.id}')"><b>${esc(t.name)}</b><small>${esc(t.area || '')} · ${t.seats} kursi</small><span class="tt-ed">${IC.edit}</span></button>`;
    if (o) {
      const ready = o.lines.some((l: any) => l.status === 'ready'), cook = o.lines.some((l: any) => l.status === 'cook');
      return `<button class="tt busy ${mins(o.createdAt) > 90 ? 'long' : ''}" onclick="App.tableSheet('${o.id}')"><b>${esc(t.name)}</b>
        <span class="tt-amt">${rp(o.total)}</span><small>#${o.no}${o.guest ? ' · ' + esc(o.guest) : ''}</small>
        <span class="tt-foot">${IC.clock}${ago(o.createdAt)}${ready ? `<i class="tag ok">${IC.bell}Siap</i>` : cook ? '<i class="tag">Dimasak</i>' : ''}</span></button>`;
    }
    return `<button class="tt ${r ? 'resv' : ''}" onclick="App.orderFor('${t.id}')"><b>${esc(t.name)}</b><small>${t.seats} kursi</small>
      ${r ? `<span class="tt-foot">${IC.cal}${esc(r.time)} · ${esc(r.name)}</span>` : '<span class="tt-foot free">Kosong</span>'}</button>`;
  };
  $('#main').innerHTML = `<div class="wrap">
   <div class="tbar"><div class="chips">${areas.map((a) => `<button class="chip ${S.area === a ? 'on' : ''}" onclick="App.setArea('${esc(a)}')">${esc(a)}</button>`).join('')}</div>
    <div class="legend"><span><i class="lg-free"></i>Kosong ${D.tables.length - busy}</span><span><i class="lg-busy"></i>Terisi ${busy}</span><span><i class="lg-resv"></i>Reservasi</span></div></div>
   ${D.tables.length || edit ? `<div class="tgrid">${list.map(tile).join('')}${edit ? `<button class="tt add" onclick="App.tableForm('')">${IC.plus}<b>Tambah meja</b></button>` : ''}</div>`
    : emptyBox('table', 'Belum ada meja', 'Tambahkan meja supaya pesanan makan di tempat bisa dicatat per meja.', isMgr() ? `<button class="btn" onclick="App.toggleTableEdit()">${IC.plus}Atur meja</button>` : '')}
   ${!edit ? takeawayBlock() : '<p class="mut center small mt">Ketuk meja untuk mengubah. Pesanan lama tidak terpengaruh.</p>'}
  </div>`;
};
function takeawayBlock() {
  const list = D.orders.filter((o: any) => o.status === 'open' && (o.type === 'take' || !o.tableId));
  if (!list.length) return '';
  return `<div class="sec-t">Bawa pulang / tanpa meja · belum dibayar</div><div class="list">${list.map((o: any) => `<button class="li" onclick="App.tableSheet('${o.id}')">
    <div class="m"><b>#${o.no} · ${esc(orderTitle(o))}${o.guest ? ' · ' + esc(o.guest) : ''}</b><small>${ago(o.createdAt)} lalu</small></div><b>${rp(o.total)}</b>${IC.chev}</button>`).join('')}</div>`;
}
function setArea(a: string) { S.area = a; VIEWS.tables(); }
function toggleTableEdit() { S.tableEdit = !S.tableEdit; VIEWS.tables(); }
function tableForm(id: string) {
  const t = D.tables.find((x: any) => x.id === id) || { name: '', area: S.area !== 'Semua' ? S.area : (D.tables.at(-1)?.area || 'Dalam'), seats: 4 };
  const areas = [...new Set(D.tables.map((x: any) => x.area).filter(Boolean))] as string[];
  const nextNum = Math.max(0, ...D.tables.map((x: any) => parseInt(x.name) || 0)) + 1;
  openSheet(`<h2>${id ? 'Ubah meja' : 'Tambah meja'}</h2>
   <div class="row2"><label class="fl"><span>Nama / nomor meja</span><input id="tfN" value="${esc(id ? t.name : String(nextNum))}" autofocus></label>
   <label class="fl"><span>Jumlah kursi</span><input id="tfS" type="number" inputmode="numeric" value="${t.seats}"></label></div>
   <label class="fl"><span>Area</span><input id="tfA" list="tfAreas" value="${esc(t.area)}" placeholder="mis. Dalam, Teras, Lantai 2"><datalist id="tfAreas">${areas.map((a) => `<option value="${esc(a)}">`).join('')}</datalist></label>
   ${!id ? `<label class="fl"><span>Buat sekaligus</span><select id="tfK">${[1, 2, 3, 4, 5, 6, 8, 10].map((k) => `<option value="${k}">${k} meja${k > 1 ? ' (nomor berurutan)' : ''}</option>`).join('')}</select></label>` : ''}
   <div class="row2 mt">${id ? `<button class="btn ghost danger" onclick="App.delTable('${id}')">${IC.trash}Hapus</button>` : '<span></span>'}<button class="btn" onclick="App.saveTable('${id}')">Simpan</button></div>`);
}
async function saveTable(id: string) {
  const name = $('#tfN').value.trim(), area = $('#tfA').value.trim() || 'Dalam', seats = +$('#tfS').value || 2;
  if (!name) return toast('Nama meja wajib diisi', 'err');
  const k = id ? 1 : +($('#tfK')?.value || 1);
  closeSheet();
  if (id) return run(() => updRow('dtables', id, { name, area, seats }), 'Meja disimpan');
  const n0 = parseInt(name), base = D.tables.length;
  await run(async () => {
    for (let i = 0; i < k; i++) await addRow('dtables', { name: k > 1 && !isNaN(n0) ? String(n0 + i) : k > 1 ? `${name} ${i + 1}` : name, area, seats, sort: base + i });
  }, k > 1 ? `${k} meja ditambahkan` : 'Meja ditambahkan');
}
async function delTable(id: string) {
  if (D.orders.some((o: any) => o.status === 'open' && o.tableId === id)) return toast('Meja masih terisi pesanan', 'err');
  if (!(await ask('Hapus meja ini?', '', 'Hapus', true))) return;
  closeSheet(); run(() => delRow('dtables', id), 'Meja dihapus');
}

/* ---------- Lembar meja terisi ---------- */
function tableSheet(id: string) {
  const o = D.orders.find((x: any) => x.id === id); if (!o) return closeSheet();
  const ready = o.lines.some((l: any) => l.status === 'ready');
  openSheet(`<div class="os-head"><div><h2>${esc(orderTitle(o))}</h2><small class="mut">#${o.no}${o.guest ? ' · ' + esc(o.guest) : ''} · sejak ${fTime(o.createdAt)} (${ago(o.createdAt)})</small></div><b class="os-total">${rp(o.total)}</b></div>
   ${linesBlock(o, false)}
   ${ready ? `<button class="btn sec blk" onclick="App.markServed('${o.id}');App.closeSheet()">${IC.bell}Tandai sudah diantar</button>` : ''}
   <div class="row2 mt"><button class="btn sec lg" onclick="App.editOrder('${o.id}')">${IC.plus}Tambah item</button>${canPay() ? `<button class="btn lg" onclick="App.payOrder('${o.id}')">Bayar ${rp(o.total - paidAmt(o))}</button>` : ''}</div>
   <div class="acts3"><button onclick="App.printReceipt('${o.id}')">${IC.print}Cetak tagihan</button>${o.type === 'dine' ? `<button onclick="App.moveTable('${o.id}')">${IC.move}Pindah meja</button>` : ''}<button onclick="App.showOrder('${o.id}')">${IC.list}Detail</button></div>`);
}
function moveTable(id: string) {
  const o = D.orders.find((x: any) => x.id === id); if (!o) return;
  const open = openByTable();
  openSheet(`<h2>Pindah ke meja…</h2><p class="mut">Dari ${esc(orderTitle(o))}</p><div class="tpick">${D.tables.map((t: any) => {
    const busy = open[t.id] && open[t.id].id !== id;
    return `<button class="${busy ? 'busy' : ''} ${t.id === o.tableId ? 'on' : ''}" ${busy || t.id === o.tableId ? 'disabled' : ''} onclick="App.doMove('${id}','${t.id}')"><b>${esc(t.name)}</b><small>${busy ? 'terisi' : t.seats + ' kursi'}</small></button>`;
  }).join('')}</div>`, { wide: true });
}
async function doMove(id: string, tableId: string) { closeSheet(); await run(() => updRow('orders', id, { tableId, type: 'dine' }), `Dipindah ke Meja ${tableName(tableId)}`); }

/* ================= PESANAN ================= */
const ST: Record<string, string> = { cook: 'Dimasak', ready: 'Siap', served: 'Diantar', void: 'Batal', new: 'Belum dikirim' };
function linesBlock(o: any, withVoid = true) {
  const open = o.status === 'open';
  return `<div class="olines">${o.lines.map((l: any, i: number) => `<div class="ol ${l.status === 'void' ? 'void' : ''}">
    <span class="q">${l.qty}×</span><div class="m"><b>${esc(l.name)}</b>${l.note ? `<small class="note">${esc(l.note)}</small>` : ''}</div>
    <span class="st st-${l.status}">${ST[l.status] || ''}</span><b class="p">${rp(l.qty * l.price)}</b>
    ${withVoid && open && l.status !== 'void' ? `<button class="x" title="Batalkan item" onclick="App.voidLine('${o.id}',${i})">${IC.x}</button>` : ''}</div>`).join('')}</div>
   <div class="osum"><div><span>Subtotal</span><span>${rp(o.subtotal)}</span></div>${o.discount ? `<div><span>Diskon</span><span>− ${rp(o.discount)}</span></div>` : ''}
    ${o.service ? `<div><span>Service</span><span>${rp(o.service)}</span></div>` : ''}${o.tax ? `<div><span>Pajak</span><span>${rp(o.tax)}</span></div>` : ''}
    <div class="tot"><span>Total</span><span>${rp(o.total)}</span></div></div>`;
}
const payBadge = (o: any) => o.status === 'void' ? '<span class="badge void">Batal</span>' : o.status === 'paid' ? '<span class="badge paid">Lunas</span>' : '<span class="badge open">Belum bayar</span>';
const kitBadge = (o: any) => {
  if (o.status === 'void') return '';
  const c = o.lines.filter((l: any) => l.status === 'cook').length, r = o.lines.filter((l: any) => l.status === 'ready').length;
  return r ? `<span class="badge ok">${IC.bell}Siap diantar</span>` : c ? '<span class="badge cook">Dimasak</span>' : '';
};
VIEWS.orders = () => {
  setHeader('Pesanan');
  const t = today(), q = S.ordQ.trim().toLowerCase();
  const tabs: [string, string, (o: any) => boolean][] = [
    ['open', 'Berjalan', (o) => o.status === 'open'],
    ['today', 'Selesai hari ini', (o) => o.status === 'paid' && dKey(o.closedAt || o.createdAt) === t],
    ['all', 'Semua', () => true],
    ['void', 'Dibatalkan', (o) => o.status === 'void'],
  ];
  const cur = tabs.find((x) => x[0] === S.ordTab) || tabs[0];
  let list = D.orders.filter(cur[2]);
  if (q) list = list.filter((o: any) => [o.code, '#' + o.no, o.guest, orderTitle(o), ...liveLines(o).map((l: any) => l.name)].join(' ').toLowerCase().includes(q));
  const shown = list.slice(0, 200);
  const sumToday = D.orders.filter((o: any) => o.status === 'paid' && dKey(o.closedAt || o.createdAt) === t).reduce((a: number, o: any) => a + o.total, 0);
  $('#main').innerHTML = `<div class="wrap">
   <div class="tbar"><div class="chips">${tabs.map(([k, n, f]) => `<button class="chip ${cur[0] === k ? 'on' : ''}" onclick="App.ordTab('${k}')">${n}<i>${D.orders.filter(f).length}</i></button>`).join('')}</div>
    <label class="search sm">${IC.search}<input type="search" placeholder="Cari no., nama, menu…" value="${esc(S.ordQ)}" oninput="App.ordSearch(this.value)"></label></div>
   ${cur[0] === 'today' ? `<div class="kpi-mini">Penjualan hari ini <b>${rp(sumToday)}</b></div>` : ''}
   ${shown.length ? `<div class="list orders">${shown.map((o: any) => `<button class="li" onclick="App.showOrder('${o.id}')">
     <span class="ono">#${o.no}</span><div class="m"><b>${esc(orderTitle(o))}${o.guest ? ' · ' + esc(o.guest) : ''}</b>
     <small>${liveLines(o).map((l: any) => `${l.qty}× ${esc(l.name)}`).join(', ') || '—'}</small></div>
     <div class="r"><b>${rp(o.total)}</b><small>${dKey(o.createdAt) === t ? fTime(o.createdAt) : fDT(o.createdAt)}</small><div class="bd">${qrBadge(o)}${kitBadge(o)}${payBadge(o)}</div></div></button>`).join('')}</div>
     ${list.length > 200 ? '<p class="mut center small">Menampilkan 200 terbaru. Gunakan pencarian atau Laporan untuk data lama.</p>' : ''}`
    : emptyBox('list', cur[0] === 'open' ? 'Tidak ada pesanan berjalan' : 'Belum ada pesanan', q ? 'Coba kata kunci lain.' : '', cur[0] === 'open' ? `<button class="btn" onclick="App.go('pos')">${IC.plus}Pesanan baru</button>` : '')}
  </div>`;
};
function ordTab(k: string) { S.ordTab = k; VIEWS.orders(); }
function ordSearch(v: string) {
  S.ordQ = v; const sel = (document.activeElement as HTMLInputElement); const pos = sel?.selectionStart;
  VIEWS.orders(); const i = document.querySelector('.tbar input') as HTMLInputElement; if (i) { i.focus(); try { i.setSelectionRange(pos!, pos!); } catch {} }
}
function showOrder(id: string) {
  const o = D.orders.find((x: any) => x.id === id); if (!o) return closeSheet();
  const open = o.status === 'open';
  openSheet(`<div class="os-head"><div><h2>#${o.no} · ${esc(orderTitle(o))}</h2><small class="mut">${esc(o.code)} · ${fDT(o.createdAt)} · oleh ${esc(o.createdBy || '-')}${o.guest ? '<br>Tamu: ' + esc(o.guest) : ''}</small></div><div class="bd">${payBadge(o)}</div></div>
   ${linesBlock(o)}
   ${(o.payments || []).length ? `<div class="sec-t">Pembayaran</div><div class="list">${o.payments.map((p: any) => `<div class="li"><div class="m"><b>${esc(p.method)}</b><small>${fDT(p.date)} · ${esc(p.by || '')}${p.received ? ` · diterima ${rp(p.received)}, kembali ${rp(p.change || 0)}` : ''}</small></div><b>${rp(p.amount)}</b></div>`).join('')}</div>` : ''}
   ${o.status === 'void' ? `<div class="alert error">Dibatalkan${o.voidReason ? ': ' + esc(o.voidReason) : ''}</div>` : ''}
   ${open ? `<div class="row2 mt"><button class="btn sec lg" onclick="App.editOrder('${o.id}')">${IC.plus}Tambah item</button>${canPay() ? `<button class="btn lg" onclick="App.payOrder('${o.id}')">Bayar ${rp(o.total)}</button>` : ''}</div>` : ''}
   <div class="acts3"><button onclick="App.printReceipt('${o.id}')">${IC.print}${open ? 'Cetak tagihan' : 'Cetak struk'}</button><button onclick="App.waReceipt('${o.id}')">${IC.wa}WhatsApp</button>
    ${o.lines.some((l: any) => l.status === 'cook') ? `<button onclick="App.printKitchen('${o.id}')">${IC.chef}Tiket dapur</button>` : ''}
    ${open && o.type === 'dine' ? `<button onclick="App.moveTable('${o.id}')">${IC.move}Pindah meja</button>` : ''}</div>
   ${o.status !== 'void' ? `<button class="link danger blk mt" onclick="App.voidOrder('${o.id}')">${o.status === 'paid' ? 'Batalkan transaksi (refund)' : 'Batalkan pesanan'}</button>` : ''}`);
}
async function voidLine(id: string, i: number) {
  const o = D.orders.find((x: any) => x.id === id); if (!o) return;
  const l = o.lines[i]; if (!l) return;
  if (!(await ask(`Batalkan ${l.qty}× ${esc(l.name)}?`, l.status === 'cook' ? 'Item sudah di dapur — beri tahu dapur juga.' : '', 'Batalkan item', true))) return;
  const mgr = l.status !== 'new' ? await managerPin(`Batalkan ${l.qty}× ${l.name} dari pesanan #${o.no}`) : true; if (!mgr) return;
  const lines = o.lines.map((x: any, j: number) => (j === i ? { ...x, status: 'void', voidBy: (mgr as any).name || byName() } : x));
  const t = calcTotals(lines, o.discountPct ? Math.round((lines.filter((x: any) => x.status !== 'void').reduce((a: number, x: any) => a + x.price * x.qty, 0) * o.discountPct) / 100) : o.discount);
  await run(() => updRow('orders', id, { lines, ...t }), 'Item dibatalkan'); showOrder(id);
}
async function voidOrder(id: string) {
  const o = D.orders.find((x: any) => x.id === id); if (!o) return;
  const reason = await prompt2(o.status === 'paid' ? 'Batalkan transaksi?' : 'Batalkan pesanan?', 'Alasan (wajib)', '');
  if (reason == null) return; if (!reason.trim()) return toast('Alasan wajib diisi', 'err');
  const mgr = await managerPin(`Batalkan pesanan #${o.no} (${rp(o.total)})`); if (!mgr) return;
  await run(() => updRow('orders', id, { status: 'void', voidReason: `${reason.trim()} — disetujui ${mgr.name}`, closedAt: new Date().toISOString(),
    lines: o.lines.map((l: any) => (l.status === 'cook' || l.status === 'new' ? { ...l, status: 'void' } : l)) }), 'Pesanan dibatalkan');
  closeSheet();
}
function printKitchen(id: string) { printReceipt(id, true); }
reg({ setArea, toggleTableEdit, tableForm, saveTable, delTable, tableSheet, moveTable, doMove, ordTab, ordSearch, showOrder, voidLine, voidOrder, printKitchen });
void payOrder; void loadOrder; void go; void num;
