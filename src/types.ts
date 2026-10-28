export type ShoeType =
  | 'Botines Fútbol Campo'
  | 'Fútbol Campo'
  | 'Micro Tacos'
  | 'Futsala'
  | 'Running'
  | 'Béisbol'
  | 'Béisbol Gancho'
  | 'Deportivo'
  | 'Casual'
  | 'Botas'
  | 'Tacones'
  | 'Sandalias'
  | 'Mocasines'
  | 'Infantil'
  | 'Sala'
  | 'Tacos'
  | 'Beisbol'
  | 'Runing'
  | 'Microtacos'
  | 'Gorras'
  | 'Medias'
  | 'Accesorios'
  | 'Ropa'
  | 'Otros'
  | string;

export type ProductCategory =
  | 'Calzado'
  | 'Gorras'
  | 'Medias'
  | 'Accesorios'
  | 'Ropa'
  | 'Otros';

export const INVENTORY_CLASSIFICATIONS = [
  'Mercancía',
  'Materia prima',
  'Productos en proceso',
  'Productos terminados',
] as const;

export type InventoryClassification = (typeof INVENTORY_CLASSIFICATIONS)[number];

export type Currency = 'USD' | 'Bs';

export type UserRole = 'admin' | 'cajera';

export interface ShoeProduct {
  id: string;
  nombre: string;
  sku: string;
  categoria: string;
  clasificacion_inventario?: InventoryClassification;
  marca: string;
  tipo: ShoeType;
  talla: string; // ej: "36", "37", "38", "39", "40", "41", "42", "43", "44"
  color: string;
  moneda: Currency;
  precio: number;      // Precio de venta en USD
  costo: number;       // Costo de compra en USD
  stock: number;       // Cantidad física actual
  stock_minimo: number;// Umbral de alerta para reposición
  activo: boolean;
  imagen?: string;
  descripcion?: string;
  genero?: string;
  es_original?: boolean; // true = producto original/auténtico, false = réplica
  created_at: string;
}

export type MovementType = 'entrada' | 'salida_ajuste' | 'venta' | 'devolucion';

export interface StockMovement {
  id: string;
  producto_id: string;
  producto_nombre: string;
  sku: string;
  talla: string;
  marca: string;
  tipo: MovementType;
  cantidad: number;
  stock_anterior: number;
  stock_nuevo: number;
  motivo: string;
  fecha: string;
  usuario: string;
  /** Historical unit cost captured when the movement is recorded. Older movements may not have it. */
  costo_unitario_usd?: number;
  costo_unitario_bs?: number;
  tasa_cambio?: number;
  documento?: string;
}

export interface SaleItem {
  producto_id: string;
  nombre_producto: string;
  sku: string;
  talla: string;
  marca: string;
  cantidad: number;
  precio_unitario: number; // en USD
  costo_unitario: number;  // en USD
  subtotal: number;        // en USD
}

export interface SalePayment {
  id: string;
  cuenta: string;         // 'Efectivo USD' | 'Efectivo Bs' | 'Pago Móvil' | 'Punto de Venta' | 'Zelle' | 'Binance' | 'Cashea'
  moneda: Currency;
  monto: number;          // Monto en la moneda seleccionada
  tasa: number;           // Tasa de cambio aplicada
  monto_equivalente_usd: number;
  referencia?: string;
  estado_liquidacion?: 'liquidado_inmediato' | 'pendiente_banco' | 'conciliado_en_banco';
  banco_acreditado?: string;
  cuenta_banco_liquidacion?: string;
  referencia_bancaria?: string;
  fecha_conciliacion?: string;
  numero_cuotas?: 3 | 6;
  monto_cuota_usd?: number;
  porcentaje_inicial?: number;
}

export interface CasheaAbono {
  id: string;
  fecha: string;
  referencia: string;
  factura: string;
  cuota: string;
  orden: string;
  monto_usd: number;
  monto_aplicado_usd: number;
  monto_ves: number;
  tasa_cambio: number;
  metodo_pago: string;
  cuenta: string;
  sucursal: string;
}

