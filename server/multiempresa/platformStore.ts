import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ALL_INDUSTRY_CATEGORIES, normalizeIndustryTemplate } from '../../src/domain/companyIndustries.ts';

export type CompanyStatus = 'onboarding' | 'active' | 'suspended' | 'archived';
export type MembershipRole = 'owner' | 'admin' | 'accountant' | 'auditor' | 'supervisor' | 'cashier';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled';

export interface PlatformCompany {
  id: string; slug: string; legalName: string; tradeName: string; taxId: string;
  countryCode: string; activity: string; address: string; phone: string; email: string;
  logoUrl: string; fiscal: Record<string, unknown>; workspace: Record<string, unknown>;
  onboardingStep: number; status: CompanyStatus; createdAt: string; updatedAt: string;
}
export interface PlatformUser { id: string; provider: 'firebase'; subject: string; email: string; displayName: string; createdAt: string; }
export interface Membership { companyId: string; userId: string; role: MembershipRole; status: 'active' | 'revoked'; createdAt: string; }
export interface Invitation { id: string; companyId: string; email: string; role: Exclude<MembershipRole, 'owner'>; status: 'pending' | 'accepted' | 'revoked' | 'expired'; createdAt: string; expiresAt: string; }
export interface Plan { id: string; name: string; price: number; currency: string; interval: 'month' | 'year'; limits: { users: number; products: number; branches: number; warehouses: number }; modules: string[]; active: boolean; }
export interface Subscription { companyId: string; planId: string; status: SubscriptionStatus; startedAt: string; currentPeriodEnd: string; updatedAt: string; }
export interface AuditEvent { id: string; actorUid: string; companyId?: string; action: string; createdAt: string; metadata: Record<string, unknown>; }
export interface PlatformState { companies: PlatformCompany[]; users: PlatformUser[]; memberships: Membership[]; invitations: Invitation[]; plans: Plan[]; subscriptions: Subscription[]; audit: AuditEvent[]; }

const initialState = (): PlatformState => ({
  companies: [], users: [], memberships: [], invitations: [], subscriptions: [], audit: [],
  plans: [{ id: 'trial', name: 'Prueba', price: 0, currency: 'USD', interval: 'month', limits: { users: 3, products: 500, branches: 1, warehouses: 1 }, modules: ['pos', 'inventory', 'reports', 'accounting'], active: true }],
});

/** File persistence is an explicitly local demo adapter; it is never enabled in production. */
export class LocalPlatformStore {
  private readonly filePath: string;
  constructor(filePath = path.resolve(process.cwd(), 'server/data/platform/control-plane.json')) { this.filePath = filePath; }

  private read(): PlatformState {
    if (process.env.NODE_ENV === 'production' || process.env.NEXOSS_MULTIEMPRESA_MODE !== 'local-demo') {
      throw new Error('El control plane requiere un repositorio persistente aprobado; el adaptador local demo está desactivado.');
    }
    try {
      const value = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<PlatformState>;
      const defaults = initialState();
      return { ...defaults, ...value, companies: value.companies || [], users: value.users || [], memberships: value.memberships || [], invitations: value.invitations || [], plans: value.plans || defaults.plans, subscriptions: value.subscriptions || [], audit: value.audit || [] };
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw new Error('No se pudo leer el control plane local.');
      return initialState();
    }
  }

