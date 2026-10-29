import React, { useCallback, useEffect, useState } from 'react';

import { AlertCircle, Building2, LoaderCircle, LogOut, Plus, ShieldCheck } from 'lucide-react';

import type { FirebaseUser } from '../../lib/firebase';

import { LoginPage } from '../auth/LoginPage';

import { refreshCurrentFirebaseUser, resendVerificationEmail } from '../../lib/firebase';
import { COMPANY_INDUSTRIES, INDUSTRY_WORKFLOWS, resolveIndustryTemplate } from '../../domain/companyIndustries';



type Company = { id: string; slug: string; legalName: string; tradeName?: string; industryTemplate?: string; activity?: string; status: string; onboardingStep: number; role: string; subscription?: { status: string; currentPeriodEnd: string; plan: string } | null };
type EmailCompanyMatch = { id: string; legalName: string; tradeName: string; status: string };

type Invitation = { id: string; companyId: string; companyName: string; role: string; expiresAt: string; email?: string };

type Props = { user: FirebaseUser | null; loading: boolean; onTenantSelected: (id: string, role: string) => void; onLogout: () => Promise<void>; children: React.ReactNode };

const headers = { 'Content-Type': 'application/json' };

const fiscalRegimeOptions = [
  {
    value: 'ordinario',
    label: 'Contribuyente ordinario del IVA',
    help: 'Persona o empresa que debe cumplir las obligaciones del IVA que le correspondan. Confirma esta condición en tus documentos fiscales.',
  },
  {
    value: 'especial',
    label: 'Contribuyente especial',
    help: 'Condición asignada formalmente por el SENIAT. Puede implicar deberes tributarios adicionales; selecciónala solo si tienes esa calificación.',
  },
  {
    value: 'formal',
    label: 'Contribuyente formal',
    help: 'Categoría con obligaciones formales específicas. Verifica que corresponda a tu empresa antes de seleccionarla.',
  },
  {
    value: 'exento',
    label: 'Exento del IVA',
    help: 'Se aplica únicamente cuando una operación o actividad tiene exención prevista en la normativa. No equivale a no estar sujeto al IVA.',
  },
  {
    value: 'no_sujeto',
    label: 'No sujeto al IVA',
    help: 'Se refiere a operaciones o actividades que no están comprendidas en el ámbito de aplicación del IVA. Confirma la clasificación con tus documentos o contador.',
  },
  {
    value: 'por_confirmar',
    label: 'No estoy seguro / Necesito ayuda',
    help: 'No elijas una categoría al azar. Puedes dejar la condición pendiente y consultarla con tu contador o verificarla ante el SENIAT.',
  },
];

