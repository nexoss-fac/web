import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, CalendarClock, CheckCircle2, ClipboardList, RefreshCw, Store, Wallet } from 'lucide-react';
import { PushNotificationSettings } from '../common/PushNotificationSettings';

type Member = { userId: string; email: string; displayName: string; role: string };
type Client = { document: string; name: string; phone: string; address: string; invoices: number; collectorUid: string };
type SaleOption = { id: string; numero_factura: string; cliente_nombre: string; cliente_apellido: string; cliente_rif: string; total_usd: number; fecha: string };
type AssignedClient = { client_document: string; client_name: string; client_address?: string; collector_uid: string; };
type Task = { sale_id: string; invoice_number: string; client_name: string; client_document: string; client_address?: string; client_phone?: string; collector_uid?: string; payments?: Array<{id:string;amount_usd:number;amount_bs:number;exchange_rate:number;method:string;reference:string;paid_at:string}>; due_at: string; dispatched_at: string; visit_due_at: string; visit_completed_at: string | null; status: string; total: number; paid: number; balance: number };
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Error HTTP ${response.status}`);
  return data as T;
}

export const CollectionsPanel: React.FC<{ companyId: string; role: string }> = ({ companyId, role }) => {
  const isAdmin = role === 'owner' || role === 'admin';
  const [clients, setClients] = useState<Client[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [sales, setSales] = useState<SaleOption[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assignedClients, setAssignedClients] = useState<AssignedClient[]>([]);
  const [selectedSale, setSelectedSale] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [amountsBs, setAmountsBs] = useState<Record<string, string>>({});
  const [rates, setRates] = useState<Record<string, string>>({});
  const [methods, setMethods] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const taskData = await request<{ tasks: Task[] }>('/api/collections/tasks');
      setTasks(taskData.tasks || []);
      if (!isAdmin) {
        const assignmentData = await request<{ assignments: AssignedClient[] }>('/api/collections/assignments');
        setAssignedClients(assignmentData.assignments || []);
      } else {
        setAssignedClients([]);
      }
      if (isAdmin) {
        const [clientData, memberData, saleData] = await Promise.all([
          request<{ clients: Client[] }>('/api/collections/clients'),
          request<{ members: Member[] }>('/api/company/members'),
          request<{ sales: SaleOption[] }>('/api/collections/eligible-sales'),
        ]);
        setClients(clientData.clients || []);
        setMembers((memberData.members || []).filter((member) => member.role === 'collector'));
        setSales(saleData.sales || []);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cargar el módulo de cobranza.'); }
  }, [isAdmin, companyId]);

  useEffect(() => { void load(); }, [load]);

  const assign = async (client: Client, collectorUid: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      if (!collectorUid) await request(`/api/collections/assignments/${encodeURIComponent(client.document)}`, { method: 'DELETE' });
      else await request(`/api/collections/assignments/${encodeURIComponent(client.document)}`, { method: 'PUT', body: JSON.stringify({ collectorUid, clientName: client.name, clientAddress: client.address || '' }) });
      setNotice('Asignación actualizada.'); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar la asignación.'); }
    finally { setBusy(false); }
  };

  const registerDispatch = async () => {
    if (!selectedSale) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request('/api/collections/dispatch', { method: 'POST', body: JSON.stringify({ saleId: selectedSale }) });
      setSelectedSale(''); setNotice('Despacho registrado. Cobranza a 15 días y visita de anaqueles programadas.'); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo registrar el despacho.'); }
    finally { setBusy(false); }
  };

  const registerPayment = async (task: Task) => {
    const amountBs = Number(amountsBs[task.sale_id] || 0);
    const exchangeRate = Number(rates[task.sale_id] || 1);
    const amountUsd = Number(amounts[task.sale_id] || 0) || (amountBs > 0 && exchangeRate > 0 ? amountBs / exchangeRate : 0);
    if (!(amountUsd > 0)) { setError('Indica un monto de abono mayor que cero.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request<{ remaining: number }>(`/api/collections/payments/${encodeURIComponent(task.sale_id)}`, {
        method: 'POST',
        body: JSON.stringify({ amountUsd, amountBs, exchangeRate, method: methods[task.sale_id] || 'Transferencia', reference: references[task.sale_id] || '' }),
      });
      setNotice(result.remaining <= 0.01 ? 'Factura pagada. Se cerró su seguimiento de cobranza.' : `Abono registrado. Saldo restante: $${result.remaining.toFixed(2)}.`);
      setAmounts((old) => ({ ...old, [task.sale_id]: '' })); setAmountsBs((old) => ({ ...old, [task.sale_id]: '' })); setReferences((old) => ({ ...old, [task.sale_id]: '' }));
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo registrar el abono.'); }
    finally { setBusy(false); }
  };

  const completeVisit = async (task: Task) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`/api/collections/visits/${encodeURIComponent(task.sale_id)}`, { method: 'POST', body: JSON.stringify({ note: 'Visita de anaqueles realizada por administrador.' }) });
      setNotice(`Visita de anaqueles registrada para ${task.client_name}.`); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo registrar la visita.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-900 p-5 text-white shadow-sm sm:p-7">
        <div className="flex items-center gap-3"><div className="rounded-xl bg-white/10 p-3"><Wallet className="h-6 w-6" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-200">Macizo Natural · Gestión comercial</p><h1 className="text-2xl font-black">Cobranza y seguimiento</h1></div></div>
        <p className="mt-3 max-w-2xl text-sm text-indigo-100">{isAdmin ? 'Asigna clientes, registra despachos y supervisa cobros y visitas de anaqueles.' : 'Aquí aparecen únicamente los clientes y facturas que el administrador te asignó.'}</p>
      </header>

      <PushNotificationSettings mode="settings" />
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      {isAdmin && <>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><ClipboardList className="h-5 w-5 text-indigo-600" /><h2 className="font-bold text-slate-900">Asignación de cartera</h2></div>
          {members.length === 0 && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Todavía no hay cobradores. Invita primero a un usuario con el rol «Cobrador» desde Administración → Equipo.</p>}
          <div className="divide-y divide-slate-100">
            {clients.map((client) => <div key={client.document} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1"><p className="font-semibold text-slate-800">{client.name}</p><p className="text-xs text-slate-500">{client.document} · {client.invoices} factura(s)</p><input aria-label="Dirección del cliente" value={client.address || ""} onChange={(event) => setClients((old) => old.map((item) => item.document === client.document ? { ...item, address: event.target.value } : item))} onBlur={() => { const current = clients.find((item) => item.document === client.document); if (current) void request(`/api/collections/clients/${encodeURIComponent(client.document)}/address`, { method: 'PUT', body: JSON.stringify({ address: current.address || '' }) }).then(() => setNotice('Dirección guardada.')).catch((err) => setError(err instanceof Error ? err.message : 'No se pudo guardar la dirección.')); }} placeholder="Dirección del cliente / supermercado" className="mt-2 w-full max-w-xl rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
              <select disabled={busy || members.length === 0} value={client.collectorUid} onChange={(event) => void assign(client, event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">Sin asignar</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName || member.email}</option>)}
              </select>
            </div>)}
            {clients.length === 0 && <p className="py-5 text-sm text-slate-500">Los clientes aparecerán aquí cuando tengan ventas registradas.</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2"><Store className="h-5 w-5 text-indigo-600" /><h2 className="font-bold text-slate-900">Confirmar despacho a crédito</h2></div>
          <p className="mb-3 text-sm text-slate-500">Al confirmar la entrega, NEXOSS inicia el plazo de 15 días y programa la revisión de anaqueles para 3 días después.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={selectedSale} onChange={(event) => setSelectedSale(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
              <option value="">Seleccionar factura a crédito pendiente de despacho</option>
              {sales.map((sale) => <option key={sale.id} value={sale.id}>{sale.numero_factura} · {[sale.cliente_nombre, sale.cliente_apellido].filter(Boolean).join(' ')} · ${Number(sale.total_usd).toFixed(2)}</option>)}
            </select>
            <button type="button" disabled={busy || !selectedSale} onClick={() => void registerDispatch()} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Confirmar despacho</button>
          </div>
        </section>
      </>}

      {!isAdmin && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2"><ClipboardList className="h-5 w-5 text-indigo-600"/><h2 className="font-bold text-slate-900">Mis clientes asignados</h2></div>
        <p className="mb-3 text-xs text-slate-500">Aquí aparecen los clientes que te asignó el administrador. Las facturas se mostrarán en cobranzas cuando se confirme su despacho a crédito.</p>
        <div className="space-y-2">{assignedClients.map((client) => <article key={client.client_document} className="rounded-xl border border-slate-200 p-3"><p className="font-semibold text-slate-900">{client.client_name || 'Cliente sin nombre'}</p><p className="text-xs text-slate-500">{client.client_document}</p>{client.client_address && <p className="mt-1 text-xs text-slate-600">{client.client_address}</p>}</article>)}{assignedClients.length === 0 && <p className="py-5 text-center text-sm text-slate-500">Todavía no tienes clientes asignados. Solicita al administrador que revise tu asignación.</p>}</div>
      </section>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-indigo-600" /><h2 className="font-bold text-slate-900">{isAdmin ? 'Todas las cuentas y visitas' : 'Mis cobranzas asignadas'}</h2></div><button type="button" onClick={() => void load()} className="rounded-lg border border-slate-200 p-2 text-slate-600" aria-label="Actualizar"><RefreshCw className="h-4 w-4" /></button></div>
        <div className="space-y-3">
          {tasks.map((task) => <article key={task.sale_id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold text-slate-900">{task.client_name}</p><p className="text-xs text-slate-500">Factura {task.invoice_number} · {task.client_document}</p><p className="mt-1 text-xs text-slate-600">Dirección: {task.client_address || "Pendiente de registrar"}</p><p className="text-xs text-slate-600">Teléfono: {task.client_phone || "No registrado"}</p><p className="text-xs text-slate-600">Cobrador: {members.find((member) => member.userId === task.collector_uid)?.displayName || task.collector_uid || "Sin asignar"}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${task.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : new Date(task.due_at) < new Date() ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{task.status === 'paid' ? 'Pagada' : new Date(task.due_at) < new Date() ? 'Vencida' : 'Pendiente'}</span></div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><p className="text-xs text-slate-500">Total</p><p className="font-semibold">${task.total.toFixed(2)}</p></div><div><p className="text-xs text-slate-500">Abonado</p><p className="font-semibold">${task.paid.toFixed(2)}</p></div><div><p className="text-xs text-slate-500">Saldo</p><p className="font-bold text-rose-700">${task.balance.toFixed(2)}</p></div><div><p className="text-xs text-slate-500">Vence</p><p className="font-semibold">{new Date(task.due_at).toLocaleDateString()}</p></div></div>
            <details className="mt-3 rounded-lg bg-slate-50 p-3"><summary className="cursor-pointer text-xs font-bold text-slate-700">Historial de abonos ({task.payments?.length || 0})</summary><div className="mt-2 space-y-2">{(task.payments || []).map((payment) => <div key={payment.id} className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-2 text-xs"><span>{new Date(payment.paid_at).toLocaleString()} · {payment.method} {payment.reference ? "· Ref. " + payment.reference : ""}</span><strong>${Number(payment.amount_usd).toFixed(2)} {Number(payment.amount_bs)>0 ? "/ Bs. " + Number(payment.amount_bs).toFixed(2) : ""}</strong></div>)}</div></details>
            {task.status !== 'paid' && <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
              <input aria-label="Abono en dólares" type="number" min="0.01" step="0.01" max={task.balance} value={amounts[task.sale_id] || ''} onChange={(event) => setAmounts((old) => ({ ...old, [task.sale_id]: event.target.value }))} placeholder="Abono USD" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input aria-label="Abono en bolívares" type="number" min="0" step="0.01" value={amountsBs[task.sale_id] || ''} onChange={(event) => setAmountsBs((old) => ({ ...old, [task.sale_id]: event.target.value }))} placeholder="Abono Bs (opcional)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input aria-label="Tasa de cambio del abono" type="number" min="0.0001" step="0.0001" value={rates[task.sale_id] || ''} onChange={(event) => setRates((old) => ({ ...old, [task.sale_id]: event.target.value }))} placeholder="Tasa Bs/USD" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <select aria-label="Método de cobro" value={methods[task.sale_id] || 'Transferencia'} onChange={(event) => setMethods((old) => ({ ...old, [task.sale_id]: event.target.value }))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option>Efectivo USD</option><option>Efectivo Bs</option><option>Pago Móvil</option><option>Transferencia</option><option>Punto de Venta</option></select>
              <input aria-label="Referencia del cobro" value={references[task.sale_id] || ''} onChange={(event) => setReferences((old) => ({ ...old, [task.sale_id]: event.target.value }))} placeholder="Referencia" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button type="button" disabled={busy} onClick={() => void registerPayment(task)} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Registrar abono</button>
            </div>}
            {isAdmin && !task.visit_completed_at && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-600">Visita de anaqueles: {new Date(task.visit_due_at).toLocaleDateString()}</p><button type="button" disabled={busy} onClick={() => void completeVisit(task)} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700"><CheckCircle2 className="h-4 w-4" /> Registrar visita</button></div>}
          </article>)}
          {tasks.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No hay cobranzas pendientes asignadas.</p>}
        </div>
      </section>
    </div>
  );
};
