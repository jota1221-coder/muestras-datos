/** Lo que se prueba es que el ordenador arregle la FORMA de cualquier
 *  planilla sin inventar nada y sin perder un solo dato: si una celda
 *  entra, tiene que salir en algún lado. */

import { describe, expect, it } from "vitest";
import { grillaDePreset, ordenarFilas, ordenarGrilla, type Cambio, type Grilla } from "./ordenar";
import { PRESETS } from "./planillas";
import { stock } from "./planillas/stock";

const ids = (cs: Cambio[]) => cs.map((c) => c.id);
const titulos = (g: Grilla, op = {}) => ordenarGrilla(g, op).preset.columnas.map((c) => c.titulo);

/** Todas las celdas no vacías de una grilla, para comparar que no se
 *  pierda ninguna. */
function contenido(filas: string[][]): string[] {
  return filas.flat().map((c) => c.trim()).filter(Boolean).sort();
}

describe("encontrar dónde empieza la tabla", () => {
  it("saltea el título y la fila en blanco de arriba", () => {
    const g: Grilla = [
      ["CLIENTES 2026"],
      [],
      ["Nombre", "Teléfono", "Localidad"],
      ["Ana Paz", "11 4047-0001", "Olivos"],
      ["Luis Sosa", "11 4047-0002", "Munro"],
    ];
    const o = ordenarGrilla(g);
    expect(ids(o.cambios)).toContain("encabezado");
    expect(o.tituloHoja).toBe("CLIENTES 2026");
    expect(o.preset.columnas.map((c) => c.titulo)).toEqual(["Nombre", "Teléfono", "Localidad"]);
    expect(o.preset.filas).toHaveLength(2);
  });

  it("no confunde una fila de datos con los títulos aunque ocupe todo el ancho", () => {
    const g: Grilla = [
      ["Informe mensual"],
      ["Producto", "Precio", "Vendidos"],
      ["Yerba 1 kg", "$ 4.500", "30"],
    ];
    // "$ 4.500" y "30" son datos: esa fila no puede ser el encabezado.
    expect(titulos(g)).toEqual(["Producto", "Precio", "Vendidos"]);
  });

  it("si la planilla ya empieza bien, no propone nada sobre el encabezado", () => {
    const g: Grilla = [["Nombre", "Teléfono"], ["Ana", "11 4047-0001"], ["Luis", "11 4047-0002"]];
    expect(ids(ordenarGrilla(g).cambios)).not.toContain("encabezado");
  });

  it("si se rechaza, la primera fila sigue siendo la de títulos", () => {
    const g: Grilla = [["Clientes"], ["Nombre", "Teléfono"], ["Ana", "11 4047-0001"]];
    const o = ordenarGrilla(g, { aceptar: (c) => c.id !== "encabezado" });
    expect(o.preset.columnas[0].titulo).toBe("Clientes");
  });
});

describe("el pie de la planilla", () => {
  const g: Grilla = [
    ["Artículo", "Precio", "Stock"],
    ["Tornillo", "$ 100", "5"],
    ["Tarugo", "$ 200", "3"],
    ["Clavo", "$ 50", "9"],
    ["TOTAL", "$ 350", "17"],
    ["Precios sin IVA."],
  ];

  it("saca el total y la nota, y marca qué columnas llevaban total", () => {
    const o = ordenarGrilla(g);
    expect(ids(o.cambios)).toContain("pie");
    expect(o.preset.filas).toHaveLength(3);
    const conTotal = o.columnasConTotal.map(
      (k) => o.preset.columnas.find((c) => c.clave === k)!.titulo,
    );
    expect(conTotal.sort()).toEqual(["Precio", "Stock"]);
  });

  it("reconoce el total aunque no esté en la primera columna ni en mayúsculas", () => {
    const h: Grilla = [
      ["Cód.", "Artículo", "Precio"],
      ["A1", "Tornillo", "$ 100"],
      ["A2", "Tarugo", "$ 200"],
      ["", "Subtotal", "$ 300"],
    ];
    expect(ordenarGrilla(h).preset.filas).toHaveLength(2);
  });

  it("no toma como nota al último registro aunque tenga una sola celda", () => {
    const h: Grilla = [
      ["Nombre", "Teléfono", "Localidad"],
      ["Ana Paz", "11 4047-0001", "Olivos"],
      ["Juan Carlos Rodríguez de la Fuente", "", ""],
    ];
    const o = ordenarGrilla(h);
    expect(ids(o.cambios)).not.toContain("pie");
    expect(o.preset.filas).toHaveLength(2);
  });

  it("si se rechaza, el total queda como una fila más y no se promete fórmula", () => {
    const o = ordenarGrilla(g, { aceptar: (c) => c.id !== "pie" });
    expect(o.preset.filas).toHaveLength(5);
    expect(o.columnasConTotal).toEqual([]);
  });
});

