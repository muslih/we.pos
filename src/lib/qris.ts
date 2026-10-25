/* QRIS statis → QRIS dinamis (nominal otomatis).
   Logika mengikuti pustaka MIT "Qris-Dinamis" oleh razisek (https://github.com/razisek/Qris-Dinamis):
   ubah tag 01 menjadi "12" (dinamis), sisipkan tag 54 (nominal) [+ 55/56/57 biaya layanan] sebelum tag 58,
   lalu hitung ulang CRC16-CCITT (tag 63). Di sini ditulis ulang dengan parser TLV agar lebih aman. */

export interface Tlv { tag: string; value: string }

/** CRC-16/CCITT-FALSE (poly 0x1021, awal 0xFFFF) — dipakai standar EMV/QRIS. */
export function crc16(str: string) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
export function parse(str: string): Tlv[] {
  const out: Tlv[] = []; let i = 0;
  while (i < str.length) {
    const tag = str.slice(i, i + 2), len = parseInt(str.slice(i + 2, i + 4), 10);
    if (!/^\d{2}$/.test(tag) || isNaN(len)) throw new Error('Format QRIS tidak dikenali');
    out.push({ tag, value: str.slice(i + 4, i + 4 + len) }); i += 4 + len;
  }
  return out;
}
const enc = (t: Tlv[]) => t.map((x) => x.tag + String(x.value.length).padStart(2, '0') + x.value).join('');

/** Periksa string QRIS: diawali 000201, ada tag 63 dengan CRC yang benar. */
export function isQris(str: string) {
  str = String(str || '').trim();
  if (!str.startsWith('000201') || !/6304[0-9A-Fa-f]{4}$/.test(str)) return false;
  return crc16(str.slice(0, -4)) === str.slice(-4).toUpperCase();
}
/** Info singkat dari QRIS: nama merchant (59), kota (60), statis/dinamis (01), NMID bila ada. */
export function info(str: string) {
  const t = parse(str.trim()), get = (k: string) => t.find((x) => x.tag === k)?.value || '';
  let nmid = '';
  for (const x of t) if (+x.tag >= 26 && +x.tag <= 51) { try { const id = parse(x.value).find((y) => y.tag === '02' && /^ID\d+/.test(y.value)); if (id) { nmid = id.value; break; } } catch {} }
  return { merchant: get('59').trim(), city: get('60').trim(), dynamic: get('01') === '12', nmid };
}
/**
 * Buat QRIS dinamis dengan nominal tertentu.
 * fee: biaya layanan opsional — { type: 'rp', value } (tag 55=02 + 56) atau { type: 'pct', value } (tag 55=03 + 57).
 */
export function toDynamic(staticQris: string, amount: number, fee?: { type: 'rp' | 'pct'; value: number }) {
  const src = String(staticQris || '').trim();
  if (!isQris(src)) throw new Error('Kode QRIS tidak valid');
  const n = Math.round(amount);
  if (!(n > 0)) throw new Error('Nominal harus lebih dari 0');
  let t = parse(src.slice(0, -8)).filter((x) => !['54', '55', '56', '57', '63'].includes(x.tag)); // buang nominal/biaya lama & CRC
  t = t.map((x) => (x.tag === '01' ? { ...x, value: '12' } : x));
  const add: Tlv[] = [{ tag: '54', value: String(n) }];
  if (fee && fee.value > 0) add.push(fee.type === 'rp' ? { tag: '55', value: '02' } : { tag: '55', value: '03' }, fee.type === 'rp' ? { tag: '56', value: String(Math.round(fee.value)) } : { tag: '57', value: String(fee.value) });
  const at = t.findIndex((x) => +x.tag > 54);
  t.splice(at < 0 ? t.length : at, 0, ...add);
  const body = enc(t) + '6304';
  return body + crc16(body);
}
