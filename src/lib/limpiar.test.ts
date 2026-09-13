import { describe, expect, it } from "vitest";
import { aplicarFusiones, limpiar } from "./limpiar";
import { propiedades } from "./planillas/propiedades";
import { PRESETS } from "./planillas";
import { cuitValido } from "./normalizar";
import type { Preset } from "./planillas/tipos";

const res = limpiar(propiedades);
/** Como el motor propone y no aplica, los tests aceptan lo sugerido. */
const sugeridas = (r: ReturnType<typeof limpiar>) =>
  new Set(r.fusiones.filter((f) => f.sugerida).map((f) => f.id));
const finales = aplicarFusiones(res, propiedades.columnas, sugeridas(res));
const porDireccion = (d: string) =>
  finales.find((f) => f.celdas.direccion.valor.toLowerCase().includes(d));

describe("limpieza de la planilla de propiedades", () => {
  it("fusiona las filas duplicadas y deja menos filas de las que entraron", () => {
    expect(propiedades.filas).toHaveLength(15);
    // 4 duplicados: Maipú 2847, Paraná 1290, Ader 455, Roca 812
    expect(res.conteos.duplicadosUnificados).toBe(4);
    expect(finales).toHaveLength(11);
  });

  it("normaliza los cuatro formatos de teléfono al mismo valor", () => {
    const maipu = porDireccion("maipú 2847");
    expect(maipu?.celdas.telefono.valor).toBe("+54 9 11 4047-0012");

    const parana = porDireccion("paraná 1290");
    expect(parana?.celdas.telefono.valor).toBe("+54 9 11 4047-0034");

    const salta = porDireccion("salta 77");
    expect(salta?.celdas.telefono.valor).toBe("+54 9 11 4047-0111");
  });

  it("al fusionar, completa el teléfono que faltaba en la fila que ganó", () => {
    // Roca 812 entró sin teléfono; su duplicado sí lo traía.
    const roca = porDireccion("roca 812");
    expect(roca?.celdas.telefono.valor).toBe("+54 9 11 4047-0201");
    expect(roca?.absorbio).toContain(15);
  });

  it("al fusionar, reemplaza el teléfono dudoso por el completo", () => {
    // Ader 455 entró como "4047-0056", sin característica; el duplicado
    // traía el número entero. Tiene que ganar el bueno.
    const ader = porDireccion("ader 455");
    expect(ader?.celdas.telefono.valor).toBe("+54 9 11 4047-0056");
    expect(ader?.celdas.telefono.alerta).toBeUndefined();
  });

  it("marca el CUIT con dígito verificador inválido sin descartarlo", () => {
    const ader = porDireccion("ader 455");
    expect(ader?.celdas.cuit.valor).toBe("30-71234567-8");
    expect(ader?.celdas.cuit.alerta).toBe("Dígito verificador inválido");
    expect(res.conteos.cuitInvalidos).toBe(1);
    expect(res.conteos.cuitRotosPorExcel).toBe(1);
  });

  it("recupera el CUIT que Excel pasó a notación científica", () => {
    const libertador = porDireccion("libertador 15200");
    expect(libertador?.celdas.cuit.valor).toBe("30-71230000-0");
    // No se lo hace pasar por dato bueno: Excel ya se comió dígitos.
    expect(libertador?.celdas.cuit.alerta).toBe("Excel lo rompió — verificar");
  });

  it("unifica las grafías de localidad contra la lista canónica", () => {
    expect(porDireccion("maipú 2847")?.celdas.localidad.valor).toBe("Martínez");
    expect(porDireccion("maipú 3100")?.celdas.localidad.valor).toBe("Martínez");
    expect(porDireccion("paraná 1290")?.celdas.localidad.valor).toBe("Vicente López");
    expect(porDireccion("ader 455")?.celdas.localidad.valor).toBe("Vicente López");
    expect(porDireccion("salta 77")?.celdas.localidad.valor).toBe("Vicente López");
    expect(porDireccion("libertador 14050")?.celdas.localidad.valor).toBe("Acassuso");
  });

  it("lleva todas las fechas a ISO, vengan como vengan", () => {
    expect(porDireccion("maipú 2847")?.celdas.publicado.valor).toBe("2026-03-12");
    expect(porDireccion("ader 455")?.celdas.publicado.valor).toBe("2026-02-18");
    expect(porDireccion("roca 812")?.celdas.publicado.valor).toBe("2026-01-22");
  });

  it("uniforma los precios mezclados", () => {
    expect(porDireccion("maipú 2847")?.celdas.precio.valor).toBe("USD 185.000");
    expect(porDireccion("25 de mayo")?.celdas.precio.valor).toBe("$ 98.500.000");
  });

  it("guarda el valor original de cada celda que tocó", () => {
    const maipu = porDireccion("maipú 2847");
    expect(maipu?.celdas.telefono.original).toBe("11 4047-0012");
    expect(maipu?.celdas.telefono.cambio).toBe(true);
    // Una celda que ya estaba bien no se marca como cambiada.
    expect(maipu?.celdas.direccion.cambio).toBe(false);
  });

  it("no explota con una planilla vacía", () => {
    const vacio: Preset = { ...propiedades, filas: [] };
    const r = limpiar(vacio);
    expect(r.filas).toHaveLength(0);
    expect(r.fusiones).toHaveLength(0);
    expect(r.conteos.duplicadosUnificados).toBe(0);
  });
});