describe("filas y columnas vacías", () => {
  it("saca las filas en blanco del medio y la columna que no tiene nada", () => {
    const g: Grilla = [
      ["Nombre", "", "Teléfono"],
      ["Ana", "", "11 4047-0001"],
      [],
      ["Luis", "", "11 4047-0002"],
    ];
    const o = ordenarGrilla(g);
    expect(ids(o.cambios)).toEqual(expect.arrayContaining(["filasVacias", "columnasVacias"]));
    expect(o.preset.filas).toHaveLength(2);
    expect(o.preset.columnas.map((c) => c.titulo)).toEqual(["Nombre", "Teléfono"]);
  });

  it("una columna sin título pero CON datos no se toca: se le pone un nombre provisorio", () => {
    const g: Grilla = [
      ["Nombre", "", "Teléfono"],
      ["Ana", "algo", "11 4047-0001"],
      ["Luis", "otra cosa", "11 4047-0002"],
    ];
    const o = ordenarGrilla(g);
    expect(ids(o.cambios)).not.toContain("columnasVacias");
    expect(o.preset.columnas.map((c) => c.titulo)).toContain("Columna 2");
  });
});

describe("separar lo que está junto", () => {
  it("teléfono y mail en la misma celda van a dos columnas, cada una con su tipo", () => {
    const g: Grilla = [
      ["Proveedor", "Contacto"],
      ["Uno", "11 4047-0410 / ventas@uno.example"],
      ["Dos", "1140470411 / info@dos.example"],
      ["Tres", "11 4047-0412"],
    ];
    const o = ordenarGrilla(g);
    const cols = o.preset.columnas;
    expect(cols.map((c) => c.titulo)).toEqual(["Proveedor", "Contacto", "Contacto · mail"]);
    // "Proveedor" es una categoría que se repite, como una localidad.
    expect(cols.map((c) => c.tipo)).toEqual(["localidad", "telefono", "email"]);
    // La fila sin mail queda con el teléfono en su lugar y el mail vacío.
    const ultima = o.preset.filas[2];
    expect(ultima[cols[1].clave]).toBe("11 4047-0412");
    expect(ultima[cols[2].clave]).toBe("");
  });

  it("dos datos del mismo tipo se numeran", () => {
    const g: Grilla = [
      ["Cliente", "Teléfonos"],
      ["Uno", "11 4047-0001 / 11 4047-0002"],
      ["Dos", "11 4047-0003 / 11 4047-0004"],
    ];
    expect(titulos(g)).toEqual(["Cliente", "Teléfonos 1", "Teléfonos 2"]);
  });

  it("no parte fechas ni teléfonos que llevan barra o guion sin espacios", () => {
    const g: Grilla = [
      ["Cliente", "Alta", "Teléfono"],
      ["Uno", "9/3/26", "4047-0001"],
      ["Dos", "12/3/26", "4047-0002"],
    ];
    expect(ids(ordenarGrilla(g).cambios).some((i) => i.startsWith("separar"))).toBe(false);
  });

  it("saca la localidad de la dirección, cortando en la ÚLTIMA coma", () => {
    const g: Grilla = [
      ["Nombre", "Domicilio"],
      ["Ana", "Av. Maipú 1200, 3° B, Vicente López"],
      ["Luis", "Roca 200, Olivos"],
    ];
    const o = ordenarGrilla(g);
    const [, calle, lugar] = o.preset.columnas;
    expect(lugar.titulo).toBe("Localidad");
    expect(lugar.tipo).toBe("localidad");
    expect(o.preset.filas[0][calle.clave]).toBe("Av. Maipú 1200, 3° B");
    expect(o.preset.filas[0][lugar.clave]).toBe("Vicente López");
  });

  it("si ya hay columna de localidad, la dirección no se parte", () => {
    const g: Grilla = [
      ["Nombre", "Domicilio", "Localidad"],
      ["Ana", "Maipú 1200, Vicente López", "Vicente López"],
      ["Luis", "Roca 200, Olivos", "Olivos"],
    ];
    expect(ids(ordenarGrilla(g).cambios).some((i) => i.startsWith("direccion"))).toBe(false);
  });
});

