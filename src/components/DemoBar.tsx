/** Barra fija arriba de todo: deja claro que es un ejemplo (no un negocio
 *  real) y da la vuelta a la galería sin depender del botón "atrás". */
export function DemoBar({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const dark = tone === "dark";
  return (
    <div
      className="fixed top-0 inset-x-0 z-50 h-9 flex items-center justify-between px-4 lg:px-6 text-[10px] font-bold uppercase tracking-[0.18em]"
      style={{
        background: dark ? "#000" : "#1A1715",
        color: dark ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.8)",
      }}
    >
      <a href="/" className="py-2 whitespace-nowrap hover:opacity-100 opacity-80 transition-opacity">
        ← Otros estilos
      </a>
      {/* En 375px las dos frases completas no entran y la barra se parte en
          dos líneas: abajo del breakpoint va la versión corta. */}
      <span className="opacity-60 whitespace-nowrap">
        <span className="sm:hidden">Ejemplo de diseño</span>
        <span className="hidden sm:inline">Ejemplo de diseño · no es un negocio real</span>
      </span>
    </div>
  );
}
