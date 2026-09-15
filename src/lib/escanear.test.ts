/** Lo que se prueba acá es el CRITERIO, no el resultado: que la misma
 *  planilla con distinta forma de estar cargada reciba distinta limpieza.
 *  Son los dos casos que justifican que el escáner exista. */

import { describe, expect, it } from "vitest";
import { escanear } from "./escanear";
import { aplicarFusiones, limpiar } from "./limpiar";
import type { Preset } from "./planillas/tipos";

const base = (columnas: Preset["columnas"], filas: Preset["filas"]): Preset => ({
  slug: "t",
  nombre: "t",
  rubro: "t",
  gancho: "",
  columnas,
  filas,
});

/** Escanea y después limpia con lo que el escaneo decidió: es la cadena
 *  real de la pantalla, no el motor aislado. */
function escanearYLimpiar(p: Preset) {
  const esc = escanear(p);
  const r = limpiar({ ...p, columnas: esc.columnas });
  const sugeridas = new Set(r.fusiones.filter((f) => f.sugerida).map((f) => f.id));
  return { esc, r, finales: aplicarFusiones(r, esc.columnas, sugeridas) };
}

const colsPago: Preset["columnas"] = [
  { clave: "n", titulo: "Cliente", tipo: "nombre", clavePara: "dedupe" },
  { clave: "p", titulo: "¿Pagó?", tipo: "siNo" },
];

describe('el "-" se interpreta según cuánto aparece en ESTA planilla', () => {
  it("si aparece seguido, es un tercer estado y no se convierte", () => {
    // 3 de 9 filas: con esa frecuencia parece "pendiente", no un "no".
    const p = base(colsPago, [
      { n: "A", p: "SI" }, { n: "B", p: "si" }, { n: "C", p: "NO" },
      { n: "D", p: "no" }, { n: "E", p: "x" }, { n: "F", p: "-" },
      { n: "G", p: "-" }, { n: "H", p: "-" }, { n: "I", p: "SI" },
    ]);
    const { esc, r } = escanearYLimpiar(p);

    expect(esc.columnas.find((c) => c.clave === "p")!.siNoDejar).toContain("-");

    const guiones = r.filas.filter((f) => f.celdas.p.original === "-");
    expect(guiones).toHaveLength(3);
    for (const g of guiones) {
      expect(g.celdas.p.valor).toBe("-");
      expect(g.celdas.p.cambio).toBe(false);
    }

    // Y lo dice, con el número que lo justifica.
    const perfil = esc.perfiles.find((x) => x.clave === "p")!;
    const regla = perfil.reglas.find((rg) => rg.titulo.includes("se deja como está"));
    expect(regla?.titulo).toBe('"-" se deja como está');
    expect(regla?.detalle).toContain("3 de 9");
  });

  it("si aparece una sola vez entre muchas, sí se toma como no", () => {
    const p = base(colsPago, [
      { n: "A", p: "SI" }, { n: "B", p: "si" }, { n: "C", p: "NO" },
      { n: "D", p: "no" }, { n: "E", p: "SI" }, { n: "F", p: "no" },
      { n: "G", p: "SI" }, { n: "H", p: "no" }, { n: "I", p: "SI" },
      { n: "J", p: "no" }, { n: "K", p: "SI" }, { n: "L", p: "-" },
    ]);
    const { esc, r } = escanearYLimpiar(p);

    expect(esc.columnas.find((c) => c.clave === "p")!.siNoDejar ?? []).not.toContain("-");

    const g = r.filas.find((f) => f.celdas.p.original === "-")!;
    expect(g.celdas.p.valor).toBe("No");
    expect(g.celdas.p.cambio).toBe(true);
  });

  it("las formas comunes de sí y no se unifican siempre, por frecuentes que sean", () => {
    // "x" en un tercio de las filas sigue siendo "sí": no es ambiguo.
    const p = base(colsPago, [
      { n: "A", p: "x" }, { n: "B", p: "x" }, { n: "C", p: "x" },
      { n: "D", p: "no" }, { n: "E", p: "0" }, { n: "F", p: "SI" },
    ]);
    const { esc, r } = escanearYLimpiar(p);

    expect(esc.columnas.find((c) => c.clave === "p")!.siNoDejar ?? []).toHaveLength(0);
    const equis = r.filas.filter((f) => f.celdas.p.original === "x");
    expect(equis).toHaveLength(3);
    for (const e of equis) expect(e.celdas.p.valor).toBe("Sí");
    expect(r.filas.find((f) => f.celdas.p.original === "0")!.celdas.p.valor).toBe("No");
  });

  it("lo que no se entiende ni como sí ni como no queda intacto", () => {
    const p = base(colsPago, [
      { n: "A", p: "SI" }, { n: "B", p: "no" }, { n: "C", p: "SI" },
      { n: "D", p: "no" }, { n: "E", p: "parcial" }, { n: "F", p: "SI" },
    ]);
    const { r } = escanearYLimpiar(p);
    const x = r.filas.find((f) => f.celdas.p.original === "parcial")!;
    expect(x.celdas.p.valor).toBe("parcial");
    expect(x.celdas.p.cambio).toBe(false);
  });
});

