/**
 * Informe fiscal de inspección: los 114 puntos que revisa un fiscal, más las observaciones finales.
 * La plantilla es la base común; cada empresa marca su estado, escribe sus notas, vincula sus
 * documentos, oculta lo que no le corresponde y agrega puntos propios.
 */
import type { FiscalInspectionEntry, FiscalInspectionState, InspectionStatus } from './fiscalBoard';

export const INSPECTION_STATUSES = ['Cumple', 'No cumple', 'No aplica'] as const satisfies readonly InspectionStatus[];

/** [número, título, sección, pista de qué dato escribir]. */
export const INSPECTION_TEMPLATE: ReadonlyArray<readonly [number, string, string, string]> = [
  [1, 'Razón Social', 'Datos del contribuyente', ''],
  [2, 'Registro de Información Fiscal', 'Datos del contribuyente', ''],
  [3, 'Tipo de Contribuyente', 'Datos del contribuyente', ''],
  [4, 'Domicilio Fiscal', 'Datos del contribuyente', ''],
  [5, 'Dirección del Correo Electrónico', 'Datos del contribuyente', ''],
  [6, 'Teléfono Residencial', 'Datos del contribuyente', ''],
  [7, 'Teléfono Celular', 'Datos del contribuyente', ''],
  [8, 'Registro de Comercio', 'Registro mercantil y sociedad', ''],
  [9, 'Publicación Mercantil', 'Registro mercantil y sociedad', ''],
  [10, 'Accionistas', 'Registro mercantil y sociedad', ''],
  [11, 'Administradores', 'Registro mercantil y sociedad', ''],
  [12, 'Objeto Registrado', 'Registro mercantil y sociedad', ''],
  [13, 'Principal Actividad Declarada al SENIAT', 'Registro mercantil y sociedad', ''],
  [14, 'Rubros Alcaldía', 'Registro mercantil y sociedad', ''],
  [15, 'Duración de la Sociedad', 'Registro mercantil y sociedad', ''],
  [16, 'Capital', 'Registro mercantil y sociedad', ''],
  [17, 'Reserva', 'Registro mercantil y sociedad', ''],
  [18, 'Registro Único de Contribuyentes', 'Registros y licencias', ''],
  [19, 'Licencia de Actividades Económicas', 'Registros y licencias', ''],
  [20, 'Autorización para Farmacias, Expendio de Bebidas Alcohólicas, Minería, Otros', 'Registros y licencias', ''],
  [21, 'Organigrama', 'Organización e identidad', ''],
  [22, 'Filosofía', 'Organización e identidad', ''],
  [23, 'Firma, sello y marca', 'Organización e identidad', ''],
  [24, 'Estados Financieros Registrados', 'Contabilidad y facturación', ''],
  [25, 'Libros Contables (Diario, Mayor e Inventario)', 'Contabilidad y facturación', ''],
  [26, 'Libro de Compras', 'Contabilidad y facturación', ''],
  [27, 'Libro de Ventas', 'Contabilidad y facturación', ''],
  [28, 'Facturación', 'Contabilidad y facturación', ''],
  [29, 'Notas de Débito', 'Contabilidad y facturación', ''],
  [30, 'Notas de Crédito', 'Contabilidad y facturación', ''],
  [31, 'Máquina Fiscal', 'Contabilidad y facturación', ''],
  [32, 'Contrato del Punto de Venta', 'Contabilidad y facturación', ''],
  [33, 'Declaraciones ISLR', 'Declaraciones y retenciones', ''],
  [34, 'Declaraciones IVA', 'Declaraciones y retenciones', ''],
  [35, 'Declaraciones Ingresos Brutos', 'Declaraciones y retenciones', ''],
  [36, 'Retenciones Municipales', 'Declaraciones y retenciones', ''],
  [37, 'Solvencia Inmobiliaria', 'Inmueble del local', ''],
  [38, 'Registro Inmobiliario', 'Inmueble del local', ''],
  [39, 'Contrato de Arrendamiento', 'Inmueble del local', ''],
  [40, 'Ficha Catastral', 'Inmueble del local', ''],
  [41, 'Área Inmobiliaria', 'Inmueble del local', ''],
  [42, 'Conformidad de Uso', 'Inmueble del local', ''],
  [43, 'Conformidad de Bomberos', 'Bomberos y seguridad', ''],
  [44, 'Contrato de Servicios de Extintores', 'Bomberos y seguridad', ''],
  [45, 'Contrato de Sistema de Detección de Incendio y Alarma', 'Bomberos y seguridad', ''],
  [46, 'Permiso Sanitario', 'Sanidad y servicios básicos', ''],
  [47, 'Aseo Urbano', 'Sanidad y servicios básicos', ''],
  [48, 'Agua', 'Sanidad y servicios básicos', ''],
  [49, 'Electricidad', 'Sanidad y servicios básicos', ''],
  [50, 'Gas', 'Sanidad y servicios básicos', ''],
  [51, 'Publicidad', 'Publicidad y vehículos', ''],
  [52, 'Vehículos', 'Publicidad y vehículos', ''],
  [53, 'Certificados Médicos', 'Certificados y cursos', ''],
  [54, 'Cursos de Manipulación de Desechos', 'Certificados y cursos', ''],
  [55, 'Cursos de Manipulación de Alimentos', 'Certificados y cursos', ''],
  [56, 'NIL - MinTrabajo', 'Laboral y parafiscal', ''],
  [57, 'Horario de Establecimiento', 'Laboral y parafiscal', ''],
  [58, 'Seguro Social', 'Laboral y parafiscal', ''],
  [59, 'Banavih', 'Laboral y parafiscal', ''],
  [60, 'INCES', 'Laboral y parafiscal', ''],
  [61, 'RUPDAE', 'Otros registros', 'Número y fecha'],
  [62, 'INPSASEL', 'Otros registros', 'Número y fecha'],
  [63, 'SUNAGRO / SADA', 'Otros registros', 'Número y fecha'],
  [64, 'SEMCAMER', 'Otros registros', 'Número y fecha'],
  [65, 'Registro Nacional de Contratista', 'Otros registros', 'Número y fecha'],
  [66, 'Procedimientos Tributarios', 'Otros registros', 'Número y fecha'],
  [67, 'Libro de Accionistas', 'Libros societarios', 'Fecha'],
  [68, 'Libro de Administradores', 'Libros societarios', 'Fecha'],
  [69, 'Libro de Actas de Asambleas', 'Libros societarios', 'Fecha'],
  [70, 'Recursos Humanos', 'Recursos humanos', 'Fecha'],
  [71, 'Trabajadores', 'Recursos humanos', 'Fecha'],
  [72, 'Nómina', 'Recursos humanos', 'Nombres, apellido, cédula y cargo'],
  [73, 'Procedimientos Laborales', 'Recursos humanos', 'Número'],
  [74, 'Redes Sociales', 'Otros', 'Enlaces'],
  [75, 'Libro de Entrada y Salida de Mercancía', 'Otros', 'Fecha'],
  [76, 'Forma 5 Enteramiento del Débito Bancario', 'Formas del SENIAT', 'Forma'],
  [77, 'Forma 6 Declaración del Débito Bancario', 'Formas del SENIAT', 'Forma'],
  [78, 'Forma 9 Liquidación de Impuestos', 'Formas del SENIAT', 'Forma'],
  [79, 'Forma 10 Impuesto a los Grandes Patrimonios', 'Formas del SENIAT', 'Forma'],
  [80, 'Forma 11 Retenciones de ISLR Personas Naturales Residentes', 'Formas del SENIAT', 'Forma'],
  [81, 'Forma 12 Retenciones de ISLR Personas Naturales no Residentes', 'Formas del SENIAT', 'Forma'],
  [82, 'Forma 13 Retenciones de ISLR Personas Jurídicas Domiciliadas', 'Formas del SENIAT', 'Forma'],
  [83, 'Forma 14 Retenciones de ISLR Personas Jurídicas no Domiciliadas', 'Formas del SENIAT', 'Forma'],
  [84, 'Forma 15 Registro de Información Fiscal', 'Formas del SENIAT', 'Forma'],
  [85, 'Forma 16 Timbres Fiscales Nacionales', 'Formas del SENIAT', 'Forma'],
  [86, 'Forma 19 Ley de Protección a las Pensiones', 'Formas del SENIAT', 'Forma'],
  [87, 'Forma 21 Impuesto a las Grandes Transacciones Financieras', 'Formas del SENIAT', 'Forma'],
  [88, 'Forma 22 Bingos y Casinos', 'Formas del SENIAT', 'Forma'],
  [89, 'Forma 23 Registro, Declaración y Pago de Activos Reevaluados', 'Formas del SENIAT', 'Forma'],
  [90, 'Forma 24 Inversiones en Jurisdicción de Baja Imposición Fiscal', 'Formas del SENIAT', 'Forma'],
  [91, 'Forma 25 Declaración y Pago de ISLR Personas Naturales', 'Formas del SENIAT', 'Forma'],
  [92, 'Forma 26 Declaración y Pago de ISLR Personas Jurídicas', 'Formas del SENIAT', 'Forma'],
  [93, 'Forma 28 Declaración Estimada de ISLR Personas Jurídicas', 'Formas del SENIAT', 'Forma'],
  [94, 'Forma 29 Declaración ISLR Personas Naturales Residentes o no', 'Formas del SENIAT', 'Forma'],
  [95, 'Forma 30 Declaración de Contribuyente Especial', 'Formas del SENIAT', 'Forma'],
  [96, 'Forma 31 Activos Empresariales', 'Formas del SENIAT', 'Forma'],
  [97, 'Forma 32 Declaración y Pago de Sucesiones', 'Formas del SENIAT', 'Forma'],
  [98, 'Forma 33 Impuesto por Enajenación de Inmuebles', 'Formas del SENIAT', 'Forma'],
  [99, 'Forma 35 Retención de IVA a Proveedores', 'Formas del SENIAT', 'Forma'],
  [100, 'Forma 44 Anticipos ISLR', 'Formas del SENIAT', 'Forma'],
  [101, 'Forma 50 Licores', 'Formas del SENIAT', 'Forma'],
  [102, 'Forma 57 Anticipos de IVA Persona Jurídica', 'Formas del SENIAT', 'Forma'],
  [103, 'Forma 60 Cigarrillos', 'Formas del SENIAT', 'Forma'],
  [104, 'Forma 62 IVA por Cuenta de Terceros', 'Formas del SENIAT', 'Forma'],
  [105, 'Forma 70 Fósforos', 'Formas del SENIAT', 'Forma'],
  [106, 'Forma 74 Declaración y Pagos de Retenciones de Bienes, Servicios y Sueldos', 'Formas del SENIAT', 'Forma'],
  [107, 'Forma 80 Tributos Aduaneros e IVA por Autoliquidación', 'Formas del SENIAT', 'Forma'],
  [108, 'Forma 81 Tributos Aduaneros e IVA (para uso de la Administración Aduanera)', 'Formas del SENIAT', 'Forma'],
  [109, 'Forma 84 Pago del 50% de la Tasa por Determinación del Régimen Aduanero', 'Formas del SENIAT', 'Forma'],
  [110, 'Forma 85 DUA Declaración Única de Aduanas - Formulario Principal', 'Formas del SENIAT', 'Forma'],
  [111, 'Forma 86 Determinación y Pago de Tributos Aduaneros e IVA', 'Formas del SENIAT', 'Forma'],
  [112, 'Forma 87 Declaración Andina del Valor', 'Formas del SENIAT', 'Forma'],
  [113, 'Fonacit', 'Fonacit y SSL', ''],
  [114, 'Inspección SSL', 'Fonacit y SSL', ''],
];

