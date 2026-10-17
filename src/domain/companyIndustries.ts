export const COMPANY_INDUSTRIES = {
  food_manufacturing: {
    label: 'Fabricación de alimentos y bebidas',
    description: 'Producción, lotes, inventario y venta al detal o mayor',
    activityLabel: 'Productos y alimentos',
    productLabel: 'Producto',
    variantLabel: 'Presentación',
    unitLabel: 'unidades',
    posDescription: 'Consulta presentaciones, revisa existencias y factura ventas al detal y mayor.',
    initialCategories: ['Materia prima', 'Insumos y cultivos', 'Productos en proceso', 'Productos terminados', 'Empaques'],
  },
  manufacturing: {
    label: 'Fábrica y manufactura',
    description: 'Fabricación, materias primas e inventario de productos',
    activityLabel: 'Productos fabricados',
    productLabel: 'Producto',
    variantLabel: 'Presentación',
    unitLabel: 'unidades',
    posDescription: 'Busca productos fabricados, revisa existencias y registra ventas.',
    initialCategories: ['Materia prima', 'Insumos de producción', 'Productos en proceso', 'Productos terminados', 'Empaques'],
  },
  footwear: {
    label: 'Calzado y moda',
    description: 'Modelos, tallas, inventario y venta de calzado y accesorios',
    activityLabel: 'Calzado y artículos de moda',
    productLabel: 'Modelo',
    variantLabel: 'Talla',
    unitLabel: 'pares',
    posDescription: 'Selecciona el modelo de calzado, ajusta tallas, aplica descuentos y factura en multimoneda.',
    initialCategories: ['Calzado', 'Ropa', 'Gorras', 'Medias', 'Accesorios', 'Otros'],
  },
  commerce: {
    label: 'Comercio al detal y mayor',
    description: 'Compra, distribución, inventario y venta de mercancía',
    activityLabel: 'Mercancía',
    productLabel: 'Artículo',
    variantLabel: 'Variante',
    unitLabel: 'unidades',
    posDescription: 'Busca artículos por nombre, marca, código o variante y factura en multimoneda.',
    initialCategories: ['Mercancía', 'Materia prima', 'Productos en proceso', 'Productos terminados'],
  },
  services: {
    label: 'Servicios profesionales y técnicos',
    description: 'Servicios, clientes, gastos y administración del negocio',
    activityLabel: 'Servicios',
    productLabel: 'Servicio',
    variantLabel: 'Modalidad',
    unitLabel: 'servicios',
    posDescription: 'Consulta servicios, registra ventas y administra cobros y gastos.',
    initialCategories: ['Servicios profesionales', 'Servicios técnicos', 'Planes y paquetes', 'Insumos de servicio'],
  },
  health: {
    label: 'Salud y bienestar',
    description: 'Atención, servicios, suministros e inventario de salud',
    activityLabel: 'Productos y servicios de salud',
    productLabel: 'Producto o servicio',
    variantLabel: 'Presentación',
    unitLabel: 'unidades',
    posDescription: 'Consulta productos y servicios, revisa existencias y registra ventas.',
    initialCategories: ['Medicamentos', 'Insumos médicos', 'Servicios de salud', 'Equipos y suministros'],
  },
  legal: {
    label: 'Servicios jurídicos',
    description: 'Servicios legales, gastos, clientes y gestión administrativa',
    activityLabel: 'Servicios jurídicos',
    productLabel: 'Servicio',
    variantLabel: 'Modalidad',
    unitLabel: 'servicios',
    posDescription: 'Gestiona servicios jurídicos, cobros, gastos y administración.',
    initialCategories: ['Consultoría legal', 'Representación', 'Trámites y documentos', 'Gastos reembolsables'],
  },
  accounting: {
    label: 'Contabilidad y asesoría fiscal',
    description: 'Servicios contables, clientes, obligaciones y administración',
    activityLabel: 'Servicios contables',
    productLabel: 'Servicio',
    variantLabel: 'Modalidad',
    unitLabel: 'servicios',
    posDescription: 'Gestiona servicios contables, cobros, gastos y administración.',
    initialCategories: ['Servicios contables', 'Asesoría fiscal', 'Nómina y gestión', 'Trámites'],
  },
  education: {
    label: 'Educación y capacitación',
    description: 'Cursos, matrículas, materiales y administración',
    activityLabel: 'Cursos y servicios educativos',
    productLabel: 'Curso o artículo',
    variantLabel: 'Modalidad',
    unitLabel: 'unidades',
    posDescription: 'Consulta cursos y artículos, registra cobros y administra gastos.',
    initialCategories: ['Cursos', 'Talleres', 'Material educativo', 'Matrículas y servicios'],
  },
  hospitality: {
    label: 'Restaurantes y hospedaje',
    description: 'Alimentos, bebidas, suministros, ventas y gastos',
    activityLabel: 'Productos y servicios',
    productLabel: 'Producto o servicio',
    variantLabel: 'Presentación',
    unitLabel: 'unidades',
    posDescription: 'Consulta productos y servicios, registra ventas y controla existencias.',
    initialCategories: ['Alimentos', 'Bebidas', 'Insumos', 'Servicios'],
  },
  construction: {
    label: 'Construcción e ingeniería',
    description: 'Materiales, servicios, proyectos y administración',
    activityLabel: 'Materiales y servicios',
    productLabel: 'Material o servicio',
    variantLabel: 'Presentación',
    unitLabel: 'unidades',
    posDescription: 'Consulta materiales y servicios, administra ventas, compras y gastos.',
    initialCategories: ['Materiales de construcción', 'Herramientas', 'Servicios de obra', 'Equipos'],
  },
  agriculture: {
    label: 'Agricultura y producción agropecuaria',
    description: 'Producción, insumos, cosechas e inventario',
    activityLabel: 'Productos agropecuarios',
    productLabel: 'Producto',
    variantLabel: 'Presentación',
    unitLabel: 'unidades',
    posDescription: 'Consulta productos e insumos, revisa existencias y registra ventas.',
    initialCategories: ['Insumos agrícolas', 'Producción en proceso', 'Cosecha y productos', 'Herramientas y equipos'],
  },
  other: {
    label: 'Otra actividad empresarial',
    description: 'Perfil general configurable para cualquier empresa',
    activityLabel: 'Productos y servicios',
    productLabel: 'Producto o servicio',
    variantLabel: 'Variante',
    unitLabel: 'unidades',
    posDescription: 'Busca productos y servicios, revisa existencias y factura en multimoneda.',
    initialCategories: ['Mercancía', 'Materia prima', 'Productos en proceso', 'Productos terminados'],
  },
} as const;

