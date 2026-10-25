/* GET /api/menu?r=<realmId>&k=<kunci QR>&t=<tableId> → menu terbaru untuk halaman pesan mandiri. */
import { handle, send, qp, restaurant, list, rateLimit, HttpError } from './_lib.js';

export default handle(async (req, res) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Metode tidak didukung.');
  rateLimit(req, 60);
  const { r, k, t } = qp(req);
  const s = await restaurant(r, k);
  const [cats, items, tables] = await Promise.all([list('categories', { realmId: r }), list('items', { realmId: r }), list('dtables', { realmId: r })]);
  const table = tables.find((x) => x.id === t);
  const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.name).localeCompare(String(b.name), 'id', { numeric: true });
  send(res, 200, {
    resto: { name: s.name, logo: s.logo || '', color: s.color || '#ea580c', address: s.address || '', phone: s.phone || '', taxPct: s.taxPct || 0, servicePct: s.servicePct || 0 },
    table: table ? { id: table.id, name: table.name } : null,
    categories: cats.sort(bySort).map((c) => ({ id: c.id, name: c.name, icon: c.icon || '' })),
    items: items.sort(bySort).map((i) => ({ id: i.id, name: i.name, price: i.price, icon: i.icon || '', photo: i.photo || '', categoryId: i.categoryId, available: i.available !== false })),
  });
});
