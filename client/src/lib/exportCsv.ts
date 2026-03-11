/**
 * exportToCSV — generic CSV export utility.
 * Accepts an array of flat objects and downloads as a .csv file.
 */
export function exportToCSV(rows: Record<string, unknown>[], filename = "export"): void {
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);

  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    // Wrap in quotes if contains comma, newline, or quote
    if (str.includes(",") || str.includes("\n") || str.includes('"')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvLines = [
    headers.map(escape).join(","),
    ...rows.map(row => headers.map(h => escape(row[h])).join(",")),
  ];

  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