export type IndustryTemplate = keyof typeof COMPANY_INDUSTRIES;

/** Flujos y registros que orientan la configuración operativa de cada rama. */
export const INDUSTRY_WORKFLOWS: Record<IndustryTemplate, { flow: string[]; records: string[] }> = {
  food_manufacturing: { flow: ['Registrar materia prima y lote', 'Controlar producción y vencimiento', 'Trasladar producto terminado a inventario', 'Vender por presentación y lote'], records: ['Lotes', 'Fechas de vencimiento', 'Rendimiento de producción', 'Costo por lote'] },
  manufacturing: { flow: ['Definir materiales y costo estándar', 'Registrar orden y consumo de insumos', 'Controlar producto en proceso', 'Recibir producto terminado y despachar'], records: ['Órdenes de producción', 'Consumo de materiales', 'Merma', 'Costo de fabricación'] },
  footwear: { flow: ['Crear modelos y variantes por talla/color', 'Recibir pares por variante', 'Controlar existencias y apartados', 'Vender y ajustar stock por talla'], records: ['Modelo', 'Talla y color', 'Pares disponibles', 'Apartados'] },
  commerce: { flow: ['Registrar proveedores y compras', 'Recibir y categorizar mercancía', 'Actualizar costos y precios', 'Vender y reponer por stock mínimo'], records: ['SKU', 'Proveedor', 'Costo de compra', 'Existencia y reposición'] },
  services: { flow: ['Crear servicios y tarifas', 'Registrar cliente y orden de servicio', 'Controlar avance y gastos asociados', 'Facturar y cobrar el servicio'], records: ['Cliente', 'Servicio contratado', 'Estado de ejecución', 'Horas y gastos'] },
  health: { flow: ['Registrar suministros y servicios', 'Controlar lotes y vencimientos', 'Vincular consumos a la atención', 'Facturar y revisar cobros'], records: ['Lote y vencimiento', 'Insumos utilizados', 'Servicio prestado', 'Cobro'] },
  legal: { flow: ['Abrir expediente por cliente', 'Registrar actuaciones y fechas clave', 'Controlar honorarios y gastos reembolsables', 'Facturar y cerrar expediente'], records: ['Expediente', 'Cliente', 'Actuación y plazo', 'Honorarios y gastos'] },
  accounting: { flow: ['Dar de alta clientes y obligaciones', 'Registrar documentos y movimientos', 'Preparar conciliación y asientos', 'Revisar vencimientos y entregar reportes'], records: ['Cliente', 'Período contable', 'Documentos soporte', 'Obligaciones y entregables'] },
  education: { flow: ['Crear cursos y períodos', 'Registrar alumnos e inscripciones', 'Controlar asistencia y materiales', 'Facturar matrículas y cuotas'], records: ['Curso', 'Alumno', 'Período', 'Matrícula y pagos'] },
  hospitality: { flow: ['Configurar menú, habitaciones o servicios', 'Registrar compras y consumos', 'Procesar ventas por turno', 'Cerrar caja y revisar costos'], records: ['Producto o servicio', 'Turno', 'Consumo', 'Ventas y costos'] },
  construction: { flow: ['Crear obra y presupuesto', 'Asignar materiales, equipos y personal', 'Registrar avances y gastos por obra', 'Certificar hitos y facturar'], records: ['Proyecto/obra', 'Presupuesto', 'Avance', 'Materiales y costos'] },
  agriculture: { flow: ['Registrar parcela, rubro y ciclo', 'Planificar insumos y labores', 'Controlar producción y cosecha', 'Clasificar y vender cosecha'], records: ['Parcela', 'Ciclo agrícola', 'Labores e insumos', 'Cosecha y rendimiento'] },
  other: { flow: ['Configurar productos y servicios', 'Registrar compras y gastos', 'Vender y cobrar', 'Revisar inventario y reportes'], records: ['Productos y servicios', 'Compras', 'Ventas', 'Gastos'] },
};

