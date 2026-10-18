import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { CalendarDays, ClipboardPlus, FileText, FlaskConical, HeartPulse, Plus, Search, Stethoscope, Users, Wallet, X } from 'lucide-react';
const InventoryManager = lazy(() => import('../inventory/InventoryManager').then((module) => ({ default: module.InventoryManager })));

type Patient = { id: string; patient_number: string; first_name: string; last_name: string; birth_date?: string; phone?: string; email?: string };
type Section = 'patients' | 'appointments' | 'payments' | 'inventory' | 'reports';
type RecordData = { patient: Record<string, any>; appointments: any[]; consultations: any[]; prescriptions: any[]; examOrders: any[]; reports: any[]; payments: any[] };
type FormKind = 'patient' | 'appointment' | 'consultation' | 'prescription' | 'examOrder' | 'report' | 'payment';

const sectionLabels: Record<Section, string> = { patients: 'Pacientes', appointments: 'Citas', payments: 'Pagos', inventory: 'Inventario', reports: 'Reportes' };
const formFields: Record<FormKind, Array<{ key: string; label: string; type?: string; required?: boolean; wide?: boolean }>> = {
  patient: [
    { key: 'firstName', label: 'Nombre', required: true }, { key: 'lastName', label: 'Apellido', required: true },
    { key: 'birthDate', label: 'Fecha de nacimiento', type: 'date' }, { key: 'phone', label: 'Teléfono' },
    { key: 'email', label: 'Correo', type: 'email' }, { key: 'address', label: 'Dirección', wide: true },
    { key: 'emergencyContactName', label: 'Contacto de emergencia' }, { key: 'emergencyContactPhone', label: 'Teléfono de emergencia' },
    { key: 'allergies', label: 'Alergias conocidas', wide: true }, { key: 'generalClinicalInfo', label: 'Información clínica general', wide: true },
  ],
  appointment: [{ key: 'startsAt', label: 'Fecha y hora', type: 'datetime-local', required: true }, { key: 'providerName', label: 'Profesional', required: true }, { key: 'durationMinutes', label: 'Duración en minutos', type: 'number' }, { key: 'reason', label: 'Motivo', wide: true }],
  consultation: [{ key: 'providerName', label: 'Profesional responsable', required: true }, { key: 'reason', label: 'Motivo', wide: true }, { key: 'symptoms', label: 'Síntomas', wide: true }, { key: 'findings', label: 'Hallazgos', wide: true }, { key: 'diagnosis', label: 'Diagnóstico', wide: true }, { key: 'treatmentPlan', label: 'Plan de tratamiento', wide: true }, { key: 'internalNotes', label: 'Notas internas (no se incluyen en el informe del paciente)', wide: true }],
  prescription: [{ key: 'providerName', label: 'Profesional', required: true }, { key: 'medicationName', label: 'Medicamento', required: true }, { key: 'dosage', label: 'Dosis' }, { key: 'frequency', label: 'Frecuencia' }, { key: 'duration', label: 'Duración' }, { key: 'instructions', label: 'Indicaciones', wide: true }],
  examOrder: [{ key: 'providerName', label: 'Profesional', required: true }, { key: 'examName', label: 'Examen', required: true }, { key: 'instructions', label: 'Indicaciones', wide: true }],
  report: [{ key: 'providerName', label: 'Profesional', required: true }, { key: 'title', label: 'Título del informe', required: true }, { key: 'content', label: 'Contenido que se entregará al paciente', required: true, wide: true }],
  payment: [{ key: 'concept', label: 'Concepto', required: true }, { key: 'amount', label: 'Monto', type: 'number', required: true }, { key: 'currency', label: 'Moneda' }, { key: 'method', label: 'Método de pago' }, { key: 'status', label: 'Estado' }, { key: 'notes', label: 'Notas', wide: true }],
};

