/** Ordenador de tablas: toma una planilla como viene —con el título
 *  arriba, filas en blanco en el medio, el total abajo, dos datos en una
 *  misma celda— y la deja como una tabla de verdad.
 *
 *  No sabe de rubros y no le hace falta. Lo que ordena es la FORMA, y los
 *  problemas de forma son los mismos en una inmobiliaria que en una
 *  ferretería: todos copian el título de la planilla en la fila 1, todos
 *  dejan una fila de TOTAL al pie y todos terminan anotando "teléfono /
 *  mail" en la misma celda.
 *
 *  Igual que con los repetidos, nada se aplica a escondidas: cada cambio
 *  sale como propuesta con su explicación, se puede rechazar uno por uno,
 *  y el Excel final lleva la planilla original en otra hoja. */

import { detectarTipo } from "./escanear";
import { masFrecuentePorGrupo, sinAcentos } from "./texto";
import type { Canonico, Columna, Preset, TipoColumna } from "./planillas/tipos";

export type Grilla = string[][];

export type TipoCambio =
  | "encabezado"
  | "pie"
  | "filasVacias"
  | "columnasVacias"
  | "separar"
  | "direccion"
  | "unir"
  | "reordenar"
  | "ordenarFilas";

export type Cambio = {
  id: string;
  tipo: TipoCambio;
  titulo: string;
  detalle: string;
  /** Si conviene aplicarlo sin preguntar. Un cambio que puede perder una
   *  distinción que al dueño le importe viene en NO. */
  porDefecto: boolean;
  /** Un caso concreto, para que se entienda sin ir a buscarlo. */
  ejemplo?: { antes: string; despues: string };
};

export type OrdenFilas = {
  clave: string;
  titulo: string;
  sentido: "asc" | "desc";
  tipo: TipoColumna;
};

export type Ordenado = {
  cambios: Cambio[];
  /** La tabla con los cambios aceptados aplicados. */
  preset: Preset;
  /** Se aplica recién después de limpiar: hay que ordenar por el valor
   *  limpio, no por "VETERINARIA" contra "Veterinaria". */
  ordenFilas: OrdenFilas | null;
  /** Columnas que tenían un total al pie. El Excel lo vuelve a poner,
   *  pero como fórmula: así se actualiza solo. */
  columnasConTotal: string[];
  /** El título que la planilla tenía arriba de la tabla, si tenía. */
  tituloHoja: string | null;
  /** Cuántas filas de datos tenía antes de ordenar nada. */
  filasOriginales: number;
};

export type OpcionesOrden = {
  /** Decide si se aplica cada cambio. Sin esto, se aplica lo sugerido. */
  aceptar?: (c: Cambio) => boolean;
  /** Columnas ya conocidas (las de los ejemplos). Si un título coincide
   *  se usan tal cual en vez de adivinar el tipo. */
  pistas?: Columna[];
  slug?: string;
  nombre?: string;
  rubro?: string;
  gancho?: string;
};

// ── Utilidades ────────────────────────────────────────────────────

const norm = (s: string) => sinAcentos(s).replace(/[^a-z0-9]/g, "");
const lleno = (c: string | undefined): c is string => !!c && c.trim() !== "";
const cuantosLlenos = (fila: string[]) => fila.filter(lleno).length;

/** Algo que es un DATO y no un título: plata, fecha, o casi todo dígitos.
 *  Un encabezado nunca es así, aunque tenga un año ("Ventas 2025"). */
function pareceDato(c: string): boolean {
  const t = c.trim();
  if (!t) return false;
  if (/^[^\d]*(\$|u\$s|usd)/i.test(t)) return true;
  if (/^\d{1,4}[/\-.]\d{1,2}[/\-.]\d{2,4}$/.test(t)) return true;
  const sinEsp = t.replace(/\s/g, "");
  const digitos = (sinEsp.match(/\d/g) ?? []).length;
  return digitos > 0 && digitos / sinEsp.length >= 0.5;
}

