/** Motor de limpieza de la muestra.
 *
 *  Es una función PURA: entra una planilla, sale un diff. Sin fetch, sin
 *  Date.now(), sin DOM — así corre igual en el browser (que es donde vive
 *  esta muestra) y en un test.
 *
 *  Regla de fondo: el motor NUNCA borra una fila por su cuenta. Propone
 *  fusiones y las aplica quien mira. Dos productos pueden llamarse igual y
 *  medir distinto; dos personas pueden llamarse igual y ser dos personas.
 *  Unificar en silencio destruye datos que después no se recuperan.
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
  Fusion,
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
 *  "$ 185.000,00". */
function normalizarMoneda(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const moneda = /u\$s|usd|dolar/i.test(s) ? "USD" : "$";
  const soloNum = s.replace(/[^\d,.]/g, "");
  const sinDecimales = soloNum.replace(/,\d{1,2}$/, "");
  const digitos = sinDecimales.replace(/\D/g, "");
  if (!digitos) return null;
  return `${moneda} ${Number(digitos).toLocaleString("es-AR")}`;
}

/** Sí/No cargado de todas las formas que existen en una PyME. Devuelve
 *  null si el valor no parece un booleano, para no romper texto legítimo. */
const SI = new Set(["si", "si.", "s", "x", "1", "true", "verdadero", "ok", "sip"]);
const NO = new Set(["no", "n", "0", "false", "falso", "-", "--"]);

export function normalizarSiNo(raw: string): string | null {
  // Se conserva el guion: "-" es una forma habitual de escribir "no".
  const k = sinAcentos(raw).replace(/[^a-z0-9.-]/g, "");
  if (!k) return null;
  if (SI.has(k)) return "Sí";
  if (NO.has(k)) return "No";
  return null;
}

