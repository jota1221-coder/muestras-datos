import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Una celda de planilla con el tilde de corregida. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1C1C1A",
          color: "#FBFBFA",
          fontSize: 40,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        ✓
      </div>
    ),
    size,
  );
}
