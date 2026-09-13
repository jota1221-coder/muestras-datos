// WhatsApp de Joaquín (autor). Los negocios de estas muestras no existen,
// así que el único contacto real de la página es el suyo.
//
// El mensaje va SIEMPRE armado por contexto, nunca una constante global:
// si todos los botones mandan el mismo texto, no se distingue a quien
// escribe desde la muestra de planillas de quien escribe desde otra cosa,
// y esa es justo la información más útil para contestarle bien.

const NUMERO = "5491133905237";

export function autorWhatsApp(contexto: string) {
  return `https://wa.me/${NUMERO}?text=${encodeURIComponent(
    `Hola Joaquín! Vi ${contexto} y quería consultarte`,
  )}`;
}

/** Para el CTA de una muestra concreta: menciona el rubro de la planilla
 *  que el visitante estaba mirando, así llega el dato de entrada. */
export function consultaPorPlanilla(rubro: string) {
  return autorWhatsApp(`la muestra de planillas (la de ${rubro.toLowerCase()})`);
}
