import { describe, expect, it } from 'vitest';
import { type Sheet, toCsv, toXlsx, zip } from '../src/lib/export';

const sheet: Sheet = { name: 'Tickets', columns: [{ header: 'Ticket' }, { header: 'Title' }, { header: 'Hours' }],
  rows: [['TK-1001', 'Price, "net" & tax', 1.5], ['TK-1002', '=HYPERLINK("x")', null], ['TK-1003', 'Line\nbreak ₹', 0]] };

/** reads the stored (uncompressed) entries back out of a zip */
function unzip(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset), dec = new TextDecoder(), out: Record<string, string> = {};
  for (let p = 0; v.getUint32(p, true) === 0x04034b50;) {
    const size = v.getUint32(p + 18, true), nameLen = v.getUint16(p + 26, true);
    const name = dec.decode(bytes.subarray(p + 30, p + 30 + nameLen));
    out[name] = dec.decode(bytes.subarray(p + 30 + nameLen, p + 30 + nameLen + size));
    p += 30 + nameLen + size;
  }
  return out;
}

describe('CSV export', () => {
  const csv = toCsv(sheet);
  it('starts with a BOM so Excel reads UTF-8', () => expect(csv.charCodeAt(0)).toBe(0xFEFF));
  it('quotes commas, quotes and line breaks', () => {
    expect(csv).toContain('"Price, ""net"" & tax"');
    expect(csv).toContain('"Line\nbreak ₹"');
  });
  it('neutralises formulas', () => expect(csv).toContain(`"'=HYPERLINK(""x"")"`));
  it('keeps numbers and empty cells', () => expect(csv.split('\r\n')[1]).toBe('TK-1001,"Price, ""net"" & tax",1.5'));
});

describe('Excel export', () => {
  it('writes a valid zip with the workbook parts', async () => {
    const files = unzip(new Uint8Array(await toXlsx([sheet]).arrayBuffer()));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']));
    const ws = files['xl/worksheets/sheet1.xml'];
    expect(ws).toContain('<c r="C2"><v>1.5</v></c>');
    expect(ws).toContain('Price, &quot;net&quot; &amp; tax');
    expect(ws).toContain('<autoFilter ref="A1:C4"/>');
    expect(ws).not.toContain('r="C3"');                                                 // empty cell left out
  });
  it('makes sheet names valid and unique', async () => {
    const files = unzip(new Uint8Array(await toXlsx([{ ...sheet, name: 'a/b' }, { ...sheet, name: 'A B' }]).arrayBuffer()));
    expect(files['xl/workbook.xml']).toMatch(/name="a b".*name="A B 2"/);
  });
  it('stores CRCs the zip format expects', () => {
    const z = zip([['a.txt', 'hello']]);
    expect(new DataView(z.buffer).getUint32(14, true)).toBe(0x3610a686);                // crc32("hello")
  });
});
