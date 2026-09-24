"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { aplicarFusiones, limpiar } from "@/lib/limpiar";
import { escanear } from "@/lib/escanear";
import { PRESETS } from "@/lib/planillas";
import { ErrorImportacion, leerGrilla, type Lectura } from "@/lib/importar";
import { grillaDePreset, ordenarFilas, ordenarGrilla, type Cambio } from "@/lib/ordenar";
import type { Conteos, Fusion, TipoColumna } from "@/lib/planillas/tipos";

/** Los nombres que ve el visitante. La clave interna no le dice nada a
 *  nadie: "siNo" es "Sí / No" y "cuit" es "CUIT o DNI". */
const NOMBRE_TIPO: Record<TipoColumna, string> = {
  texto: "Texto libre",
  siNo: "Sí / No",
  numero: "Número",
  nombre: "Nombre",
  telefono: "Teléfono",
  cuit: "CUIT o DNI",
  localidad: "Categoría que se repite",
  fecha: "Fecha",
  moneda: "Importe",
  email: "Mail",
};

/** Los contadores se arman desde el resultado y se filtran los que dieron
 *  cero: mostrar "0 duplicados" en una demo sobre limpieza es un autogol. */
function lineasDeConteo(c: Conteos, unificadas: number, estructura: number) {
  return [
    { n: estructura, t: "cambios de estructura (los que aceptaste)" },
    { n: c.telefonosNormalizados, t: "teléfonos llevados a un formato único" },
    { n: unificadas, t: "filas unificadas (las que aceptaste)" },
    { n: c.localidadesUnificadas, t: "valores escritos de otra forma" },
    { n: c.fechasNormalizadas, t: "fechas pasadas a un solo formato" },
    { n: c.cuitInvalidos, t: "CUIT con el dígito verificador mal" },
    { n: c.cuitRotosPorExcel, t: "CUIT que rompió Excel solo" },
    { n: c.siNoUnificados, t: "Sí/No escritos de varias formas" },
    { n: c.espaciosCorregidos, t: "celdas con espacios invisibles que rompen los BUSCARV" },
    { n: c.filasSinTelefono, t: "filas sin ningún teléfono" },
  ].filter((l) => l.n > 0);
}

