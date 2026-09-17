import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "@/styles/base.css";
import "@/styles/tema.css";

const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

/* Los datos van en monoespaciada: un teléfono y un CUIT se leen por
   columnas de dígitos, no como texto corrido. */
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  // La URL pública sale del entorno: las tarjetas de WhatsApp necesitan
  // una dirección absoluta y cambia si el sitio pasa a un dominio propio.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITIO ?? "https://muestras-datos.pages.dev"),
  title: "Muestras · Datos y automatización — Joaquín Rao",
  description:
    "Ejemplos funcionando de lo que se puede hacer con la planilla que ya tenés.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${sans.variable} ${mono.variable}`}
      style={{ ["--font-display" as string]: "var(--font-sans)" }}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
