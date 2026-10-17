import type { IndustryTemplate } from '../../src/domain/companyIndustries.ts';

/**
 * Límite de autorización multiempresa (sin dependencias externas).
 * Este módulo NO está conectado todavía a las rutas heredadas.
 * La identidad debe venir de un verificador de tokens confiable en el servidor.
 */
export type TenantRole = 'owner' | 'admin' | 'accountant' | 'auditor' | 'supervisor' | 'cashier';

export interface VerifiedIdentity {
  provider: string;
  subject: string;
  email?: string;
}

export interface MembershipRecord {
  companyId: string;
  slug: string;
  industryTemplate: IndustryTemplate;
  companyStatus: 'onboarding' | 'active' | 'suspended' | 'archived';
  membershipStatus: 'invited' | 'active' | 'revoked';
  role: TenantRole;
  secretReference: string | null;
  connectionStatus: 'provisioning' | 'ready' | 'degraded' | 'disabled';
  modules: string[];
}

export interface TenantRepository {
  findMembership(identity: VerifiedIdentity, requestedCompanyId: string): Promise<MembershipRecord | null>;
}

export interface TenantSecretProvider {
  /** Debe consultar un gestor de secretos. Nunca debe devolver una URL enviada por el navegador. */
  getConnectionString(secretReference: string): Promise<string>;
}

export interface AuthorizedTenantContext {
  companyId: string;
  companySlug: string;
  industryTemplate: IndustryTemplate;
  role: TenantRole;
  modules: string[];
  connectionString: string;
}

export class TenantResolutionError extends Error {
  public readonly statusCode: 400 | 401 | 403 | 503;
  public readonly code: 'COMPANY_REQUIRED' | 'UNAUTHENTICATED' | 'MEMBERSHIP_DENIED' | 'TENANT_UNAVAILABLE';

  constructor(
    statusCode: 400 | 401 | 403 | 503,
    code: 'COMPANY_REQUIRED' | 'UNAUTHENTICATED' | 'MEMBERSHIP_DENIED' | 'TENANT_UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'TenantResolutionError';
  }
}

function isPostgresConnectionString(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:') && Boolean(parsed.hostname) && Boolean(parsed.username);
  } catch {
    return false;
  }
}

/**
 * Autoriza la empresa solicitada contra una identidad ya verificada.
 * El companyId es solo un selector; jamás concede acceso por sí mismo.
 */
export async function resolveAuthorizedTenant(input: {
  identity: VerifiedIdentity | null;
  requestedCompanyId: string | null | undefined;
  repository: TenantRepository;
  secrets: TenantSecretProvider;
}): Promise<AuthorizedTenantContext> {
  const { identity, repository, secrets } = input;
  const requestedCompanyId = input.requestedCompanyId?.trim();

  if (!requestedCompanyId) {
    throw new TenantResolutionError(400, 'COMPANY_REQUIRED', 'Debe seleccionar una empresa.');
  }
  if (!identity?.provider || !identity.subject) {
    throw new TenantResolutionError(401, 'UNAUTHENTICATED', 'Se requiere una sesión válida.');
  }

  const membership = await repository.findMembership(identity, requestedCompanyId);
  if (!membership || membership.companyId !== requestedCompanyId || membership.membershipStatus !== 'active') {
    throw new TenantResolutionError(403, 'MEMBERSHIP_DENIED', 'No existe una membresía activa para esta empresa.');
  }
  if (membership.companyStatus !== 'active' || membership.connectionStatus !== 'ready' || !membership.secretReference) {
    throw new TenantResolutionError(503, 'TENANT_UNAVAILABLE', 'La empresa no está habilitada para operar.');
  }

  let connectionString: string;
  try {
    connectionString = await secrets.getConnectionString(membership.secretReference);
  } catch {
    // No propagar mensajes del proveedor: podrían incluir información sensible.
    throw new TenantResolutionError(503, 'TENANT_UNAVAILABLE', 'No se pudo resolver la conexión de la empresa.');
  }
  if (!isPostgresConnectionString(connectionString)) {
    throw new TenantResolutionError(503, 'TENANT_UNAVAILABLE', 'La conexión de la empresa no tiene un formato válido.');
  }

  return {
    companyId: membership.companyId,
    companySlug: membership.slug,
    industryTemplate: membership.industryTemplate,
    role: membership.role,
    modules: membership.modules,
    connectionString,
  };
}