export function isIndustryTemplate(value: unknown): value is IndustryTemplate {
  return typeof value === 'string' && Object.hasOwn(COMPANY_INDUSTRIES, value);
}

export function inferIndustryTemplate(activity: string): IndustryTemplate {
  const value = activity.toLocaleLowerCase();
  if (/yogur|yogurt|l[aá]cte|alimento|bebida|f[aá]brica de alimento|elaboraci[oó]n de alimento|panader[ií]|pasteler[ií]/.test(value)) return 'food_manufacturing';
  if (/f[aá]brica|manufactur|fabricaci[oó]n|producci[oó]n industrial/.test(value)) return 'manufacturing';
  if (/calzado|zapater[ií]a|zapato/.test(value)) return 'footwear';
  if (/salud|cl[ií]nic|m[eé]dic|odont|farmac/.test(value)) return 'health';
  if (/abog|jur[ií]dic|legal|derecho/.test(value)) return 'legal';
  if (/contab|tribut|impuesto|fiscal/.test(value)) return 'accounting';
  if (/educaci[oó]n|escuela|colegio|capacitaci[oó]n|curso/.test(value)) return 'education';
  if (/restaurant|restaurante|hotel|hospedaje|caf[eé]|comida/.test(value)) return 'hospitality';
  if (/construcci[oó]n|ingenier[ií]a|obra civil/.test(value)) return 'construction';
  if (/agric|ganader|cultivo|agropecu/.test(value)) return 'agriculture';
  if (/servicio|consultor|t[eé]cnic/.test(value)) return 'services';
  if (/venta|comerc|tienda|art[ií]culo|calzado|mercanc|distribu/.test(value)) return 'commerce';
  return 'other';
}

export function resolveIndustryTemplate(value: unknown, activity = ''): IndustryTemplate {
  if (value === 'commerce' && /calzado|zapater[ií]a|zapato/i.test(activity)) return 'footwear';
  return isIndustryTemplate(value) ? value : inferIndustryTemplate(activity);
}

export function normalizeIndustryTemplate(value: unknown, activity = ''): IndustryTemplate {
  if (value === undefined || value === null || value === '') return inferIndustryTemplate(activity);
  if (isIndustryTemplate(value)) return value;
  throw new Error('Selecciona un perfil empresarial válido.');
}

export const ALL_INDUSTRY_CATEGORIES = [...new Set(
  Object.values(COMPANY_INDUSTRIES).flatMap((industry) => industry.initialCategories),
)];
