# Imágenes fijas del sitio

El sitio es un export estático para Cloudflare Pages, y en Windows
`ImageResponse` no puede prerenderizar con el runtime de Node (muere con
`ERR_INVALID_URL`). Por eso el ícono y la tarjeta de WhatsApp se guardan
como PNG en `src/app/`, y el código que los dibuja queda acá como fuente.

Para cambiarlos: editar el `.tsx`, copiarlo temporalmente a su ruta en
`src/app/` con `export const runtime = "edge"`, levantar `npm run dev`,
descargar la imagen desde el navegador y reemplazar el `.png`.
