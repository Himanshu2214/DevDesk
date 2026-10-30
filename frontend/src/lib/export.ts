// Export tables as Excel (.xlsx) or CSV, entirely in the browser.
// The .xlsx writer is a minimal Office Open XML workbook (inline strings, one header row with frozen pane and filter)
// packed into an uncompressed zip, so no spreadsheet library is needed.

export type Cell = string | number | null | undefined;
export interface Column { header: string; width?: number }
export interface Sheet { name: string; columns: Column[]; rows: Cell[][] }

/* ---------- CSV ---------- */
/** Text that Excel would run as a formula is prefixed with ' (CSV injection) */
const safeText = (s: string) => (/^[=+\-@\t\r]/.test(s) ? "'" + s : s);
const csvCell = (c: Cell) => {
  if (c === null || c === undefined) return '';
  if (typeof c === 'number') return String(c);
  const s = safeText(c);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
/** CSV with a byte order mark so Excel opens UTF-8 (₹, ä, …) correctly */
export function toCsv(sheet: Sheet): string {
  return '﻿' + [sheet.columns.map(c => csvCell(c.header)), ...sheet.rows.map(r => r.map(csvCell))].map(r => r.join(',')).join('\r\n') + '\r\n';
}

/* ---------- XLSX ---------- */
const xml = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (i: number) => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s };
const xCell = (c: Cell, ref: string, style = 0) => {
  if (c === null || c === undefined || c === '') return '';
  if (typeof c === 'number' && Number.isFinite(c)) return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${c}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${xml(String(c))}</t></is></c>`;
};
function sheetXml(s: Sheet): string {
  const last = colName(Math.max(0, s.columns.length - 1)) + (s.rows.length + 1);
  const cols = s.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 14}" customWidth="1"/>`).join('');
  const head = `<row r="1">${s.columns.map((c, i) => xCell(c.header, colName(i) + 1, 1)).join('')}</row>`;
  const body = s.rows.map((r, ri) => `<row r="${ri + 2}">${r.map((c, ci) => xCell(c, colName(ci) + (ri + 2))).join('')}</row>`).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + `<cols>${cols}</cols><sheetData>${head}${body}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`;
}
/** Sheet names: max 31 characters, no []:*?/\ and unique */
const sheetNames = (sheets: Sheet[]) => {
  const seen = new Set<string>();
  return sheets.map((s, i) => {
    let n = s.name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || `Sheet${i + 1}`;
    while (seen.has(n.toLowerCase())) n = n.slice(0, 28) + ' ' + (i + 1);
    seen.add(n.toLowerCase()); return n;
  });
};

export function toXlsx(sheets: Sheet[]): Blob {
  const names = sheetNames(sheets);
  const files: [string, string][] = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '</Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + names.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>'
      + `<definedNames>${names.map((n, i) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(n.replace(/'/g, "''"))}'!$A$1:$${colName(Math.max(0, sheets[i].columns.length - 1))}$${sheets[i].rows.length + 1}</definedName>`).join('')}</definedNames></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    // style 1 = bold header with a light fill
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8ECF4"/></patternFill></fill></fills>'
      + '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>'
      + '<cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>'],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)] as [string, string]),
  ];
  return new Blob([zip(files) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* ---------- uncompressed zip ---------- */
let CRC: Uint32Array | null = null;
function crc32(b: Uint8Array) {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0 } }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
export function zip(files: [string, string][]): Uint8Array {
  const enc = new TextEncoder(), parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const n = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const local = new Uint8Array(30 + n.length), v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true);          // UTF-8 names, stored
    v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true); v.setUint16(26, n.length, true);
    local.set(n, 30);
    const cen = new Uint8Array(46 + n.length), w = new DataView(cen.buffer);
    w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0x0800, true);
    w.setUint32(16, crc, true); w.setUint32(20, data.length, true); w.setUint32(24, data.length, true); w.setUint16(28, n.length, true); w.setUint32(42, offset, true);
    cen.set(n, 46);
    parts.push(local, data); central.push(cen); offset += local.length + data.length;
  }
  const size = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, offset, true);
  const out = new Uint8Array(offset + size + 22);
  let p = 0; for (const a of [...parts, ...central, end]) { out.set(a, p); p += a.length }
  return out;
}

/* ---------- download ---------- */
export function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type ExportFormat = 'xlsx' | 'csv';
/** Downloads the sheets as <base>-<YYYY-MM-DD>.xlsx, or the first sheet as CSV */
export function exportSheets(sheets: Sheet[], base: string, format: ExportFormat) {
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'csv') download(new Blob([toCsv(sheets[0])], { type: 'text/csv;charset=utf-8' }), `${base}-${stamp}.csv`);
  else download(toXlsx(sheets), `${base}-${stamp}.xlsx`);
}
