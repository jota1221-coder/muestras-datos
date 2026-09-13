import type { Preset } from "./tipos";
import { propiedades } from "./propiedades";
import { pacientes } from "./pacientes";
import { clientes } from "./clientes";

/** El orden es el de la pantalla. El primero es el que se ve si el link
 *  llega sin `?preset=`. */
export const PRESETS: Preset[] = [propiedades, pacientes, clientes];

export function buscarPreset(slug: string | undefined): Preset {
  return PRESETS.find((p) => p.slug === slug) ?? PRESETS[0];
}