describe("unir lo que está separado", () => {
  const g: Grilla = [
    ["Nombre", "Teléfono fijo", "Teléfono celular"],
    ["Ana", "4747-1000", ""],
    ["Luis", "", "11 4047-1001"],
    ["Eva", "4747-1002", ""],
    ["Juan", "", "11 4047-1003"],
  ];

  it("dos columnas del mismo dato que nunca están llenas juntas", () => {
    const o = ordenarGrilla(g);
    const unir = o.cambios.find((c) => c.tipo === "unir")!;
    expect(unir.porDefecto).toBe(true);
    const cols = o.preset.columnas;
    expect(cols.map((c) => c.titulo)).toEqual(["Nombre", "Teléfono"]);
    expect(o.preset.filas.map((f) => f[cols[1].clave])).toEqual([
      "4747-1000",
      "11 4047-1001",
      "4747-1002",
      "11 4047-1003",
    ]);
  });

  it("si los títulos no comparten la raíz, lo propone pero en NO", () => {
    const h: Grilla = [
      ["Nombre", "Fecha de pago", "Vencimiento"],
      ["Ana", "3/2/26", ""],
      ["Luis", "", "4/2/26"],
      ["Eva", "5/2/26", ""],
      ["Juan", "", "6/2/26"],
    ];
    const o = ordenarGrilla(h);
    const unir = o.cambios.find((c) => c.tipo === "unir")!;
    expect(unir.porDefecto).toBe(false);
    expect(o.preset.columnas).toHaveLength(3);
  });

  it("nunca une texto libre, aunque sea complementario", () => {
    const h: Grilla = [
      ["Nombre", "Observaciones", "Motivo de baja"],
      ["Ana", "Llamar a la tarde", ""],
      ["Luis", "", "Se mudó"],
      ["Eva", "Paga en efectivo", ""],
      ["Juan", "", "Cerró el local"],
    ];
    expect(ordenarGrilla(h).cambios.some((c) => c.tipo === "unir")).toBe(false);
  });
});

describe("el orden de las columnas", () => {
  it("en una planilla de gente: quién, documento, contacto, lugar, resto, comentarios", () => {
    const g: Grilla = [
      ["Cliente", "Observaciones", "Localidad", "Saldo", "Teléfono", "CUIT"],
      ["Ana Paz", "Llama tarde", "Olivos", "$ 100", "11 4047-0001", "27-23456789-1"],
      ["Luis Sosa", "", "Munro", "$ 200", "11 4047-0002", "20-12345678-6"],
    ];
    expect(titulos(g)).toEqual(["Cliente", "CUIT", "Teléfono", "Localidad", "Saldo", "Observaciones"]);
  });

  it("en una planilla que no es de gente sólo manda los comentarios al final", () => {
    const g: Grilla = [
      ["Artículo", "Notas", "Precio", "Stock"],
      ["Tornillo", "Pedir más", "$ 100", "5"],
      ["Tarugo", "", "$ 200", "3"],
    ];
    expect(titulos(g)).toEqual(["Artículo", "Precio", "Stock", "Notas"]);
  });

  it("las columnas que salieron de separar una quedan juntas", () => {
    const g: Grilla = [
      ["Razón social", "Localidad", "Contacto", "CUIT"],
      ["Uno SA", "Olivos", "Ana Paz / 11 4047-0001", "30-71234567-1"],
      ["Dos SRL", "Munro", "Luis Sosa / 11 4047-0002", "30-71234567-8"],
    ];
    const t = titulos(g);
    expect(t.indexOf("Contacto · teléfono")).toBe(t.indexOf("Contacto") + 1);
  });
});

