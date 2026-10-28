import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowDownToLine, ArrowUpRight, CalendarDays, CheckCircle2, Clock3,
  FileBadge, FileText, LayoutGrid, ListFilter, Search, ShieldCheck, Sparkles
} from 'lucide-react';
import type { FiscalRequirement, FiscalBoardDocument } from '../../domain/fiscalBoard';

interface PublicBoard {
  companyName: string;
  updatedAt: string | null;
  requirements: FiscalRequirement[];
  documents: FiscalBoardDocument[];
}

const statusStyles: Record<string, string> = {
  Cumplido: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  Pendiente: 'border-amber-200 bg-amber-50 text-amber-800',
  'No aplica': 'border-slate-200 bg-slate-100 text-slate-600',
  Vigente: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  'Por vencer': 'border-amber-200 bg-amber-50 text-amber-800',
  Vencido: 'border-rose-200 bg-rose-50 text-rose-800',
  'En trámite': 'border-sky-200 bg-sky-50 text-sky-800',
  'Pendiente de revisión': 'border-slate-200 bg-slate-100 text-slate-700',
};

export const PublicFiscalBoard: React.FC<{ companyId: string; token: string }> = ({ companyId, token }) => {
  const [board, setBoard] = useState<PublicBoard | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'Todos' | 'Vigentes' | 'Por vencer' | 'Vencidos'>('Todos');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/public/fiscal-board/${encodeURIComponent(companyId)}/${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Cartelera no disponible');
        setBoard(await response.json() as PublicBoard);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          console.error('No se pudo cargar la cartelera fiscal pública:', cause);
          setError(true);
        }
      });
    return () => controller.abort();
  }, [companyId, token]);

  const documents = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es');
    return (board?.documents || []).filter((document) => {
      const matchesQuery = !q || [document.title, document.category, document.area, document.issuer, document.status]
        .some((value) => String(value || '').toLocaleLowerCase('es').includes(q));
      const matchesFilter = filter === 'Todos'
        || (filter === 'Vigentes' && document.status === 'Vigente')
        || (filter === 'Por vencer' && document.status === 'Por vencer')
        || (filter === 'Vencidos' && document.status === 'Vencido');
      return matchesQuery && matchesFilter;
    });
  }, [board, query, filter]);

  if (error) return <PublicPage><section className="rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-xl shadow-slate-200/50"><AlertTriangle className="mx-auto h-12 w-12 text-rose-500" /><h1 className="mt-4 text-2xl font-black text-slate-900">Cartelera no disponible</h1><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Este enlace no existe, fue revocado o no puede cargarse en este momento.</p></section></PublicPage>;
  if (!board) return <PublicPage><section className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><Sparkles className="h-7 w-7 animate-pulse" /></span><h1 className="mt-4 text-lg font-bold text-slate-800">Preparando cartelera…</h1><p className="mt-1 text-sm text-slate-500">Cargando los documentos publicados.</p></section></PublicPage>;

  const progress = board.requirements.filter((item) => item.status === 'Cumplido').length;
  const applicableCount = board.requirements.filter((item) => item.status !== 'No aplica').length;
  const validDocuments = board.documents.filter((item) => item.status === 'Vigente').length;
  const expiringDocuments = board.documents.filter((item) => item.status === 'Por vencer').length;
  const expiredDocuments = board.documents.filter((item) => item.status === 'Vencido').length;
  const progressPercent = applicableCount ? Math.round((progress / applicableCount) * 100) : 0;

  return <PublicPage>
    <header className="relative isolate overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-950 via-slate-900 to-emerald-950 p-6 text-white shadow-2xl shadow-indigo-950/20 sm:p-9">
      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 -z-10 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-1/3 -z-10 h-56 w-56 rounded-full bg-indigo-400/20 blur-3xl" />
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-emerald-300 shadow-inner"><LayoutGrid className="h-7 w-7" /></span>
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-emerald-200"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" /> Cartelera digital fiscal</p>
            <h1 className="mt-3 break-words text-3xl font-black tracking-tight sm:text-4xl">{board.companyName}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Panel público de documentos, vigencias y cumplimiento. Consulta la información publicada de un vistazo.</p>
          </div>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-xs text-slate-300 backdrop-blur">
          <span className="flex items-center gap-2 font-semibold text-white"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Acceso público · Solo lectura</span>
          {board.updatedAt && <span className="mt-2 flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> Actualizada {formatDateTime(board.updatedAt)}</span>}
        </div>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric icon={<FileBadge className="h-4 w-4" />} label="Documentos publicados" value={String(board.documents.length)} detail="En esta cartelera" />
        <Metric icon={<CheckCircle2 className="h-4 w-4" />} label="Documentos vigentes" value={String(validDocuments)} detail="Listos para consulta" />
        <Metric icon={<CalendarDays className="h-4 w-4" />} label="Próximos a vencer" value={String(expiringDocuments)} detail="Revisar su renovación" />
        <Metric icon={<AlertTriangle className="h-4 w-4" />} label="Vencidos" value={String(expiredDocuments)} detail="Requieren atención" />
      </div>
    </header>

    <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
      <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Panel de cumplimiento</p><h2 className="mt-1 text-lg font-black text-slate-900">Obligaciones de referencia</h2></div><span className="rounded-xl bg-indigo-50 px-3 py-2 text-sm font-black text-indigo-700">{progressPercent}%</span></div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-700" style={{ width: `${progressPercent}%` }} /></div>
        <p className="mt-2 text-xs text-slate-500">{progress} de {applicableCount} obligaciones aplicables marcadas como cumplidas</p>
        <div className="mt-5 space-y-3">
          {board.requirements.map((item) => <article key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 transition hover:border-indigo-200 hover:bg-indigo-50/40">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="text-sm font-bold text-slate-900">{item.title}</h3><p className="mt-1 text-xs leading-5 text-slate-600">{item.description}</p><p className="mt-2 text-[11px] text-slate-500">Periodicidad: {item.frequency}{item.dueDate ? ` · Próxima fecha: ${formatDate(item.dueDate)}` : ''}</p></div><StatusBadge status={item.status} /></div>
            <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:underline">{item.sourceLabel}<ArrowUpRight className="h-3.5 w-3.5" /></a>
          </article>)}
        </div>
        <p className="mt-4 text-[11px] leading-5 text-slate-500">Los estados son declarados por la empresa y no constituyen una certificación de autoridad. La aplicabilidad de cada obligación depende del caso.</p>
      </article>

      <section className="min-w-0 space-y-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Tablón documental</p><h2 className="mt-1 text-xl font-black text-slate-900">Documentos publicados</h2></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{documents.length} resultados</span></div>
          <label className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar documento, área o emisor…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" /></label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ListFilter className="h-4 w-4 text-slate-400" />
            {(['Todos', 'Vigentes', 'Por vencer', 'Vencidos'] as const).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${filter === item ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{item}</button>)}
            <div className="ml-auto flex rounded-lg bg-slate-100 p-1"><button type="button" aria-label="Vista en tarjetas" onClick={() => setView('grid')} className={`rounded-md p-1.5 ${view === 'grid' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}><LayoutGrid className="h-4 w-4" /></button><button type="button" aria-label="Vista en lista" onClick={() => setView('list')} className={`rounded-md p-1.5 ${view === 'list' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}><ListFilter className="h-4 w-4" /></button></div>
          </div>
        </div>

        {documents.length ? <div className={view === 'grid' ? 'grid gap-3 sm:grid-cols-2' : 'space-y-3'}>
          {documents.map((document) => <article key={document.id} className={`group flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg ${view === 'list' ? 'sm:flex-row sm:items-center sm:gap-4' : ''}`}>
            <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-50 to-emerald-50 text-indigo-700"><FileText className="h-5 w-5" /></span><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-extrabold text-slate-900">{document.title}</h3><p className="mt-1 text-[11px] leading-5 text-slate-500">{document.category}{document.area ? ` · ${document.area}` : ''}</p></div></div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><StatusBadge status={document.status} />{document.expiresAt && <span className="text-[11px] text-slate-500">Vence: {formatDate(document.expiresAt)}</span>}</div>
            <div className="mt-3 border-t border-slate-100 pt-3"><p className="text-xs text-slate-600">Emisor: <span className="font-semibold text-slate-800">{document.issuer || 'No indicado'}</span></p>{document.fileData && <a href={document.fileData} download={document.fileName || document.title} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700"><ArrowDownToLine className="h-4 w-4" /> Ver / descargar documento</a>}</div>
          </article>)}
        </div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><FileText className="mx-auto h-8 w-8 text-slate-300" /><h3 className="mt-3 text-sm font-bold text-slate-800">{board.documents.length ? 'No hay coincidencias' : 'Aún no hay documentos publicados'}</h3><p className="mt-1 text-xs text-slate-500">{board.documents.length ? 'Prueba con otra búsqueda o filtro.' : 'Los documentos aparecerán aquí cuando la empresa los publique.'}</p></div>}
      </section>
    </section>

    <footer className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950"><strong>Información importante:</strong> Esta cartelera es informativa. Los documentos y estados son publicados por la empresa; NEXOSS no certifica su autenticidad ni sustituye los comprobantes, documentos originales o verificaciones oficiales.</footer>
  </PublicPage>;
};

function PublicPage({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-50 via-slate-50 to-emerald-50 px-3 py-5 sm:px-6 sm:py-8"><div className="mx-auto flex max-w-7xl flex-col gap-5 sm:gap-6">{children}<footer className="text-center text-[10px] font-medium tracking-wide text-slate-400">CARTELERA DIGITAL DE ACCESO PÚBLICO · NEXOSS</footer></div></main>;
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-sm"><div className="flex items-center gap-2 text-emerald-200">{icon}<span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">{label}</span></div><div className="mt-2 text-3xl font-black tabular-nums text-white">{value}</div><p className="mt-1 text-[10px] text-slate-400">{detail}</p></div>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${statusStyles[status] || statusStyles.Pendiente}`}>{status}</span>;
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-VE');
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' });
}