/** A, B, … Z, AA, AB: como las llama Excel. */
function letraDeColumna(j: number): string {
  let n = j + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export default function PlanillaDemo() {
  /* El rubro viene en el link que se manda en frío
     (/planilla?preset=propiedades). Se lee acá y no en el servidor para que
     la página siga siendo estática. */
  const params = useSearchParams();
  const pedido = params.get("preset") ?? "";

  const [slug, setSlug] = useState(
    PRESETS.some((p) => p.slug === pedido) ? pedido : PRESETS[0].slug,
  );
  const [propia, setPropia] = useState<Lectura | null>(null);
  const [errorImport, setErrorImport] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [limpia, setLimpia] = useState(false);
  const [bajando, setBajando] = useState(false);
  /* Solo las decisiones que el visitante cambió a mano. El resto sale de
     lo que el motor sugiere, que no es lo mismo para todas: una fusión con
     un dato contradictorio viene sugerida en NO. */
  const [decisiones, setDecisiones] = useState<Record<string, boolean>>({});
  /* Lo mismo para los cambios de estructura: sólo lo que se tocó a mano. */
  const [decisionesOrden, setDecisionesOrden] = useState<Record<string, boolean>>({});
  /* Correcciones del visitante al tipo que detectó el escáner. Mandan
     sobre la detección: el que sabe qué guarda cada columna es él. */
  const [tiposManuales, setTiposManuales] = useState<Record<string, TipoColumna>>({});
  const inputArchivo = useRef<HTMLInputElement>(null);

  /* La planilla como vino. Los ejemplos que ya eran una tabla se pasan
     a grilla igual: el ordenador trata a todas por el mismo camino. */
  const fuente = useMemo(() => {
    if (propia) {
      return {
        slug: "propia",
        nombre: propia.nombre,
        rubro: "Tu planilla",
        gancho: propia.recortada
          ? `${propia.nombre} — se muestran las primeras filas.`
          : propia.nombre,
        grilla: propia.grilla,
        pistas: undefined,
      };
    }
    const p = PRESETS.find((x) => x.slug === slug) ?? PRESETS[0];
    return { ...p, grilla: p.grilla ?? grillaDePreset(p), pistas: p.columnas };
  }, [propia, slug]);

  const aceptadoOrden = (c: Cambio) => decisionesOrden[c.id] ?? c.porDefecto;

  /* Primero la forma, después el contenido: separar una celda con
     teléfono y mail tiene que pasar ANTES de limpiar el teléfono. */
  const ordenado = useMemo(
    () =>
      ordenarGrilla(fuente.grilla, {
        pistas: fuente.pistas,
        aceptar: aceptadoOrden,
        slug: fuente.slug,
        nombre: fuente.nombre,
        rubro: fuente.rubro,
        gancho: fuente.gancho,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fuente, decisionesOrden],
  );
  const preset = ordenado.preset;

  /* El escaneo va ANTES de limpiar y decide cómo limpiar: qué columna
     sirve para reconocer repetidos, qué valor de Sí/No es en realidad un
     tercer estado. Por eso el motor recibe las columnas del escaneo y no
     las del preset. */
  const escaneo = useMemo(() => escanear(preset, tiposManuales), [preset, tiposManuales]);
  const columnas = escaneo.columnas;
  const resultado = useMemo(
    () => limpiar({ ...preset, columnas }),
    [preset, columnas],
  );

  const aceptada = (f: Fusion) => decisiones[f.id] ?? f.sugerida;
  const idsAceptadas = useMemo(
    () => new Set(resultado.fusiones.filter(aceptada).map((f) => f.id)),
    [resultado, decisiones],
  );
  const filasFinales = useMemo(() => {
    const f = aplicarFusiones(resultado, columnas, idsAceptadas);
    const o = ordenado.ordenFilas;
    return o ? ordenarFilas(f, o, (x) => x.celdas[o.clave]?.valor ?? "") : f;
  }, [resultado, columnas, idsAceptadas, ordenado.ordenFilas]);

  const cambiosAplicados = ordenado.cambios.filter(aceptadoOrden);

  const unificadas = resultado.fusiones
    .filter(aceptada)
    .reduce((a, f) => a + f.absorbidas.length, 0);
  const conteos = lineasDeConteo(resultado.conteos, unificadas, cambiosAplicados.length);
  const sinHallazgos =
    limpia && conteos.length === 0 && resultado.fusiones.length === 0 && ordenado.cambios.length === 0;

  function reiniciar() {
    setLimpia(false);
    setDecisiones({});
    setDecisionesOrden({});
    setTiposManuales({});
  }

  function elegirEjemplo(nuevo: string) {
    setPropia(null);
    setErrorImport("");
    setSlug(nuevo);
    reiniciar();
  }

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLeyendo(true);
    setErrorImport("");
    try {
      setPropia(await leerGrilla(file));
      reiniciar();
    } catch (err) {
      setErrorImport(
        err instanceof ErrorImportacion
          ? err.message
          : "No se pudo leer el archivo. Tiene que ser .xlsx o .csv.",
      );
    } finally {
      setLeyendo(false);
      if (inputArchivo.current) inputArchivo.current.value = "";
    }
  }

  /** El .xlsx se arma acá mismo, en el browser. exceljs entra por import
   *  dinámico para no cargarlo hasta que alguien realmente descarga. */
  async function descargar() {
    setBajando(true);
    try {
      const [{ default: ExcelJS }, { armarExcel }] = await Promise.all([
        import("exceljs"),
        import("@/lib/exportar"),
      ]);
      const notas: string[] = [];
      if (unificadas) notas.push(`${unificadas} fila${unificadas > 1 ? "s" : ""} repetida${unificadas > 1 ? "s" : ""} unificada${unificadas > 1 ? "s" : ""}.`);
      for (const l of lineasDeConteo(resultado.conteos, 0, 0)) notas.push(`${l.n} ${l.t}.`);

      const buf = await armarExcel(ExcelJS, {
        columnas,
        filas: filasFinales,
        columnasConTotal: ordenado.columnasConTotal,
        tituloHoja: ordenado.tituloHoja,
        cambiosAplicados,
        notas,
        original: fuente.grilla,
      });
      const url = URL.createObjectURL(
        new Blob([buf], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `${propia ? "tu-planilla" : fuente.slug}-ordenada.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBajando(false);
    }
  }

  /** Muestra el valor de la primera columna que identifique la fila, para
   *  que la propuesta se entienda sin tener que ir a buscarla a la tabla. */
  function etiqueta(indice: number) {
    const fila = resultado.filas.find((f) => f.indiceOriginal === indice);
    if (!fila) return `fila ${indice}`;
    const col =
      columnas.find((c) => c.tipo === "nombre") ?? columnas[0];
    return fila.celdas[col.clave]?.valor || `fila ${indice}`;
  }

  const filasEnTabla = limpia ? filasFinales : null;
  const anchoCrudo = Math.max(1, ...fuente.grilla.map((f) => f.length));

  return (
    <div>
      {/* Selector */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Qué planilla mirar">
        {PRESETS.map((p) => (
          <button
            key={p.slug}
            role="tab"
            aria-selected={!propia && p.slug === slug}
            className="tab"
            onClick={() => elegirEjemplo(p.slug)}
          >
            {p.rubro}
          </button>
        ))}
        {propia && (
          <button role="tab" aria-selected className="tab" onClick={() => {}}>
            Tu planilla
          </button>
        )}
      </div>

      <p className="mt-6 text-lg leading-relaxed max-w-2xl">{preset.gancho}</p>

      {/* Acciones */}
      <div className="mt-7 flex flex-wrap items-center gap-3">
        {!limpia ? (
          <button className="cta-solid" onClick={() => setLimpia(true)}>
            Ordenar la planilla
          </button>
        ) : (
          <>
            <button className="cta-outline" onClick={() => setLimpia(false)}>
              Ver cómo estaba
            </button>
            <button className="cta-solid" onClick={descargar} disabled={bajando}>
              {bajando ? "Generando…" : "Descargar ordenada (.xlsx)"}
            </button>
          </>
        )}
        <span className="text-sm" style={{ color: "var(--fg-muted)" }}>
          {limpia
            ? `${filasFinales.length} filas · antes ${ordenado.filasOriginales}`
            : `${fuente.grilla.length} filas como vino, contando títulos y renglones sueltos`}
        </span>
      </div>

      {/* Lo que el escáner entendió, antes de tocar nada. Va plegado para
          no empujar el botón abajo del pliegue, pero el resumen se lee
          igual cerrado: es la primera prueba de que leyó de verdad. */}
      <details className="escaneo mt-8">
        <summary className="cursor-pointer select-none">
          <span className="font-display text-lg">Lo que entendí de tu planilla</span>
          <span className="block mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
            {escaneo.resumen} Tocá para ver columna por columna.
          </span>
        </summary>

        <p className="mt-5 text-sm leading-relaxed max-w-2xl" style={{ color: "var(--fg-muted)" }}>
          No hay una limpieza única: cada planilla necesita la suya. Esto es
          lo que detecté en la tuya y qué voy a hacer con cada columna. Si me
          equivoqué en algo, cambialo acá y se rehace sola.
        </p>

        <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {escaneo.perfiles.map((p) => (
            <div key={p.clave} className="col-card">
              <p className="col-nombre">{p.titulo}</p>

              <label className="sr-only" htmlFor={`tipo-${p.clave}`}>
                Qué guarda la columna {p.titulo}
              </label>
              <select
                id={`tipo-${p.clave}`}
                className="tipo-select"
                value={p.tipo}
                onChange={(e) =>
                  setTiposManuales((t) => ({
                    ...t,
                    [p.clave]: e.target.value as TipoColumna,
                  }))
                }
              >
                {(Object.keys(NOMBRE_TIPO) as TipoColumna[]).map((t) => (
                  <option key={t} value={t}>
                    {NOMBRE_TIPO[t]}
                  </option>
                ))}
              </select>

              {p.confianza !== "alta" && (
                <span className="baja-confianza">
                  {p.confianza === "media" ? "Bastante seguro" : "No estoy seguro"} — {p.razon}
                </span>
              )}

              <p className="mt-3 text-xs" style={{ color: "var(--fg-muted)" }}>
                {p.llenas} con dato
                {p.vacias > 0 && ` · ${p.vacias} vacía${p.vacias > 1 ? "s" : ""}`}
                {` · ${p.distintos} valor${p.distintos === 1 ? "" : "es"} distinto${p.distintos === 1 ? "" : "s"}`}
              </p>

              {p.reglas.map((r, i) => (
                <p key={i} className="regla">
                  <b>{r.titulo}</b>
                  {r.detalle}
                </p>
              ))}
            </div>
          ))}
        </div>
      </details>

      {/* Contadores */}
      {limpia && conteos.length > 0 && (
        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {conteos.map((l) => (
            <div key={l.t} className="conteo">
              <p className="conteo-num">{l.n}</p>
              <p className="conteo-label">{l.t}</p>
            </div>
          ))}
        </div>
      )}

      {sinHallazgos && (
        <p className="mt-8 conteo" style={{ color: "var(--fg-muted)" }}>
          No se encontró nada para corregir en esta planilla. Está prolija.
        </p>
      )}

      {/* Cambios de estructura — igual que los repetidos: se proponen,
          se explican y se pueden rechazar uno por uno. */}
      {limpia && ordenado.cambios.length > 0 && (
        <div className="mt-8">
          <p className="font-display text-lg">Cómo la ordené</p>
          <p className="mt-2 text-sm leading-relaxed max-w-2xl" style={{ color: "var(--fg-muted)" }}>
            Esto es la forma de la tabla, no los datos. Cada cambio viene
            con su motivo; si alguno no te sirve, lo dejás como estaba y la
            tabla se rehace sola.
          </p>

          <ol className="mt-5 grid gap-3">
            {ordenado.cambios.map((c, i) => {
              const si = aceptadoOrden(c);
              return (
                <li key={c.id} className="cambio" data-aplicado={si}>
                  <span className="cambio-n font-mono" aria-hidden>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{c.titulo}</p>
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                      {c.detalle}
                    </p>
                    {c.ejemplo && (
                      <p className="cambio-ejemplo font-mono">
                        <span className="valor-viejo-inline">{c.ejemplo.antes}</span>
                        {c.ejemplo.despues && (
                          <>
                            <span aria-hidden> → </span>
                            <span className="sr-only"> queda así: </span>
                            <span>{c.ejemplo.despues}</span>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="cambio-botones">
                    <button
                      className="tab"
                      aria-selected={si}
                      onClick={() => setDecisionesOrden((d) => ({ ...d, [c.id]: true }))}
                    >
                      Aplicar
                    </button>
                    <button
                      className="tab"
                      aria-selected={!si}
                      onClick={() => setDecisionesOrden((d) => ({ ...d, [c.id]: false }))}
                    >
                      Dejar como estaba
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Posibles repetidos — se proponen, no se aplican solos */}
      {limpia && resultado.fusiones.length > 0 && (
        <div className="mt-8">
          <p className="font-display text-lg">Posibles repetidos</p>
          <p className="mt-2 text-sm leading-relaxed max-w-2xl" style={{ color: "var(--fg-muted)" }}>
            Esto no se decide solo. Dos productos pueden llamarse igual y
            medir distinto, y dos personas pueden llamarse igual y ser dos
            personas. Mirá cada uno y elegís vos.
          </p>

          <div className="mt-5 grid md:grid-cols-2 gap-3">
            {resultado.fusiones.map((f) => {
              const si = aceptada(f);
              return (
                <div
                  key={f.id}
                  className="conteo"
                  style={f.conflicto ? { borderColor: "var(--alerta)" } : undefined}
                >
                  <p className="text-sm font-semibold">{etiqueta(f.principal)}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--fg-muted)" }}>
                    Fila {f.principal} y {f.absorbidas.join(", ")} · {f.motivo}
                  </p>

                  {f.conflicto && (
                    <p className="mt-2 text-xs" style={{ color: "var(--alerta)" }}>
                      Ojo: {f.conflicto}. Probablemente sean dos distintos.
                    </p>
                  )}

                  <div className="mt-4 flex gap-2">
                    <button
                      className="tab"
                      aria-selected={si}
                      onClick={() => setDecisiones((d) => ({ ...d, [f.id]: true }))}
                    >
                      Unificar
                    </button>
                    <button
                      className="tab"
                      aria-selected={!si}
                      onClick={() => setDecisiones((d) => ({ ...d, [f.id]: false }))}
                    >
                      Dejar separadas
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabla. Antes de ordenar se ve como la ve Excel —letras arriba,
          números al costado, el título pegado, los renglones sueltos—
          porque el desorden de forma sólo se entiende viéndolo así. */}
      <div className="tabla-scroll mt-8">
        {filasEnTabla ? (
          <table className="tabla font-mono">
            <thead>
              <tr>
                <th className="num">#</th>
                {columnas.map((c) => (
                  <th key={c.clave}>{c.titulo}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filasEnTabla.map((fila) => (
                <tr key={fila.indiceOriginal}>
                  <td className="num">{fila.indiceOriginal}</td>
                  {columnas.map((c, i) => {
                    const celda = fila.celdas[c.clave];
                    const clases = celda.alerta
                      ? "celda-alerta"
                      : celda.cambio
                        ? "celda-cambio"
                        : "";
                    return (
                      <td key={c.clave} className={clases}>
                        {celda.valor || (
                          <span style={{ color: "var(--fg-muted)" }}>—</span>
                        )}
                        {celda.cambio && celda.original && (
                          <span className="valor-viejo">{celda.original}</span>
                        )}
                        {celda.alerta && (
                          <span className="nota-alerta">{celda.alerta}</span>
                        )}
                        {i === 0 && fila.absorbio.length > 0 && (
                          <span className="badge-fusion">
                            + fila {fila.absorbio.join(", ")}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="tabla tabla-cruda font-mono">
            <thead>
              <tr>
                <th className="num" aria-label="Fila" />
                {Array.from({ length: anchoCrudo }, (_, j) => (
                  <th key={j} className="letra">
                    {letraDeColumna(j)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fuente.grilla.map((fila, i) => {
                // Una fila con una sola celda llena (el título, una nota)
                // se desborda sobre las vacías de al lado, como en Excel,
                // en vez de ensanchar toda la columna.
                const llenas = fila.map((c, j) => (c?.trim() ? j : -1)).filter((j) => j >= 0);
                const unica = llenas.length === 1 ? llenas[0] : -1;
                return (
                  <tr key={i}>
                    <td className="num">{i + 1}</td>
                    {unica >= 0 ? (
                      <>
                        {Array.from({ length: unica }, (_, j) => (
                          <td key={j} />
                        ))}
                        <td colSpan={anchoCrudo - unica} className="desborda">
                          <span>{fila[unica]}</span>
                        </td>
                      </>
                    ) : (
                      Array.from({ length: anchoCrudo }, (_, j) => (
                        <td key={j}>{fila[j] ?? ""}</td>
                      ))
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-4 text-xs" style={{ color: "var(--fg-muted)" }}>
        {limpia
          ? "En amarillo lo que se corrigió, con el valor anterior tachado. En rojo lo que no se corrige solo y hay que mirar. El Excel que descargás trae también la planilla original, sin tocar."
          : propia
            ? "Tu planilla, como la subiste."
            : "Datos de ejemplo. Ninguna persona, negocio ni teléfono de esta tabla es real."}
      </p>

      {/* Consejos: son de ESTRUCTURA, no de contenido. Nada de esto se
          toca solo — cómo se organiza la planilla lo decide el dueño.
          Cuando no hay nada que decir, se dice: que el escáner también
          sepa callarse es lo que hace creíble cuando habla. */}
      {escaneo.consejos.length === 0 && (
        <p className="mt-10 text-sm leading-relaxed max-w-2xl" style={{ color: "var(--fg-muted)" }}>
          <strong style={{ color: "var(--fg)" }}>La planilla está bien
          armada.</strong>{" "}
          Las columnas tienen nombre, guardan una cosa cada una y ninguna
          está de adorno. No tengo nada que sugerirte sobre la estructura.
        </p>
      )}

      {escaneo.consejos.length > 0 && (
        <div className="mt-10">
          <p className="font-display text-lg">
            {escaneo.consejos.length === 1
              ? "Un consejo sobre cómo está armada"
              : `${escaneo.consejos.length} consejos sobre cómo está armada`}
          </p>
          <p className="mt-2 text-sm leading-relaxed max-w-2xl" style={{ color: "var(--fg-muted)" }}>
            Esto no lo cambio yo: no tiene que ver con los datos sino con la
            forma de la planilla, y esa decisión es tuya. Te lo dejo señalado.
          </p>

          <div className="mt-5 grid md:grid-cols-2 gap-3">
            {escaneo.consejos.map((c) => (
              <div key={c.id} className="consejo">
                {c.columna && (
                  <p className="text-xs font-mono" style={{ color: "var(--fg-muted)" }}>
                    {c.columna}
                  </p>
                )}
                <p className="mt-1 text-sm font-semibold">{c.titulo}</p>
                <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                  {c.detalle}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subir la propia */}
      <div className="mt-10 conteo">
        <p className="font-display text-lg">Probá con tu propia planilla</p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          Se abre <strong style={{ color: "var(--fg)" }}>acá adentro, en tu
          teléfono</strong>: el archivo no se sube a ningún servidor, no viaja
          por internet y yo no lo veo. Podés cortar el wifi y funciona igual.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="cta-outline" style={{ cursor: "pointer" }}>
            {leyendo ? "Leyendo…" : "Elegir archivo (.xlsx o .csv)"}
            <input
              ref={inputArchivo}
              type="file"
              accept=".xlsx,.csv"
              onChange={subir}
              className="sr-only"
            />
          </label>
          {propia && (
            <button className="cta-link" onClick={() => elegirEjemplo(PRESETS[0].slug)}>
              Volver a los ejemplos
            </button>
          )}
        </div>

        {errorImport && (
          <p className="mt-4 text-sm" style={{ color: "var(--alerta)" }}>
            {errorImport}
          </p>
        )}
      </div>
    </div>
  );
}
