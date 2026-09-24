/** Arma el Excel ordenado.
 *
 *  La diferencia entre "una planilla con los datos arreglados" y "una
 *  planilla ordenada" se ve acá: una tabla de Excel de verdad (con filtros,
 *  franjas y el encabezado fijo), fechas que Excel reconoce como fechas,
 *  importes que se pueden sumar, y el total al pie como fórmula.
 *
 *  Y lo que responde al "no se borra por borrar": el archivo lleva dos
 *  hojas más, una con cada cambio que se hizo y otra con la planilla
 *  original tal como vino. Nada se pierde. */

import type ExcelJSNS from "exceljs";
import type { Cambio, Grilla } from "./ordenar";
import type { Columna, FilaLimpia } from "./planillas/tipos";

type ExcelJS = typeof ExcelJSNS;

export type Exportable = {
  columnas: Columna[];
  filas: FilaLimpia[];
  columnasConTotal: string[];
  tituloHoja: string | null;
  cambiosAplicados: Cambio[];
  /** Otras cosas que se hicieron y conviene dejar anotadas (unificaciones,
   *  celdas corregidas). */
  notas: string[];
  original: Grilla;
};

/** "$ 348.500" → 348500, "USD 1.200" → 1200. null si no es un importe. */
export function leerImporte(v: string): { n: number; moneda: "$" | "USD" } | null {
  const m = v.trim().match(/^(\$|USD)\s*([\d.]+)$/);
  if (!m) return null;
  const n = Number(m[2].replace(/\./g, ""));
  return Number.isFinite(n) ? { n, moneda: m[1] as "$" | "USD" } : null;
}

/** "1.250" → 1250, "2,5" → 2.5 (formato argentino). */
export function leerNumero(v: string): number | null {
  const t = v.trim();
  if (!/^-?[\d.]+(,\d+)?$/.test(t)) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** "2026-03-09" → fecha. Se arma en UTC a propósito: Excel guarda días,
 *  no instantes, y en hora local el 9 de marzo puede quedar en el 8. */
export function leerFecha(v: string): Date | null {
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Un nombre de hoja válido: Excel no admite más de 31 caracteres ni
 *  ninguno de : \ / ? * [ ] */
export function nombreDeHoja(t: string | null): string {
  const limpio = (t ?? "").replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim();
  return (limpio || "Tabla").slice(0, 31).trim();
}

function unicos(nombres: string[]): string[] {
  const vistos = new Map<string, number>();
  return nombres.map((n) => {
    const base = n.trim() || "Columna";
    const k = base.toLowerCase();
    const i = (vistos.get(k) ?? 0) + 1;
    vistos.set(k, i);
    return i === 1 ? base : `${base} ${i}`;
  });
}

export async function armarExcel(ExcelJS: ExcelJS, d: Exportable): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Muestras · Joaquín Rao";
  wb.created = new Date();

  // ── Hoja 1: la tabla ────────────────────────────────────────────
  const ws = wb.addWorksheet(nombreDeHoja(d.tituloHoja), {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const nombres = unicos(d.columnas.map((c) => c.titulo));
  const monedaDe = new Map<string, "$" | "USD">();

  const filas = d.filas.map((f) =>
    d.columnas.map((c) => {
      const v = f.celdas[c.clave]?.valor ?? "";
      if (!v) return null;
      if (c.tipo === "fecha") return leerFecha(v) ?? v;
      if (c.tipo === "moneda") {
        const imp = leerImporte(v);
        if (!imp) return v;
        if (!monedaDe.has(c.clave)) monedaDe.set(c.clave, imp.moneda);
        return imp.n;
      }
      if (c.tipo === "numero") return leerNumero(v) ?? v;
      return v;
    }),
  );

  const hayTotal = d.columnasConTotal.length > 0;
  ws.addTable({
    name: "Datos",
    ref: "A1",
    headerRow: true,
    totalsRow: hayTotal,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: d.columnas.map((c, i) => {
      const conTotal = d.columnasConTotal.includes(c.clave);
      return {
        name: nombres[i],
        filterButton: true,
        ...(hayTotal
          ? i === 0 && !conTotal
            ? { totalsRowLabel: "Total" }
            : conTotal
              ? { totalsRowFunction: "sum" as const }
              : { totalsRowFunction: "none" as const }
          : {}),
      };
    }),
    rows: filas,
  });

  // Formatos y anchos por tipo
  d.columnas.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.tipo === "fecha") col.numFmt = "dd/mm/yyyy";
    if (c.tipo === "moneda") {
      col.numFmt = monedaDe.get(c.clave) === "USD" ? '"USD" #,##0' : '"$" #,##0';
    }
    if (c.tipo === "numero") col.numFmt = "#,##0.##";
    // Teléfonos y documentos como texto: si Excel los toma como número
    // les come los ceros y los pasa a notación científica, que es
    // exactamente el problema que se vino a arreglar.
    if (c.tipo === "telefono" || c.tipo === "cuit") col.numFmt = "@";

    const largos = [nombres[i], ...d.filas.map((f) => f.celdas[c.clave]?.valor ?? "")].map(
      (v) => v.length,
    );
    col.width = Math.min(48, Math.max(10, Math.max(...largos) + 3));
  });

  // Sí/No con lista desplegable: el que carga la próxima fila no puede
  // volver a escribir "x", "SI" o "sip".
  d.columnas.forEach((c, i) => {
    if (c.tipo !== "siNo") return;
    for (let r = 2; r <= d.filas.length + 1; r++) {
      ws.getCell(r, i + 1).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"Sí,No"'],
        showErrorMessage: true,
        errorTitle: "Sí o No",
        error: "Elegí Sí o No de la lista.",
      };
    }
  });

  // ── Hoja 2: qué se hizo ─────────────────────────────────────────
  const wc = wb.addWorksheet("Cambios");
  wc.getColumn(1).width = 44;
  wc.getColumn(2).width = 90;
  wc.addRow(["Qué se hizo", "Por qué"]).font = { bold: true };
  for (const c of d.cambiosAplicados) {
    const fila = wc.addRow([c.titulo, c.detalle]);
    fila.alignment = { wrapText: true, vertical: "top" };
    if (c.ejemplo?.antes) {
      const ej = wc.addRow([
        "",
        c.ejemplo.despues ? `${c.ejemplo.antes}  →  ${c.ejemplo.despues}` : `Era: ${c.ejemplo.antes}`,
      ]);
      ej.font = { italic: true, color: { argb: "FF63635E" } };
      ej.alignment = { wrapText: true };
    }
  }
  for (const n of d.notas) wc.addRow(["", n]).alignment = { wrapText: true };
  wc.addRow([]);
  wc.addRow(["", "La planilla como vino está en la hoja «Original»: no se borró nada."]).font = {
    italic: true,
  };

  // ── Hoja 3: la original, sin tocar ──────────────────────────────
  const wo = wb.addWorksheet("Original");
  for (const f of d.original) wo.addRow(f);

  return wb.xlsx.writeBuffer();
}
