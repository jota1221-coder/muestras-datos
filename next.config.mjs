/**
 * Sitio 100% estático, publicado en Cloudflare Pages: la planilla se
 * procesa en el navegador, así que no hace falta servidor.
 *
 * Con `output: "export"` Next ignora `headers()`: los headers de seguridad
 * (CSP, noindex) viven en public/_headers, que es el formato de Cloudflare.
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: "export",
  poweredByHeader: false,
  images: { unoptimized: true },
};

export default nextConfig;