  private write(state: PlatformState): void {
    if (process.env.NODE_ENV === 'production' || process.env.NEXOSS_MULTIEMPRESA_MODE !== 'local-demo') {
      throw new Error('El control plane local solo se permite en modo local-demo.');
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.${randomUUID()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state, null, 2), { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temp, this.filePath);
  }

  readState(): PlatformState { return this.read(); }
  update<T>(fn: (state: PlatformState) => T): T {
    const state = this.read();
    const result = fn(state);
    this.write(state);
    return result;
  }
}

export function normalizeCompanyInput(input: unknown): Pick<PlatformCompany, 'legalName' | 'tradeName' | 'taxId' | 'countryCode' | 'activity' | 'address' | 'phone' | 'email' | 'logoUrl'> {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const clean = (key: string, max: number) => typeof value[key] === 'string' ? (value[key] as string).trim().slice(0, max) : '';
  const legalName = clean('legalName', 180);
  if (legalName.length < 2) throw new Error('La razón social es obligatoria.');
  normalizeIndustryTemplate(value.industryTemplate, clean('activity', 180));
  return {
    legalName, tradeName: clean('tradeName', 180), taxId: clean('taxId', 40),
    countryCode: (clean('countryCode', 5) || 'VE').toUpperCase(), activity: clean('activity', 180),
    address: clean('address', 500), phone: clean('phone', 40), email: clean('email', 254), logoUrl: '',
  };
}

export function findCompanyEmailMatches(
  state: PlatformState,
  identity: { uid: string; email?: string; emailVerified: boolean },
): Array<{ id: string; legalName: string; tradeName: string; status: CompanyStatus }> {
  if (!identity.uid || !identity.email || identity.emailVerified !== true) return [];
  const user = state.users.find((item) => item.subject === identity.uid);
  const knownCompanyIds = new Set(
    user
      ? state.memberships.filter((membership) => membership.userId === user.id).map((membership) => membership.companyId)
      : [],
  );
  const email = identity.email.trim().toLowerCase();
  return state.companies
    .filter((company) => company.email.trim().toLowerCase() === email && !knownCompanyIds.has(company.id))
    .map(({ id, legalName, tradeName, status }) => ({ id, legalName, tradeName, status }));
}

export function normalizeInventoryCategories(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Selecciona al menos una categoría de inventario.');
  const categories = [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))];
  if (categories.length === 0 || categories.length > 30 || categories.some((category) => category.length > 80 || !(ALL_INDUSTRY_CATEGORIES as readonly string[]).includes(category))) {
    throw new Error('Selecciona categorías de inventario válidas.');
  }
  return categories;
}

export function createCompanyForVerifiedUser(store: LocalPlatformStore, input: unknown, identity: { uid: string; email?: string; emailVerified: boolean; displayName?: string }) {
  if (!identity.uid || !identity.email || identity.emailVerified !== true) throw new Error('Firebase debe proporcionar una identidad con correo verificado.');
  const companyInput = normalizeCompanyInput(input);
  const rawInput = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const industryTemplate = normalizeIndustryTemplate(rawInput.industryTemplate, companyInput.activity);
  return store.update((state) => {
    const normalizedTaxId = companyInput.taxId.replace(/[^a-z0-9]/gi, '').toUpperCase();
    if (normalizedTaxId && state.companies.some((company) => company.taxId.replace(/[^a-z0-9]/gi, '').toUpperCase() === normalizedTaxId)) {
      throw new Error('Ya existe una empresa con esa identificación fiscal.');
    }
    const user = state.users.find((item) => item.subject === identity.uid) || {
      id: randomUUID(), provider: 'firebase' as const, subject: identity.uid,
      email: identity.email!.toLowerCase(), displayName: (identity.displayName || '').slice(0, 180), createdAt: new Date().toISOString(),
    };
    if (!state.users.some((item) => item.subject === identity.uid)) state.users.push(user);
    const id = randomUUID();
    const slugBase = companyInput.legalName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'empresa';
    const now = new Date();
    const company: PlatformCompany = { id, slug: `${slugBase}-${id.slice(0, 8)}`, ...companyInput, fiscal: {}, workspace: { industryTemplate }, onboardingStep: 2, status: 'onboarding', createdAt: now.toISOString(), updatedAt: now.toISOString() };
    const trial = state.plans.find((plan) => plan.id === 'trial' && plan.active);
    if (!trial) throw new Error('No hay un plan de prueba disponible.');
    state.companies.push(company);
    state.memberships.push({ companyId: id, userId: user.id, role: 'owner', status: 'active', createdAt: now.toISOString() });
    state.subscriptions.push({ companyId: id, planId: trial.id, status: 'trialing', startedAt: now.toISOString(), currentPeriodEnd: new Date(now.getTime() + 14 * 86400000).toISOString(), updatedAt: now.toISOString() });
    state.audit.push({ id: randomUUID(), actorUid: identity.uid, companyId: id, action: 'company.created', createdAt: now.toISOString(), metadata: { source: 'self_service' } });
    return company;
  });
}

