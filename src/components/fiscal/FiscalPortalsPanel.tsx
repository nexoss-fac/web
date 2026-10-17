import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, EyeOff, Info, Landmark, Plus, Settings2 } from 'lucide-react';
import { FISCAL_AREAS, type FiscalArea, type FiscalBoardSettings, type FiscalPortalConfig } from '../../domain/fiscalBoard';
import { VENEZUELA_STATES, isSafePortalUrl, portalsForSettings, stateName } from '../../domain/fiscalPortals';

interface Props {
  settings: FiscalBoardSettings;
  saving: boolean;
  onSave: (settings: FiscalBoardSettings) => Promise<boolean>;
}

const openPortal = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');
const splitLines = (value: string) => value.split(/\r?\n|;/).map((line) => line.trim()).filter(Boolean).slice(0, 12);

export const FiscalPortalsPanel: React.FC<Props> = ({ settings, saving, onSave }) => {
  const [areaFilter, setAreaFilter] = useState<FiscalArea | 'Todas'>('Todas');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState('');
  const [urlError, setUrlError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [area, setArea] = useState<FiscalArea>(FISCAL_AREAS[0]);
  const [url, setUrl] = useState('');
  const [procedures, setProcedures] = useState('');

  const portals = useMemo(() => portalsForSettings(settings), [settings]);
  const visible = portals.filter((portal) => areaFilter === 'Todas' || portal.area === areaFilter);
  const isVenezuela = !settings.countryCode || settings.countryCode.toUpperCase() === 'VE';

  const saveUrl = async (portal: FiscalPortalConfig) => {
    const value = urlDraft.trim();
    if (!value || !isSafePortalUrl(value)) {
      setUrlError('Escribe un enlace completo que empiece por https://');
      return;
    }
    setUrlError('');
    // Los portales sugeridos no se editan: se guarda una copia propia con el enlace y se oculta la original.
    const next: FiscalBoardSettings = portal.custom
      ? { ...settings, customPortals: settings.customPortals.map((item) => item.id === portal.id ? { ...item, url: value } : item) }
      : { ...settings, hiddenPortalIds: [...settings.hiddenPortalIds, portal.id], customPortals: [...settings.customPortals, { ...portal, id: `custom-${portal.id}`.slice(0, 64), url: value, needsReview: false, custom: true }] };
    if (await onSave(next)) { setConfiguring(null); setUrlDraft(''); }
  };

  const hidePortal = (portal: FiscalPortalConfig) => {
    if (portal.custom) {
      if (!window.confirm(`¿Quitar «${portal.name}» de tus portales?`)) return;
      void onSave({ ...settings, customPortals: settings.customPortals.filter((item) => item.id !== portal.id) });
    } else {
      void onSave({ ...settings, hiddenPortalIds: [...settings.hiddenPortalIds, portal.id] });
    }
  };

  const addPortal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    if (!isSafePortalUrl(url.trim())) { setUrlError('El enlace debe empezar por https://'); return; }
    setUrlError('');
    const custom: FiscalPortalConfig = {
      id: `custom-${crypto.randomUUID()}`.slice(0, 64), name: name.trim(), description: '', area, scope: settings.stateCode ? 'Municipal' : 'Nacional',
      url: url.trim(), procedures: splitLines(procedures), instructions: [], stateCodes: settings.stateCode ? [settings.stateCode] : [], needsReview: false, custom: true,
    };
    if (await onSave({ ...settings, customPortals: [...settings.customPortals, custom] })) {
      setName(''); setUrl(''); setProcedures(''); setShowForm(false);
    }
  };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-base font-bold text-slate-900">Portales gubernamentales y trámites</h2><p className="mt-1 text-xs text-slate-500">Accesos oficiales con instructivo. Los portales locales cambian según el estado de la empresa.</p></div>
      <label className="block space-y-1"><span className="text-[11px] font-semibold text-slate-700">Estado de la empresa</span>
        <select value={settings.stateCode} disabled={saving || !isVenezuela} onChange={(event) => void onSave({ ...settings, stateCode: event.target.value })} className="w-56 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs">
          <option value="">Seleccionar estado…</option>{VENEZUELA_STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
        </select></label>
    </div>

    <p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>Seguridad y validación humana.</strong> NEXOSS organiza expedientes y programa alertas, pero el ingreso a los portales (SENIAT, SIGAT, etc.) y la presentación definitiva los haces tú con tu clave. Nunca guardes aquí contraseñas fiscales.</span></p>

    {!isVenezuela && <p className="flex gap-2 rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-600"><Info className="h-4 w-4 shrink-0" />Los portales sugeridos son de Venezuela. Para otro país, agrega tus propios portales abajo.</p>}
    {isVenezuela && !settings.stateCode && <p className="flex gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-[11px] text-indigo-900"><Info className="h-4 w-4 shrink-0" />Elige el estado de la empresa para ver los portales de alcaldía, bomberos y sanidad que le corresponden.{settings.stateCode ? '' : ' Mientras tanto verás solo los nacionales.'}</p>}
    {settings.stateCode && <p className="text-[11px] text-slate-500">Mostrando portales nacionales y de {stateName(settings.stateCode)}.</p>}

    <div className="flex flex-wrap gap-2">{(['Todas', ...FISCAL_AREAS] as const).map((item) => <button key={item} type="button" onClick={() => setAreaFilter(item)} aria-pressed={areaFilter === item} className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${areaFilter === item ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`}>{item === 'Todas' ? 'Todas las áreas' : item}</button>)}</div>

    <div className="grid gap-4 lg:grid-cols-2">
      {visible.map((portal) => <article key={portal.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white"><Landmark className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><h3 className="text-sm font-black text-slate-900">{portal.name}</h3><p className="mt-0.5 text-[10px] font-semibold text-indigo-700">{portal.scope} · {portal.area}</p></div>
          {portal.needsReview && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">Confirma el enlace</span>}
        </div>
        {portal.description && <p className="mt-3 text-xs leading-relaxed text-slate-600">{portal.description}</p>}
        {portal.procedures.length > 0 && <div className="mt-3"><p className="text-[11px] font-bold text-slate-800">Trámites principales</p><ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">{portal.procedures.map((item) => <li key={item}>• {item}</li>)}</ul></div>}
        {expanded === portal.id && <div className="mt-3 rounded-lg bg-slate-50 p-3"><p className="text-[11px] font-bold text-slate-800">Instructivo</p>{portal.instructions.length ? <ul className="mt-1 space-y-1 text-[11px] leading-relaxed text-slate-600">{portal.instructions.map((item) => <li key={item}>• {item}</li>)}</ul> : <p className="mt-1 text-[11px] text-slate-500">Sin instrucciones registradas.</p>}<p className="mt-2 text-[10px] text-slate-400">Orientativo: confirma en el organismo cuáles trámites aplican a tu empresa.</p></div>}
        {configuring === portal.id && <div className="mt-3 space-y-2"><input value={urlDraft} onChange={(event) => setUrlDraft(event.target.value)} placeholder="https://…" aria-label={`Enlace de ${portal.name}`} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" />{urlError && <p role="alert" className="text-[11px] text-rose-700">{urlError}</p>}<div className="flex gap-2"><button type="button" disabled={saving} onClick={() => void saveUrl(portal)} className="rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50">Guardar enlace</button><button type="button" onClick={() => { setConfiguring(null); setUrlError(''); }} className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600">Cancelar</button></div></div>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          <button type="button" onClick={() => setExpanded(expanded === portal.id ? null : portal.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50"><Info className="h-3.5 w-3.5" />Instructivo</button>
          {portal.url ? <button type="button" onClick={() => openPortal(portal.url)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-bold text-white hover:bg-slate-700"><ArrowUpRight className="h-3.5 w-3.5" />Abrir portal</button> : <span className="text-[11px] text-slate-400">Sin enlace</span>}
          <button type="button" onClick={() => { setConfiguring(portal.id); setUrlDraft(portal.url); setUrlError(''); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50"><Settings2 className="h-3.5 w-3.5" />{portal.url ? 'Cambiar enlace' : 'Configurar enlace'}</button>
          <button type="button" disabled={saving} onClick={() => hidePortal(portal)} aria-label={`Quitar ${portal.name}`} className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><EyeOff className="h-4 w-4" /></button>
        </div>
      </article>)}
      {visible.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500 lg:col-span-2">No hay portales en esta área para el estado elegido. Puedes agregar uno propio.</p>}
    </div>

    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => setShowForm((value) => !value)} className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3.5 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50"><Plus className="h-4 w-4" />Agregar portal propio</button>
      {settings.hiddenPortalIds.length > 0 && <button type="button" disabled={saving} onClick={() => void onSave({ ...settings, hiddenPortalIds: [] })} className="text-[11px] font-bold text-slate-500 underline">Restaurar {settings.hiddenPortalIds.length} oculto{settings.hiddenPortalIds.length === 1 ? '' : 's'}</button>}
    </div>
    {showForm && <form onSubmit={(event) => void addPortal(event)} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <label className="block space-y-1"><span className="text-[11px] font-semibold text-slate-700">Nombre del portal</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs" /></label>
      <label className="block space-y-1"><span className="text-[11px] font-semibold text-slate-700">Área</span><select value={area} onChange={(event) => setArea(event.target.value as FiscalArea)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs">{FISCAL_AREAS.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="block space-y-1 sm:col-span-2"><span className="text-[11px] font-semibold text-slate-700">Enlace (https://…)</span><input value={url} onChange={(event) => setUrl(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs" /></label>
      <label className="block space-y-1 sm:col-span-2"><span className="text-[11px] font-semibold text-slate-700">Trámites principales (uno por línea)</span><textarea value={procedures} onChange={(event) => setProcedures(event.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs" /></label>
      {urlError && <p role="alert" className="text-[11px] text-rose-700 sm:col-span-2">{urlError}</p>}
      <div className="sm:col-span-2"><button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">Guardar portal</button></div>
    </form>}
  </div>;
};