describe("un documento que se repite a propósito no sirve para unificar", () => {
  const colsEmpresa: Preset["columnas"] = [
    { clave: "n", titulo: "Empleado", tipo: "nombre", clavePara: "dedupe" },
    { clave: "c", titulo: "CUIT empresa", tipo: "cuit" },
  ];

  it("lo detecta y explica por qué no lo va a usar", () => {
    // Una empresa, cinco empleados: el CUIT es el mismo a propósito.
    const p = base(colsEmpresa, [
      { n: "Ana Gómez", c: "30-71234567-1" },
      { n: "Luis Paz", c: "30-71234567-1" },
      { n: "Sara Díaz", c: "30-71234567-1" },
      { n: "Juan Ruiz", c: "30-71234567-1" },
      { n: "Eva Mota", c: "30-71234567-1" },
    ]);
    const { esc } = escanearYLimpiar(p);

    expect(esc.columnas.find((c) => c.clave === "c")!.esIdentificador).toBe(false);

    const perfil = esc.perfiles.find((x) => x.clave === "c")!;
    expect(perfil.reglas.some((r) => r.titulo.includes("se repite a propósito"))).toBe(true);
  });

  it("y entonces un CUIT distinto no separa a dos homónimos", () => {
    // Dos "Ana Gómez" de empresas distintas. Con el CUIT repetido a
    // propósito, que difiera no prueba que sean dos personas.
    const p = base(colsEmpresa, [
      { n: "Ana Gómez", c: "30-71234567-1" },
      { n: "Luis Paz", c: "30-71234567-1" },
      { n: "Sara Díaz", c: "30-71234567-1" },
      { n: "ANA GOMEZ", c: "30-59876543-2" },
      { n: "Eva Mota", c: "30-59876543-2" },
      { n: "Raúl Vera", c: "30-59876543-2" },
    ]);
    const { esc, r } = escanearYLimpiar(p);
    expect(esc.columnas.find((c) => c.clave === "c")!.esIdentificador).toBe(false);

    const fusion = r.fusiones.find((f) => f.motivo === "mismo nombre")!;
    expect(fusion).toBeDefined();
    expect(fusion.conflicto).toBeUndefined();
    expect(fusion.sugerida).toBe(true);
  });

  it("pero si el documento es único, sí los separa", () => {
    const p = base(colsEmpresa, [
      { n: "Ana Gómez", c: "27-31234567-4" },
      { n: "ANA GOMEZ", c: "27-35876543-1" },
      { n: "Luis Paz", c: "20-30111222-3" },
      { n: "Eva Mota", c: "27-38999888-5" },
    ]);
    const { esc, r } = escanearYLimpiar(p);
    expect(esc.columnas.find((c) => c.clave === "c")!.esIdentificador).toBe(true);

    const fusion = r.fusiones.find((f) => f.motivo === "mismo nombre")!;
    expect(fusion.conflicto).toContain("distinto");
    expect(fusion.sugerida).toBe(false);
  });

  it("un teléfono compartido tampoco alcanza para unificar", () => {
    // El fijo del local, cargado en todas las filas.
    const p = base(
      [
        { clave: "n", titulo: "Contacto", tipo: "nombre", clavePara: "dedupe" },
        { clave: "t", titulo: "Telefono", tipo: "telefono" },
      ],
      [
        { n: "Pedro Sosa", t: "11 4747-1000" },
        { n: "Marta Lima", t: "11 4747-1000" },
        { n: "Jorge Vega", t: "11 4747-1000" },
        { n: "Nora Blanco", t: "11 4747-1000" },
      ],
    );
    const { esc, r } = escanearYLimpiar(p);
    expect(esc.columnas.find((c) => c.clave === "t")!.esIdentificador).toBe(false);
    expect(r.fusiones.some((f) => f.motivo === "mismo teléfono")).toBe(false);
  });
});

