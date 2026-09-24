/** El Excel se abre de nuevo con la misma librería y se mira por dentro:
 *  lo que importa no es que "se genere", es que un dueño lo abra y las
 *  fechas sean fechas, los importes se puedan sumar y esté todo. */

import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { armarExcel, leerFecha, leerImporte, leerNumero, nombreDeHoja } from "./exportar";
import { ordenarGrilla } from "./ordenar";
import { escanear } from "./escanear";
import { aplicarFusiones, limpiar } from "./limpiar";
import { stock } from "./planillas/stock";

async function excelDelStock() {
  const o = ordenarGrilla(stock.grilla!);
  const esc = escanear(o.preset);
  const r = limpiar({ ...o.preset, columnas: esc.columnas });
  const sug = new Set(r.fusiones.filter((f) => f.sugerida).map((f) => f.id));
  const filas = aplicarFusiones(r, esc.columnas, sug);

  const buf = await armarExcel(ExcelJS, {
    columnas: esc.columnas,
    filas,
    columnasConTotal: o.columnasConTotal,
    tituloHoja: o.tituloHoja,
    cambiosAplicados: o.cambios,
    notas: ["1 fila unificada"],
    original: stock.grilla!,
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  return { wb, esc, filas };
}

describe("lectores de valores limpios", () => {
  it("importes, números y fechas en formato argentino", () => {
    expect(leerImporte("$ 348.500")).toEqual({ n: 348500, moneda: "$" });
    expect(leerImporte("USD 1.200")).toEqual({ n: 1200, moneda: "USD" });
    expect(leerImporte("a consultar")).toBeNull();
    expect(leerNumero("1.250")).toBe(1250);
    expect(leerNumero("2,5")).toBe(2.5);
    expect(leerNumero("12 u.")).toBeNull();
    expect(leerFecha("2026-03-09")?.toISOString().slice(0, 10)).toBe("2026-03-09");
  });

  it("el nombre de la hoja respeta lo que Excel admite", () => {
    expect(nombreDeHoja("LISTADO DE STOCK — actualizado marzo 2026").length).toBeLessThanOrEqual(31);
    expect(nombreDeHoja("Ventas 1/2026 [final]")).not.toMatch(/[/[\]]/);
    expect(nombreDeHoja(null)).toBe("Tabla");
  });
});

describe("el Excel ordenado", () => {
  it("tiene tres hojas: la tabla, los cambios y la original", async () => {
    const { wb } = await excelDelStock();
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      nombreDeHoja("LISTADO DE STOCK — actualizado marzo 2026"),
      "Cambios",
      "Original",
    ]);
  });

  it("las fechas son fechas y los importes son números", async () => {
    const { wb, esc } = await excelDelStock();
    const ws = wb.worksheets[0];
    const iFecha = esc.columnas.findIndex((c) => c.tipo === "fecha") + 1;
    const iPrecio = esc.columnas.findIndex((c) => c.tipo === "moneda") + 1;
    expect(ws.getCell(2, iFecha).value).toBeInstanceOf(Date);
    expect(typeof ws.getCell(2, iPrecio).value).toBe("number");
  });

  it("el total del pie vuelve como fórmula, no como número fijo", async () => {
    const { wb, filas } = await excelDelStock();
    const ws = wb.worksheets[0];
    const totalRow = ws.getRow(filas.length + 2);
    const formulas = (totalRow.values as unknown[]).filter(
      (v) => typeof v === "object" && v !== null && "formula" in (v as object),
    );
    expect(formulas.length).toBe(3); // precio costo, precio venta, stock
  });

  it("los teléfonos quedan como texto, para que Excel no les coma dígitos", async () => {
    const { wb, esc } = await excelDelStock();
    const i = esc.columnas.findIndex((c) => c.tipo === "telefono") + 1;
    expect(wb.worksheets[0].getColumn(i).numFmt).toBe("@");
  });

  it("la hoja original trae la planilla exactamente como vino", async () => {
    const { wb } = await excelDelStock();
    const wo = wb.getWorksheet("Original")!;
    expect(wo.getCell(1, 1).value).toBe(stock.grilla![0][0]);
    const ultima = stock.grilla!.length;
    expect(String(wo.getCell(ultima, 1).value)).toMatch(/sin IVA/);
  });
});
