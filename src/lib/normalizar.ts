/** Normalización de CUIT y WhatsApp cargados a mano. No bloquean nada — el
 * dato se guarda igual aunque no matchee; solo sirven para uniformar el
 * formato de guardado y, en el caso del CUIT, avisar si no parece válido. */

const PESOS_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Deja solo los dígitos (saca guiones, espacios, puntos). */
export function normalizarCuit(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Valida el dígito verificador del CUIT (algoritmo módulo 11 de AFIP). */
export function cuitValido(raw: string): boolean {
  const d = normalizarCuit(raw);
  if (d.length !== 11) return false;
  const nums = d.split("").map(Number);
  const suma = PESOS_CUIT.reduce((acc, p, i) => acc + p * nums[i], 0);
  const resto = suma % 11;
  const verificador = resto === 0 ? 0 : 11 - resto;
  if (verificador === 10) return false; // no existe dígito verificador válido
  return verificador === nums[10];
}

/** ¿Es un DNI guardado con el relleno 00-XXXXXXXX-0 en vez de un CUIT real?
 * AFIP nunca usa el prefijo 00 en un CUIT auténtico, así que este patrón
 * alcanza para distinguirlos sin ambigüedad. */
export function esCuitDeDni(raw: string): boolean {
  const d = normalizarCuit(raw);
  return d.length === 11 && d.startsWith("00") && d.endsWith("0");
}

/** Va agregando los guiones de un CUIT a medida que se tipea: uno después
 * del 2do dígito, otro después del 10mo. */
export function formatearCuitProgresivo(raw: string): string {
  const d = normalizarCuit(raw).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

/** DNI tal como lo tipea quien completa el formulario: hasta 8 dígitos,
 * sin guiones ni relleno (eso se agrega recién al guardar, ver
 * `dniAFormatoCuit`). */
export function formatearDniProgresivo(raw: string): string {
  return normalizarCuit(raw).slice(0, 8);
}

/** Un DNI (los 8 dígitos que ve quien completa el formulario) al formato
 * interno 00-XXXXXXXX-0, para que quede con la misma forma que un CUIT
 * real en la base — 00 nunca es un prefijo válido de AFIP, así que no se
 * puede confundir con uno auténtico. */
export function dniAFormatoCuit(raw: string): string {
  const d = normalizarCuit(raw).slice(0, 8);
  return d ? `00-${d}-0` : "";
}

/**
 * Normaliza un WhatsApp a formato canónico (549 + área + número). Si ya
 * viene con 549 o con un formato no reconocido, lo respeta tal cual — no
 * inventa un prefijo si no está razonablemente seguro de cuál va.
 */
export function normalizarWhatsapp(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10) return "549" + d; // ej. "11 4047-9641" -> sin 549
  if (d.length === 12 && d.startsWith("54") && !d.startsWith("549")) {
    return "549" + d.slice(2); // tiene 54 pero le falta el 9 de móvil
  }
  return d;
}