describe("los tres presets", () => {
  it.each(PRESETS.map((p) => [p.rubro, p] as const))(
    "%s: limpia sin romperse y encuentra algo que arreglar",
    (_rubro, preset) => {
      const r = limpiar(preset);
      const f = aplicarFusiones(preset.columnas ? r : r, preset.columnas, sugeridas(r));

      // Aceptando lo sugerido tiene que quedar menos de lo que entró: si
      // un preset no propone nada, la muestra no muestra nada.
      expect(f.length).toBeLessThan(preset.filas.length);
      expect(r.conteos.duplicadosUnificados).toBeGreaterThan(0);
      expect(r.conteos.telefonosNormalizados).toBeGreaterThan(0);

      // Ninguna fila puede quedar sin su clave principal.
      for (const fila of f) {
        const primera = preset.columnas[0].clave;
        expect(fila.celdas[primera].valor).not.toBe("");
      }
    },
  );

  it("ningún preset deja pasar un CUIT inválido sin marcarlo", () => {
    for (const preset of PRESETS) {
      const r = limpiar(preset);
      const colCuit = preset.columnas.find((c) => c.tipo === "cuit");
      if (!colCuit) continue;
      for (const fila of r.filas) {
        const celda = fila.celdas[colCuit.clave];
        if (!celda.valor) continue;
        const digitos = celda.valor.replace(/\D/g, "");
        if (digitos.length === 11 && !cuitValido(digitos)) {
          expect(celda.alerta).toBeTruthy();
        }
      }
    }
  });
});

