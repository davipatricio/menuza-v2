/**
 * Safe CSV serialization for spreadsheet viewers.
 */
export type CsvCellValue = string | number | boolean | null | undefined;

export function sanitizeCsvCell(value: CsvCellValue): string {
  if (value === null || value === undefined) return "";

  let str = String(value);

  // Guard against CSV formula injection (=, +, -, @, tab, CR)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Escape double quotes and enclose within quotes if special chars exist
  if (/[",\n\r]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }

  return str;
}

export interface CsvColumn<T> {
  key: keyof T | string;
  label: string;
  accessor?: (row: T) => CsvCellValue;
}

export function exportToCsv<T extends object>(
  columns: Array<CsvColumn<T>>,
  rows: T[],
  filename: string,
): void {
  const headerLine = columns.map((c) => sanitizeCsvCell(c.label)).join(",");

  const dataLines = rows.map((row) =>
    columns
      .map((col) => {
        if (col.accessor) {
          return sanitizeCsvCell(col.accessor(row));
        }

        const colKey = String(col.key);
        // SAFETY: row is an object, colKey is converted to string for safe index lookup
        const record = row as Record<string, CsvCellValue>;
        const val = record[colKey];

        return sanitizeCsvCell(val);
      })
      .join(","),
  );

  const csvContent = [headerLine, ...dataLines].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
