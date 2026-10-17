import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, Briefcase, BriefcaseMedical, Building2, Calculator, Check, ClipboardList,
  Edit3, Factory, GraduationCap, HardHat, Hotel, LoaderCircle, Mail, Milk, Plus,
  Save, Scale, ShieldCheck, ShoppingBag, Trash2, Users, Wheat, X,
} from 'lucide-react';
import { COMPANY_INDUSTRIES, INDUSTRY_WORKFLOWS, resolveIndustryTemplate, type IndustryTemplate } from '../../domain/companyIndustries';
import { PushNotificationSettings } from '../common/PushNotificationSettings';

type AdminTab = 'company' | 'team' | 'categories' | 'notifications';
type CompanyProfile = {
  legalName: string; tradeName: string; taxId: string; activity: string; address: string;
  phone: string; email: string; industryTemplate: IndustryTemplate;
};
type TeamMember = { companyId: string; userId: string; email: string; displayName: string; role: string };
type Invitation = { id: string; companyId: string; email: string; role: string; expiresAt: string };
type Category = { id: string; name: string; kind: 'product' | 'service'; legacy?: boolean };

const roleOptions = [
  { value: 'admin', label: 'Administrador' },
  { value: 'accountant', label: 'Contador' },
  { value: 'auditor', label: 'Auditor' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'cashier', label: 'Cajera / Ventas' },
];

const industryIcons: Record<IndustryTemplate, React.ComponentType<{ className?: string }>> = {
  food_manufacturing: Milk,
  manufacturing: Factory,
  footwear: ShoppingBag,
  commerce: Briefcase,
  services: Briefcase,
  health: BriefcaseMedical,
  legal: Scale,
  accounting: Calculator,
  education: GraduationCap,
  hospitality: Hotel,
  construction: HardHat,
  agriculture: Wheat,
  other: Building2,
};

const industryStyles: Record<IndustryTemplate, string> = {
  food_manufacturing: 'from-lime-600 to-emerald-400',
  manufacturing: 'from-slate-700 to-blue-500',
  footwear: 'from-orange-500 to-amber-400',
  commerce: 'from-indigo-600 to-violet-400',
  services: 'from-indigo-600 to-violet-400',
  health: 'from-emerald-600 to-teal-400',
  legal: 'from-slate-700 to-slate-500',
  accounting: 'from-cyan-700 to-sky-400',
  education: 'from-blue-700 to-sky-400',
  hospitality: 'from-rose-600 to-orange-400',
  construction: 'from-amber-600 to-yellow-400',
  agriculture: 'from-green-700 to-lime-400',
  other: 'from-fuchsia-700 to-pink-400',
};

const industryOptions = Object.entries(COMPANY_INDUSTRIES).map(([value, industry]) => ({
  value: value as IndustryTemplate,
  label: industry.label,
  description: industry.description,
  Icon: industryIcons[value as IndustryTemplate],
  style: industryStyles[value as IndustryTemplate],
}));

const emptyProfile: CompanyProfile = {
  legalName: '', tradeName: '', taxId: '', activity: '', address: '', phone: '', email: '', industryTemplate: 'other',
};

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  let body: { error?: string };
  try {
    body = await response.json() as { error?: string };
  } catch {
    throw new Error(`El servidor devolvió una respuesta inválida (HTTP ${response.status}).`);
  }
  if (!response.ok) throw new Error(body.error || `La solicitud falló (HTTP ${response.status}).`);
  return body as T;
}

