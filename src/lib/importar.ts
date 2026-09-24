/** Lee la planilla que sube el visitante y la convierte en un `Preset`,
 *  para que el resto de la pantalla funcione igual que con los ejemplos.
 *
 *  TODO pasa en el browser: el archivo nunca se sube a ningún servidor.
 *  No es una decisión técnica sino comercial — habilita a prometer "tu
 *  archivo no sale de tu teléfono" y que sea verdad. */

import { ordenarGrilla, type Grilla } from "./ordenar";
import type { Preset } from "./planillas/tipos";

/** Tope defensivo: una planilla enorme colgaría el celular del visitante,
 *  y para mostrar el valor alcanza con las primeras filas. */
export const MAX_FILAS = 300;
export const MAX_BYTES = 4 * 1024 * 1024;

export class ErrorImportacion extends Error {}

/** Extrae texto plano de cualquier tipo de celda de exceljs (fórmulas,
 *  hipervínculos, texto enriquecido). Igual que en el importador del CRM.
 *
 *  NO recorta: el espacio invisible al final es justamente uno de los
 *  hallazgos que la muestra tiene que poder mostrar. Se recorta después,
 *  y solo donde corresponde (los encabezados). */
function texto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.text === "string") return o.text;
    if (o.result !== undefined && o.result !== null) return String(o.result);
    if (typeof o.hyperlink === "string") return o.hyperlink;
    if (Array.isArray(o.richText)) {
      return (o.richText as { text: string }[]).map((r) => r.text).join("");
    }
    if (o instanceof Date) return (o as Date).toISOString().slice(0, 10);
    return "";
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

/** CSV con comillas y comas adentro de los campos. */
function parsearCsv(txt: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let enComillas = false;

  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (enComillas) {
      if (c === '"') {
        if (txt[i + 1] === '"') { campo += '"'; i++; } else enComillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') { enComillas = true; continue; }
    if (c === "," || c === ";") { fila.push(campo); campo = ""; continue; }
    if (c === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; continue; }
    if (c === "\r") continue;
    campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return recortarVaciasAlFinal(filas);
}

async function leerXlsx(file: File): Promise<string[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const ws = wb.worksheets[0];
  if (!ws) throw new ErrorImportacion("El archivo no tiene ninguna hoja.");

  const crudas = ws.getSheetValues() as unknown[][];
  const filas: string[][] = [];
  // getSheetValues es 1-indexado y deja un hueco en la posición 0. Las
  // filas vacías del medio SE CONSERVAN: son uno de los hallazgos que el
  // ordenador tiene que poder mostrar.
  for (let r = 1; r < crudas.length; r++) {
    const fila = crudas[r];
    filas.push(Array.isArray(fila) ? fila.slice(1).map(texto) : []);
  }
  return recortarVaciasAlFinal(filas);
}

function recortarVaciasAlFinal(filas: string[][]): string[][] {
  const hay = (f: string[]) => f.some((c) => c.trim());
  const primera = filas.findIndex(hay);
  if (primera < 0) return [];
  let ultima = filas.length - 1;
  while (ultima > primera && !hay(filas[ultima])) ultima--;
  return filas.slice(primera, ultima + 1);
}

export type Lectura = { nombre: string; grilla: Grilla; recortada: boolean };

/** Lee el archivo tal cual viene, sin decidir nada: dónde empieza la
 *  tabla, qué es el total y qué sobra lo decide el ordenador. */
export async function leerGrilla(file: File): Promise<Lectura> {
  if (file.size > MAX_BYTES) {
    throw new ErrorImportacion(
      "El archivo pesa más de 4 MB. Probá con una hoja más chica.",
    );
  }

  const esCsv = /\.csv$/i.test(file.name);
  const crudas = esCsv ? parsearCsv(await file.text()) : await leerXlsx(file);

  if (crudas.filter((f) => f.some((c) => c.trim())).length < 2) {
    throw new ErrorImportacion(
      "No se encontraron filas con datos. ¿Es la hoja correcta?",
    );
  }

  // Unas filas de más por si arriba hay títulos: el tope es de datos.
  const tope = MAX_FILAS + 25;
  return { nombre: file.name, grilla: crudas.slice(0, tope), recortada: crudas.length > tope };
}

/** La planilla leída con fidelidad: la primera fila como títulos y sin
 *  tocar la estructura. Es lo que era el importador antes de que
 *  existiera el ordenador, y sigue sirviendo para limpiar sin reordenar. */
export async function presetDesdeArchivo(file: File): Promise<Preset> {
  const { nombre, grilla, recortada } = await leerGrilla(file);
  return ordenarGrilla(grilla, {
    aceptar: () => false,
    slug: "propia",
    nombre,
    rubro: "Tu planilla",
    gancho: recortada ? `${nombre} — se muestran las primeras ${MAX_FILAS} filas.` : nombre,
  }).preset;
}
