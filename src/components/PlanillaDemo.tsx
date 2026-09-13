"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { limpiar } from "@/lib/limpiar";
import { PRESETS } from "@/lib/planillas";
import { ErrorImportacion, presetDesdeArchivo } from "@/lib/importar";
import type { Conteos, Preset } from "@/lib/planillas/tipos";

/** Los contadores se arman desde el resultado y se filtran los que dieron
 *  cero: mostrar "0 duplicados" en una demo sobre limpieza es un autogol. */
function lineasDeConteo(c: Conteos) {
  return [
    { n: c.telefonosNormalizados, t: "teléfonos llevados a un formato único" },
    { n: c.duplicadosUnificados, t: "filas duplicadas unificadas" },
    { n: c.localidadesUnificadas, t: "valores escritos de otra forma" },
    { n: c.fechasNormalizadas, t: "fechas pasadas a un solo formato" },
    { n: c.cuitInvalidos, t: "CUIT con el dígito verificador mal" },
    { n: c.cuitRotosPorExcel, t: "CUIT que rompió Excel solo" },
    { n: c.filasIdenticas, t: "filas repetidas carácter por carácter" },
    { n: c.siNoUnificados, t: "Sí/No escritos de varias formas" },
    { n: c.espaciosCorregidos, t: "celdas con espacios invisibles que rompen los BUSCARV" },
    { n: c.filasSinTelefono, t: "filas sin ningún teléfono" },
  ].filter((l) => l.n > 0);
}

export default function PlanillaDemo() {
  /* El rubro viene en el link que se manda en frío
     (/planilla?preset=propiedades). Se lee acá y no en el servidor para que
     la página siga siendo estática: así no depende de que una función
     serverless despierte para pintar el primer render. */
  const params = useSearchParams();
  const pedido = params.get("preset") ?? "";

  const [slug, setSlug] = useState(
    PRESETS.some((p) => p.slug === pedido) ? pedido : PRESETS[0].slug,
  );
  const [propia, setPropia] = useState<Preset | null>(null);
  const [errorImport, setErrorImport] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [limpia, setLimpia] = useState(false);
  const [bajando, setBajando] = useState(false);
  const inputArchivo = useRef<HTMLInputElement>(null);

  const preset = useMemo(
    () => propia ?? (PRESETS.find((p) => p.slug === slug) as Preset),
    [propia, slug],
  );
  const resultado = useMemo(() => limpiar(preset), [preset]);

  const conteos = lineasDeConteo(resultado.conteos);
  const sinHallazgos = limpia && conteos.length === 0;

  function elegirEjemplo(nuevo: string) {
    setPropia(null);
    setErrorImport("");
    setSlug(nuevo);
    setLimpia(false);
  }

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLeyendo(true);
    setErrorImport("");
    try {
      const nuevo = await presetDesdeArchivo(file);
      setPropia(nuevo);
      setLimpia(false);
    } catch (err) {
      setErrorImport(
        err instanceof ErrorImportacion
          ? err.message
          : "No se pudo leer el archivo. Tiene que ser .xlsx o .csv, con los títulos en la primera fila.",
      );
    } finally {
      setLeyendo(false);
      // Permite volver a elegir el mismo archivo después de corregirlo.
      if (inputArchivo.current) inputArchivo.current.value = "";
    }
  }

  /** El .xlsx se arma acá mismo, en el browser. exceljs entra por import
   *  dinámico para no cargarlo hasta que alguien realmente descarga. */
  async function descargar() {
    setBajando(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Limpia");

      ws.addRow(preset.columnas.map((c) => c.titulo));
      ws.getRow(1).font = { bold: true };

      for (const fila of resultado.filas) {
        ws.addRow(preset.columnas.map((c) => fila.celdas[c.clave].valor));
      }
      ws.columns.forEach((col) => { col.width = 22; });

      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([buf], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `${propia ? "tu-planilla" : preset.slug}-limpia.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBajando(false);
    }
  }

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
            Limpiar la planilla
          </button>
        ) : (
          <>
            <button className="cta-outline" onClick={() => setLimpia(false)}>
              Ver cómo estaba
            </button>
            <button className="cta-solid" onClick={descargar} disabled={bajando}>
              {bajando ? "Generando…" : "Descargar limpia (.xlsx)"}
            </button>
          </>
        )}
        <span className="text-sm" style={{ color: "var(--fg-muted)" }}>
          {limpia
            ? `${resultado.filas.length} filas · antes ${preset.filas.length}`
            : `${preset.filas.length} filas como vinieron`}
        </span>
      </div>

      {/* Contadores */}
      {limpia && !sinHallazgos && (
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

      {/* Tabla */}
      <div className="tabla-scroll mt-8">
        <table className="tabla font-mono">
          <thead>
            <tr>
              <th className="num">#</th>
              {preset.columnas.map((c) => (
                <th key={c.clave}>{c.titulo}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {limpia
              ? resultado.filas.map((fila) => (
                  <tr key={fila.indiceOriginal}>
                    <td className="num">{fila.indiceOriginal}</td>
                    {preset.columnas.map((c, i) => {
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
                ))
              : preset.filas.map((fila, i) => (
                  <tr key={i}>
                    <td className="num">{i + 1}</td>
                    {preset.columnas.map((c) => (
                      <td key={c.clave}>
                        {fila[c.clave] || (
                          <span style={{ color: "var(--fg-muted)" }}>—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs" style={{ color: "var(--fg-muted)" }}>
        {limpia
          ? "En amarillo lo que se corrigió, con el valor anterior tachado. En rojo lo que no se corrige solo y hay que mirar."
          : propia
            ? "Tu planilla, como la subiste."
            : "Datos de ejemplo. Ninguna persona, negocio ni teléfono de esta tabla es real."}
      </p>

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