export function isInvitationPending(invitation: Invitation, now = new Date()): boolean {
  const expiresAt = Date.parse(invitation.expiresAt);
  return invitation.status === 'pending' && Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

export function createCompanyInvitation(
  companyId: string,
  email: string,
  role: Exclude<MembershipRole, 'owner'>,
  now = new Date(),
): Invitation {
  return {
    id: randomUUID(),
    companyId,
    email: email.toLowerCase(),
    role,
    status: 'pending',
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString(),
  };
}

export function acceptCompanyInvitation(
  store: LocalPlatformStore,
  invitationId: string,
  identity: { uid: string; email?: string; emailVerified: boolean; displayName?: string },
  now = new Date(),
): number {
  if (!identity.uid || !identity.email || identity.emailVerified !== true || !invitationId) return 0;
  return store.update((state) => {
    const invitation = state.invitations.find((item) => item.id === invitationId);
    if (!invitation || invitation.email.toLowerCase() !== identity.email!.toLowerCase() || invitation.status !== 'pending') return 0;
    if (!isInvitationPending(invitation, now)) {
      invitation.status = 'expired';
      return 0;
    }
    const company = state.companies.find((item) => item.id === invitation.companyId);
    if (!company || !['onboarding', 'active'].includes(company.status) || !hasActiveSubscription(state, company.id, now)) return 0;

    let user = state.users.find((item) => item.subject === identity.uid);
    if (!user) {
      user = { id: randomUUID(), provider: 'firebase', subject: identity.uid, email: identity.email.toLowerCase(), displayName: identity.displayName || '', createdAt: now.toISOString() };
      state.users.push(user);
    }
    const membership = state.memberships.find((item) => item.companyId === invitation.companyId && item.userId === user!.id);
    if (membership) {
      membership.role = membership.status === 'active' ? membership.role : invitation.role;
      membership.status = 'active';
    } else {
      state.memberships.push({ companyId: invitation.companyId, userId: user.id, role: invitation.role, status: 'active', createdAt: now.toISOString() });
    }
    invitation.status = 'accepted';
    state.audit.push({ id: randomUUID(), actorUid: identity.uid, companyId: invitation.companyId, action: 'membership.invitation_accepted', createdAt: now.toISOString(), metadata: {} });
    return 1;
  });
}

export function getCompanyOnboardingMembership(state: PlatformState, uid: string | undefined, companyId: string, now = new Date()): Membership | null {
  if (!uid) return null;
  const user = state.users.find((item) => item.subject === uid);
  const membership = user && state.memberships.find((item) => item.userId === user.id && item.companyId === companyId && item.status === 'active' && ['owner', 'admin'].includes(item.role));
  const company = state.companies.find((item) => item.id === companyId && ['onboarding', 'active'].includes(item.status));
  return membership && company && hasActiveSubscription(state, company.id, now) ? membership : null;
}

export function hasActiveSubscription(state: PlatformState, companyId: string, now = new Date()): boolean {
  const subscription = state.subscriptions.find((item) => item.companyId === companyId);
  if (!subscription || !['trialing', 'active'].includes(subscription.status)) return false;
  const plan = state.plans.find((item) => item.id === subscription.planId && item.active);
  return Boolean(plan && Date.parse(subscription.currentPeriodEnd) > now.getTime());
}

export function platformAdminUids(): Set<string> {
  return new Set((process.env.NEXOSS_PLATFORM_ADMIN_UIDS || '').split(',').map((uid) => uid.trim()).filter(Boolean));
}

export function isPlatformAdmin(identity: { uid?: string; email?: string; emailVerified?: boolean } | null | undefined): boolean {
  if (!identity?.uid) return false;
  if (platformAdminUids().has(identity.uid)) return true;
  if (identity.emailVerified !== true || !identity.email) return false;
  const allowedEmails = new Set((process.env.NEXOSS_PLATFORM_ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
  return allowedEmails.has(identity.email.trim().toLowerCase());
}