describe("el orden de las filas", () => {
  it("propone ordenar por nombre y ordena por el valor, ignorando mayúsculas y acentos", () => {
    const g: Grilla = [
      ["Paciente", "Teléfono"],
      ["Zoe", "11 4047-0001"],
      ["álvaro", "11 4047-0002"],
      ["Bruno", "11 4047-0003"],
    ];
    const o = ordenarGrilla(g);
    expect(o.ordenFilas?.sentido).toBe("asc");
    const k = o.ordenFilas!.clave;
    const ordenadas = ordenarFilas(o.preset.filas, o.ordenFilas!, (f) => f[k]);
    expect(ordenadas.map((f) => f[k])).toEqual(["álvaro", "Bruno", "Zoe"]);
  });

  it("sin nombre pero con fecha, lo más reciente arriba", () => {
    const g: Grilla = [
      ["Fecha", "Monto"],
      ["2026-01-05", "$ 100"],
      ["2026-03-01", "$ 200"],
      ["2026-02-10", "$ 300"],
    ];
    const o = ordenarGrilla(g);
    expect(o.ordenFilas?.sentido).toBe("desc");
    const k = o.ordenFilas!.clave;
    expect(ordenarFilas(o.preset.filas, o.ordenFilas!, (f) => f[k]).map((f) => f[k])).toEqual([
      "2026-03-01",
      "2026-02-10",
      "2026-01-05",
    ]);
  });

  it("los vacíos quedan al final en cualquier sentido", () => {
    const orden = { clave: "x", titulo: "X", sentido: "desc" as const, tipo: "texto" as const };
    const r = ordenarFilas([{ x: "" }, { x: "b" }, { x: "a" }], orden, (f) => f.x);
    expect(r.map((f) => f.x)).toEqual(["b", "a", ""]);
  });

  it("si ya está ordenada no lo propone", () => {
    const g: Grilla = [["Nombre", "Tel"], ["Ana", "1"], ["Bruno", "2"], ["Carla", "3"]];
    expect(ids(ordenarGrilla(g).cambios)).not.toContain("ordenarFilas");
  });
});

describe("no se pierde nada", () => {
  it("rechazando todo, la planilla sale igual que como entró", () => {
    const g = stock.grilla!;
    const o = ordenarGrilla(g, { aceptar: () => false });
    const salida = [o.preset.columnas.map((c) => c.titulo), ...o.preset.filas.map((f) => o.preset.columnas.map((c) => f[c.clave]))];
    // Lo único que cambia es el nombre provisorio de la columna sin título
    // y que el título de arriba pasa a ser la fila de encabezados.
    expect(contenido(salida).filter((c) => !/^Columna \d+$/.test(c))).toEqual(contenido(g));
  });

  it("aceptando todo, cada dato del cuerpo sigue estando (separado o unido, pero está)", () => {
    const g = stock.grilla!;
    const o = ordenarGrilla(g);
    const salida = o.preset.filas.flatMap((f) => Object.values(f)).filter(Boolean).join(" ");
    for (const fila of g.slice(3, -2)) {
      for (const celda of fila.filter(Boolean)) {
        for (const pedazo of celda.split(/\s+\/\s+/)) expect(salida).toContain(pedazo.trim());
      }
    }
  });

  it("todos los cambios del stock se proponen y vienen sugeridos", () => {
    const o = ordenarGrilla(stock.grilla!);
    expect(ids(o.cambios)).toEqual(
      expect.arrayContaining([
        "encabezado",
        "pie",
        "filasVacias",
        "columnasVacias",
        "separar:c4",
        "reordenar",
        "ordenarFilas",
      ]),
    );
    expect(o.cambios.every((c) => c.porDefecto)).toBe(true);
    expect(o.tituloHoja).toMatch(/STOCK/);
  });
});

describe("funciona con los cuatro ejemplos", () => {
  it.each(PRESETS.map((p) => [p.rubro, p] as const))("%s: ordena sin perder filas de datos", (_r, p) => {
    const o = ordenarGrilla(p.grilla ?? grillaDePreset(p), { pistas: p.columnas });
    expect(o.preset.filas.length).toBe(p.filas.length);
    // Las columnas conocidas conservan su tipo: el ordenador no desconfía
    // de lo que ya se sabe.
    for (const c of p.columnas) {
      const igual = o.preset.columnas.find((x) => x.titulo === c.titulo);
      if (igual) expect(igual.tipo).toBe(c.tipo);
    }
  });
});