describe("los consejos avisan y no tocan nada", () => {
  it("una columna sin nombre y una casi vacía", () => {
    const p = base(
      [
        { clave: "a", titulo: "Cliente", tipo: "nombre" },
        { clave: "b", titulo: "Columna 2", tipo: "texto" },
        { clave: "c", titulo: "Observaciones", tipo: "texto" },
      ],
      [
        { a: "Uno", b: "z", c: "" }, { a: "Dos", b: "z", c: "" },
        { a: "Tres", b: "z", c: "" }, { a: "Cuatro", b: "z", c: "" },
        { a: "Cinco", b: "z", c: "" }, { a: "Seis", b: "z", c: "" },
        { a: "Siete", b: "z", c: "algo" },
      ],
    );
    const { esc } = escanearYLimpiar(p);
    expect(esc.consejos.some((c) => c.titulo.includes("Ponele nombre"))).toBe(true);
    expect(esc.consejos.some((c) => c.titulo.includes("casi vacía"))).toBe(true);
  });

  it("una celda con varios valores adentro", () => {
    const p = base(
      [
        { clave: "a", titulo: "Cliente", tipo: "nombre" },
        { clave: "t", titulo: "Contactos varios", tipo: "texto" },
      ],
      [
        { a: "Uno", t: "11 4047-0901 / 11 4047-0902" },
        { a: "Dos", t: "11 4047-0903 / 11 4047-0904" },
        { a: "Tres", t: "11 4047-0905" },
      ],
    );
    const { esc } = escanearYLimpiar(p);
    expect(esc.consejos.some((c) => c.titulo.includes("separarla en varias"))).toBe(true);
  });

  it("dos columnas que nunca están llenas juntas", () => {
    const p = base(
      [
        { clave: "a", titulo: "Cliente", tipo: "nombre" },
        { clave: "t1", titulo: "Telefono fijo", tipo: "telefono" },
        { clave: "t2", titulo: "Telefono celular", tipo: "telefono" },
      ],
      [
        { a: "Uno", t1: "4747-1000", t2: "" },
        { a: "Dos", t1: "", t2: "11 4047-1001" },
        { a: "Tres", t1: "4747-1002", t2: "" },
        { a: "Cuatro", t1: "", t2: "11 4047-1003" },
      ],
    );
    const { esc } = escanearYLimpiar(p);
    expect(esc.consejos.some((c) => c.titulo.includes("nunca están llenas juntas"))).toBe(true);
  });

  it("dos columnas con el mismo título", () => {
    const p = base(
      [
        { clave: "a", titulo: "Cliente", tipo: "nombre" },
        { clave: "b", titulo: "Teléfono", tipo: "texto" },
        { clave: "c", titulo: "telefono", tipo: "texto" },
      ],
      [{ a: "Uno", b: "1", c: "2" }, { a: "Dos", b: "3", c: "4" }],
    );
    const { esc } = escanearYLimpiar(p);
    expect(esc.consejos.some((c) => c.titulo.includes("columnas llamadas"))).toBe(true);
  });

  it("la dirección que trae la localidad adentro", () => {
    const p = base(
      [
        { clave: "a", titulo: "Cliente", tipo: "nombre" },
        { clave: "d", titulo: "Direccion", tipo: "texto" },
      ],
      [
        { a: "Uno", d: "Av. Maipú 1200, Vicente López" },
        { a: "Dos", d: "Alvear 55, Martínez" },
        { a: "Tres", d: "Paraná 900, San Isidro" },
      ],
    );
    const { esc } = escanearYLimpiar(p);
    expect(esc.consejos.some((c) => c.titulo.includes("trae la localidad"))).toBe(true);
  });

  it("ningún consejo modifica una celda", () => {
    const p = base(
      [{ clave: "a", titulo: "Columna 1", tipo: "texto" }],
      [{ a: "x" }, { a: "y" }, { a: "z" }],
    );
    const { esc, finales } = escanearYLimpiar(p);
    expect(esc.consejos.length).toBeGreaterThan(0);
    expect(finales.map((f) => f.celdas.a.valor)).toEqual(["x", "y", "z"]);
  });
});

describe("qué dice que es la planilla", () => {
  it("reconoce una base de contactos", () => {
    const p = base(
      [
        { clave: "n", titulo: "Cliente", tipo: "nombre" },
        { clave: "t", titulo: "Telefono", tipo: "telefono" },
      ],
      [{ n: "Uno", t: "11 4047-1100" }, { n: "Dos", t: "11 4047-1101" }],
    );
    const esc = escanear(p);
    expect(esc.resumen).toContain("base de contactos o clientes");
    expect(esc.resumen).toContain("2 filas");
  });

  it("reconoce un listado de productos", () => {
    const p = base(
      [
        { clave: "d", titulo: "Descripcion", tipo: "texto" },
        { clave: "pr", titulo: "Precio", tipo: "moneda" },
      ],
      [{ d: "Collar", pr: "$ 100" }, { d: "Correa", pr: "$ 200" }],
    );
    expect(escanear(p).resumen).toContain("productos o movimientos");
  });
});

describe("el tipo elegido a mano manda sobre el detectado", () => {
  it("cambia la limpieza y lo deja asentado", () => {
    // Un código interno numérico que NO es una cantidad.
    const p = base(
      [
        { clave: "n", titulo: "Producto", tipo: "nombre" },
        { clave: "k", titulo: "Cantidad", tipo: "numero" },
      ],
      [{ n: "Collar", k: "1002" }, { n: "Correa", k: "1003" }, { n: "Pipeta", k: "1004" }],
    );

    const auto = escanear(p);
    expect(auto.perfiles.find((x) => x.clave === "k")!.tipo).toBe("numero");

    const manual = escanear(p, { k: "texto" });
    const perfil = manual.perfiles.find((x) => x.clave === "k")!;
    expect(perfil.tipo).toBe("texto");
    expect(perfil.confianza).toBe("alta");
    expect(perfil.razon).toBe("lo elegiste vos");
    expect(manual.columnas.find((c) => c.clave === "k")!.tipo).toBe("texto");
  });
});
