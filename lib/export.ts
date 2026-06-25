// Client-side export helpers: turn an assistant answer into an Excel workbook
// or a PDF. Excel pulls the structured data out of the answer (Markdown tables
// + ```chart data blocks); PDF snapshots the rendered answer (prose, tables,
// and charts) as it appears on screen. Heavy libs are imported dynamically so
// they stay out of the main bundle until someone actually exports.

import { parseChartSpec, type ChartSpec } from "@/components/ChartRenderer";

export type ParsedTable = { headers: string[]; rows: string[][] };

const CHART_RE = /```chart\s*([\s\S]*?)```/g;

/** Pull every valid ```chart block out of an assistant message. */
export function extractCharts(text: string): ChartSpec[] {
  const charts: ChartSpec[] = [];
  let match: RegExpExecArray | null;
  CHART_RE.lastIndex = 0;
  while ((match = CHART_RE.exec(text)) !== null) {
    const spec = parseChartSpec(match[1]);
    if (spec) charts.push(spec);
  }
  return charts;
}

const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isSeparator = (line: string) =>
  /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");

function splitCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Parse GitHub-flavored Markdown tables out of an answer (charts stripped). */
export function extractTables(text: string): ParsedTable[] {
  const body = text.replace(CHART_RE, "");
  const lines = body.split(/\r?\n/);
  const tables: ParsedTable[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (isTableRow(lines[i]) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const headers = splitCells(lines[i]);
      const rows: string[][] = [];
      let j = i + 2;
      for (; j < lines.length && isTableRow(lines[j]); j++) {
        rows.push(splitCells(lines[j]));
      }
      tables.push({ headers, rows });
      i = j - 1;
    }
  }
  return tables;
}

/** Coerce a cell to a number when it cleanly looks like one (keeps %/text). */
function coerce(value: string): string | number {
  if (value === "") return value;
  const stripped = value.replace(/,/g, "");
  if (/^-?\d+(\.\d+)?$/.test(stripped)) return Number(stripped);
  return value;
}

function safeSheetName(name: string, fallback: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31);
  return cleaned || fallback;
}

/**
 * Build and download an .xlsx from an assistant answer. One sheet per Markdown
 * table and one per chart's underlying data; if neither is present, a single
 * sheet with the raw answer text.
 */
export async function exportExcel(text: string, filename: string): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const tables = extractTables(text);
  const charts = extractCharts(text);

  tables.forEach((t, i) => {
    const aoa = [t.headers, ...t.rows.map((r) => r.map(coerce))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(`Table ${i + 1}`, `Table ${i + 1}`));
  });

  charts.forEach((c, i) => {
    const headers = [c.xKey, ...c.series.map((s) => s.label ?? s.key)];
    const aoa = [
      headers,
      ...c.data.map((row) => [row[c.xKey], ...c.series.map((s) => row[s.key])]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(
      wb,
      ws,
      safeSheetName(c.title ?? `Chart ${i + 1}`, `Chart ${i + 1}`),
    );
  });

  if (tables.length === 0 && charts.length === 0) {
    const aoa = text.split(/\r?\n/).map((line) => [line]);
    const ws = XLSX.utils.aoa_to_sheet([["Answer"], ...aoa]);
    XLSX.utils.book_append_sheet(wb, ws, "Answer");
  }

  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/** Snapshot a rendered answer node (prose + tables + charts) to a PDF. */
export async function exportPdf(node: HTMLElement, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const bg =
    getComputedStyle(document.body).backgroundColor || "#0b0d12";
  const canvas = await html2canvas(node, {
    backgroundColor: bg,
    scale: 2,
    useCORS: true,
  });

  const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;
  const imgH = (usableW * canvas.height) / canvas.width;
  const imgData = canvas.toDataURL("image/png");

  let heightLeft = imgH;
  let position = margin;
  pdf.addImage(imgData, "PNG", margin, position, usableW, imgH);
  heightLeft -= usableH;

  while (heightLeft > 0) {
    position = margin - (imgH - heightLeft);
    pdf.addPage();
    pdf.addImage(imgData, "PNG", margin, position, usableW, imgH);
    heightLeft -= usableH;
  }

  pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
