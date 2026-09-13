/** Tipos de la muestra "planilla sucia → planilla limpia".
 *
 *  El motor no devuelve datos limpios a secas: devuelve un DIFF celda por
 *  celda. Eso es lo que hace convincente la muestra — el dueño ve qué
 *  cambió y qué era antes, no un resultado que tiene que creer. */

export type TipoColumna =
  | "texto"
  | "siNo"
  | "numero"
  | "nombre"
  | "telefono"
  | "cuit"
  | "localidad"
  | "fecha"
  | "moneda"
  | "email";

/** Una entrada de la lista canónica de un campo tipo "localidad": el valor
 *  bueno más las formas en que aparece escrito en la vida real. Sin esta
 *  tabla no hay forma de saber que "Bs. As." y "BUENOS AIRES" son lo mismo:
 *  no se parecen como strings. */
export type Canonico = { valor: string; alias: string[] };

export type Columna = {
  clave: string;
  titulo: string;
  tipo: TipoColumna;
  /** Solo para tipo "localidad". */
  canonicos?: Canonico[];
  /** Si esta columna participa de la clave de deduplicación. */
  clavePara?: "dedupe";
};

export type Preset = {
  slug: string;
  /** Cómo se llama la planilla en la pantalla. */
  nombre: string;
  /** A qué rubro se le manda esta variante. */
  rubro: string;
  /** El dolor en una línea, arriba de la tabla. */
  gancho: string;
  columnas: Columna[];
  filas: Record<string, string>[];
};

export type CeldaLimpia = {
  valor: string;
  original: string;
  cambio: boolean;
  /** Texto de advertencia cuando el dato es sospechoso pero no se corrige
   *  solo (ej. un CUIT cuyo dígito verificador no cierra). */
  alerta?: string;
};

export type FilaLimpia = {
  /** Índice en la planilla original, para poder mostrar "fila 7". */
  indiceOriginal: number;
  celdas: Record<string, CeldaLimpia>;
  /** Índices originales de las filas que se fusionaron en ésta. */
  absorbio: number[];
};

export type Conteos = {
  telefonosNormalizados: number;
  duplicadosUnificados: number;
  /** Dígito verificador que no cierra: el número está mal cargado. */
  cuitInvalidos: number;
  /** Excel lo pasó a notación científica y se comió dígitos. Es otro
   *  problema y tiene otra solución, por eso se cuenta aparte. */
  cuitRotosPorExcel: number;
  filasSinTelefono: number;
  localidadesUnificadas: number;
  fechasNormalizadas: number;
  /** Espacios invisibles al final o dobles en el medio. Rompen los
   *  BUSCARV y los filtros, y nadie los ve nunca. Aplica a cualquier
   *  planilla, sea de gente o de cosas. */
  espaciosCorregidos: number;
  /** Filas enteras repetidas carácter por carácter. Es el duplicado que
   *  se puede detectar aunque la planilla no tenga ni nombre ni teléfono. */
  filasIdenticas: number;
  /** Sí/No escritos de varias formas ("SI", "x", "1", "verdadero"). */
  siNoUnificados: number;
};

export type Resultado = {
  filas: FilaLimpia[];
  conteos: Conteos;
};
