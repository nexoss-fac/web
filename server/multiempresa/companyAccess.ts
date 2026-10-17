import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { FirebaseAuthenticatedRequest } from '../auth/firebaseAuth.ts';
import { LocalPlatformStore, hasActiveSubscription, type MembershipRole } from './platformStore.ts';
import { resolveAuthorizedTenant, TenantResolutionError, type TenantRepository, type TenantSecretProvider } from './tenantResolver.ts';

export interface TenantStorageContext {
  companyId: string;
  uid: string;
  role: MembershipRole;
  companySlug?: string;
  connectionString?: string;
}
export const tenantStorageContext = new AsyncLocalStorage<TenantStorageContext>();
export interface TenantAuthenticatedRequest extends FirebaseAuthenticatedRequest { tenant?: TenantStorageContext; }

/** Módulo del plan que habilita cada grupo de rutas (la primera coincidencia gana). */
const MODULE_BY_ROUTE: Array<{ module: string; route: RegExp }> = [
  { module: 'accounting', route: /^\/accounting/ },
  { module: 'pos', route: /^\/(?:sales|layaways|bdv|pos|invoices|contacts)(?:\/|$)/ },
  { module: 'inventory', route: /^\/(?:products|movements|catalog|ai)(?:\/|$)/ },
  { module: 'reports', route: /^\/(?:expenses|closures|bank-reconciliations|reports)(?:\/|$)/ },
];

/** Rutas que solo pueden usar owner y admin, sin importar el rol. */
const OWNER_ONLY_ROUTES = /^\/db(?:\/|$)/;

interface RequestInfo {
  method: string;
  route: string;
  readOnly: boolean;
  /** Valor de `tipo` en el query (lecturas) o en el cuerpo (escrituras). */
  contactType: string;
}

interface AllowRule {
  /** 'read' = GET/HEAD; 'write' = cualquier otro método; o una lista de métodos exactos. */
  methods: 'read' | 'write' | string[];
  route: RegExp;
  when?: (request: RequestInfo) => boolean;
}

interface RolePolicy {
  /** Acceso total. */
  all?: boolean;
  /** Puede leer cualquier ruta. */
  readAny?: boolean;
  /** Puede escribir en cualquier ruta salvo estas. */
  writeExcept?: RegExp;
  /** Permisos puntuales adicionales. */
  allow?: AllowRule[];
}

const isCustomerContact = (request: RequestInfo) => request.route === '/contacts' && request.contactType === 'cliente';

/** Tabla de permisos: para agregar o cambiar un rol se edita aquí, no la lógica. */
const ROLE_POLICY: Record<MembershipRole, RolePolicy> = {
  owner: { all: true },
  admin: { all: true },
  auditor: { readAny: true },
  accountant: {
    readAny: true,
    allow: [{ methods: ['POST', 'DELETE'], route: /^\/accounting\/journal(?:\/[^/]+)?$/ }],
  },
  supervisor: {
    readAny: true,
    writeExcept: /^\/(?:db(?:\/|$)|catalog(?:\/|$)|store\/sync$|accounting(?:\/|$))/,
  },
  cashier: {
    allow: [
      { methods: 'read', route: /^\/pos\/(?:state|version)$/ },
      { methods: 'read', route: /^\/sales$/ },
      { methods: 'read', route: /^\/contacts$/, when: isCustomerContact },
      { methods: ['POST'], route: /^\/sales$/ },
      { methods: ['POST'], route: /^\/invoices\/next$/ },
      { methods: ['POST'], route: /^\/bdv\/verificar$/ },
      { methods: 'write', route: /^\/contacts$/, when: isCustomerContact },
    ],
  },
};

function ruleApplies(rule: AllowRule, request: RequestInfo): boolean {
  const methodOk = rule.methods === 'read' ? request.readOnly
    : rule.methods === 'write' ? !request.readOnly
    : rule.methods.includes(request.method);
  return methodOk && rule.route.test(request.route) && (rule.when ? rule.when(request) : true);
}

export function isRoleAllowed(role: MembershipRole, request: RequestInfo): boolean {
  const policy = ROLE_POLICY[role];
  if (!policy) return false;
  if (policy.all) return true;
  if (policy.readAny && request.readOnly) return true;
  if (policy.writeExcept && !request.readOnly && !policy.writeExcept.test(request.route)) return true;
  return (policy.allow ?? []).some((rule) => ruleApplies(rule, request));
}

