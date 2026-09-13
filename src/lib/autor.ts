// WhatsApp de Joaquín (autor). Los negocios de estos ejemplos no existen,
// así que el único contacto real de la página es el suyo — el mensaje
// prearmado dice qué estilo estaba mirando el que escribe.
export function autorWhatsApp(estilo: string) {
  return `https://wa.me/5491133905237?text=${encodeURIComponent(
    `Hola Joaquín! Vi el estilo "${estilo}" y me interesa algo así para mi negocio`
  )}`;
}
