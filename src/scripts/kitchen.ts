/* We POS — Layar Dapur (KDS), Layar Antrian, Reservasi. */
import {
  S, D, VIEWS, reg, $, esc, IC, rp, today, dKey, fDay, fTime, mins, orderTitle, isMgr, tableName,
  openSheet, closeSheet, run, addRow, updRow, ask, emptyBox, toast, waNum, shopName, setg, byName, beep, unlockAudio, audioReady, soundMuted,
} from './core';
import { setHeader, go } from './shell';
import { newCart } from './pos';

/* ================= DAPUR ================= */
function tickets() {
  const st = S.station;
  const out: any[] = [];
  for (const o of D.orders) {
    if (o.status === 'void') continue;
    const rounds = [...new Set(o.lines.filter((l: any) => l.status === 'cook').map((l: any) => l.round))] as number[];
    for (const r of rounds) {
      const lines = o.lines.map((l: any, i: number) => ({ ...l, i })).filter((l: any) => l.round === r && (l.status === 'cook' || l.status === 'ready') && (st === 'all' || l.station === st));
      if (!lines.some((l: any) => l.status === 'cook')) continue;
      const sentAt = lines.reduce((m: string, l: any) => (l.sentAt && l.sentAt < m ? l.sentAt : m), lines[0].sentAt || o.createdAt);
      out.push({ o, r, lines, sentAt });
    }
  }
  return out.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}
VIEWS.kitchen = () => {
  const muted = localStorage.getItem('wp_mute') === '1';
  setHeader('Dapur', `<button class="hb" onclick="App.toggleMute()" title="Suara">${muted ? IC.mute : IC.sound}</button><button class="hb" onclick="App.fullscreen()" title="Layar penuh">${IC.full}</button>`);
  const list = tickets();
  const hasBar = D.items.some((i: any) => i.station === 'bar');
  const recent = D.orders.filter((o: any) => o.status !== 'void' && o.lines.some((l: any) => l.status === 'ready')).slice(0, 12);
  if (!setg().kds) {
    $('#main').innerHTML = `<div class="wrap">${emptyBox('chef', 'Layar dapur sedang nonaktif', 'Pesanan langsung dianggap siap tanpa melewati dapur. Aktifkan di Pengaturan bila dapur memakai tablet/HP.', isMgr() ? `<button class="btn" onclick="App.go('settings')">Buka Pengaturan</button>` : '')}</div>`;
    return;
  }
  $('#main').innerHTML = `<div class="kds">${soundBanner()}
   <div class="kds-bar">${hasBar ? `<div class="chips dark">${[['all', 'Semua'], ['dapur', '🍳 Dapur'], ['bar', '🥤 Bar']].map(([k, n]) => `<button class="chip ${S.station === k ? 'on' : ''}" onclick="App.setStation('${k}')">${n}</button>`).join('')}</div>` : '<span></span>'}
    <div class="kds-stat"><b>${list.length}</b> tiket menunggu</div></div>
   ${list.length ? `<div class="kgrid">${list.map((t) => ticketHTML(t)).join('')}</div>`
    : `<div class="kds-empty">${IC.chef}<b>Semua pesanan sudah selesai</b><p>Tiket baru muncul otomatis di sini, lengkap dengan bunyi notifikasi.</p></div>`}
   ${recent.length ? `<div class="kds-recent"><span>Siap diantar:</span>${recent.map((o: any) => `<button onclick="App.recallOrder('${o.id}')" title="Ketuk untuk kembalikan ke dapur">#${o.no} ${esc(o.type === 'dine' && o.tableId ? 'M' + tableName(o.tableId) : '🛍')}</button>`).join('')}</div>` : ''}
  </div>`;
};
function ticketHTML(t: any) {
  const m = mins(t.sentAt), o = t.o;
  const lvl = m >= 20 ? 'late' : m >= 10 ? 'warn' : 'ok';
  return `<div class="tk ${lvl}"><div class="tk-h"><div><b>#${o.no}</b><span>${esc(orderTitle(o))}</span></div><div class="tk-t">${IC.clock}${m} mnt</div></div>
   ${o.guest || t.r > 1 || t.lines.some((l: any) => l.by === 'qr') ? `<div class="tk-sub">${o.guest ? esc(o.guest) : ''}${t.r > 1 ? ' <i>Tambahan</i>' : ''}${t.lines.some((l: any) => l.by === 'qr') ? ' <i class="qr">QR</i>' : ''}</div>` : ''}
   <div class="tk-lines">${t.lines.map((l: any) => `<button class="${l.status === 'ready' ? 'done' : ''}" onclick="App.kLine('${o.id}',${l.i})"><span class="q">${l.qty}×</span><span class="n">${esc(l.name)}${l.note ? `<small>${esc(l.note)}</small>` : ''}</span>${l.status === 'ready' ? IC.check : ''}</button>`).join('')}</div>
   <button class="tk-done" onclick="App.bump('${o.id}',${t.r})">${IC.check}Selesai</button></div>`;
}
async function kLine(id: string, i: number) {
  const o = D.orders.find((x: any) => x.id === id); if (!o) return;
  const now = new Date().toISOString();
  const lines = o.lines.map((l: any, j: number) => (j !== i ? l : l.status === 'cook' ? { ...l, status: 'ready', readyAt: now } : l.status === 'ready' ? { ...l, status: 'cook', readyAt: undefined } : l));
  await run(() => updRow('orders', id, { lines }));
}
async function bump(id: string, round: number) {
  const o = D.orders.find((x: any) => x.id === id); if (!o) return;
  const now = new Date().toISOString(), st = S.station;
  const lines = o.lines.map((l: any) => (l.round === round && l.status === 'cook' && (st === 'all' || l.station === st) ? { ...l, status: 'ready', readyAt: now } : l));
  await run(() => updRow('orders', id, { lines }), `#${o.no} siap diantar`);
}
async function recallOrder(id: string) {
  const o = D.orders.find((x: any) => x.id === id); if (!o) return;
  if (!(await ask(`Kembalikan #${o.no} ke dapur?`, 'Gunakan bila tiket tidak sengaja ditandai selesai.', 'Kembalikan'))) return;
  await run(() => updRow('orders', id, { lines: o.lines.map((l: any) => (l.status === 'ready' ? { ...l, status: 'cook', readyAt: undefined } : l)) }));
}
function setStation(k: string) { S.station = k; VIEWS.kitchen(); }
function toggleMute() {
  const mute = !soundMuted(); localStorage.setItem('wp_mute', mute ? '1' : '0');
  if (!mute) { unlockAudio(); beep('new', true); }
  VIEWS[S.view](); toast(mute ? 'Suara dimatikan' : 'Suara dinyalakan — ini contoh bunyinya');
}
function testSound() { unlockAudio(); beep(S.view === 'queue' ? 'ready' : 'new', true); }
/** Pengingat di layar dapur/antrian bila browser belum mengizinkan suara. */
function soundBanner() {
  if (soundMuted() || audioReady()) return '';
  return `<button class="snd-banner" onclick="App.testSound()">${IC.sound}<span><b>Ketuk di sini untuk mengaktifkan suara notifikasi</b><small>Browser baru mengizinkan bunyi setelah layar disentuh sekali.</small></span></button>`;
}
document.addEventListener('wp:audio', () => { document.querySelectorAll('.snd-banner').forEach((b) => b.remove()); });
function fullscreen() { const d: any = document; if (d.fullscreenElement) d.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => toast('Layar penuh tidak didukung')); }

