import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Plus, RefreshCw } from 'lucide-react';
type Patient = { id: string; first_name: string; last_name: string; national_id?: string; phone?: string; email?: string } | null;
type Line = { description: string; quantity: string; unitPrice: string };
const blankLine = (): Line => ({ description: '', quantity: '1', unitPrice: '' });
const money = (value: number) => value.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const HealthBilling: React.FC<{ patient: Patient }> = ({ patient }) => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [provider, setProvider] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [applyTax, setApplyTax] = useState(false);
  const [taxRate, setTaxRate] = useState('16');
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentCurrency, setPaymentCurrency] = useState<'USD' | 'VES'>('USD');
  const [paymentMethod, setPaymentMethod] = useState('Efectivo USD');
  const [paymentReference, setPaymentReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const headers = useCallback(() => ({ 'Content-Type': 'application/json', 'x-company-id': localStorage.getItem('nexoss_active_company_id') || '' }), []);
  const load = useCallback(async () => {
    const response = await fetch('/api/health/invoices', { headers: headers() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudieron cargar las facturas.');
    setInvoices(data.invoices || []);
  }, [headers]);
  useEffect(() => { void load().catch((e) => setError(e.message)); }, [load]);
  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.unitPrice) || 0), 0), [lines]);
  const tax = applyTax ? subtotal * Math.max(0, Number(taxRate) || 0) / 100 : 0;
  const total = subtotal + tax;
  const update = (index: number, field: keyof Line, value: string) => setLines((current) => current.map((line, i) => i === index ? { ...line, [field]: value } : line));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setNotice('');
    if (!patient) return setError('Selecciona primero un paciente en la sección Pacientes.');
    if (!provider.trim()) return setError('Indica el profesional responsable.');
    if (!lines.length || lines.some((line) => !line.description.trim() || !(Number(line.quantity) > 0) || !(Number(line.unitPrice) >= 0))) return setError('Completa los servicios, cantidades y precios.');
    setBusy(true);
    try {
      const response = await fetch('/api/health/invoices', { method: 'POST', headers: headers(), body: JSON.stringify({
        patientId: patient.id, providerName: provider, items: lines.map((line) => ({ description: line.description, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) })),
        exchangeRate: Number(exchangeRate), applyTax, taxRate: Number(taxRate), paidAmount: Number(paidAmount || 0),
        paymentCurrency, paymentMethod, paymentReference,
      }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo emitir la factura.');
      setNotice(`Factura NEXOSS ${data.invoice.numero_factura} emitida correctamente.`);
      setLines([blankLine()]); setPaidAmount(''); setPaymentReference('');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo emitir la factura.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5">
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Facturación y Caja</h2><p className="mt-1 text-sm text-slate-500">Factura servicios y tratamientos con la numeración de ventas de NEXOSS, sin descontar mercancía.</p></div><button type="button" onClick={() => void load().catch((e) => setError(e.message))} className="rounded-lg border px-3 py-2 text-sm"><RefreshCw className="mr-1 inline h-4 w-4"/>Actualizar</button></div>
      {patient ? <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><strong>Paciente:</strong> {patient.first_name} {patient.last_name} {patient.national_id ? `· ${patient.national_id}` : ''}</p> : <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Selecciona un paciente en Pacientes antes de emitir la factura.</p>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-4">
        <label className="block text-sm">Profesional responsable<input value={provider} onChange={(e) => setProvider(e.target.value)} required className="mt-1 w-full rounded-lg border p-2"/></label>
        <div className="space-y-2"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Servicios y tratamientos</h3><button type="button" onClick={() => setLines((v) => [...v, blankLine()])} className="text-sm font-semibold text-teal-800"><Plus className="mr-1 inline h-4 w-4"/>Agregar renglón</button></div>
          {lines.map((line, index) => <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_90px_130px_auto]"><input aria-label="Servicio o tratamiento" placeholder="Consulta, terapia, procedimiento…" value={line.description} onChange={(e) => update(index, 'description', e.target.value)} className="rounded-lg border p-2 text-sm"/><input aria-label="Cantidad" type="number" min="0.01" step="0.01" value={line.quantity} onChange={(e) => update(index, 'quantity', e.target.value)} className="rounded-lg border p-2 text-sm"/><input aria-label="Precio unitario USD" type="number" min="0" step="0.01" placeholder="Precio USD" value={line.unitPrice} onChange={(e) => update(index, 'unitPrice', e.target.value)} className="rounded-lg border p-2 text-sm"/><button type="button" disabled={lines.length === 1} onClick={() => setLines((v) => v.filter((_, i) => i !== index))} className="rounded-lg border px-3 text-sm disabled:opacity-30">Quitar</button></div>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Tasa de cambio aplicada<input type="number" min="0.0001" step="0.0001" required value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} placeholder="Indica la tasa BCV" className="mt-1 w-full rounded-lg border p-2"/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={applyTax} onChange={(e) => setApplyTax(e.target.checked)}/> Aplicar impuesto</label>{applyTax && <label className="text-sm">Alícuota (%)<input type="number" min="0.01" max="100" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="mt-1 w-full rounded-lg border p-2"/></label>}</div>
        <div className="rounded-lg bg-slate-50 p-3 text-sm"><p>Subtotal: <strong>${money(subtotal)}</strong></p><p>Impuesto: <strong>${money(tax)}</strong></p><p className="mt-1 text-lg">Total: <strong>${money(total)}</strong></p></div>
        <div className="border-t pt-4"><h3 className="font-semibold">Registrar cobro o abono</h3><p className="text-xs text-slate-500">Deja el monto en cero si la factura queda pendiente. El importe se interpreta en la moneda seleccionada.</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><input aria-label="Monto recibido" type="number" min="0" step="0.01" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder="Monto recibido" className="rounded-lg border p-2 text-sm"/><select value={paymentCurrency} onChange={(e) => setPaymentCurrency(e.target.value as 'USD'|'VES')} className="rounded-lg border p-2 text-sm"><option value="USD">USD</option><option value="VES">Bolívares</option></select><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="rounded-lg border p-2 text-sm"><option>Efectivo USD</option><option>Efectivo Bs</option><option>Pago Móvil</option><option>Punto de Venta</option><option>Transferencia</option><option>Zelle</option><option>Otro</option></select><input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Referencia (opcional)" className="rounded-lg border p-2 text-sm"/></div></div>
        <button type="submit" disabled={busy || !patient} className="rounded-lg bg-[#102b4c] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><FileText className="mr-1 inline h-4 w-4"/>{busy ? 'Emitiendo…' : 'Emitir factura NEXOSS'}</button>
      </form>
    </section>
    <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Facturas de servicios y tratamientos</h2>{invoices.length ? <div className="mt-3 space-y-2">{invoices.map((invoice) => <article key={invoice.id} className="rounded-lg border p-3"><div className="flex flex-wrap justify-between gap-2"><strong>Factura {invoice.numero_factura}</strong><span className="text-sm">{new Date(invoice.fecha).toLocaleString('es-VE')}</span></div><p className="mt-1 text-sm">{invoice.cliente_nombre} {invoice.cliente_apellido} · ${money(Number(invoice.total_usd))} · {invoice.estado}</p><p className="mt-1 text-xs text-slate-500">{(invoice.items || []).map((item: any) => item.nombre_producto).join(' · ')}</p></article>)}</div> : <p className="mt-3 text-sm text-slate-500">Todavía no hay facturas clínicas.</p>}</section>
  </div>;
};
