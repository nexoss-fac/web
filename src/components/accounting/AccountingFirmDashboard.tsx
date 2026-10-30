import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Check, Clock3, FileText, RefreshCw, ShieldCheck, X } from 'lucide-react';

type Grant = {
  id: string; status: 'requested' | 'active' | 'rejected' | 'revoked'; scopes: string[];
  legal_name?: string; trade_name?: string; rif?: string; firm_company_id?: string; client_company_id?: string;
};
type Props = { companyId: string; companyName: string; onOpenBilling: () => void; onOpenAccounting: () => void };

const SCOPE_LABELS: Record<string, string> = {
  journal_read: 'Libro diario', ledger_read: 'Libro mayor', purchases_read: 'Compras',
  sales_read: 'Ventas', expenses_read: 'Gastos', reports_read: 'Reportes',
  reconciliation_write: 'Conciliación bancaria', journal_write: 'Registrar asientos',
  tax_read: 'Impuestos', closures_write: 'Cierres contables',
};

export const AccountingFirmDashboard: React.FC<Props> = ({ companyId, companyName, onOpenBilling, onOpenAccounting }) => {
  const [enabled, setEnabled] = useState(false);
  const [outgoing, setOutgoing] = useState<Grant[]>([]);
  const [incoming, setIncoming] = useState<Grant[]>([]);
  const [query, setQuery] = useState('');
  const [firms, setFirms] = useState<Array<{id:string;legal_name:string;trade_name:string;rif:string}>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/accounting-firm/status?companyId=' + encodeURIComponent(companyId));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar la firma contable.');
      setEnabled(data.enabled === true);
      setOutgoing(Array.isArray(data.outgoing) ? data.outgoing : []);
      setIncoming(Array.isArray(data.incoming) ? data.incoming : []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error de conexión.'); }
    finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const activate = async () => {
    setBusy('enable'); setError('');
    try {
      const response = await fetch('/api/accounting-firm/enable', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({companyId}) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudo activar.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo activar.'); }
    finally { setBusy(''); }
  };

  const searchFirms = async () => {
    setBusy('search'); setError('');
    try {
      const params = new URLSearchParams({companyId, q:query});
      const response = await fetch('/api/accounting-firm/directory?' + params);
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudo buscar.');
      setFirms(Array.isArray(data.firms) ? data.firms : []);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo buscar.'); }
    finally { setBusy(''); }
  };

  const requestFirm = async (clientCompanyId: string) => {
    setBusy(clientCompanyId); setError('');
    try {
      const response = await fetch('/api/accounting-firm/request', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firmCompanyId:companyId,clientCompanyId,scopes:['journal_read','ledger_read','reports_read','purchases_read','sales_read','expenses_read','tax_read']})});
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudo solicitar acceso.');
      setFirms([]); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo solicitar acceso.'); }
    finally { setBusy(''); }
  };

  const decide = async (grantId: string, decision: 'approve'|'reject') => {
    setBusy(grantId); setError('');
    try {
      const response = await fetch('/api/accounting-firm/requests/' + encodeURIComponent(grantId) + '/decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientCompanyId:companyId,decision})});
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudo procesar la solicitud.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo procesar.'); }
    finally { setBusy(''); }
  };

  const revoke = async (grantId: string) => {
    if (!window.confirm('¿Revocar el acceso de esta firma contable?')) return;
    setBusy(grantId); setError('');
    try {
      const response = await fetch('/api/accounting-firm/grants/' + encodeURIComponent(grantId) + '?companyId=' + encodeURIComponent(companyId),{method:'DELETE'});
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudo revocar.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo revocar.'); }
    finally { setBusy(''); }
  };

  const activeClients = outgoing.filter(g=>g.status==='active').length;
  const pendingIncoming = incoming.filter(g=>g.status==='requested').length;

  return <div className="mx-auto max-w-7xl space-y-5 p-3 sm:p-6">
    <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-900 p-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-widest text-indigo-200">NEXOSS · Firma contable</p><h2 className="mt-1 text-2xl font-black">{companyName}</h2><p className="mt-1 text-sm text-slate-200">Control de tu empresa y gestión de empresas clientes autorizadas.</p></div>
        <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs">Empresa afiliada</span>
      </div>
    </div>
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Empresas clientes autorizadas</p><p className="mt-1 text-3xl font-bold">{activeClients}</p></div>
      <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Solicitudes recibidas</p><p className="mt-1 text-3xl font-bold">{pendingIncoming}</p></div>
      <button onClick={onOpenBilling} className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-indigo-300"><p className="flex items-center gap-2 text-xs text-slate-500"><FileText className="h-4 w-4"/> Facturación propia</p><p className="mt-2 text-sm font-bold text-indigo-700">Abrir facturación de mi empresa →</p></button>
      <button onClick={onOpenAccounting} className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-indigo-300"><p className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4"/> Mi contabilidad</p><p className="mt-2 text-sm font-bold text-indigo-700">Abrir libros de PANTENTADOC →</p></button>
    </div>

    {!enabled && <section className="rounded-xl border border-indigo-200 bg-white p-5"><h3 className="font-bold">Activar servicios de firma contable</h3><p className="mt-1 text-sm text-slate-600">Activa el perfil para que otras empresas puedan localizar a {companyName} y enviarle solicitudes. Esto no concede acceso automático a ninguna empresa.</p><button disabled={busy==='enable'} onClick={activate} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy==='enable'?'Activando…':'Activar perfil de firma'}</button></section>}

    {enabled && <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3"><div><h3 className="font-bold">Buscar una empresa para solicitar autorización</h3><p className="text-xs text-slate-500">La empresa debe aprobar la solicitud antes de que puedas acceder a su contabilidad.</p></div><div className="flex flex-col gap-2 sm:flex-row"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Razón social, nombre comercial o RIF" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"/><button onClick={searchFirms} disabled={busy==='search'} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy==='search'?'Buscando…':'Buscar empresas'}</button></div>{firms.map(f=><div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3"><div><p className="text-sm font-semibold">{f.trade_name||f.legal_name}</p><p className="text-xs text-slate-500">{f.rif||'Sin RIF registrado'}</p></div><button onClick={()=>requestFirm(f.id)} disabled={Boolean(busy)} className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 disabled:opacity-50">Solicitar autorización</button></div>)}</section>}

    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="mb-3 flex items-center justify-between"><h3 className="font-bold">Empresas clientes que gestiono</h3><button onClick={load} className="text-xs text-indigo-600"><RefreshCw className="inline h-3 w-3"/> Actualizar</button></div>{loading?<p className="text-sm text-slate-500">Cargando…</p>:outgoing.length===0?<p className="text-sm text-slate-500">Aún no tienes empresas clientes autorizadas.</p>:outgoing.map(g=><div key={g.id} className="border-t border-slate-100 py-3"><div className="flex items-center justify-between gap-2"><div><p className="text-sm font-semibold">{g.trade_name||g.legal_name}</p><p className="text-xs text-slate-500">{g.rif||''}</p></div><span className={'rounded-full px-2 py-1 text-xs '+(g.status==='active'?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700')}>{g.status}</span></div><p className="mt-1 text-xs text-slate-500">{(g.scopes||[]).map(s=>SCOPE_LABELS[s]||s).join(' · ')}</p>{g.status==='active'&&<p className="mt-2 text-xs text-slate-600">Para entrar a los libros, cambia al tenant del cliente solo después de implementar el contexto de acceso delegado.</p>}</div>)}</section>
      <section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="mb-3 font-bold">Solicitudes de acceso recibidas</h3>{loading?<p className="text-sm text-slate-500">Cargando…</p>:incoming.filter(g=>g.status==='requested').length===0?<p className="text-sm text-slate-500">No hay solicitudes pendientes.</p>:incoming.filter(g=>g.status==='requested').map(g=><div key={g.id} className="border-t border-slate-100 py-3"><p className="text-sm font-semibold">{g.trade_name||g.legal_name}</p><p className="mt-1 text-xs text-slate-500">{(g.scopes||[]).map(s=>SCOPE_LABELS[s]||s).join(' · ')}</p><div className="mt-2 flex gap-2"><button disabled={Boolean(busy)} onClick={()=>decide(g.id,'approve')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"><Check className="mr-1 inline h-3 w-3"/> Aprobar</button><button disabled={Boolean(busy)} onClick={()=>decide(g.id,'reject')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"><X className="mr-1 inline h-3 w-3"/> Rechazar</button></div></div>)}</section>
    </div>
    <p className="flex items-center gap-2 text-xs text-slate-500"><Clock3 className="h-4 w-4"/> La facturación y contabilidad propia de la firma continúan dentro de su empresa afiliada, separadas de los datos de sus clientes.</p>
  </div>;
};
