/** Escáner de planillas: mira el archivo ANTES de tocarlo y decide qué
 *  limpieza le conviene a ésta en particular.
 *
 *  La idea de fondo: no existe "la limpieza correcta". Existe la que le
 *  sirve a esta planilla. Dos ejemplos reales de por qué:
 *
 *  - Un "-" en una columna de Sí/No puede ser un "no" (si aparece dos
 *    veces entre cien) o puede ser un TERCER estado, tipo "pendiente" o
 *    "no aplica" (si aparece en un cuarto de las filas). Convertirlo a
 *    "No" en el segundo caso destruye información.
 *  - Un CUIT que nunca se repite identifica a un cliente, así que dos
 *    filas con el mismo CUIT son la misma. Pero en una planilla de
 *    empleados el CUIT es el de la empresa y se repite a propósito: ahí
 *    usarlo para detectar repetidos junta gente distinta.
 *
 *  Por eso el escaneo primero mide, después decide, y sobre todo EXPLICA
 *  cada decisión: lo que se ve es el criterio, no un resultado mágico. */

import { sinAcentos } from "./texto";
import { normalizarSiNo } from "./limpiar";
import type { Columna, Preset, TipoColumna } from "./planillas/tipos";

const norm = (s: string) => sinAcentos(s).replace(/[^a-z0-9]/g, "");

// ── Detección de tipo ──────────────────────────────────────────────

const POR_ENCABEZADO: [RegExp, TipoColumna, string][] = [
  [/^(tel|cel|whats|movil|contacto|fono)/, "telefono", "el título habla de un teléfono"],
  [/(cuit|cuil|dni|documento)/, "cuit", "el título habla de un documento"],
  [/(mail|correo)/, "email", "el título habla de un mail"],
  [/(fecha|alta|visita|compra|publicad|vencim|ingreso)/, "fecha", "el título habla de una fecha"],
  [/(precio|monto|importe|total|valor|saldo|deuda)/, "moneda", "el título habla de plata"],
  [/(localidad|ciudad|zona|barrio|partido|sucursal|obrasocial|cobertura|proveedor|marca|rubro|categor|familia)/, "localidad", "el título es de una categoría que se repite"],
  [/(nombre|razon|cliente|paciente|propietario|apellido|titular|empresa)/, "nombre", "el título habla de un nombre"],
  [/(pago|pagado|entregado|activo|vigente|confirmad|cobrado|enviado|abonado)/, "siNo", "el título es una pregunta de sí o no"],
  [/(cantidad|stock|unidades|cant|edad|kilos|litros)/, "numero", "el título habla de una cantidad"],
];

function proporcion(valores: string[], cumple: (v: string) => boolean): number {
  const llenos = valores.filter((v) => v.trim());
  if (llenos.length < 3) return 0;
  return llenos.filter(cumple).length / llenos.length;
}

const pareceTelefono = (v: string) => {
  if (/[a-zA-Z]/.test(v)) return false;
  const d = v.replace(/\D/g, "");
  return d.length >= 8 && d.length <= 13;
};
const pareceFecha = (v: string) =>
  /^\d{4}-\d{1,2}-\d{1,2}$/.test(v.trim()) ||
  /^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}$/.test(v.trim());
const pareceMoneda = (v: string) => /^[^\d]*(\$|u\$s|usd)/i.test(v.trim());
const pareceSiNo = (v: string) => normalizarSiNo(v) !== null;
const pareceEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const pareceNumero = (v: string) => {
  const t = v.trim();
  if (!t || /[a-zA-Z]/.test(t)) return false;
  const d = t.replace(/[.,]/g, "");
  return /^\d+$/.test(d) && d.length < 8;
};

export type Deteccion = {
  tipo: TipoColumna;
  confianza: "alta" | "media" | "baja";
  razon: string;
};

/** El título acierta casi siempre, pero nunca alcanza solo: en una
 *  planilla ajena aparecen encabezados que no se pueden anticipar
 *  ("Último pedido", "Dato 2"). Cuando el nombre no dice nada, se mira el
 *  contenido, que es lo único que no depende de cómo se le ocurrió
 *  llamarla al dueño. */
