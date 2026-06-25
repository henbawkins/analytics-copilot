// Client-side export helpers: turn an assistant answer into an Excel workbook
// or a PDF. Excel pulls the structured data out of the answer (Markdown tables
// + ```chart data blocks); PDF snapshots the rendered answer (prose, tables,
// and charts) as it appears on screen. Heavy libs are imported dynamically so
// they stay out of the main bundle until someone actually exports.

import { parseChartSpec, type ChartSpec } from "@/components/ChartRenderer";

export type ParsedTable = { headers: string[]; rows: string[][] };

const CHART_RE = /```chart\s*([\s\S]*?)```/g;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

export type ReportMeta = { query?: string };

/**
 * Render an answer (prose + tables + charts) into a branded, light-themed
 * report sheet and save it as a PDF. The on-screen answer is cloned into an
 * off-screen Kaseya-branded layout so the export looks client-ready rather
 * than a screenshot of the dark chat UI.
 */
export async function exportPdf(
  node: HTMLElement,
  filename: string,
  meta: ReportMeta = {},
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const width = Math.round(node.getBoundingClientRect().width) || 760;
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const sheet = document.createElement("div");
  sheet.className = "report-sheet md";
  sheet.style.width = `${width}px`;

  const header = document.createElement("div");
  header.className = "report-header";
  header.innerHTML = `
    <div class="report-headrow">
      <div>
        <div class="report-title">Analytics Report</div>
        ${meta.query ? `<div class="report-query">${escapeHtml(meta.query)}</div>` : ""}
        <div class="report-date">${dateStr}</div>
      </div>
      <img class="report-logo" src="/kaseya-logo.png" alt="Kaseya" />
    </div>
    <div class="report-rule"></div>`;

  const body = document.createElement("div");
  body.className = "report-body";
  body.innerHTML = node.innerHTML;

  const footer = document.createElement("div");
  footer.className = "report-footer";
  footer.textContent = `Generated by Analytics Copilot · ${dateStr}`;

  sheet.append(header, body, footer);
  document.body.appendChild(sheet);

  // Wait for the logo to load so it isn't blank in the snapshot.
  const logo = sheet.querySelector(".report-logo") as HTMLImageElement | null;
  if (logo && !logo.complete) {
    await new Promise<void>((resolve) => {
      logo.onload = () => resolve();
      logo.onerror = () => resolve();
    });
  }

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(sheet, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
    });
  } finally {
    sheet.remove();
  }

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