export interface Sale {
  id: string;
  numero_factura: string;
  cliente_nombre: string;
  cliente_apellido?: string;
  cliente_rif?: string;
  cliente_telefono?: string;
  cliente_correo?: string;
  items: SaleItem[];
  subtotal_usd: number;
  descuento_usd: number;
  aplica_iva: boolean;
  iva_incluido?: boolean; // true = el IVA ya está incluido dentro del precio facturado
  porcentaje_iva: number;
  iva_monto_usd: number;
  total_usd: number;
  total_bs: number;
  costo_total_usd: number;
  ganancia_neta_usd: number;
  tasa_cambio: number;
  pagos: SalePayment[];
  fecha: string;          // ISO string
  usuario: string;
  notas?: string;
  estado?: 'completada' | 'anulada' | 'modificada';
  anulada_at?: string;
  motivo_anulacion?: string; // nombre real: columna de Neon y campo que escribe el servidor
  anulada_motivo?: string;   // sin uso: se conserva por compatibilidad
  modificada_at?: string;
  motivo_modificacion?: string;
  total_positivo_inmediato_usd?: number; // Monto que entró en positivo inmediatamente (Pago Móvil, Punto de Venta, etc.)
  total_cashea_pendiente_usd?: number;   // Monto que queda pendiente por conciliar en banco según caiga
  estado_cashea?: 'sin_cashea' | 'pendiente_banco' | 'conciliado_total' | 'conciliado_parcial';
  cashea_abonos?: CasheaAbono[];
  created_at: string;
}

export interface BdvVerificationData {
  referencia: string;
  telefono_origen: string;
  cedula_cliente: string;
  banco_origen: string;
  monto_bs: number;
  monto_usd?: number;
}

export interface BdvVerificationResponse {
  aprobado: boolean;
  codigo_aprobacion: string;
  referencia: string;
  monto_bs: number;
  monto_usd_estimado?: number;
  telefono_origen: string;
  cedula_cliente: string;
  banco_origen: string;
  cuenta_receptora: string;
  fecha_transaccion: string;
  modo: 'PRODUCCION' | 'SANDBOX_VERIFICADO';
  mensaje: string;
}

export interface NeonDbStatus {
  connected: boolean;
  message: string;
  databaseName?: string;
  productsCount?: number;
  salesCount?: number;
  closuresCount?: number;
  expensesCount?: number;
  bankCount?: number;
  layawaysCount?: number;
  tablesSummary?: Record<string, number>;
  error?: string;
}

export interface AccountBalance {
  id: string;
  nombre: string;
  moneda: Currency;
  saldo: number;
  icono?: string;
}

export interface DailyCashClosure {
  id: string;
  fecha: string; // YYYY-MM-DD
  usuario: string;
  total_ventas_usd: number;
  total_ventas_bs: number;
  cantidad_transacciones: number;
  pares_vendidos: number;
  desglose_cuentas: {
    cuenta: string;
    moneda: Currency;
    monto: number;
    monto_usd: number;
  }[];
  cerrado_at: string;
  notas?: string;
}

export type ReportPeriod = 'hoy' | 'ayer' | 'ultimos_7_dias' | 'este_mes' | 'mes_anterior' | 'personalizado';

export interface SalesReportFilter {
  periodo: ReportPeriod;
  fechaInicio?: string;
  fechaFin?: string;
  marca?: string;
  tipo?: string;
}

import type { ExpenseCategory } from './domain/expenseChart';
export type { ExpenseCategory };

export interface Expense {
  id: string;
  fecha: string; // YYYY-MM-DD
  categoria: ExpenseCategory;
  descripcion: string;
  beneficiario?: string;
  beneficiario_rif?: string;
  cuenta_origen: string; // 'Efectivo USD', 'Efectivo Bs', 'Pago Móvil BDV', etc.
  moneda: Currency;
  monto: number;
  tasa_cambio: number;
  monto_usd: number;
  monto_bs: number;
  comprobante_ref?: string;
  registrado_por: string;
  notas?: string;
  foto_factura?: string;
  created_at: string;
}

