import type { Preset } from "./tipos";
import { ordenarGrilla } from "../ordenar";

/** Listado de stock de un comercio (ferretería, corralón, pinturería).
 *
 *  Existe para demostrar que el ordenador no es "de clientes": acá no hay
 *  una sola persona, y los problemas son los mismos que en cualquier
 *  planilla vieja —el título copiado en la fila 1, una columna que quedó
 *  vacía, una fila en blanco en el medio, el TOTAL al pie, una nota
 *  suelta abajo de todo, y teléfono y mail del proveedor en la misma
 *  celda.
 *
 *  Todo inventado: los mails usan el dominio reservado `.example`, que no
 *  existe, y los teléfonos el patrón 4047-04XX que no rutea. */

const GRILLA: string[][] = [
  ["LISTADO DE STOCK — actualizado marzo 2026"],
  [],
  ["Cód.", "", "Artículo", "Proveedor", "Contacto proveedor", "Precio costo", "Precio venta", "Observaciones", "Stock", "Stock mín.", "Últ. compra"],
  ["A-1021", "", "Tornillo autoperforante 8x1\" (x100)", "Bulonera Ferrán", "11 4047-0410 / ventas@buloneraferran.example", "$ 3.200", "$ 4.800", "", "35", "20", "12/2/26"],
  ["A-1022", "", "Tarugo nylon 8 mm (x100)", "BULONERA FERRAN", "1140470410 / ventas@buloneraferran.example", "1850", "2.790", "", "12", "20", "2026-02-12"],
  ["B-2040", "", "Cinta aisladora 20 m negra", "Eléctrica Osuna", "11 4047-0422", "$ 950", "$ 1.450", "Pedir de a 10", "64", "30", "3/1/26"],
  ["B-2041", "", "Cable unipolar 2,5 mm (x100 m)", "Electrica Osuna", "11 4047-0422 / pedidos@electricaosuna.example", "$ 38.900", "$ 54.500", "", "4", "5", "03/01/2026"],
  ["C-3105", "", "Pintura látex interior 20 L", "Pinturas Valdés", "", "$ 61.200", "$ 85.700", "", "7", "4", "20/2/26"],
  ["C-3106", "", "Rodillo de lana 22 cm", "pinturas valdés", "", "4200", "6.300", "", "18", "10", "20/2/26"],
  [],
  ["D-4010", "", "Silicona transparente 280 ml", "Química Soler", "11 4047-0438 / ventas@quimicasoler.example", "$ 2.150", "$ 3.300", "", "22", "12", "5/3/26"],
  ["D-4011", "", "Adhesivo de contacto 1 L", "Quimica Soler", "11 4047-0438", "$ 7.800", "$ 11.400", "Vence 11/2026", "9", "6", "5/3/26"],
  ["E-5002", "", "Guantes de trabajo talle 9", "Bulonera Ferrán", "4047-0410", "$ 1.900", "$ 2.950", "", "40", "15", "28/1/26"],
  ["E-5003", "", "Antiparras de seguridad", "Bulonera Ferrán", "", "$ 2.400", "$ 3.600", "", "3", "8", "28/01/2026"],
  ["a-1021", "", "tornillo autoperforante 8x1\" (x100)", "Bulonera Ferrán", "", "$ 3.200", "$ 4.800", "¿Cargado dos veces?", "35", "20", "12/2/26"],
  ["", "", "TOTAL", "", "", "$ 127.950", "$ 185.890", "", "267", "", ""],
  ["Precios sin IVA. Revisar la lista de Eléctrica Osuna en abril."],
];

// La versión "ordenada" del preset sale del mismo ordenador con lo que
// sugiere por defecto: así el ejemplo y la herramienta nunca pueden
// contradecirse.
const ordenado = ordenarGrilla(GRILLA);

export const stock: Preset = {
  slug: "stock",
  nombre: "Listado de stock",
  rubro: "Comercio",
  gancho:
    "El título pegado arriba, una columna vacía, el total al pie, el mismo artículo cargado dos veces y el teléfono y el mail del proveedor en la misma celda.",
  columnas: ordenado.preset.columnas,
  filas: ordenado.preset.filas,
  grilla: GRILLA,
};