export function detectarTipo(encabezado: string, valores: string[]): Deteccion {
  const n = norm(encabezado);
  for (const [re, tipo, razon] of POR_ENCABEZADO) {
    if (re.test(n)) return { tipo, confianza: "alta", razon };
  }

  const candidatos: [number, TipoColumna, string][] = [
    [proporcion(valores, pareceSiNo), "siNo", "casi todos los valores son sí o no"],
    [proporcion(valores, pareceFecha), "fecha", "casi todos los valores tienen forma de fecha"],
    [proporcion(valores, pareceMoneda), "moneda", "casi todos los valores traen signo de moneda"],
    [proporcion(valores, pareceTelefono), "telefono", "casi todos los valores tienen largo de teléfono"],
    [proporcion(valores, pareceNumero), "numero", "casi todos los valores son números cortos"],
  ];
  const siNo = candidatos[0];
  if (siNo[0] >= 0.8) return { tipo: "siNo", confianza: "alta", razon: siNo[2] };

  // Un mail no se parece a nada más: si la mayoría lo es, no hay duda.
  if (proporcion(valores, pareceEmail) >= 0.8) {
    return { tipo: "email", confianza: "alta", razon: "casi todos los valores son mails" };
  }

  const mejor = candidatos.slice(1).sort((a, b) => b[0] - a[0])[0];
  if (mejor[0] >= 0.6) {
    return {
      tipo: mejor[1],
      confianza: mejor[0] >= 0.85 ? "alta" : "media",
      razon: mejor[2],
    };
  }

  return { tipo: "texto", confianza: "baja", razon: "no sigue ningún formato reconocible" };
}

// ── Perfil de cada columna ─────────────────────────────────────────

export type Regla = { titulo: string; detalle: string };

export type PerfilColumna = {
  clave: string;
  titulo: string;
  tipo: TipoColumna;
  confianza: Deteccion["confianza"];
  razon: string;
  llenas: number;
  vacias: number;
  distintos: number;
  /** Valores únicos por fila → sirve para reconocer la misma entidad. */
  esIdentificador: boolean;
  frecuentes: { valor: string; veces: number }[];
  /** Lo que se va a hacer con esta columna, en castellano. */
  reglas: Regla[];
};

/** Umbral para decidir si un valor raro en una columna de Sí/No es un
 *  tercer estado o simplemente otra forma de escribir "no". */
const UMBRAL_TERCER_ESTADO = 0.1;

/** Valores que significan "no" tanto como "todavía no lo sé". Son los
 *  únicos candidatos a ser un tercer estado: "x" o "ok" quieren decir sí
 *  en cualquier planilla del mundo, pero un guion no dice nada por sí
 *  solo — lo que significa lo define el uso que le da esta planilla. */
const PLACEHOLDERS = new Set(["-", "--", ".", "..", "?", "na", "n/a", "s/d", "sd"]);

const esPlaceholder = (v: string) =>
  PLACEHOLDERS.has(sinAcentos(v).trim().replace(/\s+/g, ""));