function moda(nums: number[]): number {
  const cuenta = new Map<number, number>();
  for (const n of nums) cuenta.set(n, (cuenta.get(n) ?? 0) + 1);
  let mejor = nums[0] ?? 0;
  let veces = 0;
  for (const [n, v] of cuenta) {
    if (v > veces || (v === veces && n > mejor)) {
      mejor = n;
      veces = v;
    }
  }
  return mejor;
}

// ── 1. Encontrar la tabla ─────────────────────────────────────────

/** La fila de títulos es la primera que ocupa casi todo el ancho de la
 *  tabla y no tiene ni un dato adentro. Lo que hay arriba —el nombre del
 *  negocio, "Actualizado marzo 2026"— son títulos de la planilla, no de
 *  las columnas.
 *
 *  Límite conocido: en una tabla de DOS columnas donde una no tiene
 *  título, la fila de títulos tiene una sola celda y es indistinguible de
 *  un título suelto. Por eso el cambio siempre se muestra y se puede
 *  rechazar. Con tres columnas o más no pasa. */
function buscarEncabezado(g: Grilla): number {
  const anchos = g.map(cuantosLlenos).filter((n) => n >= 2);
  if (!anchos.length) return 0;
  const ancho = moda(anchos);
  const minimo = Math.max(2, Math.ceil(ancho * 0.6));

  for (let r = 0; r < Math.min(g.length, 20); r++) {
    const llenas = g[r].filter(lleno);
    if (llenas.length >= minimo && llenas.every((c) => !pareceDato(c))) return r;
  }
  return 0;
}

const TOTAL = /^(total(es)?|sub ?total|suma|promedio)\b/;

/** Una fila del pie: el total, o una nota suelta ("Precios sin IVA.").
 *  La nota tiene que PARECER una nota —varias palabras, punto final o
 *  dos puntos— para no confundirla con el último registro, que puede
 *  tener una sola celda llena. */
function esPie(fila: string[], ancho: number): "total" | "nota" | null {
  const llenas = fila.filter(lleno);
  if (!llenas.length) return null;
  if (TOTAL.test(sinAcentos(llenas[0]).trim())) return "total";
  if (ancho < 3 || llenas.length !== 1) return null;
  const t = llenas[0].trim();
  const palabras = t.split(/\s+/).length;
  if (palabras >= 3 && (/[.:]$/.test(t) || t.includes(":")) && !pareceDato(t)) {
    return "nota";
  }
  return null;
}

// ── 2. Columnas ───────────────────────────────────────────────────

type Col = {
  id: string;
  titulo: string;
  valores: string[];
  /** Las columnas que salen de separar una quedan juntas al reordenar. */
  grupo: string;
  /** Columna de la planilla original de la que viene. */
  origen: number;
  tipo?: TipoColumna;
};

const SEPARADOR = /\s+[/|]\s+|\s*;\s*/;

const SUFIJO: Record<TipoColumna, string> = {
  telefono: "teléfono",
  email: "mail",
  cuit: "documento",
  fecha: "fecha",
  moneda: "importe",
  numero: "número",
  localidad: "zona",
  nombre: "nombre",
  texto: "detalle",
  siNo: "sí/no",
};

/** El tipo de un pedazo de celda. Con pocos valores `detectarTipo` no se
 *  anima a decidir (pide tres); acá alcanza con que la mayoría cumpla,
 *  porque el pedazo viene de una columna que ya sabemos que mezcla. */
