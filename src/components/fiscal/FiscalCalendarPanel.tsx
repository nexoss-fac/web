import React, { useMemo, useState } from 'react';
import { Bell, BellOff, CalendarDays, Check, Plus, Repeat, Trash2 } from 'lucide-react';
import { FISCAL_AREAS, type FiscalArea, type FiscalBoardSettings, type FiscalBoardState, type FiscalCalendarEvent, type FiscalRecurrence } from '../../domain/fiscalBoard';
import { buildFiscalCalendar, computeFiscalNotifications, type FiscalEntryLevel } from '../../domain/fiscalCalendar';

const REMIND_OPTIONS = [30, 15, 7, 3, 1, 0];
const RECURRENCE_LABEL: Record<FiscalRecurrence, string> = { none: 'No se repite', monthly: 'Cada mes', quarterly: 'Cada trimestre', yearly: 'Cada año' };
const LEVEL_STYLE: Record<FiscalEntryLevel, { label: string; className: string }> = {
  vencido: { label: 'Vencido', className: 'bg-rose-50 text-rose-700' },
  hoy: { label: 'Vence hoy', className: 'bg-amber-100 text-amber-900' },
  proximo: { label: 'Próximo', className: 'bg-amber-50 text-amber-800' },
  futuro: { label: 'Programado', className: 'bg-slate-100 text-slate-600' },
};

interface Props {
  board: FiscalBoardState;
  settings: FiscalBoardSettings;
  today: string;
  saving: boolean;
  onSave: (patch: { calendar?: FiscalCalendarEvent[]; settings?: FiscalBoardSettings }) => Promise<boolean>;
}

const browserPermission = (): NotificationPermission | 'unsupported' => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
const formatDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('es-VE');