function perfilar(col: Columna, valores: string[]): PerfilColumna {
  const llenosRaw = valores.filter((v) => v.trim());
  const cuenta = new Map<string, number>();
  for (const v of llenosRaw) {
    const k = v.trim();
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }
  const frecuentes = [...cuenta]
    .map(([valor, veces]) => ({ valor, veces }))
    .sort((a, b) => b.veces - a.veces);

  const distintos = cuenta.size;
  const llenas = llenosRaw.length;
  const vacias = valores.length - llenas;

  // Un identificador tiene un valor distinto por fila. Se pide casi
  // perfecto (95%) porque alcanza un par de repeticiones legítimas para
  // que deje de servir como identidad.
  const esIdentificador =
    llenas >= 3 && distintos / llenas >= 0.95;

  const reglas: Regla[] = [];
  const perfil: PerfilColumna = {
    clave: col.clave,
    titulo: col.titulo,
    tipo: col.tipo,
    confianza: "alta",
    razon: "",
    llenas,
    vacias,
    distintos,
    esIdentificador,
    frecuentes: frecuentes.slice(0, 8),
    reglas,
  };

  switch (col.tipo) {
    case "telefono":
      reglas.push({
        titulo: "Un solo formato de teléfono",
        detalle: "Se pasan todos a +54 9 11 XXXX-XXXX. Al que le falte la característica se marca, no se le inventa el prefijo.",
      });
      if (esIdentificador) {
        reglas.push({
          titulo: "Sirve para reconocer repetidos",
          detalle: `Los ${llenas} teléfonos son distintos entre sí, así que dos filas con el mismo teléfono son la misma persona.`,
        });
      } else if (llenas >= 3) {
        reglas.push({
          titulo: "No se usa para detectar repetidos",
          detalle: "Hay teléfonos que se repiten en filas distintas: puede ser el teléfono de la empresa o de la familia, así que no alcanza para decir que son la misma persona.",
        });
      }
      break;

    case "cuit": {
      reglas.push({
        titulo: "Se verifica el dígito verificador",
        detalle: "Con el algoritmo de AFIP. El que no cierre se marca; no se corrige solo, porque el número correcto no se puede adivinar.",
      });
      if (esIdentificador) {
        reglas.push({
          titulo: "Sirve para distinguir homónimos",
          detalle: `Los ${llenas} documentos son únicos. Si dos filas se llaman igual pero tienen documento distinto, son dos personas y no se van a unificar.`,
        });
      } else if (llenas >= 3) {
        const rep = frecuentes.find((f) => f.veces > 1);
        reglas.push({
          titulo: "Acá el documento se repite a propósito",
          detalle: `${rep?.valor ?? "Un documento"} aparece en ${rep?.veces ?? 2} filas. Parece el CUIT de una empresa con varias personas o varios registros, así que NO se usa ni para unificar ni para separar.`,
        });
      }
      break;
    }

    case "siNo": {
      // Acá está la decisión fina: qué hacer con el valor ambiguo. Un
      // placeholder frecuente se respeta como tercer estado; todo lo demás
      // que se entienda como sí o no se unifica.
      const terceros = frecuentes.filter(
        (f) =>
          esPlaceholder(f.valor) &&
          f.veces / Math.max(llenas, 1) >= UMBRAL_TERCER_ESTADO,
      );
      const resto = frecuentes.filter((f) => !terceros.includes(f));
      const reconocidos = resto.filter((f) => normalizarSiNo(f.valor) !== null);
      const raros = resto.filter((f) => normalizarSiNo(f.valor) === null);

      const formas = [...new Set(reconocidos.map((f) => f.valor.toLowerCase()))];
      if (formas.length > 2) {
        const muestra = formas.slice(0, 6).map((f) => `"${f}"`).join(", ");
        const resto = formas.length - 6;
        reglas.push({
          titulo: `Unificar ${formas.length} formas de escribir sí y no`,
          detalle: `Aparecen como ${muestra}${
            resto > 0 ? ` y ${resto} más` : ""
          }. Se llevan todas a Sí / No.`,
        });
      }
      for (const t of terceros) {
        reglas.push({
          titulo: `"${t.valor}" se deja como está`,
          detalle: `Aparece en ${t.veces} de ${llenas} filas (${Math.round((t.veces / llenas) * 100)}%). Con esa frecuencia no parece otra forma de decir "no", sino un estado propio. Convertirlo perdería información.`,
        });
      }
      if (raros.length) {
        reglas.push({
          titulo: "Valores sueltos sin tocar",
          detalle: `${raros.map((c) => `"${c.valor}"`).join(", ")} no se entienden como sí ni como no. Se dejan como están para que los revises.`,
        });
      }
      break;
    }

    case "localidad":
      if (distintos > 1) {
        reglas.push({
          titulo: "Unificar las formas de escribir lo mismo",
          detalle: `Hay ${distintos} valores distintos en ${llenas} filas. Los que solo cambian en acentos o mayúsculas se unifican en la variante más usada.`,
        });
      }
      break;

    case "fecha":
      reglas.push({
        titulo: "Un solo formato de fecha",
        detalle: "Se pasan todas a año-mes-día. Se asume día/mes, nunca mes/día, porque es una planilla argentina.",
      });
      break;

    case "moneda":
      reglas.push({
        titulo: "Un solo formato de importe",
        detalle: "Se separan los miles y se conserva la moneda que traía cada fila.",
      });
      break;

    case "nombre":
      reglas.push({
        titulo: "Mayúsculas y minúsculas parejas",
        detalle: "Se respetan las siglas (SRL, SA) y los enlaces en minúscula (de, del, la).",
      });
      break;

    default:
      reglas.push({
        titulo: "Solo se limpian los espacios",
        detalle: "No se toca el contenido: no hay forma de saber qué es lo correcto en un texto libre.",
      });
  }

  const conEspacios = valores.filter(
    (v) => v !== v.trim() || /\s{2,}/.test(v),
  ).length;
  if (conEspacios) {
    reglas.push({
      titulo: `${conEspacios} celda${conEspacios > 1 ? "s" : ""} con espacios invisibles`,
      detalle: "Espacios al final o dobles en el medio. No se ven, pero rompen los BUSCARV y los filtros.",
    });
  }

  return perfil;
}

