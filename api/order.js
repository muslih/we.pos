/* POST /api/order  { r, k, t, guest, note, day, lines: [{ itemId, qty, note }] }
   Membuat pesanan baru untuk meja (atau menambah ke pesanan meja yang masih terbuka).
   Harga & nama selalu diambil dari database — bukan dari HP pelanggan. */
import { handle, send, restaurant, list, upsert, newId, calcTotals, readBody, rateLimit, HttpError } from './_lib.js';

const clean = (s, n) => String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const pad = (n) => String(n).padStart(2, '0');

export default handle(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Metode tidak didukung.');
  rateLimit(req, 8);
  const b = await readBody(req);
  const s = await restaurant(b.r, b.k);
  const r = b.r;
  const [items, tables] = await Promise.all([list('items', { realmId: r }), list('dtables', { realmId: r })]);
  const table = tables.find((x) => x.id === b.t);
  if (!table) throw new HttpError(404, 'Meja tidak ditemukan. Scan ulang QR di meja Anda.');
  const want = Array.isArray(b.lines) ? b.lines.slice(0, 40) : [];
  if (!want.length) throw new HttpError(400, 'Pesanan masih kosong.');

  // tanggal lokal restoran dari HP pelanggan (dibatasi ±1 hari dari waktu server)
  const now = new Date(), day = /^\d{4}-\d{2}-\d{2}$/.test(b.day || '') && Math.abs(new Date(b.day + 'T12:00:00Z') - now) < 2 * 864e5 ? b.day : now.toISOString().slice(0, 10);
  const auto = s.selfAuto !== false && s.kds !== false ? 'cook' : s.selfAuto !== false ? 'served' : 'new';
  const iso = now.toISOString();
  const lines = [];
  for (const w of want) {
    const it = items.find((i) => i.id === w.itemId);
    if (!it) throw new HttpError(409, 'Ada menu yang sudah tidak tersedia. Muat ulang halaman.');
    if (it.available === false) throw new HttpError(409, `${it.name} sedang habis.`);
    const qty = Math.max(1, Math.min(50, Math.round(+w.qty || 0)));
    lines.push({ key: newId('ln').slice(0, 14), itemId: it.id, name: it.name, price: it.price, qty, note: clean(w.note, 120), station: it.station || 'dapur',
      status: auto, round: 0, ...(auto !== 'new' ? { sentAt: iso } : {}), ...(auto === 'served' ? { readyAt: iso } : {}), by: 'qr' });
  }
  const guest = clean(b.guest, 40), note = clean(b.note, 160);

  // Tambah ke pesanan meja yang masih terbuka, atau buat pesanan baru
  const open = (await list('orders', { realmId: r, status: 'open' })).filter((o) => o.tableId === table.id && o.type === 'dine')
    .sort((a, c) => String(c.createdAt).localeCompare(String(a.createdAt)))[0];
  let order;
  if (open) {
    const round = (open.round || 0) + 1;
    const all = [...(open.lines || []), ...lines.map((l) => ({ ...l, round }))];
    const discount = open.discountPct ? Math.round((all.filter((l) => l.status !== 'void').reduce((a, l) => a + l.price * l.qty, 0) * open.discountPct) / 100) : open.discount || 0;
    order = { ...open, lines: all, round, ...calcTotals(all, discount, s), guest: open.guest || guest, note: [open.note, note].filter(Boolean).join(' · '),
      source: open.source || 'qr', qrPending: auto === 'new' ? true : open.qrPending || false, qrAt: iso };
  } else {
    const today = await list('orders', { realmId: r, day });
    const no = 1 + today.reduce((m, o) => Math.max(m, o.no || 0), 0);
    const ls = lines.map((l) => ({ ...l, round: 1 }));
    const d = new Date(day + 'T12:00:00Z');
    order = { id: newId('ord'), realmId: r, code: `${s.prefix || 'WP'}${String(d.getUTCFullYear()).slice(2)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${String(no).padStart(3, '0')}`,
      no, day, type: 'dine', tableId: table.id, guest, pax: 0, lines: ls, round: 1, ...calcTotals(ls, 0, s), discountPct: 0, status: 'open', payments: [], note,
      createdAt: iso, createdBy: `QR Meja ${table.name}`, reservationId: '', source: 'qr', qrPending: auto === 'new', qrAt: iso };
  }
  await upsert('orders', order);
  send(res, 200, { ok: true, orderId: order.id, no: order.no, pending: auto === 'new', total: order.total });
});