/** Números cargados como texto, con separadores mezclados. */
function normalizarNumero(raw: string): string | null {
  const s = raw.trim();
  if (!s || /[a-zA-Z]/.test(s)) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString("es-AR");
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
      // chequearlo. No se lo hace pasar por dato bueno.
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

    case "siNo": {
      if (!raw) return { valor: "" };
      const b = normalizarSiNo(raw);
      return b ? { valor: b } : { valor: raw };
    }

    case "numero": {
      if (!raw) return { valor: "" };
      const n = normalizarNumero(raw);
      return n ? { valor: n } : { valor: raw };
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

/** Claves por las que dos filas pueden ser la misma. Devuelve TODAS las
 *  que apliquen, no la primera: con una sola clave el duplicado se escapa
 *  en el caso más común —una fila trae el teléfono entero y la otra sin
 *  característica— porque cada una se indexa por un lado distinto. */
function clavesDedupe(
  celdas: Record<string, { valor: string }>,
  columnas: Columna[],
): { clave: string; motivo: string }[] {
  const claves: { clave: string; motivo: string }[] = [];

  const colTel = columnas.find((c) => c.tipo === "telefono");
  if (colTel) {
    const tel = normalizarWhatsapp(celdas[colTel.clave]?.valor ?? "");
    if (tel.length >= 12) claves.push({ clave: `tel:${tel}`, motivo: "mismo teléfono" });
  }

  const colNombre = columnas.find(
    (c) => c.clavePara === "dedupe" || c.tipo === "nombre",
  );
  if (colNombre) {
    const k = clave(celdas[colNombre.clave]?.valor ?? "");
    if (k) claves.push({ clave: `nom:${k}`, motivo: "mismo nombre" });
  }

  // Sin teléfono ni nombre no hay a qué agarrarse para saber si dos filas
  // son "la misma". Pero sí se puede ver la fila repetida carácter por
  // carácter, que es el duplicado de cualquier planilla — incluido un
  // catálogo, donde no hay personas.
  if (claves.length === 0) {
    const todo = columnas.map((c) => clave(celdas[c.clave]?.valor ?? "")).join("|");
    if (todo.replace(/\|/g, "")) {
      claves.push({ clave: `fila:${todo}`, motivo: "fila idéntica" });
    }
  }

  return claves;
}

/** Busca un dato que CONTRADIGA que dos filas sean la misma cosa.
 *
 *  Es la protección contra el error más caro de una limpieza: dos clientes
 *  que se llaman igual y tienen CUIT distinto son dos clientes. Si aparece
 *  una contradicción así, la fusión se propone igual —para que se vea—
 *  pero sugerida en NO. */
function buscarConflicto(
  a: FilaLimpia,
  b: FilaLimpia,
  columnas: Columna[],
): string | undefined {
  for (const col of columnas) {
    if (col.tipo !== "cuit" && col.tipo !== "email") continue;
    const va = a.celdas[col.clave]?.valor?.trim();
    const vb = b.celdas[col.clave]?.valor?.trim();
    if (va && vb && clave(va) !== clave(vb)) {
      return `${col.titulo} distinto: ${va} vs ${vb}`;
    }
  }
  return undefined;
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
    espaciosCorregidos: 0,
    filasIdenticas: 0,
    siNoUnificados: 0,
  };

  // Paso 1 — limpiar celda por celda, guardando el original.
  const filas: FilaLimpia[] = preset.filas.map((fila, i) => {
    const celdas: FilaLimpia["celdas"] = {};

    for (const col of preset.columnas) {
      // Sin trim: el valor crudo es la única forma de ver un espacio
      // invisible al final, que es el defecto más universal de todos.
      const original = fila[col.clave] ?? "";
      const { valor, alerta } = limpiarCelda(original, col);
      const cambio = valor !== original;

      if (original !== original.trim() || /\s{2,}/.test(original)) {
        conteos.espaciosCorregidos++;
      }

      if (cambio) {
        if (col.tipo === "telefono") conteos.telefonosNormalizados++;
        if (col.tipo === "localidad") conteos.localidadesUnificadas++;
        if (col.tipo === "fecha") conteos.fechasNormalizadas++;
        if (col.tipo === "siNo") conteos.siNoUnificados++;
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

  // Paso 2 — PROPONER fusiones. Acá no se borra ni se une nada.
  const porClave = new Map<string, FilaLimpia>();
  const fusiones: Fusion[] = [];

  for (const fila of filas) {
    const claves = clavesDedupe(fila.celdas, preset.columnas);
    const encontrada = claves.find((k) => porClave.has(k.clave));

    if (!encontrada) {
      for (const k of claves) if (!porClave.has(k.clave)) porClave.set(k.clave, fila);
      continue;
    }

    const previa = porClave.get(encontrada.clave)!;
    const conflicto = buscarConflicto(previa, fila, preset.columnas);
    const yaPropuesta = fusiones.find(
      (f) => f.principal === previa.indiceOriginal && !f.conflicto,
    );

    if (yaPropuesta && !conflicto) {
      yaPropuesta.absorbidas.push(fila.indiceOriginal);
    } else {
      fusiones.push({
        id: `f${previa.indiceOriginal}-${fila.indiceOriginal}`,
        principal: previa.indiceOriginal,
        absorbidas: [fila.indiceOriginal],
        motivo: encontrada.motivo,
        conflicto,
        // Con un dato que las contradice, la sugerencia es NO unificar.
        sugerida: !conflicto,
      });
    }

    if (!conflicto) {
      conteos.duplicadosUnificados++;
      if (encontrada.motivo === "fila idéntica") conteos.filasIdenticas++;
      for (const k of claves) if (!porClave.has(k.clave)) porClave.set(k.clave, previa);
    }
  }

  return { filas, fusiones, conteos };
}

/** Aplica solo las fusiones aceptadas. Va separada del motor a propósito:
 *  el visitante prende y apaga cada una y esto se recalcula, sin volver a
 *  limpiar nada. */
export function aplicarFusiones(
  resultado: Resultado,
  columnas: Columna[],
  aceptadas: Set<string>,
): FilaLimpia[] {
  const original = new Map(resultado.filas.map((f) => [f.indiceOriginal, f]));

  const clon = (f: FilaLimpia): FilaLimpia => ({
    ...f,
    celdas: Object.fromEntries(
      Object.entries(f.celdas).map(([k, v]) => [k, { ...v }]),
    ),
    absorbio: [],
  });

  const salida = new Map(resultado.filas.map((f) => [f.indiceOriginal, clon(f)]));
  const absorbidas = new Set<number>();

  for (const fusion of resultado.fusiones) {
    if (!aceptadas.has(fusion.id)) continue;
    const principal = salida.get(fusion.principal);
    if (!principal) continue;

    for (const idx of fusion.absorbidas) {
      const otra = original.get(idx);
      if (!otra) continue;

      for (const col of columnas) {
        const actual = principal.celdas[col.clave];
        const entrante = otra.celdas[col.clave];
        if (!entrante?.valor) continue;

        // Se completa un hueco, o se reemplaza un dato dudoso por uno sano.
        // Quedarse siempre con el primero perdería el teléfono completo de
        // la fila duplicada cuando el primero vino sin característica, que
        // es justo el caso que más aparece.
        const completaHueco = !actual.valor;
        const mejoraCalidad = Boolean(actual.alerta) && !entrante.alerta;
        if (completaHueco || mejoraCalidad) {
          principal.celdas[col.clave] = { ...entrante, cambio: true };
        }
      }
      principal.absorbio.push(idx);
      absorbidas.add(idx);
    }
  }

  return [...salida.values()].filter((f) => !absorbidas.has(f.indiceOriginal));
}