export function normalizeApiRoute(originalUrl: string): string {
  return (originalUrl.split('?')[0] || '/')
    .toLowerCase()
    .replace(/^\/api(?=\/|$)/, '')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '') || '/';
}

function checkTenantPermissions(
  req: Request,
  res: Response,
  role: MembershipRole,
  modules: string[],
): boolean {
  const method = req.method.toUpperCase();
  const route = normalizeApiRoute(req.originalUrl);
  const readOnly = method === 'GET' || method === 'HEAD';

  const moduleName = MODULE_BY_ROUTE.find((entry) => entry.route.test(route))?.module ?? null;
  if (moduleName && !modules.includes(moduleName)) {
    res.status(403).json({ error: 'El módulo no está incluido en el plan de la empresa.' });
    return false;
  }

  const contactType = String(
    (readOnly
      ? new URLSearchParams(req.originalUrl.split('?')[1] || '').get('tipo')
      : (req as Request & { body?: { tipo?: unknown } }).body?.tipo) || '',
  ).toLowerCase();

  const allowed = !(OWNER_ONLY_ROUTES.test(route) && role !== 'owner' && role !== 'admin')
    && isRoleAllowed(role, { method, route, readOnly, contactType });
  if (!allowed) {
    res.status(403).json({ error: 'Tu rol no permite esta operación.' });
    return false;
  }
  return true;
}

/** Treats X-Company-Id only as a selector; membership, company and subscription come from server storage. */
export function createCompanyAccessMiddleware(store: LocalPlatformStore): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const identity = (req as FirebaseAuthenticatedRequest).firebaseIdentity;
    const companyId = req.get('x-company-id')?.trim();
    if (!identity?.uid) return res.status(401).json({ error: 'Se requiere una identidad verificada.' });
    if (!companyId) return res.status(400).json({ error: 'Selecciona una empresa autorizada.' });
    try {
      const state = store.readState();
      const user = state.users.find((item) => item.subject === identity.uid);
      const membership = user && state.memberships.find((item) => item.userId === user.id && item.companyId === companyId && item.status === 'active');
      const company = state.companies.find((item) => item.id === companyId);
      if (!user || !membership || !company) return res.status(403).json({ error: 'No tienes una membresía activa para esta empresa.' });
      if (company.status !== 'active' || !hasActiveSubscription(state, company.id)) return res.status(403).json({ error: 'La empresa o su suscripción no están habilitadas para operar.' });
      const subscription = state.subscriptions.find((item) => item.companyId === companyId)!;
      const plan = state.plans.find((item) => item.id === subscription.planId)!;
      if (!checkTenantPermissions(req, res, membership.role, plan.modules)) return;
      const tenant = { companyId, uid: identity.uid, role: membership.role } satisfies TenantStorageContext;
      (req as TenantAuthenticatedRequest).tenant = tenant;
      tenantStorageContext.run(tenant, next);
    } catch {
      return res.status(503).json({ error: 'El control de empresas no está disponible.' });
    }
  };
}

export function createPostgresCompanyAccessMiddleware(
  repository: TenantRepository,
  secrets: TenantSecretProvider,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const identity = (req as FirebaseAuthenticatedRequest).firebaseIdentity;
    try {
      const tenant = await resolveAuthorizedTenant({
        identity: identity?.uid ? {
          provider: 'firebase',
          subject: identity.uid,
          ...(identity.email ? { email: identity.email } : {}),
        } : null,
        requestedCompanyId: req.get('x-company-id'),
        repository,
        secrets,
      });
      if (!checkTenantPermissions(req, res, tenant.role, tenant.modules)) return;
      const context: TenantStorageContext = {
        companyId: tenant.companyId,
        companySlug: tenant.companySlug,
        uid: identity!.uid,
        role: tenant.role,
        connectionString: tenant.connectionString,
      };
      (req as TenantAuthenticatedRequest).tenant = context;
      tenantStorageContext.run(context, next);
    } catch (error) {
      if (error instanceof TenantResolutionError) {
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }
      return res.status(503).json({ error: 'No se pudo validar la empresa y su conexión.' });
    }
  };
}

export function requireTenantRole(...allowed: MembershipRole[]): RequestHandler {
  return (req, res, next) => {
    const tenant = (req as TenantAuthenticatedRequest).tenant;
    if (!tenant) return res.status(403).json({ error: 'No hay una empresa autorizada en esta sesión.' });
    if (!allowed.includes(tenant.role)) return res.status(403).json({ error: 'Tu rol no permite esta operación.' });
    next();
  };
}
