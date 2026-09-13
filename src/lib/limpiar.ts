/** Motor de limpieza de la muestra.
 *
 *  Es una función PURA: entra una planilla, sale un diff. Sin fetch, sin
 *  Date.now(), sin DOM — así corre igual en el browser (que es donde vive
 *  esta muestra) y en un test.
 *
 *  Las funciones de normalización de teléfono y CUIT no se reimplementan:
 *  vienen de `normalizar.ts`, que es el mismo código que corre en
 *  producción en el CRM sobre +17.000 contactos reales. */

import { normalizarWhatsapp, normalizarCuit, cuitValido } from "./normalizar";
import { sinAcentos } from "./texto";
import type {
  Canonico,
  Columna,
  Conteos,
  FilaLimpia,
  Preset,
  Resultado,
} from "./planillas/tipos";

/** Compara ignorando acentos, mayúsculas, puntos y espacios: con eso
 *  "Vte. López", "vte lopez" y "VTE.LOPEZ" caen todos en la misma clave. */
function clave(s: string): string {
  return sinAcentos(s).replace(/[^a-z0-9]/g, "");
}

/** Saca los dígitos de una celda, deshaciendo primero la notación
 *  científica. Excel convierte solo cualquier número largo cargado como
 *  número —un CUIT, un teléfono sin el apóstrofo— y al exportar queda
 *  "3.07123E+10". Es la corrupción más común de todas y la que más
 *  desconcierta al dueño, porque él nunca escribió eso.
 *
 *  Misma lógica que `soloDigitos()` de scripts/import-zonas.ts del CRM. */
function digitosDeCelda(raw: string): { digitos: string; eraCientifica: boolean } {
  let s = raw.trim();
  const eraCientifica = /\d[eE]\+?\d+/.test(s);
  if (eraCientifica || (s.includes(".") && /^\d[\d.]*$/.test(s))) {
    const n = Number(s);
    if (Number.isFinite(n)) s = BigInt(Math.round(n)).toString();
  }
  return { digitos: s.replace(/\D/g, ""), eraCientifica };
}

/** Deja el teléfono legible: 549 11 4047-9641 en vez de 5491140479641. */
function formatearTelefono(d: string): string {
  if (d.length === 13 && d.startsWith("549")) {
    return `+54 9 ${d.slice(3, 5)} ${d.slice(5, 9)}-${d.slice(9)}`;
  }
  return d;
}

/** Capitaliza cada palabra, respetando las minúsculas de enlace ("de",
 *  "del", "y") que en castellano no se capitalizan en el medio. */
function capitalizar(s: string): string {
  const menores = new Set(["de", "del", "la", "las", "los", "y", "en"]);
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p, i) =>
      i > 0 && menores.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1),
    )
    .join(" ");
}

function canonizar(valor: string, canonicos: Canonico[]): string | null {
  const k = clave(valor);
  if (!k) return null;
  for (const c of canonicos) {
    if (clave(c.valor) === k) return c.valor;
    if (c.alias.some((a) => clave(a) === k)) return c.valor;
  }
  return null;
}

/** Fechas como las carga la gente: 12/3/26, 2026-03-12, 12-03-2026.
 *  Se asume día/mes (formato argentino), nunca mes/día. */
function normalizarFecha(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, a, m, d] = iso;
    return `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    const [, d, m, aRaw] = dmy;
    const a = aRaw.length === 2 ? `20${aRaw}` : aRaw;
    return `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

/** Precios cargados con separadores mezclados: "U$S 185.000", "185000",
 *  "$ 185.000,00". Devuelve solo el número, sin decidir la moneda. */
function normalizarMoneda(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const moneda = /u\$s|usd|dolar/i.test(s) ? "USD" : "$";
  const soloNum = s.replace(/[^\d,.]/g, "");
  // Si tiene coma decimal al final la sacamos; los puntos son de miles.
  const sinDecimales = soloNum.replace(/,\d{1,2}$/, "");
  const digitos = sinDecimales.replace(/\D/g, "");
  if (!digitos) return null;
  const conSeparador = Number(digitos).toLocaleString("es-AR");
  return `${moneda} ${conSeparador}`;
}

