/* Grafik laporan Fara Wash — SVG/HTML ringan tanpa library.
   Spesifikasi mengikuti skill dataviz: 1 sumbu, garis 2px, kolom ≤24px dengan ujung membulat 4px
   (rata di baseline), grid hairline solid, label selektif, tooltip + tabel sebagai pendamping. */

export const C = {
  s1: '#c4501e', // seri 1 (biru) — pemasukan / nilai utama
  s2: '#7a8594', // seri 2 (oranye) — pengeluaran
  neg: '#a3301f', // kutub negatif diverging (rugi)
  ord: ['#ecc9b3', '#dd9a72', '#c4501e', '#94391a', '#5e2410'], // ramp ordinal (tahapan status)
  grid: '#e9ebee', axis: '#d3d7dc', mut: '#858a91', ink: '#18191b', surface: '#ffffff',
};

export interface Pt { label: string; full: string; values: number[] }
export interface Series { name: string; color: string }

const W = 340, H = 196, PL = 44, PR = 10, PT = 12, PB = 26;
const PW = W - PL - PR, PH = H - PT - PB;
const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Rupiah ringkas untuk sumbu: 0, 250rb, 1,2jt */
export function compact(n: number) {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e9) return s + (a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + 'M';
  if (a >= 1e6) return s + (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + 'jt';
  if (a >= 1e3) return s + Math.round(a / 1e3).toLocaleString('id-ID') + 'rb';
  return s + Math.round(a).toLocaleString('id-ID');
}
function niceStep(range: number, count: number) {
  const raw = range / count, p = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
function scale(min: number, max: number) {
  if (max === min) max = min + 1;
  const step = niceStep(max - min, 4);
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks: number[] = []; for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { lo, hi, ticks, y: (v: number) => PT + PH - ((v - lo) / (hi - lo)) * PH };
}
function axes(sc: ReturnType<typeof scale>, labels: string[], xs: number[], money: boolean) {
  const every = Math.max(1, Math.ceil(labels.length / 7));
  const grid = sc.ticks.map((t) => `<line x1="${PL}" x2="${W - PR}" y1="${sc.y(t)}" y2="${sc.y(t)}" stroke="${t === 0 ? C.axis : C.grid}" stroke-width="1"/>
    <text x="${PL - 6}" y="${sc.y(t) + 3.5}" text-anchor="end" class="tk">${money ? compact(t) : Math.round(t).toLocaleString('id-ID')}</text>`).join('');
  const n = labels.length;
  const xl = labels.map((l, i) => (i % every === 0 || (i === n - 1 && (n - 1) % every >= Math.ceil(every / 2)))
    ? `<text x="${xs[i]}" y="${H - 8}" text-anchor="middle" class="tk">${esc(l)}</text>` : '').join('');
  return grid + xl;
}
const meta = (kind: string, n: number, xs: number[], extra = '') => `data-kind="${kind}" data-n="${n}" data-xs="${xs.map((x) => x.toFixed(1)).join(',')}" ${extra}`;

/** Garis (1–2 seri, satuan sama → satu sumbu). */
export function lineChart(pts: Pt[], series: Series[], o: { money?: boolean; area?: boolean } = {}) {
  const n = pts.length; if (!n) return '';
  const all = pts.flatMap((p) => p.values);
  const sc = scale(Math.min(0, ...all), Math.max(...all, 1));
  const xs = pts.map((_, i) => PL + (n === 1 ? PW / 2 : (i / (n - 1)) * PW));
  const paths = series.map((s, si) => {
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)},${sc.y(p.values[si]).toFixed(1)}`).join('');
    const area = o.area && series.length === 1 ? `<path d="${d}L${xs[n - 1]},${sc.y(Math.max(sc.lo, 0))}L${xs[0]},${sc.y(Math.max(sc.lo, 0))}Z" fill="${s.color}" opacity=".1"/>` : '';
    const last = pts[n - 1].values[si];
    return `${area}<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${xs[n - 1]}" cy="${sc.y(last)}" r="4" fill="${s.color}" stroke="${C.surface}" stroke-width="2"/>`;
  }).join('');
  const dots = series.map((s, si) => `<circle class="hd" data-s="${si}" r="4.5" fill="${s.color}" stroke="${C.surface}" stroke-width="2" cx="-20" cy="-20"/>`).join('');
  const ys = series.map((_, si) => pts.map((p) => sc.y(p.values[si]).toFixed(1)).join(',')).join('|');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" ${meta('line', n, xs, `data-ys="${ys}"`)} role="img">
    ${axes(sc, pts.map((p) => p.label), xs, !!o.money)}
    <line class="xh" x1="-10" x2="-10" y1="${PT}" y2="${PT + PH}" stroke="${C.axis}" stroke-width="1"/>
    ${paths}${dots}
    <rect x="${PL - 6}" y="${PT}" width="${PW + 12}" height="${PH + PB}" fill="transparent" class="hit"/></svg>`;
}

/** Kolom 1 seri; diverging=true → nilai negatif memakai warna kutub negatif. */
export function columnChart(pts: Pt[], color: string, o: { money?: boolean; diverging?: boolean } = {}) {
  const n = pts.length; if (!n) return '';
  const vals = pts.map((p) => p.values[0]);
  const sc = scale(Math.min(0, ...vals), Math.max(0, ...vals, 1));
  const band = PW / n, bw = Math.max(2, Math.min(24, band * 0.62));
  const xs = pts.map((_, i) => PL + band * i + band / 2);
  const y0 = sc.y(0);
  const bars = vals.map((v, i) => {
    if (!v) return '';
    const yv = sc.y(v), x = xs[i] - bw / 2, h = Math.abs(y0 - yv), r = Math.min(4, bw / 2, h);
    const fill = o.diverging && v < 0 ? C.neg : color;
    const d = v >= 0
      ? `M${x},${y0}V${yv + r}Q${x},${yv} ${x + r},${yv}H${x + bw - r}Q${x + bw},${yv} ${x + bw},${yv + r}V${y0}Z`
      : `M${x},${y0}V${yv - r}Q${x},${yv} ${x + r},${yv}H${x + bw - r}Q${x + bw},${yv} ${x + bw},${yv - r}V${y0}Z`;
    return `<path class="bar" data-i="${i}" d="${d}" fill="${fill}"/>`;
  }).join('');
  // label selektif: nilai tertinggi saja
  const mi = vals.indexOf(Math.max(...vals));
  const top = vals[mi] > 0 ? `<text x="${xs[mi]}" y="${sc.y(vals[mi]) - 5}" text-anchor="middle" class="vl">${o.money ? compact(vals[mi]) : vals[mi]}</text>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" ${meta('col', n, xs, `data-band="${band.toFixed(1)}"`)} role="img">
    ${axes(sc, pts.map((p) => p.label), xs, !!o.money)}
    <rect class="xb" x="-50" y="${PT}" width="${band}" height="${PH}" fill="${C.grid}" opacity=".6"/>
    ${bars}${top}
    <rect x="${PL}" y="${PT}" width="${PW}" height="${PH + PB}" fill="transparent" class="hit"/></svg>`;
}

/** Batang horizontal (HTML) — label kategori di atas batang, nilai di ujung. */
export function hbars(rows: { label: string; value: number; sub?: string; color?: string }[], o: { money?: boolean; color?: string; empty?: string } = {}) {
  if (!rows.length || rows.every((r) => !r.value)) return `<div class="cempty">${o.empty || 'Belum ada data di periode ini'}</div>`;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const fmt = (v: number) => (o.money ? 'Rp ' + Math.round(v).toLocaleString('id-ID') : Math.round(v).toLocaleString('id-ID'));
  return `<div class="hbars">${rows.map((r) => `<div class="hbr" tabindex="0">
    <div class="hbl"><span>${esc(r.label)}</span><b>${fmt(r.value)}</b></div>
    <div class="hbt"><i style="width:${Math.max(r.value ? 2 : 0, (r.value / max) * 100)}%;background:${r.color || o.color || C.s1}"></i></div>
    ${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</div>`).join('')}</div>`;
}