function tipoDeParte(valores: string[]): TipoColumna {
  const llenos = valores.filter(lleno);
  if (!llenos.length) return "texto";
  const prop = (f: (v: string) => boolean) => llenos.filter(f).length / llenos.length;
  if (prop((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) >= 0.6) return "email";
  if (
    prop((v) => {
      if (/[a-z]/i.test(v)) return false;
      const d = v.replace(/\D/g, "").length;
      return d >= 8 && d <= 13;
    }) >= 0.6
  ) {
    return "telefono";
  }
  return detectarTipo("", valores).tipo;
}

type Separacion = {
  partes: string[][];
  titulos: string[];
  tipos: TipoColumna[];
  conSeparador: number;
  ejemplo: string;
};

function proponerSeparar(col: Col): Separacion | null {
  const llenas = col.valores.filter(lleno);
  const con = llenas.filter((v) => SEPARADOR.test(v));
  if (con.length < 2 || con.length / llenas.length < 0.2) return null;

  const trozos = col.valores.map((v) =>
    lleno(v) ? v.split(SEPARADOR).map((s) => s.trim()).filter(Boolean) : [],
  );
  const k = Math.min(4, Math.max(...trozos.map((t) => t.length)));
  if (k < 2) return null;

  // Lo que sobra después de la cuarta parte va junto en la última: se
  // separa lo que se puede sin inventar columnas de a una por celda.
  const partes = Array.from({ length: k }, (_, i) =>
    trozos.map((t) => (i < k - 1 ? t[i] ?? "" : t.slice(k - 1).join(" / "))),
  );
  const tipos = partes.map(tipoDeParte);

  const iguales = tipos.every((t) => t === tipos[0]);
  const titulos = iguales
    ? partes.map((_, i) => `${col.titulo} ${i + 1}`)
    : tipos.map((t, i) => (i === 0 ? col.titulo : `${col.titulo} · ${SUFIJO[t]}`));

  return { partes, titulos: unicos(titulos), tipos, conSeparador: con.length, ejemplo: con[0] };
}

function unicos(titulos: string[]): string[] {
  const vistos = new Map<string, number>();
  return titulos.map((t) => {
    const n = (vistos.get(t) ?? 0) + 1;
    vistos.set(t, n);
    return n === 1 ? t : `${t} ${n}`;
  });
}

const ES_DIRECCION = /direcc|domicil/;
const ES_LUGAR = /localidad|ciudad|barrio|partido|zona/;

function proponerDireccion(col: Col, todas: Col[]): { calle: string[]; lugar: string[]; ejemplo: string } | null {
  if (!ES_DIRECCION.test(norm(col.titulo))) return null;
  if (todas.some((c) => ES_LUGAR.test(norm(c.titulo)))) return null;
  const llenas = col.valores.filter(lleno);
  const con = llenas.filter((v) => v.includes(","));
  if (con.length < Math.max(2, llenas.length * 0.3)) return null;

  // Se corta en la ÚLTIMA coma: "Av. Maipú 1200, 3° B, Vicente López"
  // tiene la localidad al final, no después de la primera coma.
  const calle: string[] = [];
  const lugar: string[] = [];
  for (const v of col.valores) {
    const i = v.lastIndexOf(",");
    if (i < 0) {
      calle.push(v);
      lugar.push("");
    } else {
      calle.push(v.slice(0, i).trim());
      lugar.push(v.slice(i + 1).trim());
    }
  }
  return { calle, lugar, ejemplo: con[0] };
}

function tipoDe(col: Col, pistas: Map<string, Columna>): TipoColumna {
  return pistas.get(norm(col.titulo))?.tipo ?? col.tipo ?? detectarTipo(col.titulo, col.valores).tipo;
}

const primeraPalabra = (t: string) => sinAcentos(t).split(/[^a-z]+/).find((p) => p.length >= 3) ?? "";

function tituloComun(a: string, b: string): string {
  const pa = a.split(/\s+/);
  const pb = b.split(/\s+/);
  const comun: string[] = [];
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    if (norm(pa[i]) !== norm(pb[i])) break;
    comun.push(pa[i]);
  }
  const t = comun.join(" ").replace(/[\s.:,-]+$/, "");
  return t || `${a} / ${b}`;
}

// ── 3. Orden de las columnas ──────────────────────────────────────

const ES_LIBRE = /observ|nota|coment|aclarac/;
const ES_CONTACTO = /contacto|whats|celular|mail/;

