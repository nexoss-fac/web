import React, { useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Loader2, Plus, ScanLine, Trash2, Upload, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import type { ShoeProduct } from '../../types';
import { getSaleDateKey, getTodayVenezuela } from '../../utils/dateUtils';

type InvoiceLine = {
  description: string; sku: string; barcode: string; quantity: number; unit: string;
  unitCost: number; discount: number; taxableBase: number; taxRate: number; taxAmount: number;
  lineTotal: number; inventoryClassification: string; confidence: string;
};
type InvoiceDraft = {
  documentType: string; supplierName: string; supplierTaxId: string; invoiceNumber: string;
  controlNumber: string; issueDate: string; currency: 'USD' | 'VES' | ''; exchangeRate: number;
  subtotal: number; discountTotal: number; taxableBase: number; exemptBase: number; taxTotal: number;
  grandTotal: number; lines: InvoiceLine[]; confidence: string; warnings: string[]; sourceModel: string;
};
type Mapping = { productId: string; unitFactor: string };
const blankLine = (): InvoiceLine => ({
  description: '', sku: '', barcode: '', quantity: 0, unit: '', unitCost: 0, discount: 0,
  taxableBase: 0, taxRate: 0, taxAmount: 0, lineTotal: 0,
  inventoryClassification: 'Por clasificar', confidence: 'baja',
});
const numberValue = (value: string) => Number(value) || 0;
const normalize = (value: string) => value.trim().toLocaleLowerCase('es');

function suggestedProduct(line: InvoiceLine, products: ShoeProduct[]): string {
  const code = normalize(line.sku || line.barcode);
  if (code) {
    const exact = products.filter((product) => normalize(product.sku || '') === code);
    if (exact.length === 1) return exact[0].id;
  }
  const name = normalize(line.description);
  if (name) {
    const exact = products.filter((product) => normalize(product.nombre || '') === name);
    if (exact.length === 1) return exact[0].id;
  }
  return '';
}

export const PurchaseInvoiceScanner: React.FC<{ onClose: () => void; onConfirmed: () => Promise<void> | void }> = ({ onClose, onConfirmed }) => {
  const { products, exchangeRate, historicalRates, sales, expenses } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [rate, setRate] = useState(String(exchangeRate || ''));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const activeProducts = useMemo(() => products.filter((product) => product.activo !== false), [products]);
  const getKnownRateForDate = (date: string): number => {
    if (!date) return 0;
    const key = getSaleDateKey(date);
    if (key === getTodayVenezuela() && exchangeRate > 0) return exchangeRate;
    if (Number(historicalRates[key] || 0) > 0) return Number(historicalRates[key]);
    const sale = sales.find((item) => item.fecha && getSaleDateKey(item.fecha) === key && Number(item.tasa_cambio) > 0);
    if (sale) return Number(sale.tasa_cambio);
    const expense = expenses.find((item) => item.fecha && getSaleDateKey(item.fecha) === key && Number(item.tasa_cambio) > 0);
    if (expense) return Number(expense.tasa_cambio);
    const previous = Object.keys(historicalRates).filter((item) => item <= key).sort().pop();
    return previous && Number(historicalRates[previous] || 0) > 0 ? Number(historicalRates[previous]) : 0;
  };
  const updateHeader = (field: keyof InvoiceDraft, value: any) => setDraft((current) => current ? { ...current, [field]: value } : current);
  const updateLine = (index: number, field: keyof InvoiceLine, value: any) => setDraft((current) => {
    if (!current) return current;
    const lines = current.lines.map((line, i) => i === index ? { ...line, [field]: value } : line);
    return { ...current, lines };
  });
  const updateMapping = (index: number, field: keyof Mapping, value: string) => setMappings((current) =>
    current.map((mapping, i) => i === index ? { ...mapping, [field]: value } : mapping)
  );

  const readFile = async (file: File) => {
    setError(''); setSuccess(''); setDraft(null); setMappings([]);
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/i.test(file.type)) {
      setError('Formato no compatible. Selecciona una imagen JPG, PNG, WEBP o un PDF.');
      return;
    }
    if (file.size > 18 * 1024 * 1024) {
      setError('El archivo supera 18 MB. Reduce el tamaño del PDF o de la imagen e inténtalo de nuevo.');
      return;
    }
    setFileName(file.name);
    setLoading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('No se pudo leer el archivo.'));
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        reader.readAsDataURL(file);
      });
      const response = await fetch('/api/purchases/scan-invoice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentBase64: dataUrl }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'No se pudo analizar el documento.');
      const next = payload.draft as InvoiceDraft;
      setDraft(next);
      const historicalRate = next.issueDate ? getKnownRateForDate(next.issueDate) : 0;
      setRate(historicalRate > 0 ? String(historicalRate) : '');
      setMappings(next.lines.map((line) => ({ productId: suggestedProduct(line, activeProducts), unitFactor: '' })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo analizar el documento.');
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    if (!draft) return;
    setError(''); setSuccess('');
    if (draft.documentType !== 'factura') return setError('Solo se puede confirmar una factura. Las notas de entrega y otros documentos requieren un proceso distinto.');
    if (!draft.supplierName.trim() || !draft.supplierTaxId.trim() || !(draft.invoiceNumber.trim() || draft.controlNumber.trim())) {
      return setError('Completa el proveedor, su RIF y el número de factura o control.');
    }
    if (!draft.currency || !(Number(rate) > 0)) return setError('Confirma la moneda y la tasa BCV de la fecha de la factura.');
    if (draft.lines.some((line, index) => !mappings[index]?.productId || !(Number(mappings[index]?.unitFactor) > 0))) {
      return setError('Relaciona cada renglón con un producto existente e indica su factor de conversión a la unidad del inventario. No se asume una conversión 1:1.');
    }
    if (draft.lines.some((line) => !line.description.trim() || !(line.quantity > 0) || !(line.unitCost > 0) || !line.unit || line.inventoryClassification === 'Por clasificar')) {
      return setError('Completa descripción, cantidad, unidad, costo y clasificación de cada renglón.');
    }
    setSaving(true);
    try {
      const response = await fetch('/api/purchases/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft, mappings: mappings.map((item) => ({ productId: item.productId, unitFactor: Number(item.unitFactor) })), exchangeRate: Number(rate) }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'No se pudo confirmar la compra.');
      setSuccess('Compra registrada. El inventario y el asiento contable se actualizaron.');
      await onConfirmed();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo confirmar la compra.');
    } finally {
      setSaving(false);
    }
  };

  const addLine = () => {
    setDraft((current) => current ? { ...current, lines: [...current.lines, blankLine()] } : current);
    setMappings((current) => [...current, { productId: '', unitFactor: '' }]);
  };
  const removeLine = (index: number) => {
    setDraft((current) => current ? { ...current, lines: current.lines.filter((_, i) => i !== index) } : current);
    setMappings((current) => current.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-start justify-center p-2 sm:p-5 overflow-y-auto">
      <section className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl my-2 overflow-hidden">
        <header className="sticky top-0 z-10 bg-slate-900 text-white px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center"><ScanLine className="w-5 h-5 text-indigo-300" /></div>
            <div><h2 className="font-bold text-base">Registrar factura de compra</h2><p className="text-xs text-slate-300">Escaneo con IA · revisión · actualización controlada del inventario</p></div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </header>

        <div className="p-4 sm:p-6 space-y-5">
          {!draft && (
            <div className="border-2 border-dashed border-indigo-200 rounded-2xl bg-indigo-50/50 p-6 sm:p-10 text-center">
              <FileText className="w-10 h-10 text-indigo-500 mx-auto mb-3" />
              <h3 className="font-bold text-slate-800">Carga la factura del proveedor</h3>
              <p className="text-sm text-slate-500 mt-1">Fotografía, imagen o PDF. La IA extrae los datos y no registra nada hasta que revises y confirmes.</p>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); event.currentTarget.value = ''; }} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={loading} className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {loading ? 'Analizando documento…' : 'Seleccionar factura'}
              </button>
              {fileName && <p className="text-xs text-slate-500 mt-3">{fileName}</p>}
            </div>
          )}

          {draft && <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="font-bold text-slate-900">Documento extraído: {fileName}</p><p className="text-xs text-slate-500">Verifica todos los campos. La lectura de IA puede contener errores.</p></div>
              <button type="button" onClick={() => { setDraft(null); setMappings([]); setFileName(''); }} className="text-xs font-semibold text-indigo-700 hover:underline">Cambiar documento</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="text-xs font-semibold text-slate-600">Tipo de documento<select value={draft.documentType} onChange={(e) => updateHeader('documentType', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"><option value="factura">Factura</option><option value="nota_entrega">Nota de entrega</option><option value="otro">Otro</option></select></label>
              <label className="text-xs font-semibold text-slate-600">Proveedor<input value={draft.supplierName} onChange={(e) => updateHeader('supplierName', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
              <label className="text-xs font-semibold text-slate-600">RIF del proveedor<input value={draft.supplierTaxId} onChange={(e) => updateHeader('supplierTaxId', e.target.value.toUpperCase())} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
              <label className="text-xs font-semibold text-slate-600">N.º de factura<input value={draft.invoiceNumber} onChange={(e) => updateHeader('invoiceNumber', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
              <label className="text-xs font-semibold text-slate-600">N.º de control<input value={draft.controlNumber} onChange={(e) => updateHeader('controlNumber', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
              <label className="text-xs font-semibold text-slate-600">Fecha de emisión<input type="date" value={draft.issueDate} onChange={(e) => { updateHeader('issueDate', e.target.value); const historicalRate = getKnownRateForDate(e.target.value); setRate(historicalRate > 0 ? String(historicalRate) : ''); }} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
              <label className="text-xs font-semibold text-slate-600">Moneda<select value={draft.currency} onChange={(e) => updateHeader('currency', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"><option value="">Seleccionar</option><option value="USD">USD</option><option value="VES">Bolívares (VES)</option></select></label>
              <label className="text-xs font-semibold text-slate-600">Tasa BCV de la fecha<input type="number" min="0" step="0.0001" value={rate} onChange={(e) => setRate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 flex items-center justify-between gap-2"><div><h3 className="font-bold text-sm text-slate-800">Renglones de la factura</h3><p className="text-xs text-slate-500">Relaciona cada renglón con un producto existente.</p></div><button type="button" onClick={addLine} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700"><Plus className="w-4 h-4" /> Agregar línea</button></div>
              <div className="divide-y divide-slate-200">
                {draft.lines.map((line, index) => (
                  <div key={index} className="p-4 space-y-3">
                    <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-500">Renglón {index + 1}</span><button type="button" onClick={() => removeLine(index)} className="p-1 text-rose-500 hover:bg-rose-50 rounded" aria-label="Eliminar renglón"><Trash2 className="w-4 h-4" /></button></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      <label className="text-[11px] font-semibold text-slate-600 sm:col-span-2">Descripción<input value={line.description} onChange={(e) => updateLine(index, 'description', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs" /></label>
                      <label className="text-[11px] font-semibold text-slate-600">SKU / código<input value={line.sku} onChange={(e) => updateLine(index, 'sku', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs" /></label>
                      <label className="text-[11px] font-semibold text-slate-600">Clasificación<select value={line.inventoryClassification} onChange={(e) => updateLine(index, 'inventoryClassification', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"><option>Por clasificar</option><option>Materia prima</option><option>Mercancía</option><option>Productos en proceso</option><option>Productos terminados</option></select></label>
                      <label className="text-[11px] font-semibold text-slate-600">Cantidad facturada<input type="number" min="0" step="0.001" value={line.quantity || ''} onChange={(e) => updateLine(index, 'quantity', numberValue(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs" /></label>
                      <label className="text-[11px] font-semibold text-slate-600">Unidad facturada<input value={line.unit} onChange={(e) => updateLine(index, 'unit', e.target.value)} placeholder="caja, paquete, litro…" className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs" /></label>
                      <label className="text-[11px] font-semibold text-slate-600">Costo por unidad<input type="number" min="0" step="0.0001" value={line.unitCost || ''} onChange={(e) => updateLine(index, 'unitCost', numberValue(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs" /></label>
                      <label className="text-[11px] font-semibold text-slate-600">Descuento<input type="number" min="0" step="0.01" value={line.discount || 0} onChange={(e) => updateLine(index, 'discount', numberValue(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs" /></label>
                      <label className="text-[11px] font-semibold text-slate-600">Base imponible<input type="number" min="0" step="0.01" value={line.taxableBase || 0} onChange={(e) => updateLine(index, 'taxableBase', numberValue(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs" /></label>
                      <label className="text-[11px] font-semibold text-slate-600">IVA %<input type="number" min="0" step="0.01" value={line.taxRate || 0} onChange={(e) => updateLine(index, 'taxRate', numberValue(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs" /></label>
                      <label className="text-[11px] font-semibold text-slate-600">IVA del renglón<input type="number" min="0" step="0.01" value={line.taxAmount || 0} onChange={(e) => updateLine(index, 'taxAmount', numberValue(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs" /></label>
                      <label className="text-[11px] font-semibold text-slate-600">Total del renglón<input type="number" min="0" step="0.01" value={line.lineTotal || 0} onChange={(e) => updateLine(index, 'lineTotal', numberValue(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs" /></label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-lg bg-indigo-50/60 border border-indigo-100 p-3">
                      <label className="text-[11px] font-bold text-indigo-900 sm:col-span-2">Producto del inventario<select value={mappings[index]?.productId || ''} onChange={(e) => updateMapping(index, 'productId', e.target.value)} className="mt-1 w-full rounded-lg border border-indigo-200 bg-white p-2 text-xs"><option value="">Selecciona producto (obligatorio)</option>{activeProducts.map((product) => <option key={product.id} value={product.id}>{product.nombre} · SKU {product.sku} · stock {product.stock}</option>)}</select></label>
                      <label className="text-[11px] font-bold text-indigo-900">Factor a unidad de inventario<input type="number" min="0.0001" step="0.0001" value={mappings[index]?.unitFactor || ''} onChange={(e) => updateMapping(index, 'unitFactor', e.target.value)} placeholder="Ej.: 12 unidades por caja" className="mt-1 w-full rounded-lg border border-indigo-200 bg-white p-2 text-xs" /><span className="block mt-1 font-normal text-indigo-700">Cuántas unidades de inventario ingresan por cada {line.unit || 'unidad facturada'} de la factura. Entrada: {mappings[index]?.unitFactor && line.quantity > 0 ? (line.quantity * Number(mappings[index].unitFactor)).toLocaleString('es-VE') : '—'} unidades.</span></label>
                    </div>
                  </div>
                ))}
                {!draft.lines.length && <p className="p-6 text-center text-sm text-slate-500">No hay renglones. Agrega uno para continuar.</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {([
                ['subtotal','Subtotal'],['discountTotal','Descuentos'],['taxableBase','Base gravable'],
                ['exemptBase','Base exenta'],['taxTotal','IVA total'],['grandTotal','Total factura'],
              ] as [keyof InvoiceDraft,string][]).map(([field,label]) => (
                <label key={field} className="text-[11px] font-semibold text-slate-600">{label}<input type="number" min="0" step="0.01" value={Number(draft[field] || 0)} onChange={(e) => updateHeader(field, numberValue(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm font-bold" /></label>
              ))}
            </div>
            {draft.warnings.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-bold text-amber-900 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Datos que requieren revisión</p><ul className="mt-2 list-disc pl-5 text-xs text-amber-800 space-y-1">{draft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
          </>}

          {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}</div>}
          {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex gap-2"><CheckCircle2 className="w-4 h-4" />{success}</div>}
        </div>

        <footer className="sticky bottom-0 bg-white border-t border-slate-200 p-4 sm:px-6 flex items-center justify-between gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
          {draft && <button type="button" onClick={() => void confirm()} disabled={saving || loading} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {saving ? 'Registrando compra…' : 'Confirmar compra e ingresar inventario'}
          </button>}
        </footer>
      </section>
    </div>
  );
};