export const CompanyAdminPanel: React.FC<{ companyId: string }> = ({ companyId }) => {
  const [tab, setTab] = useState<AdminTab>('company');
  const [profile, setProfile] = useState<CompanyProfile>(emptyProfile);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('cashier');
  const [categoryKind, setCategoryKind] = useState<'product' | 'service'>('product');
  const [categoryName, setCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const activeIndustry = useMemo(
    () => industryOptions.find((item) => item.value === profile.industryTemplate) || industryOptions.find((item) => item.value === 'other')!,
    [profile.industryTemplate],
  );

  const loadPanel = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [companyData, memberData, categoryData, platformData] = await Promise.all([
        apiRequest<{ company: CompanyProfile }>(`/api/company/profile`),
        apiRequest<{ members: TeamMember[] }>('/api/company/members'),
        apiRequest<{ categories: Category[] }>('/api/company/categories'),
        apiRequest<{ managedInvitations: Invitation[] }>('/api/platform/companies'),
      ]);
      const company = companyData.company;
      const industry = resolveIndustryTemplate(company.industryTemplate, company.activity);
      setProfile({ ...emptyProfile, ...company, industryTemplate: industry });
      localStorage.setItem('nexoss_active_company_industry', industry);
      setMembers(memberData.members.filter((item) => item.companyId === companyId));
      setCategories(categoryData.categories);
      setInvitations(platformData.managedInvitations.filter((item) => item.companyId === companyId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el panel de administración.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void loadPanel(); }, [loadPanel]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await apiRequest('/api/company/profile', { method: 'PUT', body: JSON.stringify(profile) });
      localStorage.setItem('nexoss_active_company_name', profile.tradeName || profile.legalName);
      localStorage.setItem('nexoss_active_company_industry', profile.industryTemplate);
      window.dispatchEvent(new Event('nexoss:company-profile-updated'));
      setNotice('Información de la empresa guardada.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la empresa.');
    } finally {
      setBusy(false);
    }
  };

  const inviteMember = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest<{ emailSent?: boolean; emailError?: string; activation?: string }>(`/api/platform/companies/${companyId}/invitations`, {
        method: 'POST', body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setInviteEmail('');
      if (result.emailSent === false) {
        // La invitación existe aunque el correo no haya salido: se explica el motivo para poder corregirlo.
        setError(`${result.activation || 'La invitación quedó creada, pero el correo no se pudo enviar.'}${result.emailError ? ` Motivo: ${result.emailError}` : ''}`);
      } else {
        setNotice(result.activation || 'Invitación creada. La persona debe iniciar sesión con ese correo verificado.');
      }
      await loadPanel();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'No se pudo invitar al usuario.');
    } finally {
      setBusy(false);
    }
  };

  const changeMemberRole = async (member: TeamMember, role: string) => {
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/api/company/members/${member.userId}`, { method: 'PUT', body: JSON.stringify({ role }) });
      await loadPanel();
      setNotice(`Rol actualizado para ${member.email}.`);
    } catch (roleError) {
      setError(roleError instanceof Error ? roleError.message : 'No se pudo cambiar el rol.');
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (member: TeamMember) => {
    if (!window.confirm(`¿Retirar a ${member.email} del equipo de esta empresa?`)) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/api/company/members/${member.userId}`, { method: 'DELETE' });
      await loadPanel();
      setNotice('Miembro retirado de la empresa.');
    } catch (memberError) {
      setError(memberError instanceof Error ? memberError.message : 'No se pudo retirar al miembro.');
    } finally {
      setBusy(false);
    }
  };

  const revokeInvitation = async (invitation: Invitation) => {
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/api/platform/companies/${companyId}/invitations/${invitation.id}`, { method: 'DELETE' });
      await loadPanel();
      setNotice('Invitación pendiente revocada.');
    } catch (invitationError) {
      setError(invitationError instanceof Error ? invitationError.message : 'No se pudo revocar la invitación.');
    } finally {
      setBusy(false);
    }
  };

  const saveCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const editing = categories.find((item) => item.id === editingCategoryId);
      if (editing) {
        await apiRequest(`/api/company/categories/${editing.id}`, { method: 'PUT', body: JSON.stringify({ name: categoryName }) });
      } else {
        await apiRequest('/api/company/categories', { method: 'POST', body: JSON.stringify({ name: categoryName, kind: categoryKind }) });
      }
      setCategoryName('');
      setEditingCategoryId('');
      const response = await apiRequest<{ categories: Category[] }>('/api/company/categories');
      setCategories(response.categories);
      setNotice('Categoría guardada.');
    } catch (categoryError) {
      setError(categoryError instanceof Error ? categoryError.message : 'No se pudo guardar la categoría.');
    } finally {
      setBusy(false);
    }
  };

  const removeCategory = async (category: Category) => {
    if (category.legacy) return;
    if (!window.confirm(`¿Eliminar la categoría «${category.name}»?`)) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/api/company/categories/${category.id}`, { method: 'DELETE' });
      setCategories((current) => current.filter((item) => item.id !== category.id));
      setNotice('Categoría eliminada.');
    } catch (categoryError) {
      setError(categoryError instanceof Error ? categoryError.message : 'No se pudo eliminar la categoría.');
    } finally {
      setBusy(false);
    }
  };

  const tabs: Array<{ id: AdminTab; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'company', label: 'Empresa y rubro', Icon: Building2 },
    { id: 'team', label: 'Equipo y roles', Icon: Users },
    { id: 'categories', label: 'Categorías', Icon: ClipboardList },
    { id: 'notifications', label: 'Notificaciones', Icon: Activity },
  ];
  const IndustryIcon = activeIndustry.Icon;

  if (loading) return <div className="grid min-h-[420px] place-items-center text-sm text-slate-500"><LoaderCircle className="mr-2 inline h-5 w-5 animate-spin" /> Cargando administración…</div>;

  return (
    <section className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
      <header className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${activeIndustry.style} p-6 text-white shadow-lg sm:p-8`}>
        <div className="absolute -right-8 -top-10 opacity-20"><IndustryIcon className="h-52 w-52" /></div>
        <div className="relative flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/30">
            <IndustryIcon className="h-8 w-8" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/75">Panel de administración</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{profile.tradeName || profile.legalName}</h2>
            <p className="mt-1 text-sm text-white/80">{activeIndustry.label} · {activeIndustry.description}</p>
          </div>
        </div>
      </header>

      <nav aria-label="Administración de empresa" className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </nav>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
      {busy && <p className="text-xs text-slate-500"><LoaderCircle className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Guardando cambios…</p>}

      {tab === 'company' && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,.8fr)]">
          <form onSubmit={saveProfile} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Información empresarial</h3>
              <p className="mt-1 text-sm text-slate-500">Corrige o actualiza los datos que aparecen en tu espacio de trabajo.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ['tradeName', 'Nombre comercial'], ['legalName', 'Razón social'], ['taxId', 'RIF / identificación fiscal'],
                ['activity', 'Actividad económica'], ['email', 'Correo de la empresa'], ['phone', 'Teléfono'],
              ] as Array<[keyof CompanyProfile, string]>).map(([key, label]) => (
                <label key={key} className="space-y-1 text-xs font-semibold text-slate-600">
                  {label}
                  <input required={key === 'legalName' || key === 'email'} value={profile[key]} onChange={(event) => setProfile((value) => ({ ...value, [key]: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
                </label>
              ))}
              <label className="space-y-1 text-xs font-semibold text-slate-600 sm:col-span-2">
                Dirección
                <textarea rows={2} value={profile.address} onChange={(event) => setProfile((value) => ({ ...value, address: event.target.value }))} className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
              </label>
            </div>
            <button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
              <Save className="h-4 w-4" /> Guardar información
            </button>
          </form>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h3 className="text-lg font-bold text-slate-900">Imagen prediseñada por rubro</h3>
            <p className="mt-1 text-sm text-slate-500">Elige la portada visual que mejor representa la actividad de tu empresa.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {industryOptions.map(({ value, label, Icon, style }) => (
                <button key={value} type="button" onClick={() => setProfile((current) => ({ ...current, industryTemplate: value }))} className={`rounded-xl border p-3 text-left transition ${profile.industryTemplate === value ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-slate-300'}`}>
                  <span className={`grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br ${style} text-white`}><Icon className="h-5 w-5" /></span>
                  <span className="mt-2 block text-xs font-bold text-slate-800">{label}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">El perfil define las categorías iniciales y el flujo operativo recomendado para esta rama.</p>
          </section>
          <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5 shadow-sm sm:p-6 lg:col-span-2">
            <h3 className="text-lg font-bold text-slate-900">Flujo operativo · {activeIndustry.label}</h3>
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <div><p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Pasos de trabajo</p><ol className="mt-2 space-y-2">{INDUSTRY_WORKFLOWS[profile.industryTemplate].flow.map((item, index) => <li key={item} className="flex gap-2 text-sm text-slate-700"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">{index + 1}</span>{item}</li>)}</ol></div>
              <div><p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Datos que el perfil debe controlar</p><ul className="mt-2 space-y-2">{INDUSTRY_WORKFLOWS[profile.industryTemplate].records.map((item) => <li key={item} className="rounded-lg border border-indigo-100 bg-white px-3 py-2 text-sm text-slate-700">{item}</li>)}</ul><p className="mt-3 text-xs text-slate-500">Guarda el perfil para aplicarlo en el espacio de esta empresa.</p></div>
            </div>
          </section>
        </div>
      )}

      {tab === 'team' && (
        <div className="space-y-5">
          <form onSubmit={inviteMember} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-[1fr_220px_auto] md:items-end">
            <label className="space-y-1 text-xs font-semibold text-slate-600">
              Correo del usuario
              <input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="persona@empresa.com" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">
              Rol asignado
              <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900">
                {roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
              </select>
            </label>
            <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"><Plus className="h-4 w-4" /> Invitar</button>
          </form>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4"><h3 className="font-bold text-slate-900">Miembros activos</h3><p className="text-xs text-slate-500">Asigna un rol predefinido o retira el acceso a la empresa.</p></div>
            <div className="divide-y divide-slate-100">
              {members.map((member) => (
                <div key={member.userId} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{member.displayName || member.email}</p><p className="truncate text-xs text-slate-500">{member.email}</p></div>
                  <div className="flex items-center gap-2">
                    {member.role === 'owner'
                      ? <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"><ShieldCheck className="h-4 w-4" /> Propietario</span>
                      : <>
                        <select aria-label={`Rol de ${member.email}`} disabled={busy} value={member.role} onChange={(event) => void changeMemberRole(member, event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800">
                          {roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                        </select>
                        <button type="button" disabled={busy} onClick={() => void removeMember(member)} aria-label={`Retirar ${member.email}`} className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                      </>}
                  </div>
                </div>
              ))}
              {!members.length && <p className="px-5 py-8 text-center text-sm text-slate-500">Todavía no hay miembros en el equipo.</p>}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4"><h3 className="font-bold text-slate-900">Invitaciones pendientes</h3></div>
            <div className="divide-y divide-slate-100">
              {invitations.map((invitation) => (
                <div key={invitation.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="text-sm font-semibold text-slate-900">{invitation.email}</p><p className="text-xs text-slate-500">{roleOptions.find((role) => role.value === invitation.role)?.label || invitation.role} · vence {new Date(invitation.expiresAt).toLocaleDateString()}</p></div>
                  <button type="button" disabled={busy} onClick={() => void revokeInvitation(invitation)} className="inline-flex items-center gap-1 self-start rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><X className="h-3.5 w-3.5" /> Revocar</button>
                </div>
              ))}
              {!invitations.length && <p className="px-5 py-6 text-sm text-slate-500">No hay invitaciones pendientes.</p>}
            </div>
            <p className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-500"><Mail className="h-4 w-4" /> El invitado debe iniciar sesión y verificar el mismo correo al que se envió la invitación.</p>
          </section>
        </div>
      )}

      {tab === 'categories' && (
        <div className="grid gap-5 lg:grid-cols-[minmax(260px,.75fr)_minmax(0,1.25fr)]">
          <form onSubmit={saveCategory} className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">{editingCategoryId ? 'Editar categoría' : 'Crear categoría'}</h3>
            <label className="block space-y-1 text-xs font-semibold text-slate-600">
              Tipo
              <select disabled={Boolean(editingCategoryId)} value={categoryKind} onChange={(event) => setCategoryKind(event.target.value as 'product' | 'service')} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900">
                <option value="product">Productos</option><option value="service">Servicios</option>
              </select>
            </label>
            <label className="block space-y-1 text-xs font-semibold text-slate-600">
              Nombre de la categoría
              <input required minLength={2} maxLength={100} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal text-slate-900" placeholder={categoryKind === 'product' ? 'Ej. Calzado' : 'Ej. Consulta profesional'} />
            </label>
            <div className="flex gap-2">
              <button disabled={busy} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">{editingCategoryId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{editingCategoryId ? 'Guardar' : 'Crear categoría'}</button>
              {editingCategoryId && <button type="button" onClick={() => { setEditingCategoryId(''); setCategoryName(''); }} className="rounded-xl border border-slate-300 px-3 text-slate-600"><X className="h-4 w-4" /></button>}
            </div>
            <p className="text-xs leading-relaxed text-slate-500">Las categorías de productos existentes se muestran para referencia; las categorías nuevas se comparten con el catálogo de productos.</p>
          </form>
          <div className="space-y-5">
            {(['product', 'service'] as const).map((kind) => (
              <section key={kind} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
                  {kind === 'product' ? <ShoppingBag className="h-5 w-5 text-indigo-600" /> : <Activity className="h-5 w-5 text-emerald-600" />}
                  <div><h3 className="font-bold text-slate-900">{kind === 'product' ? 'Categorías de productos' : 'Categorías de servicios'}</h3><p className="text-xs text-slate-500">{categories.filter((item) => item.kind === kind).length} categorías</p></div>
                </div>
                <div className="divide-y divide-slate-100">
                  {categories.filter((item) => item.kind === kind).map((category) => (
                    <div key={category.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div><p className="text-sm font-semibold text-slate-800">{category.name}</p>{category.legacy && <p className="text-[11px] text-slate-400">Detectada en el catálogo existente</p>}</div>
                      {!category.legacy && <div className="flex gap-1">
                        <button type="button" onClick={() => { setCategoryKind(category.kind); setCategoryName(category.name); setEditingCategoryId(category.id); }} aria-label={`Editar ${category.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Edit3 className="h-4 w-4" /></button>
                        <button type="button" onClick={() => void removeCategory(category)} aria-label={`Eliminar ${category.name}`} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                      </div>}
                    </div>
                  ))}
                  {!categories.some((item) => item.kind === kind) && <p className="px-5 py-6 text-sm text-slate-500">Aún no hay categorías. Puedes crear la primera.</p>}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {tab === 'notifications' && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div><h3 className="text-lg font-bold text-slate-900">Notificaciones de esta empresa</h3><p className="mt-1 text-sm text-slate-500">Activa cada dispositivo, envía una prueba y desactívalo desde aquí cuando quieras.</p></div>
          <PushNotificationSettings key={companyId} mode="settings" />
        </div>
      )}
    </section>
  );
};
