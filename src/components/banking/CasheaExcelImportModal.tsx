import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle2, FileSpreadsheet, UploadCloud, X } from 'lucide-react';
import { Sale, BankMovement } from '../../types';

type CasheaRow = {
  fechaTransaccion: string; moneda: string; metodoPago: string; cuenta: string;
  montoVES: number; montoUSD: number; fechaTasa: string; tasaCambio: number;
  referencia: string; cuota: string; orden: string; factura: string; sucursal: string; montoAsignado: number;
  matchedSaleId?: string; matchedInvoice?: string; matchStatus: 'matched' | 'unmatched' | 'duplicate';
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sales: Sale[];
  bankMovements: BankMovement[];
  exchangeRate: number;
  importBankMovements: (movements: Omit<BankMovement, 'id' | 'created_at'>[]) => number;
  applyCasheaExcelAbonos: (abonos: Array<{ saleId: string; fecha: string; referencia: string; factura: string; cuota: string; orden: string; montoUsd: number; montoVes: number; tasaCambio: number; metodoPago: string; cuenta: string; sucursal: string }>) => number;
}

const norm = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9#]+/g, ' ').trim();
const valueByHeader = (row: Record<string, unknown>, ...aliases: string[]) => {
  const keys = Object.keys(row);
  const target = aliases.map(norm);
  const key = keys.find(k => target.includes(norm(k)));
  return key ? row[key] : undefined;
};
const num = (value: unknown) => {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim().replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
};
const dateText = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2,'0')}-${String(parsed.d).padStart(2,'0')} ${String(parsed.H || 0).padStart(2,'0')}:${String(parsed.M || 0).padStart(2,'0')}:${String(Math.floor(parsed.S || 0)).padStart(2,'0')}`;
  }
  return String(value ?? '').trim();
};

export const CasheaExcelImportModal: React.FC<Props> = ({ isOpen, onClose, sales, bankMovements, exchangeRate, importBankMovements, applyCasheaExcelAbonos }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<CasheaRow[]>([]);
  const [error, setError] = useState('');
  const [imported, setImported] = useState<number | null>(null);
  const [appliedAbonos, setAppliedAbonos] = useState(0);
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => rows.slice(0, 100), [rows]);
  if (!isOpen) return null;

  const parseFile = async (file: File) => {
    setBusy(true); setError(''); setImported(null); setAppliedAbonos(0); setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error('El archivo no contiene una hoja con datos.');
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });
      if (!raw.length) throw new Error('No se encontraron filas de transacciones en la primera hoja.');
      const parsed: CasheaRow[] = raw.map((r) => {
        const factura = String(valueByHeader(r, '# Factura', 'Factura', 'Numero Factura', 'Nro Factura') ?? '').trim();
        const referencia = String(valueByHeader(r, '# Referencia', 'Referencia', 'Numero Referencia') ?? '').trim();
        const cuota = String(valueByHeader(r, '# Cuota Pagada', 'Cuota Pagada', 'Cuota') ?? '').trim();
        const orden = String(valueByHeader(r, '# Orden', 'Orden', 'Numero Orden') ?? '').trim();
        const fechaTransaccion = dateText(valueByHeader(r, 'Fecha de Transaccion', 'Fecha Transaccion', 'Fecha de Transacción'));
        const moneda = String(valueByHeader(r, 'Moneda') ?? '').trim();
        const metodoPago = String(valueByHeader(r, 'Método de pago', 'Metodo de pago', 'Metodo Pago') ?? '').trim();
        const cuenta = String(valueByHeader(r, 'Cuenta') ?? '').trim();
        const montoVES = num(valueByHeader(r, 'Monto pagado en VES', 'Monto Pagado VES', 'Monto en VES'));
        const montoUSD = num(valueByHeader(r, 'Monto Pagado en USD', 'Monto pagado USD', 'Monto en USD'));
        const fechaTasa = dateText(valueByHeader(r, 'Fecha Tasa de Cambio', 'Fecha de Tasa de Cambio'));
        const tasaCambio = num(valueByHeader(r, 'Tasa de Cambio', 'Tasa Cambio'));
        const sucursal = String(valueByHeader(r, 'Sucursal') ?? '').trim();
        const montoAsignado = num(valueByHeader(r, 'Monto asignado', 'Monto Asignado', 'Monto asignado USD'));
        const cleanInvoice = norm(factura);
        const sale = sales.find(s => norm(s.numero_factura) === cleanInvoice || (orden && norm(s.id) === norm(orden)));
        const hasCasheaPayment = !!sale?.pagos?.some(p => norm(p.cuenta).includes('cashea'));
        const effectiveReference = referencia || `CASHEA-${factura}-${cuota}`;
        const isDuplicate = bankMovements.some(m => m.notas?.startsWith('CASHEA_EXCEL_ROW:') && norm(m.referencia) === norm(effectiveReference) && (m.descripcion || '').toLowerCase().includes(`factura ${factura}`.toLowerCase()));
        const matchStatus: CasheaRow['matchStatus'] = isDuplicate ? 'duplicate' : sale && hasCasheaPayment ? 'matched' : 'unmatched';
        return { fechaTransaccion, moneda, metodoPago, cuenta, montoVES, montoUSD, fechaTasa, tasaCambio, referencia, cuota, orden, factura, sucursal, montoAsignado,
          matchedSaleId: sale?.id, matchedInvoice: sale?.numero_factura, matchStatus };
      }).filter(r => r.factura || r.referencia || r.montoAsignado || r.montoUSD || r.montoVES);
      if (!parsed.length) throw new Error('No se encontraron filas con los encabezados esperados.');
      const headers = Object.keys(raw[0]).map(norm);
      if (!headers.some(h => h.includes('factura')) || !headers.some(h => h.includes('monto asignado'))) {
        throw new Error('No identifiqué las columnas “# Factura” y “Monto asignado”. Verifica que la primera fila tenga los encabezados del reporte Cashea.');
      }
      setRows(parsed);
    } catch (e) {
      setRows([]); setError(e instanceof Error ? e.message : 'No se pudo leer el archivo Excel.');
    } finally { setBusy(false); }
  };

  const handleImport = () => {
    const toImport = rows.filter(r => r.matchStatus !== 'duplicate');
    if (!toImport.length) { setError('No hay filas nuevas para importar.'); return; }
    const movements: Omit<BankMovement, 'id' | 'created_at'>[] = toImport.map(r => {
      const matched = r.matchStatus === 'matched';
      const usd = r.montoUSD || r.montoAsignado || (r.montoVES && r.tasaCambio ? r.montoVES / r.tasaCambio : 0);
      const bs = r.montoVES || (usd * (r.tasaCambio || exchangeRate));
      const details = { fechaTransaccion: r.fechaTransaccion, moneda: r.moneda, metodoPago: r.metodoPago, cuenta: r.cuenta, montoVES: r.montoVES, montoUSD: r.montoUSD, fechaTasa: r.fechaTasa, tasaCambio: r.tasaCambio, cuota: r.cuota, orden: r.orden, factura: r.factura, sucursal: r.sucursal, montoAsignado: r.montoAsignado };
      return {
        fecha: (r.fechaTransaccion.match(/^\d{4}-\d{2}-\d{2}/)?.[0]) || new Date().toISOString().slice(0,10),
        banco: r.cuenta || `Cashea / ${r.metodoPago || 'Liquidación'}`,
        tipo: 'credito_ingreso',
        referencia: r.referencia || `CASHEA-${r.factura}-${r.cuota}`,
        descripcion: `Liquidación Cashea Excel · Factura ${r.factura || 'sin factura'} · Cuota ${r.cuota || 'N/D'} · Orden ${r.orden || 'N/D'}`,
        monto_bs: bs,
        monto_usd: usd,
        estado_conciliacion: matched ? 'conciliado' : 'pendiente',
        vinculado_tipo: matched ? 'venta' : 'otro',
        vinculado_id: matched ? r.matchedSaleId : undefined,
        notas: `CASHEA_EXCEL_ROW:${JSON.stringify(details)}${matched ? ' | Factura vinculada a venta Cashea' : ' | No se encontró coincidencia automática con una venta Cashea'}`,
      } as Omit<BankMovement, 'id' | 'created_at'>;
    });
    const count = importBankMovements(movements);
    const abonos = toImport.filter((r) => r.matchStatus === 'matched' && !!r.matchedSaleId).map((r) => ({
      saleId: r.matchedSaleId!, fecha: r.fechaTransaccion, referencia: r.referencia || `CASHEA-${r.factura}-${r.cuota}`,
      factura: r.factura, cuota: r.cuota, orden: r.orden, montoUsd: r.montoAsignado,
      montoVes: r.montoVES, tasaCambio: r.tasaCambio, metodoPago: r.metodoPago, cuenta: r.cuenta, sucursal: r.sucursal,
    }));
    const applied = applyCasheaExcelAbonos(abonos);
    setImported(count); setAppliedAbonos(applied); setError('');
  };

  const matchedCount = rows.filter(r => r.matchStatus === 'matched').length;
  const duplicateCount = rows.filter(r => r.matchStatus === 'duplicate').length;
  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/60 flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-6xl max-h-[94vh] overflow-hidden bg-white rounded-2xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-200">
          <div className="flex items-center gap-3"><div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl"><FileSpreadsheet className="w-5 h-5" /></div><div><h2 className="font-black text-slate-900">Conciliación Cashea por Excel</h2><p className="text-xs text-slate-500">Carga el reporte de liquidaciones, revisa las facturas y detecta duplicados.</p></div></div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4">
            <div className="text-xs text-amber-950"><p className="font-bold">Formato requerido</p><p>Primera hoja del Excel con encabezados como Fecha de Transaccion, Moneda, Método de pago, # Referencia, # Cuota Pagada, # Orden, # Factura y Monto asignado.</p>{fileName && <p className="mt-1 font-semibold">Archivo: {fileName}</p>}</div>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void parseFile(f); e.currentTarget.value = ''; }} />
            <button onClick={() => inputRef.current?.click()} disabled={busy} className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-50"><UploadCloud className="w-4 h-4" />{busy ? 'Leyendo archivo…' : 'Seleccionar Excel'}</button>
          </div>
          {error && <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
          {imported !== null && <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"><CheckCircle2 className="w-4 h-4 shrink-0" /><div><p className="font-bold">Importación registrada</p><p>Se añadieron {imported} transacciones. Se aplicaron {appliedAbonos} abonos individuales a facturas Cashea y se redujo su saldo pendiente. Las filas sin coincidencia quedan para revisión.</p></div></div>}
          {rows.length > 0 && <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-slate-500 font-bold">Filas leídas</p><p className="text-xl font-black">{rows.length}</p></div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-[10px] uppercase text-emerald-700 font-bold">Coincidencias</p><p className="text-xl font-black text-emerald-800">{matchedCount}</p></div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-[10px] uppercase text-amber-700 font-bold">Por revisar</p><p className="text-xl font-black text-amber-800">{rows.filter(r=>r.matchStatus==='unmatched').length}</p></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] uppercase text-slate-500 font-bold">Duplicados omitidos</p><p className="text-xl font-black">{duplicateCount}</p></div>
            </div>
            <div className="overflow-auto border border-slate-200 rounded-xl max-h-[42vh]"><table className="w-full text-left text-[11px] whitespace-nowrap"><thead className="sticky top-0 bg-slate-100 text-slate-600 uppercase"><tr>{['Estado','Fecha transacción','Referencia','Cuota','Orden','Factura','Monto VES','Monto USD','Asignado USD','Sucursal'].map(h=><th key={h} className="px-3 py-2">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{preview.map((r,i)=><tr key={`${r.referencia}-${r.factura}-${i}`} className="hover:bg-slate-50"><td className="px-3 py-2">{r.matchStatus==='matched'?<span className="text-emerald-700 font-bold">Coincide</span>:r.matchStatus==='duplicate'?<span className="text-slate-500 font-bold">Duplicado</span>:<span className="text-amber-700 font-bold">Sin coincidencia</span>}</td><td className="px-3 py-2">{r.fechaTransaccion}</td><td className="px-3 py-2 font-mono">{r.referencia}</td><td className="px-3 py-2">{r.cuota}</td><td className="px-3 py-2">{r.orden}</td><td className="px-3 py-2 font-bold">{r.factura}</td><td className="px-3 py-2 text-right">{r.montoVES.toLocaleString('es-VE',{minimumFractionDigits:2})}</td><td className="px-3 py-2 text-right">{r.montoUSD.toFixed(2)}</td><td className="px-3 py-2 text-right font-bold">{r.montoAsignado.toFixed(2)}</td><td className="px-3 py-2">{r.sucursal}</td></tr>)}</tbody></table></div>
            {rows.length > 100 && <p className="text-[11px] text-slate-500">Vista previa limitada a 100 filas; la importación incluirá las {rows.length} filas.</p>}
          </>}
        </div>
        <div className="flex items-center justify-between gap-3 p-4 border-t border-slate-200 bg-slate-50"><p className="text-[10px] text-slate-500">La coincidencia automática se hace por número de factura o número de orden. Revisa las filas sin coincidencia antes de usarlas en reportes.</p><div className="flex gap-2"><button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-700">Cerrar</button><button onClick={handleImport} disabled={!rows.length || busy || imported !== null || rows.every(r=>r.matchStatus==='duplicate')} className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold disabled:opacity-40">Importar {rows.filter(r=>r.matchStatus!=='duplicate').length} transacciones</button></div></div>
      </div>
    </div>
  );
};