export interface InspectionItem {
  id: string;
  number: number;
  title: string;
  section: string;
  valueHint: string;
  custom: boolean;
  value: string;
  notes: string;
  status: InspectionStatus | '';
  documentIds: string[];
  hidden: boolean;
}

export const templateItemId = (number: number) => `i${String(number).padStart(3, '0')}`;

const emptyEntry: FiscalInspectionEntry = { value: '', notes: '', status: '', documentIds: [], hidden: false };

/** Une la plantilla y los puntos propios con lo que la empresa ya guardó. */
export function buildInspectionItems(state?: FiscalInspectionState): InspectionItem[] {
  const entries = state?.entries ?? {};
  const base = INSPECTION_TEMPLATE.map(([number, title, section, valueHint]) => ({ id: templateItemId(number), number, title, section, valueHint, custom: false }));
  const custom = (state?.customItems ?? []).map((item, index) => ({ id: item.id, number: INSPECTION_TEMPLATE.length + index + 1, title: item.title, section: item.section || 'Puntos propios', valueHint: '', custom: true }));
  return [...base, ...custom].map((item) => ({ ...item, ...emptyEntry, ...(entries[item.id] ?? {}), documentIds: [...(entries[item.id]?.documentIds ?? [])] }));
}

export interface InspectionSummary {
  total: number;
  cumple: number;
  noCumple: number;
  noAplica: number;
  sinRevisar: number;
  /** Porcentaje de cumplimiento sobre los puntos que aplican (sin contar "No aplica" ni los ocultos). */
  compliancePct: number;
}

export function summarizeInspection(items: InspectionItem[]): InspectionSummary {
  const visible = items.filter((item) => !item.hidden);
  const count = (status: InspectionStatus | '') => visible.filter((item) => item.status === status).length;
  const cumple = count('Cumple');
  const noCumple = count('No cumple');
  const noAplica = count('No aplica');
  const applicable = visible.length - noAplica;
  return {
    total: visible.length, cumple, noCumple, noAplica, sinRevisar: count(''),
    compliancePct: applicable > 0 ? Math.round((cumple / applicable) * 100) : 0,
  };
}

/** Guarda solo lo que la empresa cambió: lo que sigue igual que la plantilla no ocupa espacio. */
export function compactEntries(items: InspectionItem[]): Record<string, FiscalInspectionEntry> {
  const entries: Record<string, FiscalInspectionEntry> = {};
  for (const item of items) {
    const entry = { value: item.value.trim(), notes: item.notes.trim(), status: item.status, documentIds: item.documentIds, hidden: item.hidden };
    if (entry.value || entry.notes || entry.status || entry.documentIds.length || entry.hidden) entries[item.id] = entry;
  }
  return entries;
}
