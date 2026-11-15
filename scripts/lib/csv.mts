export type CsvValue = boolean | number | string | null | undefined;

/**
 * One CSV cell. Text that a spreadsheet would run as a formula (a leading =,
 * +, -, @, tab or CR) gets a leading apostrophe; numbers stay numeric.
 */
export function escapeCsv(value: CsvValue): string {
  if (value === null || value === undefined) return '';

  const rawText = String(value);
  const text =
    typeof value === 'string' && /^[=+\-@\t\r]/.test(value)
      ? `'${value}`
      : rawText;
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(header: string[], rows: CsvValue[][]): string {
  return `${[header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n')}\n`;
}

/**
 * Parse CSV text whose first row names the columns. Quoted cells may contain
 * commas, newlines and doubled quotes; blank lines are skipped.
 */
export function parseCsv(text: string): {
  columns: string[];
  rows: Record<string, string>[];
} {
  const [header = [], ...body] = parseCells(text);
  const columns = header.map((name) => name.trim());
  const rows = body
    .filter((cells) => cells.some((cell) => cell.trim() !== ''))
    .map((cells) =>
      Object.fromEntries(
        columns.map((name, index) => [name, cells[index] ?? '']),
      ),
    );
  return { columns, rows };
}

function parseCells(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char !== '"') {
        cell += char;
      } else if (text[index + 1] === '"') {
        cell += '"';
        index++;
      } else {
        quoted = false;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
