/* GET /api/status?r=&k=&o=<orderId> → status pesanan untuk ditampilkan di HP pelanggan. */
import { handle, send, qp, restaurant, getOne, rateLimit, HttpError, ID } from './_lib.js';

export default handle(async (req, res) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Metode tidak didukung.');
  rateLimit(req, 60);
  const { r, k, o } = qp(req);
  await restaurant(r, k);
  const ord = ID.test(String(o || '')) ? await getOne('orders', o) : null;
  if (!ord || ord.realmId !== r) throw new HttpError(404, 'Pesanan tidak ditemukan.');
  send(res, 200, { no: ord.no, status: ord.status, pending: !!ord.qrPending, total: ord.total,
    lines: (ord.lines || []).filter((l) => l.by === 'qr' && l.status !== 'void').map((l) => ({ name: l.name, qty: l.qty, status: l.status })) });
});
