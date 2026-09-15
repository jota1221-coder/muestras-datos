import type { Preset } from "./tipos";

/** Planilla de pacientes de un consultorio. El desorden típico acá es la
 *  obra social escrita de cinco formas y el mismo paciente cargado dos
 *  veces, una con DNI y otra con CUIT.
 *
 *  Personas y teléfonos ficticios (patrón fijo 4047-01XX). */

const OBRAS = [
  { valor: "OSDE", alias: ["o.s.d.e.", "osde binario", "osde 210"] },
  { valor: "Swiss Medical", alias: ["swiss", "swissmedical", "s. medical"] },
  { valor: "Galeno", alias: [] },
  { valor: "IOMA", alias: ["i.o.m.a."] },
  { valor: "Particular", alias: ["sin obra social", "s/o", "privado"] },
];

export const pacientes: Preset = {
  slug: "pacientes",
  nombre: "Planilla de pacientes",
  rubro: "Consultorio",
  gancho:
    "La obra social escrita de cinco maneras distintas y pacientes repetidos que el sistema cuenta como dos personas.",
  columnas: [
    { clave: "paciente", titulo: "Paciente", tipo: "nombre", clavePara: "dedupe" },
    { clave: "telefono", titulo: "Teléfono", tipo: "telefono" },
    { clave: "obra", titulo: "Obra social", tipo: "localidad", canonicos: OBRAS },
    { clave: "cuit", titulo: "DNI / CUIT", tipo: "cuit" },
    { clave: "practica", titulo: "Última práctica", tipo: "texto" },
    { clave: "visita", titulo: "Última visita", tipo: "fecha" },
    /* Una columna que se abrió con la mejor intención y quedó sin usar.
       No ensucia ningún dato, pero hace creer que la información está.
       El escáner la señala como consejo; no la toca. */
    { clave: "obs", titulo: "Observaciones", tipo: "texto" },
  ],
  filas: [
    { paciente: "Mónica Alvarez", telefono: "11 4047-0102", obra: "OSDE", cuit: "27-23456789-1", practica: "Limpieza", visita: "4/3/26" },
    { paciente: "MONICA ALVAREZ", telefono: "+54 9 11 4047 0102", obra: "o.s.d.e.", cuit: "", practica: "limpieza", visita: "2026-03-04" },
    { paciente: "Gustavo Ríos", telefono: "1140470114", obra: "swiss", cuit: "20-12345678-6", practica: "Conducto", visita: "19/2/26" },
    { paciente: "Alejandra Sosa", telefono: "4047-0126", obra: "S. Medical", cuit: "3.07123E+10", practica: "Control", visita: "2026-02-27" },
    { paciente: "Fernando Paz", telefono: "11 4047-0138", obra: "PARTICULAR", cuit: "20-28765432-5", practica: "Extracción", visita: "11/1/26" },
    { paciente: "Lucía Benítez", telefono: "549 11 4047 0140", obra: "Galeno", cuit: "", practica: "Ortodoncia", visita: "6/3/26" },
    { paciente: "Rubén Oliva", telefono: "", obra: "i.o.m.a.", cuit: "23-34567890-5", practica: "Control", visita: "28/02/2026", obs: "Avisar antes por teléfono" },
    { paciente: "Carmen Ledesma", telefono: "11 4047-0152", obra: "sin obra social", cuit: "30-71234567-8", practica: "Blanqueamiento", visita: "2026-01-22" },
    { paciente: "gustavo rios", telefono: "11 4047-0114", obra: "Swiss Medical", cuit: "", practica: "conducto", visita: "19/02/2026" },
    { paciente: "Alejandra Sosa", telefono: "11 4047-0126", obra: "Swiss Medical", cuit: "", practica: "", visita: "" },
    { paciente: "Rubén Oliva", telefono: "11 4047-0164", obra: "IOMA", cuit: "", practica: "Control", visita: "28/2/26" },
    { paciente: "Marta Suárez", telefono: "11 4047-0176", obra: "OSDE 210", cuit: "20-35421876-4", practica: "Prótesis", visita: "13/3/26" },
  ],
};
