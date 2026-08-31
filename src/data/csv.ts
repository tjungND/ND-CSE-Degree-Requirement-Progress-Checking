// Minimal RFC-4180 CSV parser/serializer — no dependency. Handles what Google's
// "Publish to web" actually emits: quoted fields containing commas AND newlines
// (the sheet's notes column has both), escaped double quotes (""), CRLF line
// endings, a UTF-8 BOM, and trailing blank lines.

export function parseCsv(text: string): string[][] {
  let s = text;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  while (i < s.length) {
    const c = s[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += c;
        i++;
      }
    } else if (c === '"') {
      inQuotes = true;
      i++;
    } else if (c === ',') {
      pushField();
      i++;
    } else if (c === '\r') {
      if (s[i + 1] === '\n') i++;
      pushRow();
      i++;
    } else if (c === '\n') {
      pushRow();
      i++;
    } else {
      field += c;
      i++;
    }
  }
  if (field !== '' || row.length > 0) pushRow();
  // Drop fully blank trailing rows.
  while (rows.length > 0 && rows[rows.length - 1]!.every((f) => f.trim() === '')) rows.pop();
  return rows;
}

export function serializeCsv(rows: string[][]): string {
  const esc = (f: string) =>
    /[",\n\r]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f;
  return rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
}
