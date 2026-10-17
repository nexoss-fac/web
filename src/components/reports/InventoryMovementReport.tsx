import React, { useMemo, useState } from 'react';
import { CalendarDays, Download, FileSpreadsheet, FileText, Package, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useStore } from '../../context/StoreContext';
import { ShoeProduct, StockMovement } from '../../types';
import { INVENTORY_BOOK_COLUMNS, INVENTORY_BOOK_GROUPS, classifyExitReason, type BookColumn } from '../../domain/inventoryBookLayout';

interface ReportRow {
  id: string;
  producto: string;
  sku: string;
  marca: string;
  clasificacionInventario: string;
  talla: string;
  existenciaInicial: number;
  costoInicialBs: number;
  montoInicialBs: number;
  entradas: number;
  entradasCostoBs: number;
  entradasMontoBs: number;
  fechasEntradas: string;
  autoconsumo: number;
  autoconsumoMontoBs: number;
  fechasAutoconsumo: string;
  donaciones: number;
  donacionesMontoBs: number;
  fechasDonaciones: string;
  salidas: number;
  salidasMontoBs: number;
  existenciaFinal: number;
  costoFinalBs: number;
  montoFinalBs: number;
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const money = (value: number) => Number((Number(value) || 0).toFixed(2));
const dateKey = (value: string | undefined) => {
  if (!value) return '';
  const raw = String(value);
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const displayDate = (value: string | undefined) => {
  const key = dateKey(value);
  if (!key) return '';
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
};
const signedQuantity = (m: StockMovement) => {
  const qty = Number(m.cantidad) || 0;
  const before = Number(m.stock_anterior);
  const after = Number(m.stock_nuevo);
  // Prefer the actual stock delta when it was recorded; some older layaway records had zeroes here.
  if (Number.isFinite(before) && Number.isFinite(after) && before !== after) return after - before;
  const reason = String(m.motivo || '').toLowerCase();
  if (m.tipo === 'venta') return -Math.abs(qty);
  if (m.tipo === 'devolucion' || m.tipo === 'entrada') return Math.abs(qty);
  if (m.tipo === 'salida_ajuste' && /apartado reservado|retiro|autoconsumo|salida|merma|dañado|danado/.test(reason)) return -Math.abs(qty);
  return qty;
};
const movementCostBs = (m: StockMovement, fallbackRate: number) => {
  const direct = Number(m.costo_unitario_bs);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const usd = Number(m.costo_unitario_usd) || 0;
  const rate = Number(m.tasa_cambio) || fallbackRate || 0;
  return usd * rate;
};

export const InventoryMovementReport: React.FC = () => {
  const { products, movements, exchangeRate, sales, expenses } = useStore();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [search, setSearch] = useState('');
  const [classificationFilter, setClassificationFilter] = useState('Todas');

  const periodStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const periodEnd = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;

  const rows = useMemo<ReportRow[]>(() => {
    const productMap = new Map<string, ShoeProduct>();
    products.forEach((p) => productMap.set(String(p.id), p));
    movements.forEach((m) => {
      const id = String(m.producto_id || '');
      if (id && !productMap.has(id)) {
        productMap.set(id, {
          id, nombre: m.producto_nombre || 'Producto sin nombre', sku: m.sku || '', marca: m.marca || '',
          categoria: 'Calzado', clasificacion_inventario: 'Mercancía', tipo: 'Otros', talla: m.talla || '', color: '', moneda: 'USD', precio: 0, costo: 0,
          stock: Number(m.stock_nuevo) || 0, stock_minimo: 0, activo: false, created_at: m.fecha || '',
        });
      }
    });

    const result: ReportRow[] = [];
    productMap.forEach((product, id) => {
      const history = movements
        .filter((m) => String(m.producto_id) === id && dateKey(m.fecha))
        .sort((a, b) => dateKey(a.fecha).localeCompare(dateKey(b.fecha)));
      const inPeriod = history.filter((m) => dateKey(m.fecha) >= periodStart && dateKey(m.fecha) <= periodEnd);
      const onOrAfterStart = history.filter((m) => dateKey(m.fecha) >= periodStart);
      const periodNet = inPeriod.reduce((sum, m) => sum + signedQuantity(m), 0);
      // Reconstruct the opening quantity from current stock and all logged movements since the selected month began.
      const opening = Math.max(0, (Number(product.stock) || 0) - onOrAfterStart.reduce((sum, m) => sum + signedQuantity(m), 0));
      const closing = Math.max(0, opening + periodNet);
      const before = history.filter((m) => dateKey(m.fecha) < periodStart && (Number(m.costo_unitario_bs) > 0 || Number(m.costo_unitario_usd) > 0));
      const throughEnd = history.filter((m) => dateKey(m.fecha) <= periodEnd && (Number(m.costo_unitario_bs) > 0 || Number(m.costo_unitario_usd) > 0));
      const openingCostBs = before.length ? movementCostBs(before[before.length - 1], exchangeRate) : (Number(product.costo) || 0) * (Number(exchangeRate) || 0);
      const closingCostBs = throughEnd.length ? movementCostBs(throughEnd[throughEnd.length - 1], exchangeRate) : (Number(product.costo) || 0) * (Number(exchangeRate) || 0);

      let entradas = 0, entradasMontoBs = 0;
      let autoconsumo = 0, autoconsumoMontoBs = 0, donaciones = 0, donacionesMontoBs = 0, salidas = 0, salidasMontoBs = 0;
      const fechasEntradas: string[] = [], fechasAutoconsumo: string[] = [], fechasDonaciones: string[] = [];
      inPeriod.forEach((m) => {
        const qty = signedQuantity(m);
        const absQty = Math.abs(qty);
        const cost = movementCostBs(m, exchangeRate);
        const amount = absQty * cost;
        const reason = `${m.motivo || ''} ${m.documento || ''}`.toLowerCase();
        if (m.tipo === 'devolucion' || (m.tipo === 'entrada' && qty > 0)) {
          entradas += absQty;
          entradasMontoBs += amount;
          fechasEntradas.push(displayDate(m.fecha));
        } else if (m.tipo === 'salida_ajuste' && classifyExitReason(reason) === 'autoconsumo') {
          autoconsumo += absQty;
          autoconsumoMontoBs += amount;
          fechasAutoconsumo.push(displayDate(m.fecha));
        } else if (m.tipo === 'salida_ajuste' && classifyExitReason(reason) === 'donaciones') {
          donaciones += absQty;
          donacionesMontoBs += amount;
          fechasDonaciones.push(displayDate(m.fecha));
        } else if (qty < 0 || m.tipo === 'venta') {
          salidas += absQty;
          salidasMontoBs += amount;
        }
      });
      if (!product.activo && !history.length && (Number(product.stock) || 0) === 0) return;
      if (!history.length && (Number(product.stock) || 0) === 0) return;
      result.push({
        id, producto: product.nombre || 'Producto sin nombre', sku: product.sku || '', marca: product.marca || '', talla: product.talla || '',
        clasificacionInventario: product.clasificacion_inventario || 'Mercancía',
        existenciaInicial: money(opening), costoInicialBs: money(openingCostBs), montoInicialBs: money(opening * openingCostBs),
        entradas: money(entradas), entradasCostoBs: money(entradas > 0 ? entradasMontoBs / entradas : 0), entradasMontoBs: money(entradasMontoBs), fechasEntradas: [...new Set(fechasEntradas)].join(', '),
        autoconsumo: money(autoconsumo), autoconsumoMontoBs: money(autoconsumoMontoBs), fechasAutoconsumo: [...new Set(fechasAutoconsumo)].join(', '),
        donaciones: money(donaciones), donacionesMontoBs: money(donacionesMontoBs), fechasDonaciones: [...new Set(fechasDonaciones)].join(', '),
        salidas: money(salidas), salidasMontoBs: money(salidasMontoBs),
        existenciaFinal: money(closing), costoFinalBs: money(closingCostBs), montoFinalBs: money(closing * closingCostBs),
      });
    });
    return result.sort((a, b) => a.producto.localeCompare(b.producto, 'es'));
  }, [products, movements, periodStart, periodEnd, exchangeRate]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      (classificationFilter === 'Todas' || r.clasificacionInventario === classificationFilter) &&
      (!q || `${r.producto} ${r.sku} ${r.marca} ${r.talla} ${r.clasificacionInventario}`.toLowerCase().includes(q))
    );
  }, [rows, search, classificationFilter]);
  const totals = useMemo(() => filteredRows.reduce((acc, row) => ({
    opening: acc.opening + row.existenciaInicial,
    entries: acc.entries + row.entradas,
    selfUse: acc.selfUse + row.autoconsumo,
    donations: acc.donations + row.donaciones,
    exits: acc.exits + row.salidas,
    closing: acc.closing + row.existenciaFinal,
    openingValue: acc.openingValue + row.montoInicialBs,
    closingValue: acc.closingValue + row.montoFinalBs,
    entryValue: acc.entryValue + row.entradasMontoBs,
  }), { opening: 0, entries: 0, selfUse: 0, donations: 0, exits: 0, closing: 0, openingValue: 0, closingValue: 0, entryValue: 0 }), [filteredRows]);

