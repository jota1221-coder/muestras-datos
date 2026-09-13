import { ImageResponse } from "next/og";

/* runtime edge a propósito: con "nodejs" en Windows, ImageResponse arma mal
   la ruta de la fuente por defecto y muere en el prerender con
   ERR_INVALID_URL. Tampoco se cargan fuentes propias por fs — acá se usa
   la que trae el runtime. */
export const runtime = "edge";
export const alt = "Tu planilla, ordenada sola";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgPlanilla() {
  const papel = "#FBFBFA";
  const tinta = "#1C1C1A";
  const suave = "#63635E";
  const cambio = "#FDF6E7";
  const borde = "rgba(28,28,26,0.14)";

  const antes = ["11 4047-0012", "+54 9 11 4047 0012", "1140470034", "4047-0056"];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: papel,
          color: tinta,
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 22,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: suave,
              marginBottom: 28,
            }}
          >
            Muestra · Limpieza de base
          </div>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>
            Tu planilla,
          </div>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>
            ordenada sola
          </div>
        </div>

        {/* Cuatro formas del mismo teléfono → una sola */}
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {antes.map((t) => (
              <div
                key={t}
                style={{
                  display: "flex",
                  fontSize: 24,
                  color: suave,
                  border: `1px solid ${borde}`,
                  padding: "8px 16px",
                  textDecoration: "line-through",
                }}
              >
                {t}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", fontSize: 52, color: suave }}>→</div>

          <div
            style={{
              display: "flex",
              fontSize: 34,
              fontWeight: 700,
              background: cambio,
              border: `1px solid ${borde}`,
              padding: "26px 34px",
            }}
          >
            +54 9 11 4047-0012
          </div>

          <div
            style={{
              display: "flex",
              marginLeft: "auto",
              fontSize: 24,
              color: suave,
              alignSelf: "flex-end",
            }}
          >
            joaquinrao.com.ar
          </div>
        </div>
      </div>
    ),
    size,
  );
}
