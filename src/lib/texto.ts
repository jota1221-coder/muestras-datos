/** Utilidades de texto para comparar/buscar sin distinguir acentos ni
 * mayúsculas (ej. "lopez" encuentra "López", "miercoles" encuentra
 * "Miércoles"). */

/** Saca acentos y pasa a minúsculas. */
export function sinAcentos(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Agrupa valores que son "el mismo" salvo por acentos/mayúsculas, y de cada
 * grupo se queda con la variante más frecuente. Sirve para armar listas de
 * sugerencias sin repetir una entrada que en la base quedó cargada de dos
 * formas (caso real: "Lunes, Miércoles y Viernes" con 178 clientes y
 * "Lunes, Miercoles y Viernes", sin tilde, con 5 — acá se fusionan en una
 * sola, con el texto de la variante más usada).
 */
export function masFrecuentePorGrupo(
  filas: { texto: string; cantidad: number }[],
): string[] {
  const grupos = new Map<string, { texto: string; cantidad: number }[]>();
  for (const f of filas) {
    const clave = sinAcentos(f.texto);
    const lista = grupos.get(clave) ?? [];
    lista.push(f);
    grupos.set(clave, lista);
  }
  return [...grupos.values()].map(
    (variantes) =>
      variantes.reduce((mejor, v) => (v.cantidad > mejor.cantidad ? v : mejor))
        .texto,
  );
}

/**
 * Si `valor` es "el mismo" (sin acentos/mayúsculas) que alguno de los
 * `existentes`, devuelve ESE existente tal cual está guardado, en vez de
 * `valor` — así no se crea una variante nueva por una diferencia de
 * mayúsculas o tilde (caso real: alguien tipeó "OLIVOS" en un campo donde
 * ya había 30 clientes cargados como "Olivos", y quedó como localidad
 * aparte). Si no matchea ningún existente, devuelve `valor` sin tocar —
 * así se puede seguir dando de alta algo genuinamente nuevo con solo
 * escribirlo.
 */
export function preferirExistente(valor: string, existentes: string[]): string {
  const v = valor.trim();
  if (!v) return v;
  const clave = sinAcentos(v);
  const existente = existentes.find((e) => sinAcentos(e) === clave);
  return existente ?? v;
}
