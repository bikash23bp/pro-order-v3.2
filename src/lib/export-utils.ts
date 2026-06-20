import Papa from "papaparse";

export function exportCSV(filename: string, rows: Record<string, unknown>[]) {
  const csv = Papa.unparse(rows);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportPDF(opts: {
  title: string;
  meta?: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  const { title, meta, headers, rows } = opts;
  const w = window.open("", "_blank", "width=1000,height=700");
  if (!w) return;
  const esc = (s: unknown) =>
    String(s ?? "").replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string),
    );
  // Auto-detect numeric columns by scanning sample rows
  const numericCols = new Set<number>();
  headers.forEach((_, i) => {
    let isNum = true;
    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      const v = rows[r]?.[i];
      if (v === "" || v == null) continue;
      const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
      if (Number.isNaN(n)) { isNum = false; break; }
    }
    if (isNum && rows.length > 0) numericCols.add(i);
  });
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/>
<title>${esc(title)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:24px;color:#111}
  h1{font-size:18px;margin:0 0 4px}
  .meta{font-size:12px;color:#666;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th,td{border:1px solid #ddd;padding:5px 7px;text-align:left;vertical-align:top}
  th{background:#f5f5f5;font-weight:600}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  tr:nth-child(even) td{background:#fafafa}
  @media print{body{padding:12px} .noprint{display:none}}
  .btn{padding:6px 12px;border:1px solid #999;background:#fff;cursor:pointer;border-radius:4px;margin-right:8px}
</style></head><body>
<div class="noprint" style="margin-bottom:12px">
  <button class="btn" onclick="window.print()">Print / Save as PDF</button>
  <button class="btn" onclick="window.close()">Close</button>
</div>
<h1>${esc(title)}</h1>
${meta ? `<div class="meta">${esc(meta)}</div>` : ""}
<table>
  <thead><tr>${headers.map((h, i) => `<th class="${numericCols.has(i) ? "num" : ""}">${esc(h)}</th>`).join("")}</tr></thead>
  <tbody>
    ${rows
      .map(
        (r) =>
          `<tr>${r
            .map(
              (c, i) =>
                `<td class="${numericCols.has(i) ? "num" : ""}">${esc(c)}</td>`,
            )
            .join("")}</tr>`,
      )
      .join("")}
  </tbody>
</table>
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
</body></html>`);
  w.document.close();
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  exportCSV(filename, rows);
}

export async function downloadXlsx(filename: string, rows: Record<string, unknown>[]) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/**
 * Convert row objects to PDF — derives headers from first row's keys.
 */
export function downloadPdf(filename: string, rows: Record<string, unknown>[], meta?: string) {
  if (rows.length === 0) {
    exportPDF({ title: filename, meta, headers: [], rows: [] });
    return;
  }
  const headers = Object.keys(rows[0]);
  const data = rows.map((r) =>
    headers.map((h) => {
      const v = r[h];
      return v == null ? "" : (typeof v === "number" || typeof v === "string" ? v : String(v));
    }),
  );
  exportPDF({ title: filename, meta, headers, rows: data });
}

export type ExportFormat = "csv" | "xlsx" | "pdf";

/**
 * Unified export entry. `getRows` is called when the user picks a format.
 */
export async function exportRowsAs(
  format: ExportFormat,
  filenameBase: string,
  rows: Record<string, unknown>[],
  meta?: string,
) {
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `${filenameBase}-${stamp}`;
  if (format === "csv") downloadCsv(`${name}.csv`, rows);
  else if (format === "xlsx") await downloadXlsx(`${name}.xlsx`, rows);
  else downloadPdf(name, rows, meta);
}
