/* Ekspor data Fara Wash ke Excel (.xlsx, banyak sheet), CSV, atau TSV (tempel ke Google Sheets).
   Penulis XLSX mini tanpa dependensi besar — hanya memakai fflate untuk zip. */
import { zipSync, strToU8 } from 'fflate';

export type ColType = 's' | 'n' | 'd' | 'dt';
export interface Col<T = any> { h: string; t: ColType; w?: number; v: (r: T) => any }
export interface Dataset { key: string; name: string; cols: Col[]; rows: any[] }

const pad = (n: number) => String(n).padStart(2, '0');
const xmlEsc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  // buang karakter kontrol yang tidak valid di XML
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const toDate = (v: any) => (v instanceof Date ? v : v ? new Date(v) : null);
const valid = (d: Date | null) => !!d && !isNaN(d.getTime());

/** Nilai tanggal Excel (serial) dari waktu lokal. */
function excelSerial(d: Date) {
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  return (utc - Date.UTC(1899, 11, 30)) / 864e5;
}
function colName(i: number) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

/** Format teks untuk CSV/TSV (tanggal ISO agar dikenali Google Sheets & Excel). */
export function plain(v: any, t: ColType) {
  if (v == null || v === '') return '';
  if (t === 'd' || t === 'dt') {
    const d = toDate(v); if (!valid(d)) return '';
    const s = `${d!.getFullYear()}-${pad(d!.getMonth() + 1)}-${pad(d!.getDate())}`;
    return t === 'dt' ? `${s} ${pad(d!.getHours())}:${pad(d!.getMinutes())}` : s;
  }
  if (t === 'n') return String(Math.round(Number(v) * 100) / 100);
  return String(v);
}

export function toCSV(ds: Dataset, sep = ',') {
  const q = (s: string) => (/[",\n\r;\t]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
  const lines = [ds.cols.map((c) => q(c.h)).join(sep)];
  for (const r of ds.rows) lines.push(ds.cols.map((c) => q(plain(c.v(r), c.t))).join(sep));
  return '﻿' + lines.join('\r\n');
}

/** TSV untuk ditempel langsung ke Google Sheets / Excel. */
export function toTSV(ds: Dataset) {
  const clean = (s: string) => s.replace(/[\t\r\n]+/g, ' ');
  return [ds.cols.map((c) => c.h).join('\t'), ...ds.rows.map((r) => ds.cols.map((c) => clean(plain(c.v(r), c.t))).join('\t'))].join('\n');
}

function sheetXml(ds: Dataset) {
  const S = { head: 1, num: 2, date: 3, dt: 4, text: 0 };
  const nCols = ds.cols.length, last = colName(nCols - 1), nRows = ds.rows.length + 1;
  const cols = ds.cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.w || (c.t === 'dt' ? 17 : c.t === 'd' ? 12 : c.t === 'n' ? 13 : 18)}" customWidth="1"/>`).join('');
  const head = `<row r="1">${ds.cols.map((c, i) => `<c r="${colName(i)}1" t="inlineStr" s="${S.head}"><is><t>${xmlEsc(c.h)}</t></is></c>`).join('')}</row>`;
  const body = ds.rows.map((r, ri) => {
    const rn = ri + 2;
    return `<row r="${rn}">${ds.cols.map((c, ci) => {
      const ref = colName(ci) + rn, v = c.v(r);
      if (v == null || v === '') return '';
      if (c.t === 'n') { const n = Number(v); return isFinite(n) ? `<c r="${ref}" s="${S.num}"><v>${n}</v></c>` : ''; }
      if (c.t === 'd' || c.t === 'dt') { const d = toDate(v); return valid(d) ? `<c r="${ref}" s="${c.t === 'd' ? S.date : S.dt}"><v>${excelSerial(d!)}</v></c>` : ''; }
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(String(v))}</t></is></c>`;
    }).join('')}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="16"/><cols>${cols}</cols><sheetData>${head}${body}</sheetData>
${nRows > 1 ? `<autoFilter ref="A1:${last}${nRows}"/>` : ''}</worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="dd/mm/yyyy hh:mm"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** Buat file .xlsx berisi satu sheet per dataset. */
export function toXLSX(sets: Dataset[], headColor = '2563EB'): Uint8Array {
  const used = new Set<string>();
  const names = sets.map((s) => {
    let n = s.name.replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31) || 'Sheet'; let k = 2;
    while (used.has(n.toLowerCase())) n = n.slice(0, 28) + ' ' + k++;
    used.add(n.toLowerCase()); return n;
  });
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>
${names.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
<definedNames>${sets.map((s, i) => (s.rows.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xmlEsc(names[i]).replace(/'/g, "''")}'!$A$1:$${colName(s.cols.length - 1)}$${s.rows.length + 1}</definedName>` : '')).join('')}</definedNames></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${sets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(STYLES.replace('FF2563EB', 'FF' + headColor.replace('#', '').toUpperCase().padEnd(6, '0').slice(0, 6))),
  };
  sets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s))));
  return zipSync(files, { level: 6 });
}

/** Zip beberapa CSV menjadi satu file. */
export function zipCSV(sets: Dataset[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const s of sets) files[s.name.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_').toLowerCase() + '.csv'] = strToU8(toCSV(s));
  return zipSync(files, { level: 6 });
}
