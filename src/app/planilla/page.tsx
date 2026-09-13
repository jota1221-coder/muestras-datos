import type { Metadata } from "next";
import { Suspense } from "react";
import PlanillaDemo from "@/components/PlanillaDemo";
import { DemoBar } from "@/components/DemoBar";
import { autorWhatsApp } from "@/lib/autor";

const CONTACTO = autorWhatsApp("la muestra de limpieza de planillas");

export const metadata: Metadata = {
  title: "Tu planilla, ordenada sola · Muestra",
  description:
    "Teléfonos en un solo formato, duplicados unificados y CUIT verificados. Probalo con la planilla de ejemplo o con la tuya.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Tu planilla, ordenada sola",
    description:
      "Teléfonos en un solo formato, duplicados unificados y CUIT verificados. Probalo con la planilla de ejemplo o con la tuya.",
    url: "/planilla",
    type: "website",
  },
};

export default function PlanillaPage() {
  return (
    <main>
      <DemoBar tone="light" />

      <header className="pt-20 pb-10 border-b hairline">
        <div className="max-w-6xl mx-auto px-6">
          <p className="eyebrow mb-5">Muestra · Limpieza de base</p>
          <h1 className="font-display text-3xl lg:text-5xl max-w-3xl leading-tight">
            Tu planilla, ordenada sola
          </h1>
          <p className="mt-6 max-w-2xl leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            Esta es una planilla como las que hay en cualquier negocio: cargada
            por varias personas, durante años, cada una a su manera. Apretá
            <strong style={{ color: "var(--fg)" }}> Limpiar </strong>
            y mirá qué cambia.
          </p>
        </div>
      </header>

      <section className="py-10">
        <div className="max-w-6xl mx-auto px-6">
          <Suspense fallback={<p style={{ color: "var(--fg-muted)" }}>Cargando la planilla…</p>}>
            <PlanillaDemo />
          </Suspense>
        </div>
      </section>

      <section className="py-14" style={{ background: "var(--bg-alt)" }}>
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="font-display text-2xl lg:text-3xl">
            Esto mismo, con tu base de verdad
          </h2>
          <p className="mt-5 max-w-2xl leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            La planilla de arriba tiene 15 filas. El mismo proceso corrió sobre
            una base real de más de 17.000 contactos de tres fuentes distintas
            —dos planillas y la agenda de un celular— y terminó en una sola
            base ordenada, sin duplicados y con los teléfonos verificados.
          </p>
          <a href={CONTACTO} target="_blank" rel="noopener" className="cta-solid mt-8">
            Contame cómo es tu planilla
          </a>
        </div>
      </section>

      <footer className="py-10 border-t hairline">
        <p className="max-w-6xl mx-auto px-6 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          Muestra de ejemplo — los datos de la tabla son inventados: ninguna
          persona, negocio, teléfono ni CUIT de esta pantalla corresponde a
          alguien real.{" "}
          <a href={CONTACTO} target="_blank" rel="noopener" className="underline underline-offset-4">
            Hecho por Joaquín Rao
          </a>
        </p>
      </footer>
    </main>
  );
}