  const periodSales = useMemo(() => sales.filter((sale) => dateKey(sale.fecha) >= periodStart && dateKey(sale.fecha) <= periodEnd && sale.estado !== 'anulada'), [sales, periodStart, periodEnd]);
  const periodExpenses = useMemo(() => expenses.filter((expense) => dateKey(expense.fecha) >= periodStart && dateKey(expense.fecha) <= periodEnd), [expenses, periodStart, periodEnd]);

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const groupHeader: string[] = ['Descripción'];
    const columnHeader: string[] = [''];
    const merges: XLSX.Range[] = [];
    INVENTORY_BOOK_GROUPS.forEach((group) => {
      const start = groupHeader.length;
      group.columns.forEach((column, index) => {
        groupHeader.push(index === 0 ? group.label : '');
        columnHeader.push(column.label);
      });
      merges.push({ s: { r: 0, c: start }, e: { r: 0, c: start + group.columns.length - 1 } });
    });
    merges.push({ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } });
    const bookCell = (row: ReportRow, column: BookColumn) => (row as unknown as Record<string, string | number>)[column.field] ?? '';
    const bookRows = filteredRows.map((r) => [
      `${r.producto}${r.talla ? ` - Talla ${r.talla}` : ''}${r.sku ? ` (${r.sku})` : ''}`,
      ...INVENTORY_BOOK_COLUMNS.map((column) => bookCell(r, column)),
    ]);
    const totalRow = ['TOTALES', ...INVENTORY_BOOK_COLUMNS.map((column) => (column.sum ? money(filteredRows.reduce((sum, r) => sum + (Number(bookCell(r, column)) || 0), 0)) : ''))];
    const ws = XLSX.utils.aoa_to_sheet([groupHeader, columnHeader, ...bookRows, totalRow]);
    ws['!merges'] = merges;
    ws['!cols'] = [{ wch: 38 }, ...INVENTORY_BOOK_COLUMNS.map((column) => ({ wch: column.kind === 'text' ? 22 : 15 }))];
    XLSX.utils.book_append_sheet(wb, ws, 'Movimiento inventario');
    const detailRows = movements.filter((m) => dateKey(m.fecha) >= periodStart && dateKey(m.fecha) <= periodEnd).map((m) => ({
      Fecha: displayDate(m.fecha), Producto: m.producto_nombre, SKU: m.sku, Talla: m.talla, Tipo: m.tipo,
      Cantidad: signedQuantity(m), 'Costo unitario Bs': money(movementCostBs(m, exchangeRate)), 'Monto Bs': money(Math.abs(signedQuantity(m)) * movementCostBs(m, exchangeRate)),
      Documento: m.documento || '', Motivo: m.motivo || '', Usuario: m.usuario || '',
    }));
    const detail = XLSX.utils.json_to_sheet(detailRows);
    detail['!cols'] = [{wch:14},{wch:30},{wch:16},{wch:10},{wch:18},{wch:12},{wch:18},{wch:18},{wch:22},{wch:42},{wch:18}];
    XLSX.utils.book_append_sheet(wb, detail, 'Detalle movimientos');
    const relatedSummary = XLSX.utils.json_to_sheet([
      { Concepto: 'Ventas registradas (no anuladas)', Operaciones: periodSales.length, 'Monto USD': periodSales.reduce((sum, sale) => sum + (Number(sale.total_usd) || 0), 0), 'Monto Bs': periodSales.reduce((sum, sale) => sum + (Number(sale.total_bs) || 0), 0) },
      { Concepto: 'Gastos registrados', Operaciones: periodExpenses.length, 'Monto USD': periodExpenses.reduce((sum, expense) => sum + (Number(expense.monto_usd) || 0), 0), 'Monto Bs': periodExpenses.reduce((sum, expense) => sum + (Number(expense.monto_bs) || 0), 0) },
      { Concepto: 'Entradas de inventario valorizadas (referencial)', Operaciones: movements.filter((m) => dateKey(m.fecha) >= periodStart && dateKey(m.fecha) <= periodEnd && m.tipo === 'entrada').length, 'Monto USD': '', 'Monto Bs': totals.entryValue },
    ]);
    XLSX.utils.book_append_sheet(wb, relatedSummary, 'Resumen relacionado');
    const info = XLSX.utils.aoa_to_sheet([
      ['NEXOSS — MOVIMIENTO MENSUAL DE INVENTARIO'],
      ['Período', `${MONTHS[month]} ${year}`],
      ['Desde', periodStart, 'Hasta', periodEnd],
      ['Nota', 'El reporte utiliza el historial de movimientos guardado. Revise los costos históricos cuando los movimientos antiguos no tengan tasa o costo registrado.'],
    ]);
    XLSX.utils.book_append_sheet(wb, info, 'Información');
    XLSX.writeFile(wb, `NEXOSS_SHOP_Movimiento_Inventario_${year}-${String(month + 1).padStart(2, '0')}.xlsx`);
  };

  const exportPdf = () => {
    const bookCellText = (row: ReportRow, column: BookColumn) => {
      const value = (row as unknown as Record<string, string | number>)[column.field];
      return column.kind === 'text' ? escapeHtml(String(value ?? '')) : formatNumber(Number(value) || 0);
    };
    const groupHead = INVENTORY_BOOK_GROUPS.map((group) => `<th colspan="${group.columns.length}">${escapeHtml(group.label)}</th>`).join('');
    const columnHead = INVENTORY_BOOK_COLUMNS.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
    const contentRows = filteredRows.map((r) => `<tr><td>${escapeHtml(r.producto)}${r.talla ? ` - Talla ${escapeHtml(r.talla)}` : ''}</td>${INVENTORY_BOOK_COLUMNS.map((column) => `<td>${bookCellText(r, column)}</td>`).join('')}</tr>`).join('');
    const totalCells = INVENTORY_BOOK_COLUMNS.map((column) => `<td>${column.sum ? formatNumber(filteredRows.reduce((sum, r) => sum + (Number((r as unknown as Record<string, number>)[column.field]) || 0), 0)) : ''}</td>`).join('');
    const bookTableHtml = `<table><thead><tr><th rowspan="2">Descripción</th>${groupHead}</tr><tr>${columnHead}</tr></thead><tbody>${contentRows}<tr class="totals"><td>TOTALES</td>${totalCells}</tr></tbody></table>`;
    const salesUsd = periodSales.reduce((sum, sale) => sum + (Number(sale.total_usd) || 0), 0);
    const salesBs = periodSales.reduce((sum, sale) => sum + (Number(sale.total_bs) || 0), 0);
    const expensesUsd = periodExpenses.reduce((sum, expense) => sum + (Number(expense.monto_usd) || 0), 0);
    const expensesBs = periodExpenses.reduce((sum, expense) => sum + (Number(expense.monto_bs) || 0), 0);
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Movimiento de inventario NEXOSS</title><style>body{font-family:Arial,sans-serif;color:#111827;padding:22px}h1{font-size:18px;margin:0 0 6px}h2{font-size:13px;margin:18px 0 7px}p{font-size:11px;color:#475569;margin:4px 0 16px}table{border-collapse:collapse;width:100%;font-size:9px}th,td{border:1px solid #cbd5e1;padding:6px 5px;text-align:right}th{background:#e2e8f0}th:first-child,td:first-child{text-align:left}.totals{font-weight:bold;background:#f1f5f9}.note{margin-top:16px;font-size:9px}@media print{@page{size:landscape;margin:10mm}body{padding:0}}</style></head><body><h1>NEXOSS — Movimiento mensual de inventario</h1><p>Período: ${MONTHS[month]} ${year} · Desde ${periodStart} hasta ${periodEnd}</p>${bookTableHtml}<h2>Resumen contable relacionado (separado del inventario físico)</h2><table><thead><tr><th>Concepto</th><th>Operaciones</th><th>Total USD</th><th>Total Bs</th></tr></thead><tbody><tr><td>Ventas registradas no anuladas</td><td>${periodSales.length}</td><td>${formatNumber(salesUsd)}</td><td>${formatNumber(salesBs)}</td></tr><tr><td>Gastos registrados</td><td>${periodExpenses.length}</td><td>${formatNumber(expensesUsd)}</td><td>${formatNumber(expensesBs)}</td></tr><tr><td>Entradas de inventario valorizadas (referencial)</td><td>${movements.filter((m) => dateKey(m.fecha) >= periodStart && dateKey(m.fecha) <= periodEnd && m.tipo === 'entrada').length}</td><td>—</td><td>${formatNumber(totals.entryValue)}</td></tr></tbody></table><p class="note">Este reporte se genera con los movimientos disponibles en NEXOSS. Los costos históricos dependen de que cada movimiento tenga su costo y tasa registrados; los gastos y ventas se muestran como resumen relacionado, no como unidades de inventario.</p><script>window.onload=()=>window.print()</script></body></html>`;
    const win = window.open('', '_blank', 'width=1200,height=800');
    if (!win) { alert('El navegador bloqueó la ventana. Permite ventanas emergentes para imprimir el reporte en PDF.'); return; }
    win.document.open(); win.document.write(html); win.document.close();
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Package className="w-6 h-6 text-indigo-600" /><h2 className="text-xl font-black text-slate-900">Movimiento mensual de inventario</h2></div>
          <p className="text-sm text-slate-500 mt-1">Entradas, salidas, autoconsumo y existencias del período seleccionado.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportExcel} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700"><FileSpreadsheet className="w-4 h-4" /> Exportar Excel</button>
          <button onClick={exportPdf} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800"><FileText className="w-4 h-4" /> Imprimir / PDF</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Metric title="Existencia inicial" value={formatNumber(totals.opening)} icon={<Package className="w-5 h-5" />} />
        <Metric title="Entradas del mes" value={formatNumber(totals.entries)} icon={<TrendingUp className="w-5 h-5" />} />
        <Metric title="Salidas del mes" value={formatNumber(totals.exits + totals.selfUse)} icon={<TrendingDown className="w-5 h-5" />} />
        <Metric title="Valor final estimado (Bs)" value={formatNumber(totals.closingValue)} icon={<FileSpreadsheet className="w-5 h-5" />} />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row gap-3 md:items-end">
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-600"><span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> Mes</span><select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-2.5 text-sm min-w-40 bg-white">{MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">Año<select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white">{Array.from({ length: 8 }, (_, i) => now.getFullYear() - 5 + i).map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">Clasificación<select value={classificationFilter} onChange={(e) => setClassificationFilter(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white"><option value="Todas">Todas</option><option value="Mercancía">Mercancía</option><option value="Materia prima">Materia prima</option><option value="Productos en proceso">Productos en proceso</option><option value="Productos terminados">Productos terminados</option></select></label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-600 flex-1">Buscar producto<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre, SKU, marca, talla o clasificación..." className="border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-normal" /></label>
        <button onClick={() => { setMonth(now.getMonth()); setYear(now.getFullYear()); setSearch(''); setClassificationFilter('Todas'); }} className="inline-flex items-center justify-center gap-2 px-3 py-2.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50"><RefreshCw className="w-4 h-4" /> Mes actual</button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2"><div><h3 className="font-black text-slate-800">{MONTHS[month]} {year}</h3><p className="text-xs text-slate-500">{periodStart} al {periodEnd} · {filteredRows.length} productos</p></div><span className="text-xs text-slate-500">Montos en Bs</span></div>
        <div className="overflow-auto max-h-[65vh]"><table className="min-w-[1500px] w-full text-xs text-left"><thead className="sticky top-0 z-10 bg-slate-100 text-slate-600"><tr><th rowSpan={2} className="p-3 min-w-56 align-bottom border-r border-slate-200">Descripción</th>{INVENTORY_BOOK_GROUPS.map((group) => <th key={group.id} colSpan={group.columns.length} className="p-2 text-center border-l border-slate-200 font-black text-slate-700">{group.label}</th>)}</tr><tr>{INVENTORY_BOOK_COLUMNS.map((column) => <th key={column.id} className={`p-2 font-semibold ${column.kind === 'text' ? 'text-left' : 'text-right'}`}>{column.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filteredRows.map((r) => <tr key={r.id} className="hover:bg-slate-50"><td className="p-3 border-r border-slate-100"><div className="font-bold text-slate-800">{r.producto}</div><div className="text-[10px] text-slate-500">{r.sku || 'Sin SKU'} · {r.marca || 'Sin marca'} · Talla {r.talla || '—'} · {r.clasificacionInventario}</div></td>{INVENTORY_BOOK_COLUMNS.map((column) => { const value = (r as unknown as Record<string, string | number>)[column.field]; return <td key={column.id} className={`p-2 ${column.kind === 'text' ? 'text-left text-[10px] text-slate-500 max-w-[140px]' : 'text-right'}`}>{column.kind === 'text' ? String(value || '') : formatNumber(Number(value) || 0)}</td>; })}</tr>)}{!filteredRows.length && <tr><td colSpan={INVENTORY_BOOK_COLUMNS.length + 1} className="p-12 text-center text-slate-400">No hay productos o movimientos para este filtro.</td></tr>}</tbody><tfoot className="bg-slate-100 font-black text-slate-800"><tr><td className="p-3">TOTALES</td>{INVENTORY_BOOK_COLUMNS.map((column) => <td key={column.id} className="p-2 text-right">{column.sum ? formatNumber(filteredRows.reduce((sum, r) => sum + (Number((r as unknown as Record<string, number>)[column.field]) || 0), 0)) : ''}</td>)}</tr></tfoot></table></div>
      </div>
      <section className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3"><FileSpreadsheet className="w-5 h-5 text-indigo-600" /><h3 className="font-black text-slate-800">Resumen contable relacionado</h3></div>
        <p className="text-xs text-slate-500 mb-3">Estos importes son un resumen complementario; no se mezclan con las cantidades físicas de inventario.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><div className="text-xs font-bold text-emerald-800">Ventas registradas</div><div className="text-lg font-black text-emerald-900 mt-1">{formatNumber(periodSales.reduce((sum, sale) => sum + (Number(sale.total_usd) || 0), 0))} USD</div><div className="text-xs text-emerald-700">{periodSales.length} facturas no anuladas</div></div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-3"><div className="text-xs font-bold text-amber-800">Gastos registrados</div><div className="text-lg font-black text-amber-900 mt-1">{formatNumber(periodExpenses.reduce((sum, expense) => sum + (Number(expense.monto_usd) || 0), 0))} USD</div><div className="text-xs text-amber-700">{periodExpenses.length} registros de gastos</div></div>
          <div className="rounded-xl border border-sky-100 bg-sky-50 p-3"><div className="text-xs font-bold text-sky-800">Entradas valorizadas</div><div className="text-lg font-black text-sky-900 mt-1">{formatNumber(totals.entryValue)} Bs</div><div className="text-xs text-sky-700">Valor referencial de entradas de mercancía</div></div>
        </div>
      </section>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"><strong>Nota de control:</strong> las existencias se reconstruyen con el historial de movimientos y el stock actual. Para períodos antiguos, el resultado depende de que los movimientos estén completos. Si un movimiento no tiene costo o tasa histórica, el valor en bolívares es estimado con la información disponible. Los gastos generales se mantienen en el módulo de contabilidad y no se mezclan con salidas de mercancía.</div>
    </div>
  );
};

const Metric: React.FC<{ title: string; value: string; icon: React.ReactNode }> = ({ title, value, icon }) => <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3"><div className="p-3 rounded-xl bg-indigo-50 text-indigo-600">{icon}</div><div><div className="text-xs font-bold text-slate-500">{title}</div><div className="text-xl font-black text-slate-900 mt-1">{value}</div></div></div>;
const formatNumber = (value: number) => (Number(value) || 0).toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
