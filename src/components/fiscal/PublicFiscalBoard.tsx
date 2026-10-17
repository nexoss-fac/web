import React, { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, FileText, ShieldCheck } from 'lucide-react';
import type { FiscalRequirement, FiscalBoardDocument } from '../../domain/fiscalBoard';

interface PublicBoard {
  companyName: string;
  updatedAt: string | null;
  requirements: FiscalRequirement[];
  documents: FiscalBoardDocument[];
}

const statusStyles: Record<string, string> = {
  Cumplido: 'bg-emerald-100 text-emerald-800',
  Pendiente: 'bg-amber-100 text-amber-800',
  'No aplica': 'bg-slate-100 text-slate-600',
  Vigente: 'bg-emerald-100 text-emerald-800',
  'Por vencer': 'bg-amber-100 text-amber-800',
  Vencido: 'bg-rose-100 text-rose-800',
  'En trámite': 'bg-sky-100 text-sky-800',
  'Pendiente de revisión': 'bg-slate-100 text-slate-700',
};

export const PublicFiscalBoard: React.FC<{ companyId: string; token: string }> = ({ companyId, token }) => {
  const [board, setBoard] = useState<PublicBoard | null>(null);
  const [error, setError] = useState(false);

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

  if (error) return <PublicPage><section className="rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm"><AlertTriangle className="mx-auto h-10 w-10 text-amber-500" /><h1 className="mt-4 text-xl font-black text-slate-900">Cartelera no disponible</h1><p className="mt-2 text-sm text-slate-600">Este enlace no existe, fue revocado o no puede cargarse en este momento.</p></section></PublicPage>;
  if (!board) return <PublicPage><p className="rounded-xl bg-white p-8 text-center text-sm text-slate-500">Cargando cartelera fiscal…</p></PublicPage>;

  const progress = board.requirements.filter((item) => item.status === 'Cumplido').length;
  const applicableCount = board.requirements.filter((item) => item.status !== 'No aplica').length;

  return <PublicPage>
    <header className="rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-sm sm:p-8">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 text-emerald-300"><ShieldCheck className="h-7 w-7" /></span>
        <div><p className="text-xs font-bold uppercase tracking-widest text-indigo-200">Cartelera de cumplimiento fiscal</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">{board.companyName}</h1><p className="mt-2 text-xs text-slate-300">Información de consulta pública · solo lectura</p></div>
      </div>
      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/15 pt-4 text-xs text-slate-200">
        <span>Obligaciones revisadas como cumplidas: <strong className="text-white">{progress} / {applicableCount}</strong></span>
        <span>Documentos publicados: <strong className="text-white">{board.documents.length}</strong></span>
        {board.updatedAt && <span>Última actualización: <strong className="text-white">{formatDateTime(board.updatedAt)}</strong></span>}
      </div>
    </header>

    <section className="space-y-3">
      <div><h2 className="text-lg font-black text-slate-900">Obligaciones fiscales de referencia</h2><p className="mt-1 text-xs text-slate-500">Estados declarados por la empresa. Estas obligaciones de conservación, presentación o inscripción no son, por sí mismas, una lista de documentos que deban exhibirse públicamente; su aplicabilidad depende de cada caso.</p></div>
      {board.requirements.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="text-sm font-bold text-slate-900">{item.title}</h3><p className="mt-1 text-xs leading-relaxed text-slate-600">{item.description}</p><p className="mt-2 text-[11px] text-slate-500">Periodicidad: {item.frequency}{item.dueDate ? ` · Próxima fecha: ${formatDate(item.dueDate)}` : ''}</p></div><StatusBadge status={item.status} /></div>
        <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:underline">{item.sourceLabel}<ExternalLink className="h-3 w-3" /></a>
      </article>)}
    </section>

    <section className="space-y-3">
      <div><h2 className="text-lg font-black text-slate-900">Documentos exhibidos</h2><p className="mt-1 text-xs text-slate-500">Solo se muestran los documentos que la empresa seleccionó expresamente para publicación.</p></div>
      {board.documents.length ? board.documents.map((document) => <article key={document.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><FileText className="h-5 w-5" /></span>
        <div className="min-w-[180px] flex-1"><h3 className="text-sm font-bold text-slate-900">{document.title}</h3><p className="mt-1 text-[11px] text-slate-500">{document.category} · Emisor: {document.issuer || 'No indicado'}{document.expiresAt ? ` · Vence: ${formatDate(document.expiresAt)}` : ''}</p></div>
        <StatusBadge status={document.status} />
        {document.fileData && <a href={document.fileData} download={document.fileName || document.title} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50">Ver documento <ExternalLink className="h-3.5 w-3.5" /></a>}
      </article>) : <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">La empresa no ha publicado documentos digitales.</p>}
    </section>

    <footer className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-950"><strong>Nota:</strong> Esta cartelera es informativa; los estados son registrados por la empresa y no certificados por una autoridad. No constituye una lista legal exhaustiva ni reemplaza documentos originales, comprobantes de recepción o verificaciones oficiales.</footer>
  </PublicPage>;
};

function PublicPage({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-slate-50 px-3 py-6 sm:px-6"><div className="mx-auto flex max-w-4xl flex-col gap-6">{children}<footer className="text-center text-[10px] text-slate-400">Cartelera digital de acceso público · NEXOSS</footer></div></main>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${statusStyles[status] || statusStyles.Pendiente}`}>{status}</span>;
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-VE');
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' });
}
