/* We POS — server kecil untuk Pesan Mandiri (QR meja).
   Berjalan sebagai Vercel Serverless Function. Membaca & menulis data restoran lewat Dexie Cloud REST API
   memakai kunci klien (client credentials) yang HANYA disimpan di environment server:
     DEXIE_CLOUD_DB_URL        mis. https://xxxxxxxx.dexie.cloud   (boleh juga PUBLIC_DEXIE_CLOUD_URL)
     DEXIE_CLOUD_CLIENT_ID     dari file dexie-cloud.key
     DEXIE_CLOUD_CLIENT_SECRET dari file dexie-cloud.key
   Berkas berawalan "_" tidak dijadikan endpoint oleh Vercel. */

const DB = () => String(process.env.DEXIE_CLOUD_DB_URL || process.env.PUBLIC_DEXIE_CLOUD_URL || '').replace(/\/$/, '');
let tok = null;

export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

async function token() {
  if (tok && tok.exp > Date.now() + 60_000) return tok.value;
  const db = DB(), id = process.env.DEXIE_CLOUD_CLIENT_ID, secret = process.env.DEXIE_CLOUD_CLIENT_SECRET;
  if (!/^https?:\/\//.test(db) || !id || !secret) throw new HttpError(503, 'Pesan lewat QR belum diaktifkan di server (kunci Dexie Cloud belum diisi).');
  const r = await fetch(db + '/token', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', scopes: ['ACCESS_DB', 'GLOBAL_READ', 'GLOBAL_WRITE'], client_id: id, client_secret: secret }) });
  if (!r.ok) throw new HttpError(502, 'Gagal terhubung ke database (' + r.status + ')');
  const j = await r.json();
  tok = { value: j.accessToken, exp: j.accessTokenExpiration ? new Date(decode(j.accessTokenExpiration)).getTime() : Date.now() + 50 * 60_000 };
  return tok.value;
}
/** Buka encoding tipe khusus Dexie Cloud ({"$t":"Date","v":...}) menjadi nilai biasa. */
function decode(v) {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') {
    if ('$t' in v && 'v' in v) return v.v;
    const o = {}; for (const k in v) o[k] = decode(v[k]); return o;
  }
  return v;
}
export async function list(table, query) {
  const qs = new URLSearchParams(query).toString();
  const r = await fetch(`${DB()}/all/${encodeURIComponent(table)}?${qs}`, { headers: { Authorization: 'Bearer ' + (await token()), Accept: 'application/json' } });
  if (!r.ok) throw new HttpError(502, `Gagal membaca ${table} (${r.status})`);
  const j = decode(await r.json());
  return Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : [];
}
export async function getOne(table, id) {
  const r = await fetch(`${DB()}/all/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, { headers: { Authorization: 'Bearer ' + (await token()), Accept: 'application/json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new HttpError(502, `Gagal membaca ${table} (${r.status})`);
  return decode(await r.json());
}
export async function upsert(table, obj) {
  const r = await fetch(`${DB()}/all/${encodeURIComponent(table)}`, { method: 'POST',
    headers: { Authorization: 'Bearer ' + (await token()), 'Content-Type': 'application/json' }, body: JSON.stringify([obj]) });
  if (!r.ok) throw new HttpError(502, `Gagal menyimpan ${table} (${r.status})`);
}
/** Id baru untuk tabel "@id" Dexie Cloud: awalan 3 huruf + acak (format yang dipakai klien Dexie Cloud). */
export function newId(prefix) {
  const A = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const a = new Uint8Array(22); crypto.getRandomValues(a);
  return prefix + [...a].map((x) => A[x % A.length]).join('');
}

/** ID Dexie Cloud berbentuk mis. "rlm0Q5o|FTLReEC…" (ada garis tegak), jadi izinkan | dan . selain huruf/angka/_/-. */
export const ID = /^[\w|.-]{4,120}$/;
/** Ambil & validasi restoran dari parameter r (realm) + k (kunci QR). */
export async function restaurant(r, k) {
  if (!ID.test(String(r || '')) || !/^[\w-]{8,64}$/.test(String(k || ''))) throw new HttpError(400, 'Kode QR tidak valid.');
  const st = (await list('settings', { realmId: r })).find((s) => s.kds !== undefined);
  if (!st) throw new HttpError(404, 'Restoran tidak ditemukan.');
  if (!st.selfOrder || st.selfKey !== k) throw new HttpError(403, 'Kode QR ini sudah tidak berlaku. Minta menu terbaru ke kasir.');
  return st;
}
export function calcTotals(lines, discount, s) {
  const subtotal = lines.filter((l) => l.status !== 'void').reduce((a, l) => a + l.price * l.qty, 0);
  const disc = Math.min(subtotal, Math.round(discount || 0)), base = subtotal - disc;
  const service = Math.round((base * (s.servicePct || 0)) / 100), tax = Math.round(((base + service) * (s.taxPct || 0)) / 100);
  return { subtotal, discount: disc, service, tax, total: base + service + tax };
}

/* ---------- HTTP ---------- */
const hits = new Map();
export function rateLimit(req, max = 20, windowMs = 60_000) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '?').split(',')[0].trim();
  const now = Date.now(), h = (hits.get(ip) || []).filter((t) => now - t < windowMs); h.push(now); hits.set(ip, h);
  if (h.length > max) throw new HttpError(429, 'Terlalu banyak permintaan. Coba lagi sebentar.');
}
export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = []; for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString('utf8'); if (s.length > 20_000) throw new HttpError(413, 'Data terlalu besar.');
  return JSON.parse(s || '{}');
}
export function send(res, status, data) {
  res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}
export function handle(fn) {
  return async (req, res) => {
    try { await fn(req, res); }
    catch (e) { const st = e instanceof HttpError ? e.status : 500; if (st === 500) console.error(e); send(res, st, { error: e.message || 'Terjadi kesalahan.' }); }
  };
}
export const qp = (req) => (req.query && Object.keys(req.query).length ? req.query : Object.fromEntries(new URL(req.url, 'http://x').searchParams));
