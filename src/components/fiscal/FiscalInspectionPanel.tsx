import React, { useEffect, useMemo, useState } from 'react';
import { EyeOff, FileText, Plus, Printer, Save, Search, Trash2, Undo2 } from 'lucide-react';
import type { FiscalBoardState, FiscalInspectionState, InspectionStatus } from '../../domain/fiscalBoard';
import { INSPECTION_STATUSES, buildInspectionItems, compactEntries, summarizeInspection, type InspectionItem } from '../../domain/fiscalInspection';

type StatusFilter = 'Todos' | 'Sin revisar' | InspectionStatus;
const STATUS_FILTERS: StatusFilter[] = ['Todos', 'Sin revisar', ...INSPECTION_STATUSES];
const STATUS_STYLE: Record<InspectionStatus, string> = {
  Cumple: 'border-emerald-500 bg-emerald-600 text-white',
  'No cumple': 'border-rose-500 bg-rose-600 text-white',
  'No aplica': 'border-slate-500 bg-slate-600 text-white',
};
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));

interface Props {
  board: FiscalBoardState;
  companyName: string;
  saving: boolean;
  onSave: (inspection: FiscalInspectionState) => Promise<boolean>;
}

export const FiscalInspectionPanel: React.FC<Props> = ({ board, companyName, saving, onSave }) => {
  const [items, setItems] = useState<InspectionItem[]>(() => buildInspectionItems(board.inspection));
  const [observations, setObservations] = useState(board.inspection?.observations ?? '');
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState('');
  const [section, setSection] = useState('Todas');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Todos');
  const [showHidden, setShowHidden] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSection, setNewSection] = useState('');

  // Cuando se guarda (o llega otra versión), el borrador vuelve a coincidir con lo guardado.
  useEffect(() => {
    setItems(buildInspectionItems(board.inspection));
    setObservations(board.inspection?.observations ?? '');
    setDirty(false);
  }, [board.inspection]);

  const sections = useMemo(() => [...new Set(items.map((item) => item.section))], [items]);
  const summary = useMemo(() => summarizeInspection(items), [items]);
  const documents = board.documents;

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es');
    return items.filter((item) => {
      if (item.hidden && !showHidden) return false;
      if (section !== 'Todas' && item.section !== section) return false;
      if (statusFilter === 'Sin revisar' ? item.status !== '' : statusFilter !== 'Todos' && item.status !== statusFilter) return false;
      return !term || `${item.number} ${item.title} ${item.value} ${item.notes}`.toLocaleLowerCase('es').includes(term);
    });
  }, [items, query, section, statusFilter, showHidden]);

  const patch = (id: string, change: Partial<InspectionItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...change } : item)));
    setDirty(true);
  };

  const addCustom = () => {
    const title = newTitle.trim();
    if (!title) return;
    const id = `c-${crypto.randomUUID().slice(0, 12)}`;
    setItems((current) => [...current, { id, number: current.length + 1, title, section: newSection.trim() || 'Puntos propios', valueHint: '', custom: true, value: '', notes: '', status: '', documentIds: [], hidden: false }]);
    setNewTitle(''); setNewSection(''); setDirty(true);
  };

  const save = async () => {
    const ok = await onSave({
      entries: compactEntries(items),
      customItems: items.filter((item) => item.custom).map(({ id, title, section: itemSection }) => ({ id, title, section: itemSection })),
      observations: observations.trim(),
    });
    if (ok) setDirty(false);
  };

  const print = () => {
    const rows = items.filter((item) => !item.hidden).map((item) => {
      const files = item.documentIds.map((id) => documents.find((doc) => doc.id === id)?.title).filter(Boolean).join(', ');
      return `<tr><td>${item.number}</td><td><strong>${escapeHtml(item.title)}</strong>${item.value ? `<br>${escapeHtml(item.value)}` : ''}</td><td>${escapeHtml(item.status || 'Sin revisar')}</td><td>${escapeHtml(item.notes)}</td><td>${escapeHtml(files)}</td></tr>`;
    }).join('');
    const popup = window.open('', '_blank');
    if (!popup) return;
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe fiscal - ${escapeHtml(companyName)}</title><style>body{font-family:Arial,sans-serif;font-size:11px;margin:24px;color:#0f172a}h1{font-size:18px;margin:0}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f1f5f9}</style></head><body><h1>Informe fiscal: ${escapeHtml(companyName)}</h1><p>Cumplimiento ${summary.compliancePct}% · Cumple ${summary.cumple} · No cumple ${summary.noCumple} · No aplica ${summary.noAplica} · Sin revisar ${summary.sinRevisar}</p><table><thead><tr><th>N.º</th><th>Punto</th><th>Estado</th><th>Notas</th><th>Archivos</th></tr></thead><tbody>${rows}</tbody></table>${observations ? `<h2 style="font-size:13px">Observaciones</h2><p>${escapeHtml(observations)}</p>` : ''}</body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  return <div className="space-y-5 pb-20">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-base font-bold text-slate-900">Informe fiscal de inspección</h2><p className="mt-1 max-w-2xl text-xs text-slate-500">Los puntos que revisa un fiscal. Marca cada uno como Cumple, No cumple o No aplica, anota lo que corresponda y vincula los documentos de tu carpeta. Oculta lo que no le corresponde a tu empresa o agrega tus propios puntos.</p></div>
      <button type="button" onClick={print} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><Printer className="h-4 w-4" />Imprimir / PDF</button>
    </div>

    <section aria-label="Resumen del informe" className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-2"><p className="text-3xl font-black text-slate-900">{summary.compliancePct}%<span className="ml-2 text-xs font-semibold text-slate-500">de cumplimiento sobre los puntos que aplican</span></p></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${summary.compliancePct}%` }} /></div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">{[['Cumple', summary.cumple, 'bg-emerald-50 text-emerald-800'], ['No cumple', summary.noCumple, 'bg-rose-50 text-rose-800'], ['No aplica', summary.noAplica, 'bg-slate-100 text-slate-700'], ['Sin revisar', summary.sinRevisar, 'bg-amber-50 text-amber-800']].map(([label, value, tone]) => <div key={String(label)} className={`rounded-xl p-2.5 ${tone}`}><p className="text-lg font-black">{value}</p><p className="text-[10px] font-bold">{label}</p></div>)}</div>
    </section>

    <div className="flex flex-wrap items-center gap-2">
      <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><Search className="h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por número, punto o nota" aria-label="Buscar en el informe" className="w-full bg-transparent text-xs outline-none" /></label>
      <select value={section} onChange={(event) => setSection(event.target.value)} aria-label="Filtrar por sección" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700"><option value="Todas">Todas las secciones</option>{sections.map((name) => <option key={name}>{name}</option>)}</select>
    </div>
    <div className="flex flex-wrap items-center gap-2">{STATUS_FILTERS.map((filter) => <button key={filter} type="button" onClick={() => setStatusFilter(filter)} aria-pressed={statusFilter === filter} className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${statusFilter === filter ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`}>{filter}</button>)}
      <label className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-slate-600"><input type="checkbox" checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} />Mostrar ocultos ({items.filter((item) => item.hidden).length})</label></div>

    <ul className="space-y-3">{visible.map((item) => <li key={item.id} className={`rounded-2xl border bg-white p-4 ${item.hidden ? 'border-dashed border-slate-300 opacity-60' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-900"><span className="text-slate-400">{item.number}.</span> {item.title}</p><p className="text-[10px] text-slate-500">{item.section}{item.custom ? ' · punto propio' : ''}</p></div>
        <div className="flex items-center gap-1">
          {item.custom && <button type="button" aria-label={`Eliminar ${item.title}`} onClick={() => { if (window.confirm(`¿Eliminar el punto «${item.title}»?`)) { setItems((current) => current.filter((entry) => entry.id !== item.id)); setDirty(true); } }} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
          <button type="button" onClick={() => patch(item.id, { hidden: !item.hidden })} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50">{item.hidden ? <><Undo2 className="h-3.5 w-3.5" />Restaurar</> : <><EyeOff className="h-3.5 w-3.5" />No me corresponde</>}</button>
        </div>
      </div>
      {!item.hidden && <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <label className="block space-y-1"><span className="text-[11px] font-semibold text-slate-700">{item.valueHint || 'Dato o referencia'}</span><input value={item.value} maxLength={500} onChange={(event) => patch(item.id, { value: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label>
        <div className="space-y-1"><span className="text-[11px] font-semibold text-slate-700">Inspección</span><div className="flex flex-wrap gap-2" role="group" aria-label={`Estado de ${item.title}`}>{INSPECTION_STATUSES.map((status) => <button key={status} type="button" aria-pressed={item.status === status} onClick={() => patch(item.id, { status: item.status === status ? '' : status })} className={`rounded-lg border px-3 py-2 text-[11px] font-bold ${item.status === status ? STATUS_STYLE[status] : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`}>{status}</button>)}</div></div>
        <label className="block space-y-1 lg:col-span-2"><span className="text-[11px] font-semibold text-slate-700">Notas reveladoras (estatus o condición)</span><textarea value={item.notes} maxLength={2000} rows={2} onChange={(event) => patch(item.id, { notes: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label>
        <details className="lg:col-span-2"><summary className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-indigo-700"><FileText className="h-3.5 w-3.5" />Archivos ({item.documentIds.length})</summary>
          {documents.length === 0 ? <p className="mt-2 text-[11px] text-slate-500">Aún no hay documentos en la carpeta. Súbelos en la pestaña Documentos y vincúlalos aquí.</p>
            : <div className="mt-2 grid gap-1 sm:grid-cols-2">{documents.map((doc) => <label key={doc.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-[11px] text-slate-700"><input type="checkbox" checked={item.documentIds.includes(doc.id)} onChange={(event) => patch(item.id, { documentIds: event.target.checked ? [...item.documentIds, doc.id].slice(0, 10) : item.documentIds.filter((id) => id !== doc.id) })} /><span className="truncate">{doc.title}</span></label>)}</div>}
        </details>
      </div>}
    </li>)}
    {visible.length === 0 && <li className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500">No hay puntos con estos filtros.</li>}</ul>

    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-900">Agregar un punto propio</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <label className="block space-y-1"><span className="text-[11px] font-semibold text-slate-700">Nombre del punto</span><input value={newTitle} maxLength={160} onChange={(event) => setNewTitle(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs" /></label>
        <label className="block space-y-1"><span className="text-[11px] font-semibold text-slate-700">Sección</span><input value={newSection} maxLength={80} onChange={(event) => setNewSection(event.target.value)} placeholder="Puntos propios" list="inspection-sections" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs" /><datalist id="inspection-sections">{sections.map((name) => <option key={name} value={name} />)}</datalist></label>
        <button type="button" onClick={addCustom} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700"><Plus className="h-4 w-4" />Agregar</button>
      </div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4"><label className="block space-y-1"><span className="text-sm font-bold text-slate-900">Observaciones</span><textarea value={observations} maxLength={5000} rows={4} onChange={(event) => { setObservations(event.target.value); setDirty(true); }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label></section>

    <div className="sticky bottom-20 z-10 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
      <p className="text-[11px] font-semibold text-slate-600">{dirty ? 'Tienes cambios sin guardar.' : 'Todo guardado.'}</p>
      <div className="flex gap-2">
        <button type="button" disabled={!dirty || saving} onClick={() => { setItems(buildInspectionItems(board.inspection)); setObservations(board.inspection?.observations ?? ''); setDirty(false); }} className="rounded-lg border border-slate-200 px-3.5 py-2.5 text-xs font-bold text-slate-600 disabled:opacity-40">Descartar</button>
        <button type="button" disabled={!dirty || saving} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-40"><Save className="h-4 w-4" />{saving ? 'Guardando…' : 'Guardar cambios'}</button>
      </div>
    </div>
  </div>;
};
