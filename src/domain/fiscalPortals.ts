import type { FiscalBoardSettings, FiscalPortalConfig } from './fiscalBoard';

/** Estados de Venezuela. Otros países usan solo portales propios (la empresa los agrega). */
export const VENEZUELA_STATES = [
  ['DC', 'Distrito Capital'], ['AM', 'Amazonas'], ['AN', 'Anzoátegui'], ['AP', 'Apure'], ['AR', 'Aragua'],
  ['BA', 'Barinas'], ['BO', 'Bolívar'], ['CA', 'Carabobo'], ['CO', 'Cojedes'], ['DA', 'Delta Amacuro'],
  ['FA', 'Falcón'], ['GU', 'Guárico'], ['LA', 'Lara'], ['ME', 'Mérida'], ['MI', 'Miranda'],
  ['MO', 'Monagas'], ['NE', 'Nueva Esparta'], ['PO', 'Portuguesa'], ['SU', 'Sucre'], ['TA', 'Táchira'],
  ['TR', 'Trujillo'], ['LG', 'La Guaira'], ['YA', 'Yaracuy'], ['ZU', 'Zulia'],
].map(([code, name]) => ({ code, name }));

export function stateName(stateCode: string): string {
  return VENEZUELA_STATES.find((state) => state.code === stateCode)?.name ?? '';
}

const portal = (value: Omit<FiscalPortalConfig, 'stateCodes' | 'needsReview'> & Partial<Pick<FiscalPortalConfig, 'stateCodes' | 'needsReview'>>): FiscalPortalConfig => ({
  stateCodes: [],
  needsReview: false,
  ...value,
});

/**
 * Portales nacionales: aplican a toda empresa venezolana. Los trámites listados son orientativos;
 * confirma siempre en el organismo cuáles aplican a tu caso.
 */
export const NATIONAL_PORTALS: FiscalPortalConfig[] = [
  portal({
    id: 'seniat', name: 'SENIAT en Línea (Tributos Nacionales)', area: 'Tributos nacionales', scope: 'Nacional',
    description: 'Portal nacional para declaración de IVA, ISLR, retenciones y actualización del RIF jurídico.',
    url: 'https://seniatenlinea.seniat.gob.ve/',
    procedures: ['Declaración de IVA quincenal / mensual', 'Declaración definitiva y estimada de ISLR', 'Retenciones de IVA y comprobante ARC'],
    instructions: ['Ten a mano el RIF vigente y la clave del contribuyente.', 'Declara y paga solo desde el portal oficial.', 'Guarda el comprobante de declaración y de pago en la carpeta.'],
  }),
  portal({
    id: 'ivss-tiuna', name: 'IVSS - Sistema de Gestión Tiuna', area: 'Laboral y parafiscal', scope: 'Nacional',
    description: 'Gestión y autoliquidación de empresas ante el Seguro Social: trabajadores y cotizaciones.',
    url: 'https://www.ivss.gov.ve/',
    procedures: ['Ingreso y egreso de trabajadores (formas 14-02 y 14-03)', 'Descarga de órdenes de pago mensuales', 'Consulta de solvencia patronal'],
    instructions: ['Entra por el sitio oficial del IVSS, pestaña "Empleadores", y selecciona Tiuna.', 'Si la empresa no está registrada, hazlo primero y conserva la constancia.'],
  }),
  portal({
    id: 'banavih-faov', name: 'BANAVIH - FAOV en Línea', area: 'Laboral y parafiscal', scope: 'Nacional',
    description: 'Fondo de Ahorro Obligatorio para la Vivienda: carga de nómina y planilla de pago mensual.',
    url: 'https://www.banavih.gob.ve/', needsReview: true,
    procedures: ['Carga mensual de nómina FAOV', 'Emisión de planilla de pago mensual', 'Descarga de certificado de solvencia FAOV'],
    instructions: ['Confirma el enlace de FAOV en línea antes de usarlo.', 'Paga con la planilla emitida por el portal y guarda el comprobante.'],
  }),
  portal({
    id: 'inces', name: 'INCES', area: 'Laboral y parafiscal', scope: 'Nacional',
    description: 'Instituto Nacional de Capacitación y Educación Socialista: aportes y solvencia.',
    url: 'https://www.inces.gob.ve/',
    procedures: ['Declaración y pago de aportes', 'Solvencia INCES'],
    instructions: ['Confirma en el organismo la periodicidad que aplica a tu empresa.'],
  }),
];

