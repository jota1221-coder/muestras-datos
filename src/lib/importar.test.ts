import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { ErrorImportacion, presetDesdeArchivo } from "./importar";
import { aplicarFusiones, limpiar } from "./limpiar";

/** Arma un .xlsx de verdad en memoria y lo envuelve en un File, que es
 *  exactamente lo que recibe la función cuando alguien sube su planilla. */
async function archivoXlsx(filas: string[][], nombre = "mi base.xlsx") {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Hoja1");
  filas.forEach((f) => ws.addRow(f));
  const buf = await wb.xlsx.writeBuffer();
  return new File([buf], nombre, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const PLANILLA = [
  ["Razón Social", "Celular", "CUIT", "Localidad", "Último pedido", "Importe"],
  ["Kiosco La Esquina", "11 4047-0301", "20-12345678-6", "Martínez", "3/2/26", "$ 45.200"],
  ["KIOSCO LA ESQUINA", "+54 9 11 4047 0301", "", "MARTINEZ", "2026-02-03", "45200"],
  ["Almacén Don Pedro", "1140470313", "27-23456789-1", "martinez", "17/1/26", "$ 88.000"],
  ["Fiambrería Central", "4047-0325", "3.07123E+10", "Olivos", "2026-01-05", "$ 12.750"],
  ["Panadería del Sol", "", "23-34567890-5", "OLIVOS", "22/2/26", "$ 31.400"],
];

describe("importar la planilla del visitante", () => {
  it("detecta el tipo de cada columna por el encabezado", async () => {
    const preset = await presetDesdeArchivo(await archivoXlsx(PLANILLA));
    const tipos = Object.fromEntries(preset.columnas.map((c) => [c.titulo, c.tipo]));

    expect(tipos["Razón Social"]).toBe("nombre");
    expect(tipos["Celular"]).toBe("telefono");
    expect(tipos["CUIT"]).toBe("cuit");
    expect(tipos["Localidad"]).toBe("localidad");
    expect(tipos["Último pedido"]).toBe("fecha");
    expect(tipos["Importe"]).toBe("moneda");
  });

  it("conserva los encabezados y las filas del archivo", async () => {
    const preset = await presetDesdeArchivo(await archivoXlsx(PLANILLA));
    expect(preset.columnas).toHaveLength(6);
    expect(preset.filas).toHaveLength(5);
    expect(preset.nombre).toBe("mi base.xlsx");
  });

  it("limpia un archivo subido igual que un ejemplo", async () => {
    const preset = await presetDesdeArchivo(await archivoXlsx(PLANILLA));
    const r = limpiar(preset);
    const sug = new Set(r.fusiones.filter((f) => f.sugerida).map((f) => f.id));
    const finales = aplicarFusiones(r, preset.columnas, sug);

    expect(r.conteos.duplicadosUnificados).toBe(1); // el kiosco repetido
    expect(finales).toHaveLength(4);
    expect(r.conteos.telefonosNormalizados).toBeGreaterThan(0);
    expect(r.conteos.cuitRotosPorExcel).toBe(1); // el 3.07123E+10
  });

  it("deduce la grafía correcta de los propios datos, sin lista canónica", async () => {
    const preset = await presetDesdeArchivo(await archivoXlsx(PLANILLA));
    const r = limpiar(preset);
    const sug = new Set(r.fusiones.filter((f) => f.sugerida).map((f) => f.id));
    const colLoc = preset.columnas.find((c) => c.tipo === "localidad")!;
    const valores = aplicarFusiones(r, preset.columnas, sug).map(
      (f) => f.celdas[colLoc.clave].valor,
    );

    // "Martínez" aparece con tilde y mayúscula inicial una sola vez, pero
    // es la única variante con acento: gana la más frecuente del grupo.
    expect(new Set(valores.filter((v) => /mart/i.test(v))).size).toBe(1);
    expect(new Set(valores.filter((v) => /oliv/i.test(v))).size).toBe(1);
  });

  it("detecta un teléfono aunque la columna se llame cualquier cosa", async () => {
    const raro = [
      ["Cliente", "Dato 2"],
      ["Uno", "11 4047-0401"],
      ["Dos", "1140470402"],
      ["Tres", "+54 9 11 4047 0403"],
      ["Cuatro", "11 4047-0404"],
    ];
    const preset = await presetDesdeArchivo(await archivoXlsx(raro));
    expect(preset.columnas[1].tipo).toBe("telefono");
  });

  it("lee un CSV con comas adentro de las comillas", async () => {
    const csv =
      'Nombre,Teléfono,Domicilio\n' +
      '"Pérez, Juan",11 4047-0501,"Av. Maipú 100, Martínez"\n' +
      '"Gómez, Ana",1140470502,"Roca 200, Olivos"\n';
    const file = new File([csv], "contactos.csv", { type: "text/csv" });
    const preset = await presetDesdeArchivo(file);

    expect(preset.columnas.map((c) => c.titulo)).toEqual([
      "Nombre",
      "Teléfono",
      "Domicilio",
    ]);
    expect(preset.filas).toHaveLength(2);
    expect(preset.filas[0].c0).toBe("Pérez, Juan");
    expect(preset.filas[0].c2).toBe("Av. Maipú 100, Martínez");
  });

  it("avisa con un mensaje entendible si el archivo no sirve", async () => {
    const vacio = await archivoXlsx([["Solo encabezados"]]);
    await expect(presetDesdeArchivo(vacio)).rejects.toThrow(ErrorImportacion);

    const gordo = new File([new Uint8Array(5 * 1024 * 1024)], "grande.xlsx");
    await expect(presetDesdeArchivo(gordo)).rejects.toThrow(/4 MB/);
  });
});
