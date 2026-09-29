import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export type ExportTable = { title: string; head: string[]; rows: (string | number)[][] };

export function downloadExcel(filename: string, sheets: ExportTable[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([s.head, ...s.rows]);
    ws["!cols"] = s.head.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, s.title.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

export function downloadPdf(
  filename: string,
  opts: { title: string; subtitle?: string[]; tables: ExportTable[]; footer?: string[] },
) {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text("SKY PLUS", 14, 18);
  doc.setFontSize(13);
  doc.text(opts.title, 14, 27);
  doc.setFontSize(9);
  let y = 34;
  for (const line of opts.subtitle ?? []) {
    doc.text(line, 14, y);
    y += 5;
  }
  for (const t of opts.tables) {
    if (t.title) {
      doc.setFontSize(11);
      doc.text(t.title, 14, y + 4);
      y += 6;
    }
    autoTable(doc, {
      startY: y,
      head: [t.head],
      body: t.rows.map((r) => r.map(String)),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [27, 42, 68] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }
  doc.setFontSize(9);
  for (const line of opts.footer ?? []) {
    const wrapped = doc.splitTextToSize(line, 180) as string[];
    if (y + wrapped.length * 5 > 285) {
      doc.addPage();
      y = 20;
    }
    doc.text(wrapped, 14, y);
    y += wrapped.length * 5 + 2;
  }
  doc.save(filename);
}