function limpiarCelda(
  valorCrudo: string,
  col: Columna,
): { valor: string; alerta?: string } {
  const raw = (valorCrudo ?? "").trim();

  switch (col.tipo) {
    case "telefono": {
      if (!raw) return { valor: "" };
      const d = normalizarWhatsapp(raw);
      if (!d) return { valor: "" };
      if (d.length < 12) {
        // Le falta la característica: se marca, no se inventa el prefijo.
        return { valor: raw, alerta: "Sin característica de área" };
      }
      return { valor: formatearTelefono(d) };
    }

    case "cuit": {
      if (!raw) return { valor: "" };
      const { digitos, eraCientifica } = digitosDeCelda(raw);
      const d = normalizarCuit(digitos);
      if (d.length !== 11) return { valor: raw, alerta: "CUIT incompleto" };
      const formateado = `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
      // Si venía en notación científica, Excel ya se comió los dígitos de
      // la derecha: se recupera lo que se puede y se avisa que hay que
      // chequearlo contra el papel. No se lo hace pasar por dato bueno.
      if (eraCientifica) {
        return { valor: formateado, alerta: "Excel lo rompió — verificar" };
      }
      if (!cuitValido(d)) {
        return { valor: formateado, alerta: "Dígito verificador inválido" };
      }
      return { valor: formateado };
    }

    case "localidad": {
      if (!raw) return { valor: "" };
      const c = col.canonicos ? canonizar(raw, col.canonicos) : null;
      return { valor: c ?? capitalizar(raw) };
    }

    case "nombre":
      return { valor: raw ? capitalizar(raw) : "" };

    case "email":
      return { valor: raw.toLowerCase() };

    case "fecha": {
      const f = normalizarFecha(raw);
      return f ? { valor: f } : { valor: raw };
    }

    case "moneda": {
      const m = normalizarMoneda(raw);
      return m ? { valor: m } : { valor: raw };
    }

    default:
      return { valor: raw.replace(/\s+/g, " ") };
  }
}

/** Claves por las que una fila puede reconocerse como repetida: el
 *  teléfono normalizado y el nombre sin acentos ni mayúsculas.
 *
 *  Devuelve TODAS las que apliquen, no la primera. Con una sola clave por
 *  fila el duplicado se escapa en el caso más común: una fila trae el
 *  teléfono entero y la otra lo trae sin característica, así que una se
 *  indexa por teléfono y la otra por nombre y no se cruzan nunca. */
function clavesDedupe(
  celdas: Record<string, { valor: string }>,
  columnas: Columna[],
): string[] {
  const claves: string[] = [];

  const colTel = columnas.find((c) => c.tipo === "telefono");
  if (colTel) {
    const tel = normalizarWhatsapp(celdas[colTel.clave]?.valor ?? "");
    if (tel.length >= 12) claves.push(`tel:${tel}`);
  }

  const colNombre = columnas.find(
    (c) => c.clavePara === "dedupe" || c.tipo === "nombre",
  );
  if (colNombre) {
    const k = clave(celdas[colNombre.clave]?.valor ?? "");
    if (k) claves.push(`nom:${k}`);
  }

  return claves;
}

export function limpiar(preset: Preset): Resultado {
  const conteos: Conteos = {
    telefonosNormalizados: 0,
    duplicadosUnificados: 0,
    cuitInvalidos: 0,
    cuitRotosPorExcel: 0,
    filasSinTelefono: 0,
    localidadesUnificadas: 0,
    fechasNormalizadas: 0,
  };

  // Paso 1 — limpiar celda por celda, guardando el original.
  const intermedias: FilaLimpia[] = preset.filas.map((fila, i) => {
    const celdas: FilaLimpia["celdas"] = {};

    for (const col of preset.columnas) {
      const original = (fila[col.clave] ?? "").trim();
      const { valor, alerta } = limpiarCelda(original, col);
      const cambio = valor !== original;

      if (cambio) {
        if (col.tipo === "telefono") conteos.telefonosNormalizados++;
        if (col.tipo === "localidad") conteos.localidadesUnificadas++;
        if (col.tipo === "fecha") conteos.fechasNormalizadas++;
      }
      if (col.tipo === "cuit" && alerta) {
        if (alerta.startsWith("Excel")) conteos.cuitRotosPorExcel++;
        else conteos.cuitInvalidos++;
      }
      if (col.tipo === "telefono" && !original) conteos.filasSinTelefono++;

      celdas[col.clave] = { valor, original, cambio, alerta };
    }

    return { indiceOriginal: i + 1, celdas, absorbio: [] };
  });

  // Paso 2 — fusionar duplicados. Gana la primera aparición, pero cada
  // celda vacía se completa con lo que traiga la fila absorbida: así la
  // fusión suma información en vez de descartarla.
  const porClave = new Map<string, FilaLimpia>();
  const finales: FilaLimpia[] = [];

  /** Registra la fila bajo todas sus claves actuales. Se vuelve a llamar
   *  después de cada fusión porque al completarse un teléfono aparece una
   *  clave nueva por la que antes no era encontrable. */
  const indexar = (fila: FilaLimpia) => {
    for (const k of clavesDedupe(fila.celdas, preset.columnas)) {
      if (!porClave.has(k)) porClave.set(k, fila);
    }
  };

  for (const fila of intermedias) {
    const claves = clavesDedupe(fila.celdas, preset.columnas);
    const previa = claves.map((k) => porClave.get(k)).find(Boolean);

    if (!previa) {
      indexar(fila);
      finales.push(fila);
      continue;
    }

    for (const col of preset.columnas) {
      const actual = previa.celdas[col.clave];
      const entrante = fila.celdas[col.clave];
      if (!entrante.valor) continue;

      // Se completa un hueco, o se reemplaza un dato marcado como dudoso
      // por uno sano. Quedarse siempre con el primero perdería el teléfono
      // completo de la fila duplicada cuando el primero venía sin
      // característica — que es justo el caso que más aparece.
      const completaHueco = !actual.valor;
      const mejoraCalidad = Boolean(actual.alerta) && !entrante.alerta;

      if (completaHueco || mejoraCalidad) {
        previa.celdas[col.clave] = { ...entrante, cambio: true };
      }
    }
    previa.absorbio.push(fila.indiceOriginal);
    conteos.duplicadosUnificados++;
    indexar(previa);
  }

  return { filas: finales, conteos };
}