export const HealthWorkspace: React.FC = () => {
  const [section, setSection] = useState<Section>('patients');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [record, setRecord] = useState<RecordData | null>(null);
  const [formKind, setFormKind] = useState<FormKind | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const headers = useCallback(() => ({ 'Content-Type': 'application/json', 'x-company-id': localStorage.getItem('nexoss_active_company_id') || '' }), []);
  const loadPatients = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/health/patients', { headers: headers() }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar la lista de pacientes.');
      setPatients(data.patients || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cargar la lista de pacientes.'); }
    finally { setLoading(false); }
  }, [headers]);

  const loadRecord = useCallback(async (patientId: string) => {
    setSelectedId(patientId); setError('');
    try {
      const response = await fetch(`/api/health/patients/${encodeURIComponent(patientId)}/record`, { headers: headers() }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo abrir el expediente.');
      setRecord(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo abrir el expediente.'); }
  }, [headers]);

  useEffect(() => { void loadPatients(); }, [loadPatients]);
  const openForm = (kind: FormKind) => { setFormKind(kind); setForm({ currency: 'USD', status: 'paid', durationMinutes: '30' }); };
  const saveForm = async (event: React.FormEvent) => {
    event.preventDefault(); if (!formKind) return; setSaving(true); setError('');
    try {
      const patientForm = formKind === 'patient';
      const endpoint = patientForm ? '/api/health/patients' : `/api/health/patients/${encodeURIComponent(selectedId)}/${({ appointment: 'appointments', consultation: 'consultations', prescription: 'prescriptions', examOrder: 'exam-orders', report: 'reports', payment: 'payments' } as const)[formKind]}`;
      const payload: Record<string, unknown> = { ...form };
      for (const field of ['durationMinutes', 'amount']) if (typeof payload[field] === 'string' && payload[field]) payload[field] = Number(payload[field]);
      const response = await fetch(endpoint, { method: 'POST', headers: headers(), body: JSON.stringify(payload) }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar el registro.');
      setFormKind(null);
      if (patientForm) { await loadPatients(); if (data.patient?.id) await loadRecord(data.patient.id); }
      else await loadRecord(selectedId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el registro.'); }
    finally { setSaving(false); }
  };

  const filtered = patients.filter((patient) => `${patient.patient_number} ${patient.first_name} ${patient.last_name} ${patient.phone || ''}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')));
  const openButtons: Array<{ kind: FormKind; label: string; icon: typeof Stethoscope }> = [
    { kind: 'appointment', label: 'Nueva cita', icon: CalendarDays }, { kind: 'consultation', label: 'Nueva consulta', icon: Stethoscope }, { kind: 'prescription', label: 'Nueva receta', icon: ClipboardPlus },
    { kind: 'examOrder', label: 'Nueva orden', icon: FlaskConical }, { kind: 'report', label: 'Nuevo informe', icon: FileText },
  ];
  const recordLists: Array<{ key: keyof RecordData; title: string; kind?: FormKind; empty: string }> = [
    { key: 'consultations', title: 'Historial de consultas', kind: 'consultation', empty: 'Todavía no hay consultas registradas.' },
    { key: 'prescriptions', title: 'Recetas', kind: 'prescription', empty: 'Todavía no hay recetas emitidas.' },
    { key: 'examOrders', title: 'Órdenes de exámenes', kind: 'examOrder', empty: 'Todavía no hay órdenes de exámenes.' },
    { key: 'reports', title: 'Informes', kind: 'report', empty: 'Todavía no hay informes.' },
  ];

  return <div className="min-h-full bg-[#f8f7f4] p-4 text-slate-900 sm:p-7"><div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-teal-800">Espacio clínico</p><h1 className="mt-1 text-2xl font-semibold">Salud y bienestar</h1><p className="mt-1 text-sm text-slate-600">Pacientes, citas y documentación clínica de esta empresa.</p></div><button onClick={() => openForm('patient')} className="rounded-lg bg-[#102b4c] px-4 py-2.5 text-sm font-semibold text-white"><Plus className="mr-1 inline h-4 w-4" />Nuevo paciente</button></header>
    <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">{(Object.keys(sectionLabels) as Section[]).map((item) => <button key={item} onClick={() => setSection(item)} className={`rounded-lg px-3 py-2 text-sm ${section === item ? 'bg-[#102b4c] text-white' : 'bg-white text-slate-700'}`}>{sectionLabels[item]}</button>)}</nav>
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
    {section === 'patients' && <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <aside className="rounded-xl border border-slate-200 bg-white p-4"><label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3"><Search className="h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar paciente" className="w-full py-2 text-sm outline-none" /></label><div className="mt-3 max-h-[65vh] space-y-1 overflow-y-auto">{loading ? <p className="p-3 text-sm text-slate-500">Cargando pacientes…</p> : filtered.map((patient) => <button key={patient.id} onClick={() => void loadRecord(patient.id)} className={`w-full rounded-lg p-3 text-left ${selectedId === patient.id ? 'bg-teal-50 ring-1 ring-teal-300' : 'hover:bg-slate-50'}`}><strong className="block text-sm">{patient.last_name}, {patient.first_name}</strong><span className="text-xs text-slate-500">{patient.patient_number} · {patient.phone || 'Sin teléfono'}</span></button>)}</div></aside>
      <main className="min-w-0">{!record ? <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-center"><Users className="h-8 w-8 text-slate-400" /><h2 className="mt-3 font-semibold">Selecciona un paciente</h2><p className="mt-1 text-sm text-slate-500">Abre un expediente o registra un paciente nuevo.</p></div> : <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-medium">{record.patient.first_name} {record.patient.last_name}</h2><p className="mt-1 text-sm text-slate-600">{record.patient.patient_number} · {record.patient.birth_date ? new Date(record.patient.birth_date).toLocaleDateString() : 'Fecha de nacimiento no indicada'} · {record.patient.phone || 'Sin teléfono'} · {record.patient.email || 'Sin correo'}</p></div><span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">Expediente clínico</span></div><div className="mt-4 rounded-lg border border-slate-200 p-4"><h3 className="text-sm font-semibold">Información clínica general</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{record.patient.general_clinical_info || 'Sin información clínica general.'}</p>{record.patient.allergies && <p className="mt-2 text-sm text-amber-800"><strong>Alergias:</strong> {record.patient.allergies}</p>}</div><div className="mt-4 flex flex-wrap gap-2">{openButtons.map(({ kind, label, icon: Icon }) => <button key={kind} onClick={() => openForm(kind)} className="rounded-lg bg-[#102b4c] px-3.5 py-2.5 text-sm font-semibold text-white"><Icon className="mr-1.5 inline h-4 w-4" />{label}</button>)}</div></section>
        {recordLists.map(({ key, title, kind, empty }) => <section key={key}><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">{title}</h3>{kind && <button onClick={() => openForm(kind)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">Nueva entrada</button>}</div>{record[key].length === 0 ? <p className="text-sm text-slate-500">{empty}</p> : <div className="space-y-2">{record[key].map((item: any) => <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3"><strong className="text-sm">{item.title || item.medication_name || item.exam_name || item.diagnosis || item.reason || 'Registro'}</strong><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{item.patient_visible_content || item.instructions || item.findings || item.treatment_plan || item.symptoms || item.status || ''}</p><small className="text-slate-400">{new Date(item.issued_at || item.ordered_at || item.consulted_at || item.starts_at || item.created_at).toLocaleString()}</small></article>)}</div>}</section>)}
      </div>}</main>
    </div>}
    {section === 'appointments' && <RecordSection title="Citas" records={record?.appointments || []} empty="Selecciona un paciente en Pacientes para ver o registrar citas." onAdd={() => record && openForm('appointment')} />}
    {section === 'payments' && <RecordSection title="Pagos" records={record?.payments || []} empty="Selecciona un paciente en Pacientes para ver o registrar pagos." onAdd={() => record && openForm('payment')} />}
    {section === 'inventory' && <Suspense fallback={<p className="text-sm text-slate-500">Cargando inventario…</p>}><InventoryManager /></Suspense>}
    {section === 'reports' && <div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Informes clínicos</h2><p className="mt-2 text-sm text-slate-600">Los informes que redactes desde el expediente se conservan separados de las notas internas de consulta.</p></div>}
    {formKind && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-4"><form onSubmit={(event) => void saveForm(event)} className="my-auto w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{formKind === 'patient' ? 'Nuevo paciente' : ({ appointment: 'Nueva cita', consultation: 'Nueva consulta', prescription: 'Nueva receta', examOrder: 'Orden de exámenes', report: 'Nuevo informe para el paciente', payment: 'Registrar pago' } as const)[formKind]}</h2><button type="button" onClick={() => setFormKind(null)} aria-label="Cerrar"><X className="h-5 w-5" /></button></div><div className="grid gap-3 sm:grid-cols-2">{formFields[formKind].map((field) => <label key={field.key} className={`text-sm ${field.wide ? 'sm:col-span-2' : ''}`}><span className="mb-1 block text-slate-600">{field.label}</span>{field.wide ? <textarea required={field.required} rows={3} value={form[field.key] || ''} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" /> : <input required={field.required} type={field.type || 'text'} value={form[field.key] || ''} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />}</label>)}</div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setFormKind(null)} className="rounded-lg border border-slate-300 px-4 py-2">Cancelar</button><button disabled={saving} className="rounded-lg bg-[#102b4c] px-4 py-2 font-semibold text-white disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar'}</button></div></form></div>}
  </div></div>;
};

function RecordSection({ title, records, empty, onAdd }: { title: string; records: any[]; empty: string; onAdd: () => void }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">{title}</h2><button onClick={onAdd} className="rounded-lg bg-[#102b4c] px-3 py-2 text-sm font-semibold text-white"><Plus className="mr-1 inline h-4 w-4" />Nuevo</button></div>{records.length ? records.map((item) => <p key={item.id} className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">{item.concept || item.starts_at || 'Registro'} {item.amount ? `· ${item.amount} ${item.currency}` : ''}</p>) : <p className="mt-3 text-sm text-slate-500">{empty}</p>}</section>;
}