// ── Consejos (no modifican nada) ───────────────────────────────────

export type Consejo = {
  id: string;
  columna?: string;
  titulo: string;
  detalle: string;
};

const GENERICO = /^(columna|col|dato|campo|sin titulo|unnamed)\s*\d*$/i;

function consejosDe(preset: Preset, perfiles: PerfilColumna[]): Consejo[] {
  const consejos: Consejo[] = [];
  const total = preset.filas.length;

  for (const p of perfiles) {
    if (GENERICO.test(p.titulo.trim())) {
      consejos.push({
        id: `nombre-${p.clave}`,
        columna: p.titulo,
        titulo: "Ponele nombre a esta columna",
        detalle: "Sin un título que diga qué guarda, cualquier sistema que la lea después —incluido este— tiene que adivinar.",
      });
    }

    if (total >= 5 && p.llenas / total <= 0.15) {
      consejos.push({
        id: `vacia-${p.clave}`,
        columna: p.titulo,
        titulo: "Está casi vacía",
        detalle: `Solo ${p.llenas} de ${total} filas tienen algo. O se completa, o conviene sacarla: una columna vacía hace pensar que el dato existe.`,
      });
    }

    // Varios valores metidos en una sola celda
    const multiples = preset.filas.filter((f) => {
      const v = (f[p.clave] ?? "").trim();
      return v.length > 3 && /\s[/;]\s|\s\/\s|\s;\s/.test(v);
    }).length;
    if (multiples >= 2) {
      consejos.push({
        id: `separar-${p.clave}`,
        columna: p.titulo,
        titulo: "Conviene separarla en varias columnas",
        detalle: `${multiples} celdas tienen más de un valor adentro, separados por barra o punto y coma. Mientras estén juntos no se pueden filtrar ni contar por separado.`,
      });
    }

    // Dirección que además trae la localidad
    if (/direcc|domicil/.test(norm(p.titulo))) {
      const conComa = preset.filas.filter((f) => (f[p.clave] ?? "").includes(",")).length;
      if (conComa >= Math.max(2, total * 0.3)) {
        consejos.push({
          id: `dir-${p.clave}`,
          columna: p.titulo,
          titulo: "La dirección trae la localidad adentro",
          detalle: "Separar calle y localidad en dos columnas permite agrupar por zona, armar recorridos y filtrar por barrio.",
        });
      }
    }
  }

  // Encabezados repetidos
  const vistos = new Map<string, string[]>();
  for (const p of perfiles) {
    const k = norm(p.titulo);
    vistos.set(k, [...(vistos.get(k) ?? []), p.titulo]);
  }
  for (const [, titulos] of vistos) {
    if (titulos.length > 1) {
      consejos.push({
        id: `repe-${norm(titulos[0])}`,
        titulo: `Hay ${titulos.length} columnas llamadas "${titulos[0]}"`,
        detalle: "Con el mismo título no se sabe cuál es cuál, y cualquier importación va a tomar una sola.",
      });
    }
  }

  // Dos columnas que se completan entre sí: uno llena una o la otra
  for (let i = 0; i < perfiles.length; i++) {
    for (let j = i + 1; j < perfiles.length; j++) {
      const a = perfiles[i];
      const b = perfiles[j];
      if (a.tipo !== b.tipo || a.llenas === 0 || b.llenas === 0) continue;
      const ambas = preset.filas.filter(
        (f) => (f[a.clave] ?? "").trim() && (f[b.clave] ?? "").trim(),
      ).length;
      const alguna = preset.filas.filter(
        (f) => (f[a.clave] ?? "").trim() || (f[b.clave] ?? "").trim(),
      ).length;
      if (alguna >= 4 && ambas === 0) {
        consejos.push({
          id: `unir-${a.clave}-${b.clave}`,
          titulo: `"${a.titulo}" y "${b.titulo}" nunca están llenas juntas`,
          detalle: "Parecen la misma información cargada en dos lugares. Unificarlas en una sola columna simplifica todo lo que venga después.",
        });
      }
    }
  }

  return consejos;
}