export const CompanyWorkspaceGate: React.FC<Props> = ({ user, loading, onTenantSelected, onLogout, children }) => {

  const [companies, setCompanies] = useState<Company[]>([]);
  const [emailMatches, setEmailMatches] = useState<EmailCompanyMatch[]>([]);

  const [invitations, setInvitations] = useState<Invitation[]>([]);

  const [managedInvitations, setManagedInvitations] = useState<Invitation[]>([]);

  const [platformAdmin, setPlatformAdmin] = useState(false);

  const [busy, setBusy] = useState(false);

  const [error, setError] = useState('');

  const [mode, setMode] = useState<'list' | 'register' | 'onboarding' | 'admin'>('list');

  const [activeCompany, setActiveCompany] = useState<Company | null>(null);

  const [step, setStep] = useState(2);

  const [form, setForm] = useState<Record<string, string>>({ legalName: '', tradeName: '', taxId: '', activity: '', industryTemplate: '', address: '', phone: '', email: '' });

  const [fiscal, setFiscal] = useState<Record<string, string>>({ countryCode: 'VE', currency: 'USD', taxRegime: '', taxRate: '', invoicePrefix: '' });

  const [invitation, setInvitation] = useState({ inviteEmail: '', inviteRole: 'cashier' });

  const [workspace, setWorkspace] = useState({ branches: '1', warehouses: '1', categories: COMPANY_INDUSTRIES.other.initialCategories.join(', '), modules: 'pos, inventory, reports, accounting' });

  const [adminData, setAdminData] = useState<any>(null);

  const [tenantDatabaseEnvNames, setTenantDatabaseEnvNames] = useState<Record<string, string>>({});



  const loadCompanies = useCallback(async (): Promise<Company[]> => {

    setBusy(true); setError('');

    try {

      const response = await fetch('/api/platform/companies');

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'No se pudo consultar el espacio empresarial.');

      const rows = Array.isArray(data.companies) ? data.companies as Company[] : [];

      setCompanies(rows);
      setEmailMatches(Array.isArray(data.emailMatches) ? data.emailMatches as EmailCompanyMatch[] : []);

      setInvitations(Array.isArray(data.invitations) ? data.invitations as Invitation[] : []);

      setManagedInvitations(Array.isArray(data.managedInvitations) ? data.managedInvitations as Invitation[] : []);

      setPlatformAdmin(Boolean(data.platformAdmin));

      return rows;

    } catch (err) { setError(err instanceof Error ? err.message : 'Error de conexión.'); }

    finally { setBusy(false); }

    return [];

  }, []);



  useEffect(() => { if (user?.emailVerified) void loadCompanies(); }, [user, loadCompanies]);

  useEffect(() => {
    const syncSelectedCompany = () => {
      const selectedId = localStorage.getItem('nexoss_active_company_id') || '';
      const selected = companies.find((company) => company.id === selectedId);
      const subscription = selected?.subscription;
      const subscriptionIsActive = Boolean(subscription
        && ['active', 'trialing'].includes(subscription.status)
        && Date.parse(subscription.currentPeriodEnd) > Date.now());
      if (selected?.status === 'active' && subscriptionIsActive) {
        setActiveCompany(selected);
        setMode('list');
      } else {
        setActiveCompany(null);
      }
    };
    syncSelectedCompany();
    window.addEventListener('nexoss:company-selected', syncSelectedCompany);
    return () => window.removeEventListener('nexoss:company-selected', syncSelectedCompany);
  }, [companies]);



  const acceptInvitation = async (invitation: Invitation) => {

    setBusy(true); setError('');

    try {

      const response = await fetch('/api/platform/invitations/accept', { method: 'POST', headers, body: JSON.stringify({ invitationId: invitation.id }) });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'La invitación ya no está disponible.');

      const rows = await loadCompanies();
      const company = rows.find((item) => item.id === invitation.companyId);
      if (company) {
        const url = new URL(window.location.href);
        url.searchParams.delete('invitation');
        window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
        await selectCompany(company);
      }

    } catch (err) { setError(err instanceof Error ? err.message : 'Error de conexión.'); }

    finally { setBusy(false); }

  };



  const revokeInvitation = async (invitation: Invitation) => {

    setBusy(true); setError('');

    try {

      const response = await fetch(`/api/platform/companies/${invitation.companyId}/invitations/${invitation.id}`, { method: 'DELETE' });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'No se pudo revocar la invitación.');

      await loadCompanies();

    } catch (err) { setError(err instanceof Error ? err.message : 'Error de conexión.'); }

    finally { setBusy(false); }

  };



  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-300">Comprobando sesión de Firebase…</div>;

  if (!user) return <LoginPage />;

  if (!user.emailVerified) return <main className="min-h-screen grid place-items-center bg-slate-950 px-4 text-slate-100"><section className="max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-7"><h1 className="text-xl font-bold">Verifica tu correo</h1><p className="mt-3 text-sm text-slate-300">Firebase todavía no marca {user.email} como verificado. La identidad debe estar verificada antes de registrar empresas o aceptar invitaciones.</p><p className="mt-2 text-xs text-slate-400">En el emulador local, abre Firebase Emulator UI → Authentication → Users y utiliza el enlace de verificación generado.</p><div className="mt-5 grid gap-2 sm:grid-cols-2"><button onClick={() => void resendVerificationEmail().then(()=>setError('Enlace solicitado. Revisa Firebase Emulator UI.')).catch(()=>setError('No se pudo solicitar el enlace.'))} className="rounded-lg border border-slate-700 px-3 py-2 text-sm">Solicitar enlace</button><button onClick={() => void refreshCurrentFirebaseUser().then(()=>window.location.reload()).catch(()=>setError('No se pudo actualizar la sesión.'))} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold">Ya verifiqué · actualizar</button></div>{error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}<button onClick={() => void onLogout()} className="mt-4 text-xs text-slate-400">Cerrar sesión</button></section></main>;

  if (activeCompany?.status === 'active' && localStorage.getItem('nexoss_active_company_id') === activeCompany.id && mode === 'list') return <>{children}</>;



  const selectCompany = async (company: Company) => {

    setError('');

    if (company.status === 'onboarding') {

      setActiveCompany(company); setStep(Math.max(2, Math.min(5, company.onboardingStep))); setMode('onboarding');

      const response = await fetch(`/api/platform/companies/${company.id}/onboarding`);

      if (response.ok) {

        const data = await response.json();

        setForm((current) => ({ ...current, ...data.company }));

       const industry = resolveIndustryTemplate(data.company?.industryTemplate, data.company?.activity || '');
       setForm((current) => ({ ...current, industryTemplate: industry }));

        setFiscal((current) => ({ ...current, ...(data.fiscal || {}) }));

        const savedWorkspace = data.workspace || {};
        setWorkspace((current) => ({
          ...current,
          ...savedWorkspace,
          categories: Array.isArray(savedWorkspace.categories)
            ? savedWorkspace.categories.join(', ')
           : typeof savedWorkspace.categories === 'string' ? savedWorkspace.categories : COMPANY_INDUSTRIES[industry].initialCategories.join(', '),
        }));

      }

      return;

    }

    const subscription = company.subscription;

    if (!subscription || !['active', 'trialing'].includes(subscription.status) || Date.parse(subscription.currentPeriodEnd) <= Date.now()) {

      setError('La suscripción de esta empresa está vencida o suspendida. Contacta al administrador de la plataforma.');

      return;

    }

    localStorage.setItem('nexoss_active_company_id', company.id);

    localStorage.setItem('nexoss_active_company_name', company.tradeName || company.legalName);

localStorage.setItem('nexoss_active_company_role', company.role);
    localStorage.setItem('nexoss_active_company_industry', resolveIndustryTemplate(company.industryTemplate, company.activity || ''));

window.dispatchEvent(new Event('nexoss:company-selected'));

onTenantSelected(company.id, company.role);

    setActiveCompany(company); setMode('list');

  };



  const registerCompany = async (event: React.FormEvent) => {

    event.preventDefault(); setBusy(true); setError('');

    try {

      const industryTemplate = resolveIndustryTemplate(form.industryTemplate, form.activity || '');
      const response = await fetch('/api/platform/companies', { method: 'POST', headers, body: JSON.stringify({ ...form, industryTemplate, email: form.email || user.email || '' }) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          await loadCompanies();
          setMode('list');
          setError(`${data.error || 'La empresa ya está registrada.'} Si no aparece en tus empresas ni en los registros vinculados a tu correo verificado, inicia sesión con la cuenta Firebase original o solicita al administrador actual que invite este correo. No se concedió acceso automáticamente.`);
          return;
        }
        throw new Error(data.error || 'No se pudo registrar la empresa.');
      }

      await loadCompanies();

      const company: Company = { ...data.company, industryTemplate, role: 'owner', subscription: null };

      setWorkspace((current) => ({ ...current, categories: COMPANY_INDUSTRIES[industryTemplate].initialCategories.join(', ') }));

      setActiveCompany(company); setStep(2); setMode('onboarding');

    } catch (err) { setError(err instanceof Error ? err.message : 'Error de conexión.'); }

    finally { setBusy(false); }

  };



  const saveStep = async (requestedStep = step) => {

    if (!activeCompany) return;

    setBusy(true); setError('');

    const data = requestedStep === 2 ? fiscal

      : requestedStep === 3 ? invitation

      : requestedStep === 4 ? { ...workspace, branches: Number(workspace.branches), warehouses: Number(workspace.warehouses), categories: workspace.categories.split(',').map((value) => value.trim()).filter(Boolean), modules: workspace.modules.split(',').map((value) => value.trim()).filter(Boolean) }

      : {};

    try {

      const response = await fetch(`/api/platform/companies/${activeCompany.id}/onboarding`, { method: 'PUT', headers, body: JSON.stringify({ step: requestedStep, data }) });

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'No se pudo guardar el paso.');

      if (requestedStep < 5) setStep(requestedStep + 1);

      else {

        const rows = await loadCompanies();

        const completed = rows.find((item) => item.id === activeCompany.id);

        if (completed) await selectCompany(completed);

      }

    } catch (err) { setError(err instanceof Error ? err.message : 'Error de conexión.'); }

    finally { setBusy(false); }

  };



  const loadAdmin = async () => {

    setBusy(true); setError('');

    try {

      const response = await fetch('/api/platform/admin/overview'); const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'No se pudo abrir administración.');

      setAdminData(data); setMode('admin');

    } catch (err) { setError(err instanceof Error ? err.message : 'Error de conexión.'); }

    finally { setBusy(false); }

  };



  const updateCompany = async (company: any, body: Record<string, unknown>) => {

    const response = await fetch(`/api/platform/admin/companies/${company.id}`, { method: 'PATCH', headers, body: JSON.stringify(body) });

    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'No se pudo actualizar.');

    await loadAdmin();

  };

  const transferCompanyOwner = async (company: any) => {
    const email = window.prompt('Correo verificado de la nueva persona propietaria para ' + (company.tradeName || company.legalName) + ':', '');
    if (!email?.trim()) return;
    if (!window.confirm('¿Transferir la propiedad de ' + (company.tradeName || company.legalName) + ' a ' + email.trim() + '? El propietario actual pasará a ser administrador. Los datos y la base de datos de la empresa no se borrarán.')) return;
    const response = await fetch('/api/platform/admin/companies/' + company.id + '/transfer-owner', { method: 'POST', headers, body: JSON.stringify({ email: email.trim() }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo transferir la propiedad.');
    await loadAdmin();
  };
  const connectTenantDatabase = async (company: any) => {
    const name = (tenantDatabaseEnvNames[company.id] || '').trim();
    if (!/^[A-Z][A-Z0-9_]*_DATABASE_URL$/.test(name) || ['DATABASE_URL', 'CONTROL_PLANE_DATABASE_URL'].includes(name)) {
      throw new Error('Escribe una variable exclusiva de la empresa, por ejemplo MAKD_SHOP_DATABASE_URL.');
    }
    const prefix = import.meta.env.PROD ? 'render-env:' : 'local-env:';
    const response = await fetch(`/api/platform/admin/companies/${company.id}/database`, { method: 'PUT', headers, body: JSON.stringify({ secretReference: prefix + name }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo conectar la base de datos.');
    await loadAdmin();
  };

  const updatePlan = async (plan: any, body: Record<string, unknown>) => {

    const response = await fetch(`/api/platform/admin/plans/${plan.id}`, { method: 'PATCH', headers, body: JSON.stringify(body) });

    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'No se pudo actualizar el plan.');

    await loadAdmin();

  };

  const createPlan = async () => {

    const name = window.prompt('Nombre del nuevo plan');

    if (!name?.trim()) return;

    const id = window.prompt('ID técnico (minúsculas, números y guiones)', name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'));

    if (!id?.trim()) return;

    const response = await fetch('/api/platform/admin/plans', { method: 'POST', headers, body: JSON.stringify({ id, name, price: 0, currency: 'USD', interval: 'month', limits: { users: 3, products: 500, branches: 1, warehouses: 1 }, modules: ['pos', 'inventory', 'reports', 'accounting'] }) });

    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'No se pudo crear el plan.');

    await loadAdmin();

  };



  const setValue = (setter: React.Dispatch<React.SetStateAction<any>>, key: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setter((current: any) => ({ ...current, [key]: event.target.value }));
  const selectedIndustry = resolveIndustryTemplate(form.industryTemplate, form.activity || '');
  const selectedIndustryProfile = COMPANY_INDUSTRIES[selectedIndustry];
  const linkedInvitationId = new URLSearchParams(window.location.search).get('invitation');
  const linkedInvitation = invitations.find((item) => item.id === linkedInvitationId);



  return (

    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">

      <section className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8">

        <header className="mb-6 flex items-center justify-between gap-4">

          <div><div className="text-sm font-black uppercase tracking-widest text-emerald-400">NEXOSS</div><p className="mt-1 text-xs text-slate-400">Espacio empresarial privado · {user.email}</p></div>

          <button onClick={() => void onLogout()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"><LogOut size={16} /> Salir</button>

        </header>

        {error && <div role="alert" className="mb-5 flex gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200"><AlertCircle size={18} />{error}</div>}

        {busy && <div className="mb-3 flex items-center gap-2 text-xs text-slate-400"><LoaderCircle size={14} className="animate-spin"/> Guardando y verificando…</div>}



        {mode === 'list' && <>

          <h1 className="text-2xl font-bold">Tus empresas</h1><p className="mt-2 text-sm text-slate-400">Cada espacio tiene miembros, plan y datos independientes.</p>

          <div className="mt-5 grid gap-3">{companies.map((company) => <button key={company.id} onClick={() => void selectCompany(company)} className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 p-4 text-left hover:border-emerald-500"><span><strong className="block">{company.tradeName || company.legalName}</strong><small className="text-slate-400">{company.role} · {company.status === 'onboarding' ? 'Configuración pendiente' : `${company.subscription?.plan || 'Plan'} · vence ${company.subscription?.currentPeriodEnd ? new Date(company.subscription.currentPeriodEnd).toLocaleDateString() : '—'}`}</small></span><span className="text-emerald-400">{company.status === 'onboarding' ? 'Continuar →' : 'Entrar →'}</span></button>)}</div>
          {emailMatches.length > 0 && <section className="mt-5 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4"><h2 className="font-semibold text-amber-100">Empresas registradas con tu correo verificado</h2><p className="mt-1 text-xs text-slate-300">Estas empresas están asociadas a otra identidad de Firebase. No se otorgó acceso; inicia sesión con la cuenta original o pide a un administrador que invite este correo.</p><div className="mt-3 grid gap-2">{emailMatches.map((company) => <div key={company.id} className="rounded-lg border border-slate-700 bg-slate-950 p-3"><strong className="block text-sm text-white">{company.tradeName || company.legalName}</strong><span className="text-xs text-slate-400">{company.status === 'onboarding' ? 'Configuración pendiente' : 'Empresa registrada'}</span></div>)}</div></section>}

          {linkedInvitation && <section className="mt-5 rounded-xl border border-emerald-400/50 bg-emerald-500/10 p-4"><h2 className="font-semibold">Invitación a {linkedInvitation.companyName}</h2><p className="mt-1 text-sm text-slate-300">Rol asignado: <strong>{linkedInvitation.role}</strong>. Al aceptar entrarás directamente a esta empresa.</p><button disabled={busy} onClick={() => void acceptInvitation(linkedInvitation)} className="mt-3 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Aceptar y entrar</button></section>}
          {invitations.length > 0 && <section className="mt-5 rounded-xl border border-emerald-500/30 p-4"><h2 className="font-semibold">Invitaciones recibidas</h2><div className="mt-3 grid gap-2">{invitations.map((invitation) => <div key={invitation.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-950 p-3"><span className="text-sm">{invitation.companyName} · {invitation.role}<small className="block text-slate-400">Vence {new Date(invitation.expiresAt).toLocaleDateString()}</small></span><button disabled={busy} onClick={() => void acceptInvitation(invitation)} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold disabled:opacity-50">Aceptar</button></div>)}</div></section>}

          {managedInvitations.length > 0 && <section className="mt-5 rounded-xl border border-slate-700 p-4"><h2 className="font-semibold">Invitaciones pendientes de tus empresas</h2><div className="mt-3 grid gap-2">{managedInvitations.map((invitation) => <div key={invitation.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-950 p-3"><span className="text-sm">{invitation.companyName} · {invitation.email}<small className="block text-slate-400">{invitation.role} · vence {new Date(invitation.expiresAt).toLocaleDateString()}</small></span><button disabled={busy} onClick={() => void revokeInvitation(invitation)} className="rounded-lg border border-rose-500/50 px-3 py-2 text-sm text-rose-200 disabled:opacity-50">Revocar</button></div>)}</div></section>}

          <button onClick={() => setMode('register')} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-bold hover:bg-emerald-500"><Plus size={18}/> Crear cuenta empresarial</button>

          {platformAdmin && <button onClick={() => void loadAdmin()} className="mt-3 w-full rounded-xl border border-slate-700 px-4 py-3 text-sm hover:bg-slate-800">Administración central SaaS</button>}

        </>}



        {mode === 'register' && <form onSubmit={registerCompany} className="space-y-4">

          <button type="button" onClick={() => setMode('list')} className="text-sm text-slate-400">← Volver a empresas</button><h1 className="text-2xl font-bold">Crear cuenta empresarial</h1>

          <p className="text-sm text-slate-400">La cuenta Firebase verificada quedará como administradora de su propia empresa.</p>

          <div className="grid gap-3 sm:grid-cols-2">{[['legalName','Razón social *'],['tradeName','Nombre comercial'],['taxId','RIF / identificación fiscal'],['activity','Actividad económica *'],['address','Dirección *'],['phone','Teléfono *'],['email','Correo empresarial']].map(([key,label]) => <label key={key} className="text-xs text-slate-400">{label}<input required={['legalName','activity','address','phone'].includes(key)} value={form[key] || ''} onChange={setValue(setForm,key)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"/></label>)}</div>

          <label className="block text-xs font-semibold text-slate-300">
            Perfil de la empresa *
            <select required value={form.industryTemplate} onChange={setValue(setForm, 'industryTemplate')} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white">
              <option value="">Selecciona el tipo de empresa</option>
              {Object.entries(COMPANY_INDUSTRIES).map(([value, industry]) => <option key={value} value={value}>{industry.label}</option>)}
            </select>
            <span className="mt-2 block font-normal text-slate-400">{form.industryTemplate ? COMPANY_INDUSTRIES[resolveIndustryTemplate(form.industryTemplate)].description : 'Este perfil adapta el catálogo, las categorías iniciales y el flujo de trabajo.'}</span>
            {form.industryTemplate && <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900 p-3 font-normal">
              <p className="font-semibold text-emerald-300">Flujo recomendado para {COMPANY_INDUSTRIES[resolveIndustryTemplate(form.industryTemplate)].label}</p>
              <ol className="mt-2 grid gap-1 sm:grid-cols-2">{INDUSTRY_WORKFLOWS[resolveIndustryTemplate(form.industryTemplate)].flow.map((item, index) => <li key={item} className="text-xs text-slate-300">{index + 1}. {item}</li>)}</ol>
              <p className="mt-2 text-xs text-slate-400">Controla: {INDUSTRY_WORKFLOWS[resolveIndustryTemplate(form.industryTemplate)].records.join(' · ')}</p>
            </div>}
          </label>

          <button disabled={busy} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-bold disabled:opacity-50">Registrar empresa y configurar →</button>

        </form>}



        {mode === 'onboarding' && <div className="space-y-5">

          <div className="flex items-center gap-3"><Building2 className="text-emerald-400"/><div><h1 className="text-2xl font-bold">Configura {activeCompany?.legalName}</h1><p className="text-sm text-slate-400">Paso {step - 1} de 4 · Puedes guardar y continuar después.</p></div></div>

          {step === 2 && <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-400">País<select value={fiscal.countryCode} onChange={setValue(setFiscal,'countryCode')} className="mt-1 w-full rounded-lg bg-slate-950 p-3"><option value="VE">Venezuela</option><option value="CO">Colombia</option><option value="US">Estados Unidos</option><option value="OTHER">Otro</option></select></label><label className="text-xs text-slate-400">Moneda base<select value={fiscal.currency} onChange={setValue(setFiscal,'currency')} className="mt-1 w-full rounded-lg bg-slate-950 p-3"><option>USD</option><option>VES</option><option>COP</option><option>EUR</option></select></label><label className="text-xs text-slate-400">Régimen fiscal
              <select value={fiscal.taxRegime} onChange={setValue(setFiscal, 'taxRegime')} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white">
                <option value="">Selecciona una condición fiscal</option>
                {fiscalRegimeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              {fiscal.taxRegime && <p className="mt-2 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs leading-relaxed text-slate-300">{fiscalRegimeOptions.find((option) => option.value === fiscal.taxRegime)?.help}</p>}
            </label>
            <label className="text-xs text-slate-400">Impuesto (%)
              <input type="number" min="0" max="100" step="0.01" value={fiscal.taxRate} onChange={setValue(setFiscal, 'taxRate')} className="mt-1 w-full rounded-lg bg-slate-950 p-3" />
            </label>
            <label className="text-xs text-slate-400">Prefijo de documentos
              <input value={fiscal.invoicePrefix} onChange={setValue(setFiscal, 'invoicePrefix')} placeholder="Ej.: MAKD" className="mt-1 w-full rounded-lg bg-slate-950 p-3" />
            </label>
            <p className="sm:col-span-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">La condición fiscal debe coincidir con los documentos de la empresa y la normativa aplicable en Venezuela. Exento y no sujeto no significan lo mismo. Si tienes dudas, consulta a tu contador antes de guardar.</p></div>}

          {step === 3 && <div className="space-y-3"><p className="text-sm text-slate-300">Puedes invitar a una persona. Recibirá un enlace directo por correo si el servicio de correo está configurado, y deberá entrar con el mismo correo verificado.</p><input type="email" placeholder="Correo del colaborador (opcional)" value={invitation.inviteEmail} onChange={setValue(setInvitation,'inviteEmail')} className="w-full rounded-lg bg-slate-950 p-3"/><select value={invitation.inviteRole} onChange={setValue(setInvitation,'inviteRole')} className="w-full rounded-lg bg-slate-950 p-3"><option value="cashier">Cajero</option><option value="supervisor">Supervisor</option><option value="accountant">Contador</option><option value="auditor">Auditor</option><option value="admin">Administrador de empresa</option></select><div className="rounded-lg border border-slate-700 p-3 text-xs text-slate-400">Al abrir el enlace, podrá aceptar la invitación y entrar a la empresa con el rol asignado. Configura el remitente de correo y APP_PUBLIC_URL en el servidor.</div></div>}

          {step === 4 && <div className="grid gap-3"><label className="text-sm">Sucursales<input type="number" min="1" value={workspace.branches} onChange={setValue(setWorkspace,'branches')} className="mt-1 w-full rounded-lg bg-slate-950 p-3"/></label><label className="text-sm">Depósitos<input type="number" min="1" value={workspace.warehouses} onChange={setValue(setWorkspace,'warehouses')} className="mt-1 w-full rounded-lg bg-slate-950 p-3"/></label><fieldset className="rounded-xl border border-slate-700 p-4">
              <legend className="px-2 text-sm font-semibold">Categorías iniciales</legend>
              <p className="mb-3 text-xs text-slate-400">Marca las categorías que utilizará la empresa. Puedes seleccionar varias.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {selectedIndustryProfile.initialCategories.map((category) => {
                  const selectedCategories = workspace.categories.split(',').map((value) => value.trim()).filter(Boolean);
                  const checked = selectedCategories.includes(category);
                  return <label key={category} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <input type="checkbox" checked={checked} onChange={(event) => {
                      const next = event.target.checked
                         ? [...selectedCategories, category]
                         : selectedCategories.filter((value) => value !== category);
                      setWorkspace((current) => ({ ...current, categories: next.join(', ') }));
                    }} className="mt-1 accent-emerald-500" />
                    <span><span className="block text-sm font-medium text-white">{category}</span></span>
                  </label>;
                })}
              </div>
              <p className="mt-3 text-xs text-amber-200">Los bienes muebles e inmuebles se gestionan como activos fijos y no forman parte de las categorías de inventario.</p>
            </fieldset><p className="text-xs text-slate-500">Los módulos disponibles dependen del plan. Impuestos, numeración y reglas contables deben validarse según el país antes de uso comercial.</p></div>}

          {step === 5 && <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5"><ShieldCheck className="mb-3 text-emerald-400"/><h2 className="font-bold">Preparar el espacio de trabajo</h2><p className="mt-2 text-sm text-slate-300">Al finalizar se habilita el dashboard de esta empresa. Su suscripción de prueba dura 14 días y no configura cobros automáticos.</p></div>}

          <div className="flex justify-between gap-3"><button onClick={() => setMode('list')} className="rounded-lg border border-slate-700 px-4 py-3 text-sm">Guardar y continuar luego</button><button disabled={busy} onClick={() => void saveStep(step)} className="rounded-lg bg-emerald-600 px-5 py-3 font-bold disabled:opacity-50">{step === 5 ? 'Finalizar configuración' : 'Guardar y continuar'}</button></div>

        </div>}



        {mode === 'admin' && <div className="space-y-4"><button onClick={() => setMode('list')} className="text-sm text-slate-400">← Volver</button><h1 className="text-2xl font-bold">Administración central</h1><p className="text-sm text-amber-200">Control manual de planes, vencimientos y suspensión. Cobros automáticos desactivados.</p>

          <div className="flex items-center justify-between pt-2"><h2 className="font-semibold">Planes y límites</h2><button onClick={() => void createPlan().catch((e) => setError(e.message))} className="rounded border border-slate-700 px-3 py-2 text-xs">Crear plan</button></div>{(adminData?.plans || []).map((plan:any)=><div key={plan.id} className="rounded-xl border border-slate-700 p-4"><div className="flex justify-between"><div className="grid grid-cols-2 gap-2 sm:grid-cols-5"><input aria-label="Nombre del plan" value={plan.name} onChange={(e)=>setAdminData((current:any)=>({...current,plans:current.plans.map((p:any)=>p.id===plan.id?{...p,name:e.target.value}:p)}))} className="rounded bg-slate-950 p-2 text-sm"/><input aria-label="Precio del plan" type="number" min="0" step="0.01" value={plan.price} onChange={(e)=>setAdminData((current:any)=>({...current,plans:current.plans.map((p:any)=>p.id===plan.id?{...p,price:Number(e.target.value)}:p)}))} className="rounded bg-slate-950 p-2 text-sm"/><select aria-label="Moneda" value={plan.currency} onChange={(e)=>setAdminData((current:any)=>({...current,plans:current.plans.map((p:any)=>p.id===plan.id?{...p,currency:e.target.value}:p)}))} className="rounded bg-slate-950 p-2 text-sm"><option>USD</option><option>VES</option><option>EUR</option><option>COP</option></select><select aria-label="Frecuencia" value={plan.interval} onChange={(e)=>setAdminData((current:any)=>({...current,plans:current.plans.map((p:any)=>p.id===plan.id?{...p,interval:e.target.value}:p)}))} className="rounded bg-slate-950 p-2 text-sm"><option value="month">Mensual</option><option value="year">Anual</option></select><button onClick={()=>void updatePlan(plan,{name:plan.name,price:plan.price,currency:plan.currency,interval:plan.interval}).catch((e)=>setError(e.message))} className="rounded bg-slate-800 px-3 py-2 text-xs">Guardar precio</button></div><span className="text-xs text-slate-400">{plan.active?'Activo':'Inactivo'}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-5"><label className="text-xs text-slate-400">Usuarios<input type="number" min="1" value={plan.limits.users} onChange={(e)=>setAdminData((current:any)=>({...current,plans:current.plans.map((p:any)=>p.id===plan.id?{...p,limits:{...p.limits,users:Number(e.target.value)}}:p)}))} className="mt-1 w-full rounded bg-slate-950 p-2 text-white"/></label><label className="text-xs text-slate-400">Productos<input type="number" min="1" value={plan.limits.products} onChange={(e)=>setAdminData((current:any)=>({...current,plans:current.plans.map((p:any)=>p.id===plan.id?{...p,limits:{...p.limits,products:Number(e.target.value)}}:p)}))} className="mt-1 w-full rounded bg-slate-950 p-2 text-white"/></label><label className="text-xs text-slate-400">Sucursales<input type="number" min="1" value={plan.limits.branches} onChange={(e)=>setAdminData((current:any)=>({...current,plans:current.plans.map((p:any)=>p.id===plan.id?{...p,limits:{...p.limits,branches:Number(e.target.value)}}:p)}))} className="mt-1 w-full rounded bg-slate-950 p-2 text-white"/></label><label className="text-xs text-slate-400">Depósitos<input type="number" min="1" value={plan.limits.warehouses} onChange={(e)=>setAdminData((current:any)=>({...current,plans:current.plans.map((p:any)=>p.id===plan.id?{...p,limits:{...p.limits,warehouses:Number(e.target.value)}}:p)}))} className="mt-1 w-full rounded bg-slate-950 p-2 text-white"/></label><div className="flex items-end gap-2"><button onClick={()=>void updatePlan(plan,{limits:plan.limits}).catch((e)=>setError(e.message))} className="rounded bg-slate-800 px-3 py-2 text-xs">Guardar límites</button><button onClick={()=>void updatePlan(plan,{active:!plan.active}).catch((e)=>setError(e.message))} className="rounded bg-slate-800 px-3 py-2 text-xs">{plan.active?'Desactivar':'Activar'}</button></div></div></div>)}

          <section className="pt-4"><h2 className="text-lg font-bold">Administración de empresas y propietarios</h2><p className="mt-1 text-xs text-slate-400">Consulta quién es propietario de cada empresa, su estado y la conexión de datos. Archivar no elimina facturas ni bases de datos.</p></section>{(adminData?.companies || []).map((company:any)=><div key={company.id} className="rounded-xl border border-slate-700 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{company.tradeName || company.legalName}</strong><p className="mt-1 text-xs text-slate-300">Propietario: <span className="font-semibold text-emerald-300">{company.ownerEmail || company.email || 'Correo no disponible'}</span></p><p className="text-xs text-slate-400">{company.status} · {company.subscription?.status || 'sin suscripción'} · {company.memberships} miembros · Neon {company.tenantDatabaseStatus === 'ready' ? 'conectado' : 'pendiente'}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => void transferCompanyOwner(company).catch((e)=>setError(e.message))} className="rounded-lg border border-emerald-500/50 px-3 py-2 text-xs text-emerald-200">Transferir propietario</button><button onClick={() => void updateCompany(company,{status:company.status==='active'?'suspended':'active'}).catch((e)=>setError(e.message))} className="rounded-lg border border-slate-600 px-3 py-2 text-xs">{company.status==='active'?'Suspender':'Reactivar'}</button>{company.status !== 'archived' && <button onClick={() => { if (window.confirm(`¿Archivar ${company.tradeName || company.legalName}? No se borrarán sus datos, pero dejará de estar activa.`)) void updateCompany(company,{status:'archived'}).catch((e)=>setError(e.message)); }} className="rounded-lg border border-amber-500/50 px-3 py-2 text-xs text-amber-200">Archivar</button>}</div></div><div className="mt-3 grid gap-2 sm:grid-cols-3"><select defaultValue={company.subscription?.planId || ''} onChange={(e)=>void updateCompany(company,{planId:e.target.value,subscriptionStatus:'active'}).catch((err)=>setError(err.message))} className="rounded bg-slate-950 p-2 text-sm"><option value="" disabled>Asignar plan</option>{(adminData?.plans || []).filter((plan:any)=>plan.active).map((plan:any)=><option key={plan.id} value={plan.id}>{plan.name}</option>)}</select><input type="date" defaultValue={company.subscription?.currentPeriodEnd?.slice(0,10) || ''} onChange={(e)=>setAdminData((current:any)=>({...current,companies:current.companies.map((item:any)=>item.id===company.id?{...item,renewalDate:e.target.value}:item)}))} className="rounded bg-slate-950 p-2 text-sm"/><button onClick={() => void updateCompany(company,{subscriptionStatus:'active',currentPeriodEnd:company.renewalDate?new Date(`${company.renewalDate}T23:59:59.000Z`).toISOString():company.subscription?.currentPeriodEnd}).catch((e)=>setError(e.message))} className="rounded bg-emerald-700 px-3 py-2 text-xs">Activar / renovar</button></div><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void updateCompany(company,{subscriptionStatus:'past_due'}).catch((e)=>setError(e.message))} className="rounded bg-slate-800 px-3 py-2 text-xs">Marcar vencido</button><button onClick={() => void updateCompany(company,{subscriptionStatus:'canceled'}).catch((e)=>setError(e.message))} className="rounded bg-slate-800 px-3 py-2 text-xs">Cancelar</button></div><div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-slate-700 p-3"><label className="min-w-64 flex-1 text-xs text-slate-400">Variable de conexión Neon en Render<input aria-label={`Variable Neon para ${company.tradeName || company.legalName}`} value={tenantDatabaseEnvNames[company.id] || ''} onChange={(e)=>setTenantDatabaseEnvNames((current)=>({...current,[company.id]:e.target.value.toUpperCase()}))} placeholder="MAKD_SHOP_DATABASE_URL" className="mt-1 w-full rounded bg-slate-950 p-2 text-white"/></label><button onClick={()=>void connectTenantDatabase(company).catch((e)=>setError(e.message))} className="rounded bg-emerald-700 px-3 py-2 text-xs">Verificar y conectar Neon</button></div></div>)}</div>}

      </section>

    </main>

  );

};