/* ================= LAYAR ANTRIAN ================= */
VIEWS.queue = () => {
  setHeader('Layar Antrian');
  const t = today(), all = !!S.queueAll;
  const list = D.orders.filter((o: any) => o.status !== 'void' && dKey(o.createdAt) === t && (all || o.type === 'take' || !o.tableId));
  const prep = list.filter((o: any) => o.lines.some((l: any) => l.status === 'cook') && !o.lines.some((l: any) => l.status === 'ready'));
  const ready = list.filter((o: any) => o.lines.some((l: any) => l.status === 'ready'));
  const s = setg();
  const lbl = (o: any) => (o.guest ? esc(o.guest) : o.type === 'dine' && o.tableId ? 'Meja ' + esc(tableName(o.tableId)) : '');
  $('#main').innerHTML = `<div class="queue">${soundBanner()}
   <div class="q-top">${s.logo ? `<img src="${s.logo}" alt="">` : `<span class="q-logo">${IC.logo}</span>`}<b>${esc(shopName())}</b><span class="q-clock">${fTime(new Date())}</span>
    <div class="q-tools"><button onclick="App.queueAll()">${all ? 'Bawa pulang saja' : 'Semua pesanan'}</button><button onclick="App.fullscreen()">${IC.full}</button><button onclick="App.go('more')">${IC.x}</button></div></div>
   <div class="q-cols"><section><h2>Sedang disiapkan</h2><div class="q-list prep">${prep.map((o: any) => `<div><b>${o.no}</b><small>${lbl(o)}</small></div>`).join('') || '<p>—</p>'}</div></section>
    <section class="ready"><h2>Silakan ambil</h2><div class="q-list">${ready.map((o: any) => `<div><b>${o.no}</b><small>${lbl(o)}</small></div>`).join('') || '<p>Belum ada</p>'}</div></section></div>
   <div class="q-foot">Nomor antrian tertera di struk Anda · Terima kasih sudah menunggu 🙏</div></div>`;
};
function queueAll() { S.queueAll = !S.queueAll; VIEWS.queue(); }