// ── Escaneo completo ───────────────────────────────────────────────

export type Escaneo = {
  filas: number;
  resumen: string;
  perfiles: PerfilColumna[];
  consejos: Consejo[];
  /** Las columnas ya enriquecidas, listas para pasarle al motor. */
  columnas: Columna[];
};

function resumirDe(perfiles: PerfilColumna[], filas: number): string {
  const tiene = (t: TipoColumna) => perfiles.some((p) => p.tipo === t);
  const partes: string[] = [];

  if (tiene("nombre")) partes.push("nombres");
  if (tiene("telefono")) partes.push("teléfonos");
  if (tiene("cuit")) partes.push("documentos");
  if (tiene("moneda")) partes.push("importes");
  if (tiene("fecha")) partes.push("fechas");

  const gente = tiene("nombre") && (tiene("telefono") || tiene("cuit"));
  const cabecera = gente
    ? "Parece una base de contactos o clientes"
    : tiene("moneda") || tiene("numero")
      ? "Parece un listado de productos o movimientos"
      : "Planilla de datos";

  return `${cabecera}: ${filas} filas, ${perfiles.length} columnas${
    partes.length ? ` (${partes.join(", ")})` : ""
  }.`;
}

export function escanear(
  preset: Preset,
  tiposManuales: Record<string, TipoColumna> = {},
): Escaneo {
  const columnas: Columna[] = preset.columnas.map((col) => {
    const valores = preset.filas.map((f) => f[col.clave] ?? "");
    const manual = tiposManuales[col.clave];
    const tipo = manual ?? col.tipo;

    // Un identificador se calcula igual que en perfilar, y viaja en la
    // columna para que el motor sepa si puede confiar en ella.
    const llenas = valores.filter((v) => v.trim()).length;
    const distintos = new Set(valores.map((v) => v.trim()).filter(Boolean)).size;
    const esIdentificador = llenas >= 3 && distintos / llenas >= 0.95;

    // Para Sí/No: qué valores son un tercer estado y no hay que tocar.
    let siNoDejar: string[] | undefined;
    if (tipo === "siNo") {
      const cuenta = new Map<string, number>();
      for (const v of valores) {
        const k = v.trim();
        if (k) cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
      }
      // Solo se congela un PLACEHOLDER frecuente. "x" o "s" quieren decir
      // sí en cualquier planilla y siempre se unifican; el guion no: si
      // aparece en un cuarto de las filas es un estado propio de ésta.
      siNoDejar = [...cuenta]
        .filter(([valor]) => esPlaceholder(valor))
        .filter(([, veces]) => veces / Math.max(llenas, 1) >= UMBRAL_TERCER_ESTADO)
        .map(([valor]) => valor);
    }

    return { ...col, tipo, esIdentificador, siNoDejar };
  });

  const perfiles = columnas.map((col, i) => {
    const valores = preset.filas.map((f) => f[col.clave] ?? "");
    const p = perfilar(col, valores);
    const original = preset.columnas[i];
    if (tiposManuales[col.clave]) {
      p.confianza = "alta";
      p.razon = "lo elegiste vos";
    } else if (original.tipo) {
      p.razon = p.razon || "según el título y el contenido";
    }
    return p;
  });

  return {
    filas: preset.filas.length,
    resumen: resumirDe(perfiles, preset.filas.length),
    perfiles,
    consejos: consejosDe(preset, perfiles),
    columnas,
  };
}