function esTextoLibre(c: Col): boolean {
  if (ES_LIBRE.test(norm(c.titulo))) return true;
  const llenos = c.valores.filter(lleno);
  if (!llenos.length) return false;
  return llenos.reduce((a, v) => a + v.length, 0) / llenos.length > 40;
}

function proporcionDistintos(c: Col): number {
  const llenos = c.valores.filter(lleno).map((v) => v.trim());
  return llenos.length ? new Set(llenos).size / llenos.length : 0;
}

/** Orden de lectura de una ficha: quién es, cómo se lo identifica,
 *  cómo ubicarlo, dónde está, y el resto como vino. Los comentarios van
 *  al final porque son lo más ancho y lo que menos se filtra.
 *
 *  Si la planilla NO es de gente (stock, precios) no se mueve nada salvo
 *  los comentarios: ahí no hay una "ficha" que respetar y cualquier otro
 *  orden sería inventado. */
function ordenDeColumnas(cols: Col[]): Col[] {
  const deGente = cols.some((c) => c.tipo === "nombre" || c.tipo === "cuit");
  const primera = cols[0];
  const clave =
    primera &&
    (primera.tipo === "texto" || primera.tipo === "nombre") &&
    !esTextoLibre(primera) &&
    proporcionDistintos(primera) >= 0.8
      ? primera.grupo
      : null;

  const rango = (c: Col): number => {
    if (c.grupo === clave) return 0;
    if (esTextoLibre(c)) return 9;
    if (!deGente) return 5;
    if (c.tipo === "nombre") return 1;
    if (c.tipo === "cuit") return 2;
    if (c.tipo === "telefono" || c.tipo === "email" || ES_CONTACTO.test(norm(c.titulo))) return 3;
    if (ES_DIRECCION.test(norm(c.titulo)) || ES_LUGAR.test(norm(c.titulo))) return 4;
    return 5;
  };

  // Se ordenan GRUPOS, no columnas sueltas: "Contacto" y "Contacto ·
  // teléfono" salieron de la misma celda y separarlas sería peor.
  const grupos: { id: string; cols: Col[]; rango: number; pos: number }[] = [];
  cols.forEach((c, pos) => {
    const g = grupos.find((x) => x.id === c.grupo);
    if (g) g.cols.push(c);
    else grupos.push({ id: c.grupo, cols: [c], rango: rango(c), pos });
  });
  grupos.sort((a, b) => a.rango - b.rango || a.pos - b.pos);
  return grupos.flatMap((g) => g.cols);
}

// ── 4. Canónicos ──────────────────────────────────────────────────

/** Para una planilla ajena no hay lista canónica: se deduce de los
 *  propios datos quedándose con la variante más usada de cada grupo que
 *  sólo difiere en acentos o mayúsculas. */
function canonicosDesdeDatos(valores: string[]): Canonico[] {
  const cuenta = new Map<string, number>();
  for (const v of valores) {
    const t = v.trim();
    if (t) cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
  }
  const filas = [...cuenta].map(([texto, cantidad]) => ({ texto, cantidad }));
  return masFrecuentePorGrupo(filas).map((valor) => ({ valor, alias: [] }));
}

const claveDe = (id: string) => id.replace(/\W/g, "_");

/** Corta en el último espacio antes del límite, nunca a mitad de palabra. */
function recortar(t: string, max: number): string {
  if (t.length <= max) return t;
  const corte = t.lastIndexOf(" ", max);
  return `${t.slice(0, corte > max * 0.6 ? corte : max).trimEnd()}…`;
}

// ── El ordenador ──────────────────────────────────────────────────

