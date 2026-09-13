import type { Preset } from "./tipos";

/** Planilla de clientes de una distribuidora. Es la forma que tenía la
 *  base real que originó este servicio: tres fuentes distintas (la planilla
 *  de facturación, la de reparto y la agenda del celular) cargadas por
 *  gente distinta, con el mismo cliente escrito de tres maneras.
 *
 *  Negocios y teléfonos ficticios (patrón fijo 4047-02XX). */

const LOCALIDADES = [
  { valor: "Martínez", alias: [] },
  { valor: "San Isidro", alias: ["s. isidro", "s isidro"] },
  { valor: "Vicente López", alias: ["vte. lópez", "vte lopez", "v. lopez"] },
  { valor: "Olivos", alias: [] },
  { valor: "Munro", alias: [] },
  { valor: "Florida", alias: [] },
  { valor: "Boulogne", alias: [] },
];

export const clientes: Preset = {
  slug: "clientes",
  nombre: "Planilla de clientes",
  rubro: "Distribuidora",
  gancho:
    "El mismo cliente cargado tres veces por tres personas distintas, y un CUIT que Excel convirtió solo en notación científica.",
  columnas: [
    { clave: "razon", titulo: "Razón social", tipo: "nombre", clavePara: "dedupe" },
    { clave: "localidad", titulo: "Localidad", tipo: "localidad", canonicos: LOCALIDADES },
    { clave: "telefono", titulo: "Teléfono", tipo: "telefono" },
    { clave: "cuit", titulo: "CUIT", tipo: "cuit" },
    { clave: "compra", titulo: "Última compra", tipo: "moneda" },
    { clave: "fecha", titulo: "Fecha", tipo: "fecha" },
  ],
  filas: [
    { razon: "Veterinaria San Martín", localidad: "Martínez", telefono: "11 4047-0203", cuit: "30-71234567-1", compra: "$ 348.500", fecha: "9/3/26" },
    { razon: "VETERINARIA SAN MARTIN", localidad: "MARTINEZ", telefono: "+54 9 11 4047 0203", cuit: "", compra: "348500", fecha: "2026-03-09" },
    { razon: "Pet Shop Los Robles", localidad: "Vte. López", telefono: "1140470215", cuit: "27-23456789-1", compra: "$ 127.900", fecha: "2/3/26" },
    { razon: "Agro Norte SRL", localidad: "boulogne", telefono: "4047-0227", cuit: "3.07123E+10", compra: "$ 1.240.000", fecha: "26/02/2026" },
    { razon: "Clínica Veterinaria Del Sur", localidad: "Munro", telefono: "11 4047-0239", cuit: "20-12345678-6", compra: "$ 512.300", fecha: "2026-02-18" },
    { razon: "Forrajería El Trébol", localidad: "S. Isidro", telefono: "549 11 4047 0241", cuit: "", compra: "$ 89.750", fecha: "14/1/26" },
    { razon: "pet shop los robles", localidad: "Vicente López", telefono: "11 4047-0215", cuit: "", compra: "", fecha: "" },
    { razon: "Distribuidora Aconcagua", localidad: "Olivos", telefono: "", cuit: "23-34567890-5", compra: "$ 675.400", fecha: "5/3/26" },
    { razon: "Veterinaria Patitas", localidad: "FLORIDA", telefono: "11 4047-0253", cuit: "30-71234567-8", compra: "$ 203.100", fecha: "2026-01-29" },
    { razon: "Agro Norte S.R.L.", localidad: "Boulogne", telefono: "11 4047-0227", cuit: "", compra: "$ 1.240.000", fecha: "26/2/26" },
    { razon: "Criadero La Loma", localidad: "Munro", telefono: "11 4047-0265", cuit: "20-35421876-4", compra: "$ 94.600", fecha: "21/2/26" },
    { razon: "Distribuidora Aconcagua", localidad: "Olivos", telefono: "11 4047-0277", cuit: "", compra: "", fecha: "5/3/26" },
    { razon: "Veterinaria del Puerto", localidad: "Olivos", telefono: "11 4047-0289", cuit: "27-12908734-5", compra: "$ 431.800", fecha: "12/3/26" },
    { razon: "Forrajeria el Trebol", localidad: "San Isidro", telefono: "11 4047-0241", cuit: "20-28765432-5", compra: "$ 89.750", fecha: "14/01/2026" },
  ],
};