export interface BankMovement {
  id: string;
  fecha: string;
  banco: string; // 'Banco de Venezuela (0102)', 'Banesco (0134)', 'Mercantil (0105)', etc.
  tipo: 'credito_ingreso' | 'debito_egreso';
  referencia: string;
  descripcion: string;
  monto_bs: number;
  monto_usd?: number;
  estado_conciliacion: 'conciliado' | 'pendiente' | 'discrepancia';
  vinculado_tipo?: 'venta' | 'gasto' | 'transferencia' | 'otro';
  vinculado_id?: string;
  notas?: string;
  cashea?: {
    habilitado: boolean;
    porcentaje_inicial: number;
    numero_cuotas: number;
    porcentajes_cuotas: number[];
    cuenta_inicial?: string;
    cuenta_financiamiento?: string;
    referencia?: string;
  };
  created_at: string;
}

export interface NeonTableColumn {
  column_name: string;
  data_type: string;
}

export interface NeonTableInfo {
  table_name: string;
  row_count?: number;
}

export type CurrencyPurchaseMethod =
  | 'Binance P2P (USDT)'
  | 'Zelle'
  | 'Dólares Efectivo'
  | 'Transferencia USD';

export interface CurrencyPurchase {
  id: string;
  fecha: string; // YYYY-MM-DD
  metodo: CurrencyPurchaseMethod;
  monto_bs_gastado: number; // Bolívares que se descuentan del balance positivo en Bs
  tasa_compra: number;      // Tasa en Bs por cada $
  monto_usd_recibido: number; // Dólares netos que se acreditan al balance positivo en USD
  comision_usd?: number;
  referencia?: string;      // N° de orden Binance, ID de Zelle, etc.
  usuario: string;
  notas?: string;
  cashea?: {
    habilitado: boolean;
    porcentaje_inicial: number;
    numero_cuotas: number;
    porcentajes_cuotas: number[];
    cuenta_inicial?: string;
    cuenta_financiamiento?: string;
    referencia?: string;
  };
  created_at: string;
}

export interface BdvParsedMovement {
  id: string;
  fecha: string;
  referencia: string;
  descripcion: string;
  tipo: 'credito_ingreso' | 'debito_egreso';
  monto_bs: number;
  saldo_bs?: number;
  estado_conciliacion: 'conciliado' | 'pendiente' | 'discrepancia';
  venta_id?: string;
  factura_ref?: string;
  cliente?: string;
}

export type LayawayStatus = 'activo' | 'completado' | 'cancelado' | 'vencido';

export interface LayawayPayment {
  id: string;
  fecha: string; // ISO string
  monto: number;
  moneda: Currency;
  tasa_cambio: number;
  monto_equivalente_usd: number;
  cuenta: string; // 'Efectivo USD' | 'Efectivo Bs' | 'Pago Móvil' | 'Zelle' | etc.
  referencia?: string;
  notas?: string;
}

export interface LayawayItem {
  producto_id: string;
  nombre_producto: string;
  sku: string;
  talla: string;
  marca: string;
  color?: string;
  cantidad: number;
  precio_unitario: number; // en USD
  subtotal: number; // en USD
}

export interface Layaway {
  id: string;
  codigo_apartado: string; // ej. AP-1024
  cliente_nombre: string;
  cliente_apellido?: string;
  cliente_cedula?: string;
  cliente_telefono?: string;
  items: LayawayItem[];
  total_usd: number;
  total_bs: number;
  tasa_cambio: number;
  total_abonado_usd: number;
  total_abonado_bs: number;
  saldo_pendiente_usd: number;
  saldo_pendiente_bs: number;
  abonos: LayawayPayment[];
  fecha_apartado: string; // ISO string
  fecha_vencimiento: string; // YYYY-MM-DD
  estado: LayawayStatus;
  usuario: string;
  notas?: string;
  cashea?: {
    habilitado: boolean;
    porcentaje_inicial: number;
    numero_cuotas: number;
    porcentajes_cuotas: number[];
    cuenta_inicial?: string;
    cuenta_financiamiento?: string;
    referencia?: string;
  };
  created_at: string;
  updated_at: string;
}
