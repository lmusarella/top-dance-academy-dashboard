import * as XLSX from 'xlsx';

export function exportToXlsx({ filename, sheets }) {
  const wb = XLSX.utils.book_new();

  for (const s of sheets) {
    // s = { name, rows } where rows = array of objects
    const ws = XLSX.utils.json_to_sheet(s.rows ?? []);
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }

  XLSX.writeFile(wb, filename);
}