/* ================= RESERVASI ================= */
const addDays = (k: string, n: number) => { const d = new Date(k + 'T00:00:00'); d.setDate(d.getDate() + n); return dKey(d); };
const RS: Record<string, [string, string]> = { booked: ['Dipesan', 'open'], seated: ['Sudah datang', 'paid'], cancel: ['Batal', 'void'], noshow: ['Tidak datang', 'void'] };
VIEWS.reserve = () => {
  setHeader('Reservasi', `<button class="hb pri" onclick="App.resForm('')">${IC.plus}<span>Reservasi</span></button>`);
  const t = today(); if (!S.resDate) S.resDate = t;
  const d = S.resDate;
  const list = D.reservations.filter((r: any) => r.date === d).sort((a: any, b: any) => a.time.localeCompare(b.time));
  const active = list.filter((r: any) => r.status !== 'cancel' && r.status !== 'noshow');
  const upcoming = D.reservations.filter((r: any) => r.date > t && r.status === 'booked').length;
  const days = [[t, 'Hari ini'], [addDays(t, 1), 'Besok'], [addDays(t, 2), 'Lusa']];
  $('#main').innerHTML = `<div class="wrap narrow">
   <div class="tbar"><div class="chips">${days.map(([k, n]) => `<button class="chip ${d === k ? 'on' : ''}" onclick="App.resDay('${k}')">${n}<i>${D.reservations.filter((r: any) => r.date === k && r.status === 'booked').length || ''}</i></button>`).join('')}
     <label class="chip date ${days.some(([k]) => k === d) ? '' : 'on'}">${IC.cal}<input type="date" value="${d}" onchange="App.resDay(this.value)"></label></div></div>
   <div class="day-h"><b>${fDay(d + 'T00:00:00')}</b><span>${active.length} reservasi · ${active.reduce((a: number, r: any) => a + (r.pax || 0), 0)} tamu</span></div>
   ${list.length ? `<div class="rlist">${list.map((r: any) => `<div class="rv ${r.status}">
      <div class="rv-time">${esc(r.time)}</div>
      <div class="rv-m"><b>${esc(r.name)}</b><small>${IC.pax}${r.pax} orang${r.tableId ? ` · Meja ${esc(tableName(r.tableId))}` : ''}${r.phone ? ` · ${esc(r.phone)}` : ''}</small>${r.note ? `<small class="note">${esc(r.note)}</small>` : ''}</div>
      <span class="badge ${RS[r.status][1]}">${RS[r.status][0]}</span>
      <div class="rv-acts">${r.status === 'booked' ? `<button class="btn sm" onclick="App.resSeat('${r.id}')">Tamu datang</button>${r.phone ? `<button class="btn sm sec" onclick="App.resWA('${r.id}')">${IC.wa}</button>` : ''}` : ''}
       <button class="btn sm ghost" onclick="App.resForm('${r.id}')">${IC.edit}</button></div></div>`).join('')}</div>`
    : emptyBox('cal', 'Belum ada reservasi', upcoming && d === t ? `${upcoming} reservasi di hari berikutnya.` : 'Catat reservasi lewat telepon/WA di sini supaya meja tidak bentrok.', `<button class="btn" onclick="App.resForm('')">${IC.plus}Tambah reservasi</button>`)}
  </div>`;
};
function resDay(k: string) { if (k) { S.resDate = k; VIEWS.reserve(); } }
function resForm(id: string) {
  const r = D.reservations.find((x: any) => x.id === id) || { name: '', phone: '', date: S.resDate || today(), time: '19:00', pax: 2, tableId: '', note: '', status: 'booked' };
  openSheet(`<h2>${id ? 'Ubah reservasi' : 'Reservasi baru'}</h2>
   <div class="row2"><label class="fl"><span>Nama tamu</span><input id="rvN" value="${esc(r.name)}" autofocus></label><label class="fl"><span>No. HP / WA</span><input id="rvP" type="tel" inputmode="tel" value="${esc(r.phone)}"></label></div>
   <div class="row3"><label class="fl"><span>Tanggal</span><input id="rvD" type="date" value="${r.date}" onchange="App.resTables()"></label><label class="fl"><span>Jam</span><input id="rvT" type="time" value="${r.time}" onchange="App.resTables()"></label><label class="fl"><span>Jumlah orang</span><input id="rvX" type="number" inputmode="numeric" value="${r.pax}"></label></div>
   <label class="fl"><span>Meja (opsional)</span><select id="rvM" data-cur="${r.tableId}"></select></label>
   <label class="fl"><span>Catatan</span><input id="rvO" value="${esc(r.note)}" placeholder="mis. ulang tahun, minta dekat jendela"></label>
   ${id && r.status === 'booked' ? `<div class="row2"><button class="btn ghost" onclick="App.resStatus('${id}','noshow')">Tidak datang</button><button class="btn ghost danger" onclick="App.resStatus('${id}','cancel')">Batalkan</button></div>` : ''}
   ${id && r.status !== 'booked' ? `<button class="btn ghost blk" onclick="App.resStatus('${id}','booked')">Kembalikan ke “Dipesan”</button>` : ''}
   <button class="btn blk lg mt" onclick="App.saveRes('${id}')">Simpan</button>`);
  S.resEdit = id; resTables();
}
/** Isi pilihan meja; tandai meja yang sudah dipesan ±2 jam dari jam ini. */
function resTables() {
  const sel = $('#rvM'); if (!sel) return;
  const d = $('#rvD').value, tm = $('#rvT').value, cur = sel.value || sel.dataset.cur;
  const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
  const clash = (tid: string) => D.reservations.some((x: any) => x.id !== S.resEdit && x.tableId === tid && x.date === d && x.status === 'booked' && Math.abs(toMin(x.time) - toMin(tm)) < 120);
  sel.innerHTML = `<option value="">— Belum ditentukan —</option>` + D.tables.map((t: any) => `<option value="${t.id}" ${t.id === cur ? 'selected' : ''}>Meja ${esc(t.name)} · ${t.seats} kursi${clash(t.id) ? ' (sudah dipesan jam berdekatan)' : ''}</option>`).join('');
}
async function saveRes(id: string) {
  const r: any = { name: $('#rvN').value.trim(), phone: $('#rvP').value.trim(), date: $('#rvD').value, time: $('#rvT').value, pax: +$('#rvX').value || 1, tableId: $('#rvM').value, note: $('#rvO').value.trim() };
  if (!r.name) return toast('Nama tamu wajib diisi', 'err');
  if (!r.date || !r.time) return toast('Tanggal & jam wajib diisi', 'err');
  closeSheet(); S.resDate = r.date;
  if (id) await run(() => updRow('reservations', id, r), 'Reservasi disimpan');
  else await run(() => addRow('reservations', { ...r, status: 'booked', createdAt: new Date().toISOString(), by: byName() }), 'Reservasi dicatat');
}
async function resStatus(id: string, status: string) { closeSheet(); await run(() => updRow('reservations', id, { status }), 'Status diperbarui'); }
async function resSeat(id: string) {
  const r = D.reservations.find((x: any) => x.id === id); if (!r) return;
  const busy = r.tableId && D.orders.find((o: any) => o.status === 'open' && o.tableId === r.tableId);
  if (busy && !(await ask(`Meja ${esc(tableName(r.tableId))} masih terisi`, `Pesanan #${busy.no} belum dibayar. Tetap dudukkan tamu tanpa meja? (pilih meja di kasir)`, 'Lanjut'))) return;
  await run(() => updRow('reservations', id, { status: 'seated' }));
  newCart({ type: 'dine', tableId: busy ? '' : r.tableId, guest: r.name, pax: r.pax, reservationId: r.id });
  toast(`Silakan catat pesanan ${esc(r.name)}`); go('pos');
}
function resWA(id: string) {
  const r = D.reservations.find((x: any) => x.id === id); if (!r) return;
  const msg = `Halo ${r.name}, reservasi Anda di *${shopName()}* sudah kami catat:\n📅 ${fDay(r.date + 'T00:00:00')}\n🕖 Pukul ${r.time}\n👥 ${r.pax} orang${r.tableId ? `\n🪑 Meja ${tableName(r.tableId)}` : ''}\n\nSampai jumpa! 🙏`;
  window.open(`https://wa.me/${waNum(r.phone)}?text=${encodeURIComponent(msg)}`, '_blank');
}

reg({ kLine, bump, recallOrder, setStation, toggleMute, testSound, fullscreen, queueAll, resDay, resForm, resTables, saveRes, resStatus, resSeat, resWA });
void rp;
