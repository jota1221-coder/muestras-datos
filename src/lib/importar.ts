/** Lee la planilla que sube el visitante y la convierte en un `Preset`,
 *  para que el resto de la pantalla funcione igual que con los ejemplos.
 *
 *  TODO pasa en el browser: el archivo nunca se sube a ningún servidor.
 *  No es una decisión técnica sino comercial — habilita a prometer "tu
 *  archivo no sale de tu teléfono" y que sea verdad. */

import { masFrecuentePorGrupo, sinAcentos } from "./texto";
import { detectarTipo } from "./escanear";
import type { Canonico, Columna, Preset, TipoColumna } from "./planillas/tipos";

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

const norm = (s: string) => sinAcentos(s).replace(/[^a-z0-9]/g, "");

/** Para un archivo subido no hay lista canónica posible: se deduce de los
 *  propios datos quedándose, de cada grupo que solo difiere en acentos o
 *  mayúsculas, con la variante más usada. Es `masFrecuentePorGrupo`, la
 *  misma función que resolvió "Miércoles" vs "Miercoles" en el CRM. */
function canonicosDesdeDatos(valores: string[]): Canonico[] {
  const cuenta = new Map<string, number>();
  for (const v of valores) {
    const t = v.trim();
    if (t) cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
  }
  const filas = [...cuenta].map(([texto, cantidad]) => ({ texto, cantidad }));
  return masFrecuentePorGrupo(filas).map((valor) => ({ valor, alias: [] }));
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
  return filas.filter((f) => f.some((c) => c.trim()));
}

async function leerXlsx(file: File): Promise<string[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const ws = wb.worksheets[0];
  if (!ws) throw new ErrorImportacion("El archivo no tiene ninguna hoja.");

  const crudas = ws.getSheetValues() as unknown[][];
  const filas: string[][] = [];
  // getSheetValues es 1-indexado y deja un hueco en la posición 0.
  for (let r = 1; r < crudas.length; r++) {
    const fila = crudas[r];
    if (!Array.isArray(fila)) continue;
    const celdas = fila.slice(1).map(texto);
    if (celdas.some((c) => c)) filas.push(celdas);
  }
  return filas;
}

export async function presetDesdeArchivo(file: File): Promise<Preset> {
  if (file.size > MAX_BYTES) {
    throw new ErrorImportacion(
      "El archivo pesa más de 4 MB. Probá con una hoja más chica.",
    );
  }

  const esCsv = /\.csv$/i.test(file.name);
  const crudas = esCsv ? parsearCsv(await file.text()) : await leerXlsx(file);

  if (crudas.length < 2) {
    throw new ErrorImportacion(
      "No se encontraron filas. ¿La primera fila tiene los títulos de las columnas?",
    );
  }

  const encabezados = crudas[0].map((h, i) => h.trim() || `Columna ${i + 1}`);
  const cuerpo = crudas.slice(1, 1 + MAX_FILAS);

  const columnas: Columna[] = encabezados.map((titulo, i) => {
    const valores = cuerpo.map((f) => f[i] ?? "");
    const { tipo } = detectarTipo(titulo, valores);
    const col: Columna = { clave: `c${i}`, titulo, tipo };
    if (tipo === "localidad") col.canonicos = canonicosDesdeDatos(valores);
    return col;
  });

  // Si ninguna columna quedó como nombre, la primera de texto hace de
  // clave para deduplicar: sin eso no se pueden detectar repetidos.
  if (!columnas.some((c) => c.tipo === "nombre")) {
    const primeraTexto = columnas.find((c) => c.tipo === "texto");
    if (primeraTexto) primeraTexto.clavePara = "dedupe";
  }

  const filas = cuerpo.map((f) => {
    const o: Record<string, string> = {};
    columnas.forEach((c, i) => { o[c.clave] = f[i] ?? ""; });
    return o;
  });

  const recortada = crudas.length - 1 > MAX_FILAS;

  return {
    slug: "propia",
    nombre: file.name,
    rubro: "Tu planilla",
    gancho: recortada
      ? `${file.name} — se muestran las primeras ${MAX_FILAS} filas.`
      : file.name,
    columnas,
    filas,
  };
}
