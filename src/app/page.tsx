import { PRESETS } from "@/lib/planillas";

/* Hub provisorio. El link que se manda en frío es siempre el de la muestra
   con su rubro puesto, no éste. */
export default function Hub() {
  return (
    <main className="min-h-screen flex items-center">
      <div className="max-w-3xl mx-auto px-6 py-24">
        <p className="eyebrow mb-5">Estudio IT PyMEs</p>
        <h1 className="font-display text-3xl lg:text-5xl leading-tight">
          Muestras que funcionan de verdad
        </h1>
        <p className="mt-6 leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          No son capturas ni maquetas: se tocan.
        </p>

        <div className="mt-10 space-y-3">
          {PRESETS.map((p) => (
            <a
              key={p.slug}
              href={`/planilla?preset=${p.slug}`}
              className="card block p-6 hover:opacity-90 transition-opacity"
            >
              <p className="font-display text-lg">Tu planilla, ordenada sola</p>
              <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
                Versión para {p.rubro.toLowerCase()} →
              </p>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
