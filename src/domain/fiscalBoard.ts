export type FiscalRequirementStatus = 'Pendiente' | 'Cumplido' | 'No aplica';

/** Áreas en las que se organiza la carpeta fiscal. */
export const FISCAL_AREAS = [
  'Tributos nacionales',
  'Municipal (SIGAT / Alcaldía)',
  'Bomberos y seguridad',
  'Laboral y parafiscal',
  'Legal y mercantil',
  'Sanidad y manipulación de alimentos',
] as const;
export type FiscalArea = typeof FISCAL_AREAS[number];

/** Estados de un documento: vigente, por vencer, vencido y en trámite (más el estado inicial de revisión). */
export const FISCAL_DOCUMENT_STATUSES = ['Vigente', 'Por vencer', 'Vencido', 'En trámite', 'Pendiente de revisión'] as const;
export type FiscalDocumentStatus = typeof FISCAL_DOCUMENT_STATUSES[number];

export const FISCAL_RECURRENCES = ['none', 'monthly', 'quarterly', 'yearly'] as const;
export type FiscalRecurrence = typeof FISCAL_RECURRENCES[number];

/** Obligación o fecha que la empresa agrega al calendario fiscal. */
export interface FiscalCalendarEvent {
  id: string;
  title: string;
  area: FiscalArea | '';
  dueDate: string; // YYYY-MM-DD
  recurrence: FiscalRecurrence;
  /** Días antes del vencimiento en que se avisa. Vacío = usa los de la configuración. */
  remindDaysBefore: number[];
  notes: string;
  done: boolean;
}

export interface FiscalPortalConfig {
  id: string;
  name: string;
  description: string;
  area: FiscalArea;
  scope: 'Nacional' | 'Estadal' | 'Municipal';
  url: string;
  procedures: string[];
  instructions: string[];
  /** Códigos de estado donde aplica; vacío = todos. */
  stateCodes: string[];
  /** El enlace no está confirmado: la empresa debe verificarlo antes de usarlo. */
  needsReview: boolean;
  custom?: boolean;
}

export type InspectionStatus = 'Cumple' | 'No cumple' | 'No aplica';
export interface FiscalInspectionEntry {
  value: string;
  notes: string;
  status: InspectionStatus | '';
  documentIds: string[];
  hidden: boolean;
}
export interface FiscalInspectionState {
  entries: Record<string, FiscalInspectionEntry>;
  customItems: Array<{ id: string; title: string; section: string }>;
  observations: string;
}

export interface FiscalBoardSettings {
  countryCode: string;
  stateCode: string;
  notificationsEnabled: boolean;
  remindDaysBefore: number[];
  hiddenPortalIds: string[];
  customPortals: FiscalPortalConfig[];
}

export interface FiscalRequirement {
  id: string;
  area?: FiscalArea;
  title: string;
  description: string;
  frequency: string;
  sourceLabel: string;
  sourceUrl: string;
  status: FiscalRequirementStatus;
  responsible: string;
  dueDate: string;
  notes: string;
  evidenceDocumentId: string;
}

export interface FiscalBoardDocument {
  id: string;
  title: string;
  category: string;
  issuer: string;
  expiresAt: string;
  status: FiscalDocumentStatus;
  area?: FiscalArea | '';
  fileName?: string;
  fileData?: string;
  published: boolean;
}

export interface FiscalBoardState {
  documents: FiscalBoardDocument[];
  requirements: FiscalRequirement[];
  calendar?: FiscalCalendarEvent[];
  settings?: FiscalBoardSettings;
  inspection?: FiscalInspectionState;
  auditEvents?: Array<{
    id: string;
    actorUid: string;
    action: string;
    createdAt: string;
    summary: string;
  }>;
  publicTokenHash?: string;
  updatedAt?: string;
}

const TAX_CODE_SOURCE = 'Código Orgánico Tributario, G.O. 6,507 Extraordinario, art. 155';
const TAX_CODE_URL = 'https://historico.tsj.gob.ve/gaceta/febrero/29022020/29022020-6507.pdf';

export const NATIONAL_FISCAL_REQUIREMENTS: FiscalRequirement[] = [
  {
    id: 'cot-155-1-libros-registros',
    title: 'Libros y registros fiscales',
    description: 'Conservar en el domicilio tributario o establecimiento los libros y registros especiales relacionados con la actividad y tenerlos disponibles para la Administración Tributaria cuando los solicite. Este deber de conservación y presentación no establece por sí mismo una obligación de exhibición en una cartelera pública.',
    frequency: 'Conservación permanente; presentar ante requerimiento legal',
    sourceLabel: `${TAX_CODE_SOURCE}, numeral 1`,
    sourceUrl: TAX_CODE_URL,
    status: 'Pendiente',
    responsible: '',
    dueDate: '',
    notes: '',
    evidenceDocumentId: '',
  },
  {
    id: 'cot-155-6-declaraciones-soportes-origen',
    title: 'Declaraciones, soportes y origen de mercancías',
    description: 'Tener disponibles las declaraciones, informes, documentos y comprobantes relativos a hechos imponibles y el origen de las mercancías cuando sean requeridos durante una fiscalización autorizada. No es un mandato general de publicación en una cartelera pública.',
    frequency: 'Conservar según corresponda; presentar ante requerimiento legal',
    sourceLabel: `${TAX_CODE_SOURCE}, numeral 6`,
    sourceUrl: TAX_CODE_URL,
    status: 'Pendiente',
    responsible: '',
    dueDate: '',
    notes: '',
    evidenceDocumentId: '',
  },
  {
    id: 'cot-155-2-registros-tributarios',
    title: 'Inscripción en los registros tributarios aplicables',
    description: 'Verificar que el contribuyente esté inscrito en los registros pertinentes. La obligación de inscripción no acredita, por sí sola, que la constancia deba publicarse en una cartelera.',
    frequency: 'Según la obligación de inscripción y sus actualizaciones',
    sourceLabel: `${TAX_CODE_SOURCE}, numeral 2`,
    sourceUrl: TAX_CODE_URL,
    status: 'Pendiente',
    responsible: '',
    dueDate: '',
    notes: '',
    evidenceDocumentId: '',
  },
];