/** Portales sugeridos para un estado concreto. El enlace queda vacío hasta que la empresa lo configure. */
const STATE_PRESETS: Record<string, FiscalPortalConfig[]> = {
  BO: [
    portal({ id: 'bo-sigat-caroni', name: 'SIGAT Contribuyentes (Alcaldía de Caroní)', area: 'Municipal (SIGAT / Alcaldía)', scope: 'Municipal', stateCodes: ['BO'], needsReview: true,
      description: 'Sistema integrado de gestión y administración tributaria de la Alcaldía de Caroní.', url: '',
      procedures: ['Declaración mensual de ingresos brutos (patente)', 'Solicitud y renovación de licencia de actividades económicas', 'Emisión de solvencia municipal única'],
      instructions: ['Configura el enlace oficial de tu alcaldía.'] }),
    portal({ id: 'bo-bomberos-caroni', name: 'Bomberos Municipales Caroní', area: 'Bomberos y seguridad', scope: 'Municipal', stateCodes: ['BO'], needsReview: true,
      description: 'Solicitud de inspección ocular de seguridad industrial y prevención de incendios.', url: '',
      procedures: ['Inspección ocular para nuevos locales', 'Renovación anual del certificado de bomberos', 'Inspección de sistemas de detección de humo y extintores'],
      instructions: ['Configura el enlace oficial del cuerpo de bomberos de tu municipio.'] }),
  ],
  CA: [
    portal({ id: 'ca-alcaldia-naguanagua', name: 'Alcaldía de Naguanagua (referencia municipal)', area: 'Municipal (SIGAT / Alcaldía)', scope: 'Municipal', stateCodes: ['CA'], needsReview: true,
      description: 'Portal tributario municipal para patentes, solvencias comerciales y tasas.', url: '',
      procedures: ['Licencia de actividades económicas', 'Solvencia de inmuebles urbanos y propaganda', 'Liquidación de impuestos municipales'],
      instructions: ['Configura el enlace oficial de tu alcaldía.'] }),
  ],
};

/** Para estados sin sugerencias: espacios vacíos con las tres gestiones locales más comunes. */
function genericLocalPortals(stateCode: string): FiscalPortalConfig[] {
  const name = stateName(stateCode);
  const suffix = name ? ` (${name})` : '';
  const base = { scope: 'Municipal' as const, stateCodes: stateCode ? [stateCode] : [], needsReview: true, url: '', instructions: ['Configura el enlace oficial de tu municipio.'] };
  return [
    portal({ ...base, id: `local-alcaldia${stateCode ? `-${stateCode}` : ''}`, name: `Alcaldía - tributos municipales${suffix}`, area: 'Municipal (SIGAT / Alcaldía)', description: 'Patente, licencia de actividades económicas y solvencia municipal.', procedures: ['Declaración de ingresos brutos', 'Licencia de actividades económicas', 'Solvencia municipal'] }),
    portal({ ...base, id: `local-bomberos${stateCode ? `-${stateCode}` : ''}`, name: `Bomberos municipales${suffix}`, area: 'Bomberos y seguridad', description: 'Inspección y certificado de bomberos del local.', procedures: ['Inspección ocular', 'Renovación del certificado de bomberos'] }),
    portal({ ...base, id: `local-sanidad${stateCode ? `-${stateCode}` : ''}`, name: `Salud ambiental y sanidad${suffix}`, area: 'Sanidad y manipulación de alimentos', description: 'Permisos sanitarios y certificados de manipulación de alimentos.', procedures: ['Permiso sanitario del local', 'Certificado de manipulación de alimentos'] }),
  ];
}

/** Portales que se muestran: nacionales + los del estado elegido + los propios, sin los que la empresa ocultó. */
export function portalsForSettings(settings: Pick<FiscalBoardSettings, 'countryCode' | 'stateCode' | 'hiddenPortalIds' | 'customPortals'>): FiscalPortalConfig[] {
  const isVenezuela = !settings.countryCode || settings.countryCode.toUpperCase() === 'VE';
  const stateCode = settings.stateCode;
  const national = isVenezuela ? NATIONAL_PORTALS : [];
  const local = isVenezuela && stateCode ? (STATE_PRESETS[stateCode] ?? genericLocalPortals(stateCode)) : [];
  const hidden = new Set(settings.hiddenPortalIds);
  return [...national, ...local, ...settings.customPortals.map((item) => ({ ...item, custom: true }))].filter((item) => !hidden.has(item.id));
}

export const isSafePortalUrl = (value: string): boolean => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

export function defaultFiscalSettings(countryCode = 'VE'): FiscalBoardSettings {
  return { countryCode, stateCode: '', notificationsEnabled: true, remindDaysBefore: [7, 3, 1], hiddenPortalIds: [], customPortals: [] };
}