export const FiscalCalendarPanel: React.FC<Props> = ({ board, settings, today, saving, onSave }) => {
  const [title, setTitle] = useState('');
  const [area, setArea] = useState<FiscalArea | ''>('');
  const [dueDate, setDueDate] = useState('');
  const [recurrence, setRecurrence] = useState<FiscalRecurrence>('none');
  const [permission, setPermission] = useState(browserPermission());

  const entries = useMemo(() => buildFiscalCalendar({ board, today, defaultRemindDays: settings.remindDaysBefore }), [board, today, settings.remindDaysBefore]);
  const notifications = useMemo(() => computeFiscalNotifications(entries), [entries]);
  const events = board.calendar ?? [];

  const addEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !dueDate) return;
    const next: FiscalCalendarEvent = { id: crypto.randomUUID(), title: title.trim(), area, dueDate, recurrence, remindDaysBefore: [], notes: '', done: false };
    if (await onSave({ calendar: [next, ...events] })) {
      setTitle(''); setDueDate(''); setRecurrence('none'); setArea('');
    }
  };

  const toggleRemind = (day: number) => {
    const current = settings.remindDaysBefore;
    const next = current.includes(day) ? current.filter((item) => item !== day) : [...current, day];
    if (!next.length) return; // siempre debe quedar al menos un día de aviso
    void onSave({ settings: { ...settings, remindDaysBefore: next.sort((a, b) => b - a) } });
  };

  const askPermission = async () => {
    if (typeof Notification === 'undefined') return;
    setPermission(await Notification.requestPermission());
  };

  return <div className="space-y-5">
    <div><h2 className="text-base font-bold text-slate-900">Calendario fiscal</h2><p className="mt-1 text-xs text-slate-500">Reúne los vencimientos de tus documentos, las fechas de requisitos pendientes y las obligaciones que agregues aquí.</p></div>

    {notifications.length > 0 && <section role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-amber-950"><Bell className="h-4 w-4" />{notifications.length} aviso{notifications.length === 1 ? '' : 's'} para hoy</h3>
      <ul className="mt-2 space-y-1 text-xs text-amber-950">{notifications.slice(0, 8).map((item) => <li key={item.id}>• {item.message}</li>)}</ul>
    </section>}

    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl"><h3 className="text-sm font-bold text-slate-900">Avisos</h3><p className="mt-1 text-[11px] leading-relaxed text-slate-500">Elige con cuántos días de anticipación quieres el aviso. Los avisos del navegador aparecen cuando abres NEXOSS; todavía no se envían por correo ni WhatsApp.</p></div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={settings.notificationsEnabled} disabled={saving} onChange={(event) => void onSave({ settings: { ...settings, notificationsEnabled: event.target.checked } })} />Avisarme</label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-[11px] text-slate-500">Avisar</span>{REMIND_OPTIONS.map((day) => <button key={day} type="button" disabled={saving} onClick={() => toggleRemind(day)} aria-pressed={settings.remindDaysBefore.includes(day)} className={`rounded-full border px-3 py-1 text-[11px] font-bold ${settings.remindDaysBefore.includes(day) ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 text-slate-600 hover:border-indigo-300'}`}>{day === 0 ? 'El mismo día' : `${day} d antes`}</button>)}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
        {permission === 'unsupported' && <span className="flex items-center gap-1.5 text-slate-500"><BellOff className="h-4 w-4" />Este navegador no admite avisos.</span>}
        {permission === 'default' && <button type="button" onClick={() => void askPermission()} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-2 font-bold text-indigo-700 hover:bg-indigo-50"><Bell className="h-4 w-4" />Activar avisos del navegador</button>}
        {permission === 'granted' && <span className="flex items-center gap-1.5 font-semibold text-emerald-700"><Check className="h-4 w-4" />Avisos del navegador activados</span>}
        {permission === 'denied' && <span className="flex items-center gap-1.5 text-rose-700"><BellOff className="h-4 w-4" />Bloqueaste los avisos; puedes permitirlos en la configuración del sitio.</span>}
      </div>
    </section>

    <form onSubmit={(event) => void addEvent(event)} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.5fr_1fr_1fr_auto] lg:items-end">
      <label className="block space-y-1"><span className="text-[11px] font-semibold text-slate-700">Obligación o fecha</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Ej. Declaración de IVA" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs" required /></label>
      <label className="block space-y-1"><span className="text-[11px] font-semibold text-slate-700">Área</span><select value={area} onChange={(event) => setArea(event.target.value as FiscalArea | '')} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs"><option value="">Sin área</option>{FISCAL_AREAS.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="block space-y-1"><span className="text-[11px] font-semibold text-slate-700">Fecha</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs" required /></label>
      <label className="block space-y-1"><span className="text-[11px] font-semibold text-slate-700">Repetición</span><select value={recurrence} onChange={(event) => setRecurrence(event.target.value as FiscalRecurrence)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs">{Object.entries(RECURRENCE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"><Plus className="h-4 w-4" />Agregar</button>
    </form>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {entries.length === 0 ? <div className="flex flex-col items-center gap-2 p-10 text-center text-xs text-slate-500"><CalendarDays className="h-8 w-8 text-slate-300" />Aún no hay fechas. Agrega documentos con vencimiento o tus obligaciones periódicas.</div>
        : <ul className="divide-y divide-slate-100">{entries.map((entry) => {
          const level = LEVEL_STYLE[entry.level];
          return <li key={entry.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-[200px] flex-1"><p className="text-xs font-bold text-slate-800">{entry.title}</p><p className="mt-0.5 text-[10px] text-slate-500">{entry.area || 'Sin área'} · {entry.kind === 'documento' ? 'Documento' : entry.kind === 'requisito' ? 'Requisito' : 'Obligación propia'}</p></div>
            <time className="text-[11px] text-slate-600">{formatDate(entry.dueDate)}</time>
            <span className="text-[10px] text-slate-500">{entry.daysLeft < 0 ? `hace ${Math.abs(entry.daysLeft)} d` : entry.daysLeft === 0 ? 'hoy' : `en ${entry.daysLeft} d`}</span>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${level.className}`}>{level.label}</span>
          </li>;
        })}</ul>}
    </section>

    {events.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h3 className="text-sm font-bold text-slate-900">Mis obligaciones</h3>
      <ul className="mt-3 divide-y divide-slate-100">{events.map((item) => <li key={item.id} className="flex flex-wrap items-center gap-3 py-2.5">
        <div className="min-w-[180px] flex-1"><p className={`text-xs font-semibold ${item.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{item.title}</p><p className="text-[10px] text-slate-500">{formatDate(item.dueDate)}{item.recurrence !== 'none' && <span className="ml-2 inline-flex items-center gap-1"><Repeat className="h-3 w-3" />{RECURRENCE_LABEL[item.recurrence]}</span>}</p></div>
        {item.recurrence === 'none' && <button type="button" disabled={saving} onClick={() => void onSave({ calendar: events.map((event) => event.id === item.id ? { ...event, done: !event.done } : event) })} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50">{item.done ? 'Reabrir' : 'Marcar hecha'}</button>}
        <button type="button" disabled={saving} aria-label={`Eliminar ${item.title}`} onClick={() => { if (window.confirm(`¿Eliminar «${item.title}» del calendario?`)) void onSave({ calendar: events.filter((event) => event.id !== item.id) }); }} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
      </li>)}</ul>
    </section>}
  </div>;
};