describe("planillas que no son de gente (catálogo, stock, precios)", () => {
  /** Sin columna de nombre ni de teléfono no hay forma de saber si dos
   *  filas son "la misma persona" — pero sí de ver la fila repetida. */
  const catalogo: Preset = {
    slug: "catalogo",
    nombre: "Catálogo",
    rubro: "Comercio",
    gancho: "",
    columnas: [
      { clave: "sku", titulo: "Código", tipo: "texto" },
      { clave: "desc", titulo: "Descripción", tipo: "texto" },
      { clave: "stock", titulo: "Stock", tipo: "numero" },
      { clave: "precio", titulo: "Precio", tipo: "moneda" },
      { clave: "activo", titulo: "¿Activo?", tipo: "siNo" },
    ],
    filas: [
      { sku: "A-100", desc: "Collar chico", stock: "12", precio: "$ 8.500", activo: "SI" },
      { sku: "A-101", desc: "Collar  mediano ", stock: "1.200", precio: "8500", activo: "x" },
      { sku: "A-100", desc: "Collar chico", stock: "12", precio: "$ 8.500", activo: "SI" },
      { sku: "A-102", desc: "Correa larga", stock: "0", precio: "$ 12.000", activo: "NO" },
      { sku: "A-103", desc: "Pipeta", stock: "45", precio: "$ 3.200", activo: "-" },
    ],
  };

  const r = limpiar(catalogo);
  const f = aplicarFusiones(r, catalogo.columnas, sugeridas(r));

  it("detecta la fila repetida aunque no haya ni nombre ni teléfono", () => {
    expect(r.conteos.filasIdenticas).toBe(1);
    expect(f).toHaveLength(4);
  });

  it("unifica los Sí/No escritos de cinco formas", () => {
    const valores = f.map((x) => x.celdas.activo.valor);
    expect(new Set(valores)).toEqual(new Set(["Sí", "No"]));
    expect(r.conteos.siNoUnificados).toBeGreaterThan(0);
  });

  it("encuentra los espacios invisibles que rompen los BUSCARV", () => {
    expect(r.conteos.espaciosCorregidos).toBe(1); // "Collar  mediano ": doble en el medio y uno al final
    const fila = f.find((x) => /mediano/.test(x.celdas.desc.valor));
    expect(fila?.celdas.desc.valor).toBe("Collar mediano");
    expect(fila?.celdas.desc.cambio).toBe(true);
  });

  it("uniforma números y precios cargados como texto", () => {
    const fila = f.find((x) => x.celdas.sku.valor === "A-101");
    expect(fila?.celdas.stock.valor).toBe("1.200");
    expect(fila?.celdas.precio.valor).toBe("$ 8.500");
  });

  it("siempre encuentra algo: nunca muestra la planilla como perfecta", () => {
    const hallazgos = Object.values(r.conteos).reduce((a, b) => a + b, 0);
    expect(hallazgos).toBeGreaterThan(0);
  });
});

describe("nunca unifica dos cosas distintas por su cuenta", () => {
  /** El caso que más caro sale: dos personas que se llaman igual. */
  const homonimos: Preset = {
    slug: "homonimos",
    nombre: "Pacientes",
    rubro: "Consultorio",
    gancho: "",
    columnas: [
      { clave: "nombre", titulo: "Paciente", tipo: "nombre", clavePara: "dedupe" },
      { clave: "dni", titulo: "DNI", tipo: "cuit" },
      { clave: "tel", titulo: "Teléfono", tipo: "telefono" },
    ],
    filas: [
      { nombre: "Juan Pérez", dni: "20-12345678-6", tel: "11 4047-0701" },
      { nombre: "JUAN PEREZ", dni: "27-23456789-1", tel: "11 4047-0702" },
      { nombre: "Ana Gómez", dni: "", tel: "11 4047-0703" },
      { nombre: "ana gomez", dni: "23-34567890-5", tel: "" },
    ],
  };

  const r = limpiar(homonimos);
  const conflictiva = r.fusiones.find((f) => f.principal === 1);
  const limpiaSugerida = r.fusiones.find((f) => f.principal === 3);

  it("propone pero NO sugiere unificar cuando el documento se contradice", () => {
    expect(conflictiva).toBeDefined();
    expect(conflictiva!.conflicto).toMatch(/DNI distinto/);
    expect(conflictiva!.sugerida).toBe(false);
  });

  it("sí sugiere unificar cuando no hay nada que lo contradiga", () => {
    expect(limpiaSugerida).toBeDefined();
    expect(limpiaSugerida!.conflicto).toBeUndefined();
    expect(limpiaSugerida!.sugerida).toBe(true);
  });

  it("aceptando lo sugerido, los homónimos quedan separados", () => {
    const f = aplicarFusiones(r, homonimos.columnas, sugeridas(r));
    expect(f).toHaveLength(3); // los dos Juan siguen siendo dos
    const juanes = f.filter((x) => /juan/i.test(x.celdas.nombre.valor));
    expect(juanes).toHaveLength(2);
  });

  it("el que decide es quien mira: se puede forzar la unificación", () => {
    const forzada = aplicarFusiones(
      r,
      homonimos.columnas,
      new Set(r.fusiones.map((f) => f.id)),
    );
    expect(forzada).toHaveLength(2);
  });

  it("y también rechazar una que venía sugerida", () => {
    const ninguna = aplicarFusiones(r, homonimos.columnas, new Set());
    expect(ninguna).toHaveLength(4); // no se borra nada
  });
});