export function ordenarGrilla(grillaCruda: Grilla, op: OpcionesOrden = {}): Ordenado {
  const aceptar = op.aceptar ?? ((c: Cambio) => c.porDefecto);
  const pistas = new Map((op.pistas ?? []).map((c) => [norm(c.titulo), c]));
  const cambios: Cambio[] = [];
  const decidir = (c: Cambio) => {
    cambios.push(c);
    return aceptar(c);
  };

  const ancho = Math.max(0, ...grillaCruda.map((f) => f.length));
  const g: Grilla = grillaCruda.map((f) => Array.from({ length: ancho }, (_, i) => f[i] ?? ""));

  // Encabezado
  const encontrado = buscarEncabezado(g);
  let inicio = 0;
  let tituloHoja: string | null = null;
  if (encontrado > 0) {
    const arriba = g.slice(0, encontrado).map((f) => f.filter(lleno).join(" ")).filter(Boolean);
    const aceptado = decidir({
      id: "encabezado",
      tipo: "encabezado",
      titulo: `La tabla empieza en la fila ${encontrado + 1}`,
      detalle: arriba.length
        ? `Arriba había ${arriba.length === 1 ? "un título" : `${arriba.length} filas de título`}: "${arriba.join(" · ")}". Se saca de la tabla y pasa a ser el nombre de la hoja: adentro de la tabla, Excel lo trata como un registro más.`
        : "Arriba había filas en blanco. Se sacan para que la primera fila sea la de los títulos.",
      porDefecto: true,
    });
    if (aceptado) {
      inicio = encontrado;
      tituloHoja = arriba[0] ?? null;
    }
  }

  const encabezado = g[inicio] ?? [];
  let cuerpo = g.slice(inicio + 1).map((fila, i) => ({ fila, n: inicio + 2 + i }));
  const filasOriginales = cuerpo.filter((r) => cuantosLlenos(r.fila) > 0).length;

  // Pie: se recorre desde abajo salteando filas vacías
  const anchoTabla = moda(cuerpo.map((r) => cuantosLlenos(r.fila)).filter((n) => n >= 2));
  const pie: { fila: string[]; n: number; tipo: "total" | "nota" }[] = [];
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    const r = cuerpo[i];
    if (cuantosLlenos(r.fila) === 0) continue;
    const t = esPie(r.fila, anchoTabla);
    if (!t) break;
    pie.unshift({ ...r, tipo: t });
  }
  const filaTotal = pie.find((p) => p.tipo === "total")?.fila ?? null;
  if (pie.length) {
    const textos = pie.map((p) => p.fila.filter(lleno).join(" "));
    const hayTotal = pie.some((p) => p.tipo === "total");
    const aceptado = decidir({
      id: "pie",
      tipo: "pie",
      titulo: hayTotal
        ? pie.length > 1
          ? "Sacar el total y la nota del final"
          : "Sacar la fila del total"
        : pie.length > 1
          ? "Sacar las notas del final"
          : "Sacar la nota del final",
      detalle:
        (hayTotal
          ? "El total no es un registro: si queda adentro, cualquier filtro o suma lo cuenta como uno más. En el Excel vuelve a aparecer abajo, pero como fórmula, así se actualiza solo."
          : "Una nota al pie no es un registro: si queda adentro de la tabla, los filtros la tratan como uno más.") +
        (pie.some((p) => p.tipo === "nota")
          ? " La nota queda guardada en la hoja de cambios del Excel."
          : ""),
      porDefecto: true,
      ejemplo: { antes: recortar(textos.join("  ·  "), 90), despues: "" },
    });
    if (aceptado) {
      const fuera = new Set(pie.map((p) => p.n));
      cuerpo = cuerpo.filter((r) => !fuera.has(r.n));
    }
  }

  // Filas vacías en el medio
  const vacias = cuerpo.filter((r) => cuantosLlenos(r.fila) === 0);
  if (vacias.length) {
    const aceptado = decidir({
      id: "filasVacias",
      tipo: "filasVacias",
      titulo:
        vacias.length === 1 ? "Sacar una fila vacía" : `Sacar ${vacias.length} filas vacías`,
      detalle:
        "Una fila en blanco corta la tabla en dos: Excel deja de reconocerla como un solo bloque y los filtros y el orden se quedan con la mitad.",
      porDefecto: true,
    });
    if (aceptado) cuerpo = cuerpo.filter((r) => cuantosLlenos(r.fila) > 0);
  }

  // Columnas
  let cols: Col[] = encabezado.map((t, j) => ({
    id: `c${j}`,
    titulo: t.trim() || `Columna ${j + 1}`,
    valores: cuerpo.map((r) => r.fila[j] ?? ""),
    grupo: `c${j}`,
    origen: j,
  }));

  const vaciasCol = cols.filter(
    (c) => !lleno(encabezado[c.origen]) && c.valores.every((v) => !lleno(v)),
  );
  if (vaciasCol.length) {
    const aceptado = decidir({
      id: "columnasVacias",
      tipo: "columnasVacias",
      titulo:
        vaciasCol.length === 1
          ? "Sacar una columna vacía"
          : `Sacar ${vaciasCol.length} columnas vacías`,
      detalle:
        "Sin título y sin un solo dato. Parten la tabla en dos y el que la lee se pregunta qué se borró de ahí.",
      porDefecto: true,
    });
    if (aceptado) {
      const fuera = new Set(vaciasCol.map((c) => c.id));
      cols = cols.filter((c) => !fuera.has(c.id));
    }
  }

  for (const c of cols) c.tipo = tipoDe(c, pistas);

  // Separar y direcciones: se evalúan sobre las columnas como vinieron
  const involucradas = new Set<string>();
  const reemplazos = new Map<string, Col[]>();

  for (const c of cols) {
    const sep = proponerSeparar(c);
    if (sep) {
      involucradas.add(c.id);
      const aceptado = decidir({
        id: `separar:${c.id}`,
        tipo: "separar",
        titulo: `Separar "${c.titulo}" en ${sep.partes.length} columnas`,
        detalle: `${sep.conSeparador} celdas tienen más de un dato adentro. Juntos no se pueden filtrar, ordenar ni usar por separado: a una celda que dice nombre y teléfono juntos no se le puede mandar un WhatsApp.`,
        porDefecto: true,
        ejemplo: {
          antes: sep.ejemplo,
          despues: sep.ejemplo.split(SEPARADOR).map((s) => s.trim()).join("  │  "),
        },
      });
      if (aceptado) {
        reemplazos.set(
          c.id,
          sep.partes.map((valores, i) => ({
            id: `${c.id}.${i}`,
            titulo: sep.titulos[i],
            valores,
            grupo: c.id,
            origen: c.origen,
            tipo: sep.tipos[i],
          })),
        );
      }
      continue;
    }

    const dir = proponerDireccion(c, cols);
    if (dir) {
      involucradas.add(c.id);
      const i = dir.ejemplo.lastIndexOf(",");
      const aceptado = decidir({
        id: `direccion:${c.id}`,
        tipo: "direccion",
        titulo: `Separar la localidad de "${c.titulo}"`,
        detalle:
          "La localidad está adentro de la dirección. En su propia columna se puede filtrar por zona, contar cuántos hay en cada barrio o armar un recorrido.",
        porDefecto: true,
        ejemplo: {
          antes: dir.ejemplo,
          despues: `${dir.ejemplo.slice(0, i).trim()}  │  ${dir.ejemplo.slice(i + 1).trim()}`,
        },
      });
      if (aceptado) {
        reemplazos.set(c.id, [
          { id: `${c.id}.0`, titulo: c.titulo, valores: dir.calle, grupo: c.id, origen: c.origen, tipo: "texto" },
          { id: `${c.id}.1`, titulo: "Localidad", valores: dir.lugar, grupo: c.id, origen: c.origen, tipo: "localidad" },
        ]);
      }
    }
  }

  // Unir: dos columnas del mismo dato, nunca llenas a la vez
  const unidas = new Map<string, { con: string; titulo: string }>();
  const absorbidas = new Set<string>();
  const unibles = cols.filter(
    (c) => !involucradas.has(c.id) && c.tipo !== "texto" && c.tipo !== "siNo",
  );
  for (let i = 0; i < unibles.length; i++) {
    const a = unibles[i];
    if (involucradas.has(a.id)) continue;
    for (let j = i + 1; j < unibles.length; j++) {
      const b = unibles[j];
      if (involucradas.has(b.id) || a.tipo !== b.tipo) continue;
      let ambas = 0;
      let alguna = 0;
      let soloA = 0;
      let soloB = 0;
      a.valores.forEach((va, k) => {
        const la = lleno(va);
        const lb = lleno(b.valores[k]);
        if (la && lb) ambas++;
        if (la || lb) alguna++;
        if (la && !lb) soloA++;
        if (lb && !la) soloB++;
      });
      if (ambas > 0 || alguna < 4 || !soloA || !soloB) continue;

      const mismaRaiz = primeraPalabra(a.titulo) !== "" && primeraPalabra(a.titulo) === primeraPalabra(b.titulo);
      const titulo = tituloComun(a.titulo, b.titulo);
      involucradas.add(a.id);
      involucradas.add(b.id);
      const aceptado = decidir({
        id: `unir:${a.id}+${b.id}`,
        tipo: "unir",
        titulo: `Unir "${a.titulo}" y "${b.titulo}"`,
        detalle:
          `En ninguna fila están las dos llenas: es el mismo dato anotado en dos lugares, y así para buscar hay que mirar en las dos.` +
          (mismaRaiz
            ? ""
            : " Ojo: si la diferencia entre una y otra te importa, dejalas separadas."),
        porDefecto: mismaRaiz,
        ejemplo: { antes: `${a.titulo}  +  ${b.titulo}`, despues: titulo },
      });
      if (aceptado) {
        unidas.set(a.id, { con: b.id, titulo });
        absorbidas.add(b.id);
      }
      break;
    }
  }

  // Aplicar separaciones y uniones, respetando la posición original
  const porId = new Map(cols.map((c) => [c.id, c]));
  cols = cols.flatMap((c) => {
    if (absorbidas.has(c.id)) return [];
    const u = unidas.get(c.id);
    if (u) {
      const b = porId.get(u.con)!;
      return [{ ...c, titulo: u.titulo, valores: c.valores.map((v, k) => (lleno(v) ? v : b.valores[k])) }];
    }
    return reemplazos.get(c.id) ?? [c];
  });

  // Reordenar
  const ordenadas = ordenDeColumnas(cols);
  if (ordenadas.some((c, i) => c.id !== cols[i].id)) {
    const deGente = cols.some((c) => c.tipo === "nombre" || c.tipo === "cuit");
    const aceptado = decidir({
      id: "reordenar",
      tipo: "reordenar",
      titulo: "Acomodar el orden de las columnas",
      detalle: deGente
        ? "Primero quién es, después cómo ubicarlo y dónde, y los comentarios al final. Se lee de izquierda a derecha como una ficha. La primera columna queda donde estaba: es la que elegiste para reconocer cada fila."
        : "Los comentarios pasan al final: son lo que más ancho ocupa y lo que menos se filtra. El resto queda en el orden en que lo armaste.",
      porDefecto: true,
      ejemplo: {
        antes: cols.map((c) => c.titulo).join(" · "),
        despues: ordenadas.map((c) => c.titulo).join(" · "),
      },
    });
    if (aceptado) cols = ordenadas;
  }

  // Columnas del resultado
  const columnas: Columna[] = cols.map((c) => {
    const pista = pistas.get(norm(c.titulo));
    const col: Columna = { clave: claveDe(c.id), titulo: c.titulo, tipo: c.tipo ?? "texto" };
    if (pista?.canonicos) col.canonicos = pista.canonicos;
    else if (col.tipo === "localidad") col.canonicos = canonicosDesdeDatos(c.valores);
    if (pista?.clavePara) col.clavePara = pista.clavePara;
    return col;
  });

  // Sin columna de nombre, la primera de texto hace de clave para
  // reconocer repetidos: sin eso no se detectaría ninguno.
  if (!columnas.some((c) => c.tipo === "nombre") && !columnas.some((c) => c.clavePara)) {
    const primeraTexto = columnas.find((c) => c.tipo === "texto");
    if (primeraTexto) primeraTexto.clavePara = "dedupe";
  }

  const filas = cuerpo.map((_, k) => {
    const o: Record<string, string> = {};
    cols.forEach((c, j) => {
      o[columnas[j].clave] = c.valores[k] ?? "";
    });
    return o;
  });

  // Orden de las filas
  let ordenFilas: OrdenFilas | null = null;
  const colNombre =
    columnas.find((c) => c.tipo === "nombre") ??
    (cols[0] && proporcionDistintos(cols[0]) >= 0.8 && columnas[0].tipo === "texto" ? columnas[0] : undefined);
  const colFecha = columnas.find((c) => c.tipo === "fecha");
  const porCol = colNombre ?? colFecha;
  if (porCol) {
    const sentido = colNombre ? "asc" : "desc";
    const actual = filas.map((f) => sinAcentos(f[porCol.clave] ?? "").trim()).filter(Boolean);
    const yaOrdenada = colNombre && actual.every((v, i) => i === 0 || actual[i - 1] <= v);
    if (!yaOrdenada) {
      const aceptado = decidir({
        id: "ordenarFilas",
        tipo: "ordenarFilas",
        titulo: colNombre
          ? `Ordenar las filas por "${porCol.titulo}"`
          : `Ordenar por "${porCol.titulo}", lo más reciente arriba`,
        detalle: colNombre
          ? "De la A a la Z. Así los repetidos quedan uno debajo del otro y cualquiera encuentra algo sin usar el buscador."
          : "Lo último que pasó es lo primero que se ve.",
        porDefecto: true,
      });
      if (aceptado) {
        ordenFilas = { clave: porCol.clave, titulo: porCol.titulo, sentido, tipo: porCol.tipo };
      }
    }
  }

  // Qué columnas tenían total al pie (sólo si se sacó el pie)
  const columnasConTotal: string[] = [];
  if (filaTotal && aceptar(cambios.find((c) => c.id === "pie")!)) {
    cols.forEach((c, j) => {
      const t = columnas[j].tipo;
      if ((t === "moneda" || t === "numero") && lleno(filaTotal[c.origen])) {
        columnasConTotal.push(columnas[j].clave);
      }
    });
  }

  return {
    cambios,
    preset: {
      slug: op.slug ?? "propia",
      nombre: op.nombre ?? "Tu planilla",
      rubro: op.rubro ?? "Tu planilla",
      gancho: op.gancho ?? "",
      columnas,
      filas,
    },
    ordenFilas,
    columnasConTotal,
    tituloHoja,
    filasOriginales,
  };
}

/** Ordena filas ya limpias. Recibe cómo leer el valor para no depender
 *  de la forma de la fila: en la pantalla son celdas con original y
 *  valor, en otros lados son strings sueltos. */
export function ordenarFilas<T>(filas: T[], orden: OrdenFilas, valor: (f: T) => string): T[] {
  const cmp = new Intl.Collator("es", { sensitivity: "base", numeric: true });
  const copia = [...filas];
  copia.sort((a, b) => {
    const va = valor(a);
    const vb = valor(b);
    // Los vacíos siempre al final, en cualquier sentido: una fila sin
    // nombre arriba de todo parece un error de la planilla.
    if (!va && vb) return 1;
    if (va && !vb) return -1;
    const r = cmp.compare(va, vb);
    return orden.sentido === "asc" ? r : -r;
  });
  return copia;
}

/** La grilla que corresponde a un preset armado a mano: títulos arriba
 *  y una fila por registro. Es la forma "ya ordenada" de una planilla. */
export function grillaDePreset(p: Preset): Grilla {
  return [p.columnas.map((c) => c.titulo), ...p.filas.map((f) => p.columnas.map((c) => f[c.clave] ?? ""))];
}
