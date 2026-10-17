import { Sale, Expense, CurrencyPurchase, BankMovement } from '../types';

export interface ExportReportData {
  title: string;
  periodLabel: string;
  generatedDate: string;
  exchangeRate: number;
  totalVentasUsd: number;
  totalVentasBs: number;
  costoMercanciaUsd: number;
  gananciaVentasUsd: number;
  totalGastosUsd: number;
  totalGastosBs: number;
  // Conversión de Divisas
  comprasDivisas: CurrencyPurchase[];
  totalBsGastadosDivisas: number;
  totalUsdRecibidosDivisas: number;
  saldoRestanteBs: number;
  positivoSoloDolaresUsd: number;
  // Details
  sales: Sale[];
  expenses: Expense[];
  bankMovements: BankMovement[];
}

export interface GoogleSheetsExportResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
}

/**
 * Creates a complete, organized Google Spreadsheet for NEXOSS
 */
export async function exportToGoogleSheets(
  data: ExportReportData,
  accessToken: string
): Promise<GoogleSheetsExportResult> {
  if (import.meta.env.VITE_NEXOSS_LOCAL_ONLY === 'true') throw new Error('Google Sheets está desactivado en el modo local aislado.');
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  // 1. Create Spreadsheet with predefined sheets
  const spreadsheetBody = {
    properties: {
      title: data.title || `NEXOSS - Reporte Fin de Mes (${data.periodLabel})`,
    },
    sheets: [
      { properties: { title: 'Resumen Financiero' } },
      { properties: { title: 'Compras de Divisas P2P' } },
      { properties: { title: 'Detalle de Ventas' } },
      { properties: { title: 'Gastos Operativos' } },
      { properties: { title: 'Conciliación BDV' } },
    ],
  };

  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers,
    body: JSON.stringify(spreadsheetBody),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Error al crear Google Sheet: ${createRes.status} ${errText}`);
  }

  const spreadsheet = await createRes.json();
  const spreadsheetId = spreadsheet.spreadsheetId;
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // 2. Prepare Tab 1: Resumen Financiero
  const resumenValues: any[][] = [
    ['NEXOSS - CONTROL FINANCIERO Y BALANCE DE FIN DE MES'],
    ['Sede:', 'Ubicación no configurada, Sede no configurada, Sede no configurada'],
    ['Período:', data.periodLabel],
    ['Fecha de Generación:', data.generatedDate],
    ['Tasa BCV Referencial:', `${data.exchangeRate.toFixed(4)} Bs/USD`],
    [''],
    ['BALANCE GENERAL DE CAJA Y CUENTAS'],
    ['Concepto', 'Monto en USD ($)', 'Monto en Bs.'],
    ['Ventas Totales Facturadas', data.totalVentasUsd, data.totalVentasBs],
    ['Costo de Compra de Mercancía (CMV)', data.costoMercanciaUsd, data.costoMercanciaUsd * data.exchangeRate],
    ['Ganancia Bruta en Ventas', data.gananciaVentasUsd, data.gananciaVentasUsd * data.exchangeRate],
    ['Gastos Operativos y Nóminas', data.totalGastosUsd, data.totalGastosBs],
    [''],
    ['CONVERSIÓN DE BS POSITIVOS A DÓLARES (DIVISAS / BINANCE / ZELLE)'],
    ['Concepto', 'Valor', 'Nota Contable'],
    [
      'Total Bs Gastados en Compra de Divisas',
      data.totalBsGastadosDivisas,
      'Descontado del saldo positivo en Bs',
    ],
    [
      'Total Dólares Netos Recibidos (Binance/Zelle/Efectivo)',
      data.totalUsdRecibidosDivisas,
      'Acreditado al saldo positivo en USD',
    ],
    [''],
    ['RESULTADO FINAL DE FIN DE MES'],
    ['Concepto', 'Monto Neto', 'Detalle'],
    [
      'SALDO POSITIVO EN SOLO DÓLARES (USD NETO)',
      data.positivoSoloDolaresUsd,
      'Total efectivo USD + Binance + Zelle ingresados menos gastos en USD',
    ],
    [
      'SALDO REMANENTE EN BOLÍVARES (BS NETO)',
      data.saldoRestanteBs,
      'Bs cobrados en ventas MENOS Bs utilizados para comprar divisas y gastos',
    ],
  ];

  // 3. Prepare Tab 2: Compras de Divisas
  const divisasValues: any[][] = [
    ['REGISTRO DE COMPRA DE DIVISAS (CONVERSIÓN DE BS A DÓLARES)'],
    ['Fecha', 'Método / Canal', 'Monto Bs Gastados (Débito Bs)', 'Tasa Pactada (Bs/$)', 'Dólares Recibidos (Crédito USD)', 'Referencia / Orden', 'Responsable', 'Notas'],
    ...(data.comprasDivisas.length > 0
      ? data.comprasDivisas.map((c) => [
          c.fecha,
          c.metodo,
          c.monto_bs_gastado,
          c.tasa_compra,
          c.monto_usd_recibido,
          c.referencia || 'S/R',
          c.usuario,
          c.notas || '',
        ])
      : [['No hay compras de divisas registradas en este período', '', '', '', '', '', '', '']]),
    [''],
    [
      'TOTALES',
      '',
      data.totalBsGastadosDivisas,
      '',
      data.totalUsdRecibidosDivisas,
      '',
      '',
      '',
    ],
  ];

  // 4. Prepare Tab 3: Detalle de Ventas
  const ventasValues: any[][] = [
    ['DETALLE DE VENTAS Y FACTURACIÓN'],
    ['Factura', 'Fecha', 'Cliente', 'RIF / Cédula', 'Pares', 'Subtotal ($)', 'IVA ($)', 'Total ($)', 'Total (Bs)', 'Costo ($)', 'Ganancia ($)', 'Métodos de Pago', 'Cajero'],
    ...data.sales.map((s) => [
      s.numero_factura,
      new Date(s.fecha).toLocaleString('es-VE'),
      `${s.cliente_nombre} ${s.cliente_apellido || ''}`,
      s.cliente_rif || 'N/A',
      s.items.reduce((sum, item) => sum + item.cantidad, 0),
      s.subtotal_usd,
      s.iva_monto_usd,
      s.total_usd,
      s.total_bs,
      s.costo_total_usd,
      s.ganancia_neta_usd,
      s.pagos.map((p) => `${p.cuenta}: ${p.monto} ${p.moneda}`).join(' | '),
      s.usuario,
    ]),
  ];

  // 5. Prepare Tab 4: Gastos Operativos
  const gastosValues: any[][] = [
    ['DETALLE DE GASTOS OPERATIVOS'],
    ['Fecha', 'Categoría', 'Descripción', 'Beneficiario', 'Cuenta Origen', 'Moneda', 'Monto', 'Monto USD', 'Monto Bs', 'Comprobante', 'Registrado Por'],
    ...data.expenses.map((e) => [
      e.fecha,
      e.categoria,
      e.descripcion,
      e.beneficiario || 'N/A',
      e.cuenta_origen,
      e.moneda,
      e.monto,
      e.monto_usd,
      e.monto_bs,
      e.comprobante_ref || 'N/A',
      e.registrado_por,
    ]),
  ];

  // 6. Prepare Tab 5: Conciliación Banco de Venezuela
  const bdvValues: any[][] = [
    ['CONCILIACIÓN BANCARIA - BANCO DE VENEZUELA (0102)'],
    ['Fecha', 'Banco', 'Tipo', 'Referencia', 'Descripción', 'Monto Bs', 'Estado', 'Vínculo / Factura', 'Notas'],
    ...data.bankMovements.map((b) => [
      b.fecha,
      b.banco,
      b.tipo === 'credito_ingreso' ? 'Crédito / Ingreso' : 'Débito / Egreso',
      b.referencia,
      b.descripcion,
      b.monto_bs,
      b.estado_conciliacion.toUpperCase(),
      b.vinculado_id ? `${b.vinculado_tipo} (${b.vinculado_id})` : 'Sin vincular',
      b.notas || '',
    ]),
  ];

  // 7. Write all sheets using batchUpdate / values batchUpdate
  const batchValuesBody = {
    valueInputOption: 'USER_ENTERED',
    data: [
      { range: "'Resumen Financiero'!A1", values: resumenValues },
      { range: "'Compras de Divisas P2P'!A1", values: divisasValues },
      { range: "'Detalle de Ventas'!A1", values: ventasValues },
      { range: "'Gastos Operativos'!A1", values: gastosValues },
      { range: "'Conciliación BDV'!A1", values: bdvValues },
    ],
  };

  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(batchValuesBody),
    }
  );

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    console.error('Error batch updating spreadsheet:', errText);
    // Still return spreadsheet url as spreadsheet was created
  }

  return {
    spreadsheetId,
    spreadsheetUrl,
    title: spreadsheetBody.properties.title,
  };
}
