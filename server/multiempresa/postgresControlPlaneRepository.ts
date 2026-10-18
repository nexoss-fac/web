import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import {
  normalizeCompanyInput,
  type AuditEvent,
  type MembershipRole,
  type Plan,
  type PlatformCompany,
  type Subscription,
} from './platformStore.ts';
import { normalizeIndustryTemplate, resolveIndustryTemplate, type IndustryTemplate } from '../../src/domain/companyIndustries.ts';
import type { MembershipRecord, TenantRepository, VerifiedIdentity } from './tenantResolver.ts';

type Queryable = Pick<PoolClient, 'query'>;
export type ControlPlanePool = Pick<Pool, 'connect' | 'end'>;

type CompanyRow = QueryResultRow & {
  id: string; slug: string; legal_name: string; trade_name: string | null; rif: string | null;
  country_code: string; economic_activity: string | null; address: string; phone: string;
  email: string; logo_url: string; fiscal: Record<string, unknown>; workspace: Record<string, unknown>;
  onboarding_step: number; status: PlatformCompany['status']; created_at: Date; updated_at: Date;
};

function mapCompany(row: CompanyRow): PlatformCompany {
  return {
    id: row.id, slug: row.slug, legalName: row.legal_name, tradeName: row.trade_name || '',
    taxId: row.rif || '', countryCode: row.country_code.trim(), activity: row.economic_activity || '',
    address: row.address, phone: row.phone, email: row.email, logoUrl: row.logo_url,
    fiscal: row.fiscal || {}, workspace: row.workspace || {}, onboardingStep: Number(row.onboarding_step),
    status: row.status, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapPlan(row: QueryResultRow): Plan {
  return {
    id: row.id, name: row.name, price: Number(row.price), currency: row.currency.trim(),
    interval: row.billing_interval, limits: {
      users: Number(row.max_users), products: Number(row.max_products),
      branches: Number(row.max_branches), warehouses: Number(row.max_warehouses),
    },
    modules: row.modules || [], active: row.active,
  };
}

function mapAudit(row: QueryResultRow): AuditEvent {
  return {
    id: row.id, actorUid: row.auth_subject || '', companyId: row.company_id || undefined,
    action: row.action, createdAt: new Date(row.created_at).toISOString(), metadata: row.metadata || {},
  };
}

function isRole(value: unknown): value is MembershipRole {
  return ['owner', 'admin', 'accountant', 'auditor', 'supervisor', 'cashier'].includes(String(value));
}

function safeFields(data: unknown, keys: string[]): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const source = data as Record<string, unknown>;
  return Object.fromEntries(keys.filter((key) => ['string', 'number', 'boolean'].includes(typeof source[key])).map((key) => [key, source[key]]));
}

export interface CompanyListResult {
  companies: Array<{
    id: string; slug: string; legalName: string; tradeName: string; industryTemplate: IndustryTemplate; status: string;
    onboardingStep: number; role: MembershipRole; subscription: { status: string; currentPeriodEnd: string; plan: string } | null;
  }>;
  invitations: Array<{ id: string; companyId: string; companyName: string; role: MembershipRole; expiresAt: string }>;
  managedInvitations: Array<{ id: string; companyId: string; companyName: string; email: string; role: MembershipRole; expiresAt: string }>;
  managedMembers: Array<{ companyId: string; userId: string; email: string; displayName: string; role: MembershipRole }>;
  emailMatches: Array<{ id: string; legalName: string; tradeName: string; status: PlatformCompany['status'] }>;
}

export interface OnboardingResult {
  company: PlatformCompany;
  fiscal: Record<string, unknown>;
  workspace: Record<string, unknown>;
  onboardingStep: number;
  subscription: (Subscription & { plan: string | undefined }) | null;
}

export class PostgresControlPlaneRepository implements TenantRepository {
  private readonly pool: ControlPlanePool;

  constructor(pool: ControlPlanePool) {
    this.pool = pool;
  }

  async findPublicBoardTenant(companyId: string): Promise<{ companyId: string; companyName: string; secretReference: string | null; encryptedConnectionSecret: string | null } | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT c.id, COALESCE(NULLIF(c.trade_name, ''), c.legal_name) AS company_name,
                t.secret_reference, t.encrypted_connection_secret
         FROM platform_companies c
         JOIN tenant_database_connections t ON t.company_id = c.id AND t.status = 'ready'
         WHERE c.id = $1 AND c.status = 'active'
           AND (t.secret_reference IS NOT NULL OR t.encrypted_connection_secret IS NOT NULL)
         LIMIT 1`,
        [companyId],
      );
      const row = result.rows[0];
      return row ? { companyId: row.id, companyName: row.company_name, secretReference: row.secret_reference, encryptedConnectionSecret: row.encrypted_connection_secret } : null;
    } finally {
      client.release();
    }
  }

  async setTenantDatabaseConnection(companyId: string, secretReference: string, actorUid: string): Promise<boolean> {
    return this.transaction(async (client) => {
      const company = await client.query(`SELECT id FROM platform_companies WHERE id = $1`, [companyId]);
      if (!company.rows[0]) return false;
      const assigned = await client.query(
        `SELECT company_id FROM tenant_database_connections WHERE secret_reference = $1 AND company_id <> $2 LIMIT 1`,
        [secretReference, companyId],
      );
      if (assigned.rows.length) return false;
      await client.query(
        `INSERT INTO tenant_database_connections
           (company_id, provider, secret_reference, status, schema_version, provisioned_at, last_health_check_at)
         VALUES ($1, 'neon', $2, 'ready', '1', NOW(), NOW())
         ON CONFLICT (company_id) DO UPDATE SET
           provider = 'neon', secret_reference = EXCLUDED.secret_reference,
           encrypted_connection_secret = NULL, encryption_key_version = NULL,
           status = 'ready', schema_version = EXCLUDED.schema_version,
           provisioned_at = NOW(), last_health_check_at = NOW(), updated_at = NOW()`,
        [companyId, secretReference],
      );
      await this.audit(client, actorUid, 'platform.tenant_database.connected', companyId, { provider: 'neon' });
      return true;
    });
  }

  async setProvisionedTenantDatabaseConnection(companyId: string, encryptedConnectionSecret: string, actorUid: string): Promise<boolean> {
    return this.transaction(async (client) => {
      const result = await client.query(
        `INSERT INTO tenant_database_connections
           (company_id, provider, secret_reference, encrypted_connection_secret, encryption_key_version,
            status, schema_version, provisioned_at, last_health_check_at)
         VALUES ($1, 'neon', NULL, $2, 'v1', 'ready', '1', NOW(), NOW())
         ON CONFLICT (company_id) DO UPDATE SET
           provider = 'neon', secret_reference = NULL,
           encrypted_connection_secret = EXCLUDED.encrypted_connection_secret,
           encryption_key_version = EXCLUDED.encryption_key_version,
           status = 'ready', schema_version = EXCLUDED.schema_version,
           provisioned_at = NOW(), last_health_check_at = NOW(), updated_at = NOW()
         WHERE tenant_database_connections.status IN ('provisioning', 'degraded')
         RETURNING company_id`,
        [companyId, encryptedConnectionSecret],
      );
      if (!result.rowCount) return false;
      await this.audit(client, actorUid, 'tenant_database.provisioned', companyId, { provider: 'neon' });
      return true;
    });
  }

  async listTenantDatabasesToProvision(limit = 20): Promise<Array<{ companyId: string; actorUid: string; industryTemplate: IndustryTemplate; categories: string[] }>> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT c.id AS company_id, owner.auth_subject AS actor_uid, c.workspace, c.economic_activity
         FROM platform_companies c
         JOIN company_memberships m ON m.company_id = c.id AND m.role = 'owner' AND m.status = 'active'
         JOIN platform_users owner ON owner.id = m.user_id AND owner.auth_provider = 'firebase'
         LEFT JOIN tenant_database_connections t ON t.company_id = c.id
         WHERE c.status = 'active'
           AND (t.company_id IS NULL OR t.status IN ('provisioning', 'degraded'))
         ORDER BY c.created_at
         LIMIT $1`,
        [Math.max(1, Math.min(limit, 100))],
      );
      return result.rows.map((row) => {
        const workspace = row.workspace && typeof row.workspace === 'object' ? row.workspace as Record<string, unknown> : {};
        const categories = Array.isArray(workspace.categories)
          ? workspace.categories.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean)
          : [];
        return {
          companyId: row.company_id,
          actorUid: row.actor_uid,
          industryTemplate: resolveIndustryTemplate(workspace.industryTemplate, row.economic_activity || ''),
          categories: [...new Set(categories)].slice(0, 30),
        };
      });
    } finally {
      client.release();
    }
  }

  static fromEnvironment(): PostgresControlPlaneRepository {
    const connectionString = process.env.CONTROL_PLANE_DATABASE_URL?.trim();
    if (!connectionString) throw new Error('CONTROL_PLANE_DATABASE_URL es obligatoria para el repositorio PostgreSQL.');
    const parsed = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname) {
      throw new Error('CONTROL_PLANE_DATABASE_URL debe ser una conexión PostgreSQL válida.');
    }
    const pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: parsed.hostname.endsWith('.neon.tech') ? { rejectUnauthorized: true } : undefined,
    });
    return new PostgresControlPlaneRepository(pool);
  }

  async close(): Promise<void> { await this.pool.end(); }

  private async transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async ensureUser(client: Queryable, identity: { uid: string; email: string; displayName?: string }): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO platform_users (id, auth_provider, auth_subject, email, display_name, status)
       VALUES ($1, 'firebase', $2, lower($3), $4, 'active')
       ON CONFLICT (auth_provider, auth_subject)
       DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, status = 'active', updated_at = NOW()
       RETURNING id`,
      [randomUUID(), identity.uid, identity.email, identity.displayName || ''],
    );
    return result.rows[0].id;
  }

  private async audit(client: Queryable, actorUid: string, action: string, companyId?: string, metadata: Record<string, unknown> = {}): Promise<void> {
    const actor = await client.query<{ id: string | null }>(
      `SELECT id FROM platform_users WHERE auth_provider = 'firebase' AND auth_subject = $1`,
      [actorUid],
    );
    await client.query(
      `INSERT INTO platform_audit_events
         (id, actor_user_id, company_id, action, resource_type, outcome, metadata)
       VALUES ($1, $2, $3, $4, $5, 'success', $6::jsonb)`,
      [randomUUID(), actor.rows[0]?.id || null, companyId || null, action, companyId ? 'company' : 'platform', JSON.stringify(metadata)],
    );
  }

  async findMembership(identity: VerifiedIdentity, requestedCompanyId: string): Promise<MembershipRecord | null> {
    const result = await this.pool.connect().then(async (client) => {
      try {
        return await client.query(
          `SELECT c.id AS company_id, c.slug, c.status AS company_status,
                  c.economic_activity, c.workspace,
                  m.status AS membership_status, m.role, t.secret_reference, t.encrypted_connection_secret,
                  t.status AS connection_status, p.modules, p.max_products,
                  COALESCE(s.status IN ('trialing', 'active') AND s.current_period_end > NOW() AND p.active = TRUE, FALSE) AS subscription_active
           FROM platform_users u
           JOIN company_memberships m ON m.user_id = u.id
           JOIN platform_companies c ON c.id = m.company_id
           LEFT JOIN company_subscriptions s ON s.company_id = c.id
           LEFT JOIN platform_plans p ON p.id = s.plan_id
           LEFT JOIN tenant_database_connections t ON t.company_id = c.id
           WHERE u.auth_provider = $1 AND u.auth_subject = $2
             AND c.id = $3 AND m.status = 'active'
           LIMIT 1`,
          [identity.provider, identity.subject, requestedCompanyId],
        );
      } finally {
        client.release();
      }
    });
    const row = result.rows[0];
    if (!row || !isRole(row.role)) return null;
    return {
      companyId: row.company_id, slug: row.slug, companyStatus: row.company_status,
      industryTemplate: resolveIndustryTemplate(row.workspace?.industryTemplate, row.economic_activity || ''),
      membershipStatus: row.membership_status, role: row.role,
      secretReference: row.secret_reference, encryptedConnectionSecret: row.encrypted_connection_secret,
      connectionStatus: row.connection_status || 'provisioning',
      modules: Array.isArray(row.modules) ? row.modules.filter((module: unknown): module is string => typeof module === 'string') : [],
      maxProducts: Number(row.max_products) || 0,
      subscriptionActive: row.subscription_active === true,
    };
  }

  async listForIdentity(identity: { uid: string; email?: string; emailVerified?: boolean }): Promise<CompanyListResult> {
    const client = await this.pool.connect();
    try {
      const memberships = await client.query(
        `SELECT c.id, c.slug, c.legal_name, c.trade_name, c.status, c.onboarding_step,
                c.economic_activity, c.workspace, m.role,
                s.status AS subscription_status, s.current_period_end, p.name AS plan_name
         FROM platform_users u
         JOIN company_memberships m ON m.user_id = u.id AND m.status = 'active'
         JOIN platform_companies c ON c.id = m.company_id
         LEFT JOIN company_subscriptions s ON s.company_id = c.id
         LEFT JOIN platform_plans p ON p.id = s.plan_id
         WHERE u.auth_provider = 'firebase' AND u.auth_subject = $1
           AND (c.status <> 'onboarding' OR m.role IN ('owner', 'admin'))
         ORDER BY c.created_at`,
        [identity.uid],
      );
      const companyIds = memberships.rows.map((row) => row.id);
      const managed = companyIds.length
        ? await client.query(
          `SELECT i.id, i.company_id, c.trade_name, c.legal_name, i.email, i.role, i.expires_at
           FROM company_invitations i
           JOIN platform_companies c ON c.id = i.company_id
           JOIN platform_users u ON u.auth_provider = 'firebase' AND u.auth_subject = $1
           JOIN company_memberships m ON m.user_id = u.id AND m.company_id = c.id
             AND m.status = 'active' AND m.role IN ('owner', 'admin')
           WHERE i.company_id = ANY($2::uuid[]) AND i.status = 'pending'
             AND i.expires_at > NOW()
           ORDER BY i.created_at DESC`,
          [identity.uid, companyIds],
        )
        : { rows: [] };
      const managedMembers = companyIds.length
        ? await client.query(
          `SELECT c.id AS company_id, u.id AS user_id, u.email, u.display_name, m.role
           FROM platform_users actor
           JOIN company_memberships admin_membership ON admin_membership.user_id = actor.id
             AND admin_membership.status = 'active' AND admin_membership.role IN ('owner', 'admin')
           JOIN company_memberships m ON m.company_id = admin_membership.company_id AND m.status = 'active'
           JOIN platform_users u ON u.id = m.user_id
           JOIN platform_companies c ON c.id = m.company_id
           WHERE actor.auth_provider = 'firebase' AND actor.auth_subject = $1
             AND c.id = ANY($2::uuid[])
           ORDER BY c.trade_name, u.email`,
          [identity.uid, companyIds],
        )
        : { rows: [] };
      const received = identity.email && identity.emailVerified
        ? await client.query(
          `SELECT i.id, i.company_id, c.trade_name, c.legal_name, i.role, i.expires_at
           FROM company_invitations i
           JOIN platform_companies c ON c.id = i.company_id
           JOIN company_subscriptions s ON s.company_id = c.id
           JOIN platform_plans p ON p.id = s.plan_id AND p.active = TRUE
           WHERE lower(i.email) = lower($1) AND i.status = 'pending' AND i.expires_at > NOW()
             AND c.status IN ('onboarding', 'active')
             AND s.status IN ('trialing', 'active') AND s.current_period_end > NOW()
           ORDER BY i.created_at DESC`,
          [identity.email],
        )
        : { rows: [] };
      const emailMatches = identity.email && identity.emailVerified
        ? await client.query(
          `SELECT c.id, c.legal_name, c.trade_name, c.status
           FROM platform_companies c
           WHERE lower(c.email) = lower($1)
             AND NOT EXISTS (
               SELECT 1 FROM platform_users u
               JOIN company_memberships m ON m.user_id = u.id AND m.company_id = c.id
               WHERE u.auth_provider = 'firebase' AND u.auth_subject = $2
                 AND m.status IN ('active', 'invited')
             )
           ORDER BY c.created_at`,
          [identity.email, identity.uid],
        )
        : { rows: [] };
      return {
        companies: memberships.rows.map((row) => ({
          id: row.id, slug: row.slug, legalName: row.legal_name, tradeName: row.trade_name || '',
          industryTemplate: resolveIndustryTemplate(row.workspace?.industryTemplate, row.economic_activity || ''),
          status: row.status, onboardingStep: Number(row.onboarding_step), role: row.role,
          subscription: row.subscription_status ? {
            status: row.subscription_status, currentPeriodEnd: new Date(row.current_period_end).toISOString(), plan: row.plan_name || 'Sin plan',
          } : null,
        })),
        invitations: received.rows.map((row) => ({
          id: row.id, companyId: row.company_id, companyName: row.trade_name || row.legal_name,
          role: row.role, expiresAt: new Date(row.expires_at).toISOString(),
        })),
        managedInvitations: managed.rows.map((row) => ({
          id: row.id, companyId: row.company_id, companyName: row.trade_name || row.legal_name,
          email: row.email, role: row.role, expiresAt: new Date(row.expires_at).toISOString(),
        })),
        managedMembers: managedMembers.rows.filter((row) => isRole(row.role)).map((row) => ({
          companyId: row.company_id, userId: row.user_id, email: row.email,
          displayName: row.display_name || '', role: row.role,
        })),
        emailMatches: emailMatches.rows.map((row) => ({
          id: row.id, legalName: row.legal_name, tradeName: row.trade_name || '', status: row.status,
        })),
      };
    } finally {
      client.release();
    }
  }

  async createCompany(input: unknown, identity: { uid: string; email?: string; emailVerified: boolean; displayName?: string }): Promise<PlatformCompany> {
    if (!identity.uid || !identity.email || identity.emailVerified !== true) throw new Error('Firebase debe proporcionar una identidad con correo verificado.');
    const companyInput = normalizeCompanyInput(input);
    const rawInput = input && typeof input === 'object' ? input as Record<string, unknown> : {};
    const industryTemplate = normalizeIndustryTemplate(rawInput.industryTemplate, companyInput.activity);
    return this.transaction(async (client) => {
      const userId = await this.ensureUser(client, { uid: identity.uid, email: identity.email!, displayName: identity.displayName });
      const trial = await client.query<{ id: string }>(`SELECT id FROM platform_plans WHERE id = 'trial' AND active = TRUE FOR SHARE`);
      if (!trial.rows[0]) throw new Error('No hay un plan de prueba disponible.');
      const id = randomUUID();
      const slugBase = companyInput.legalName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'empresa';
      const result = await client.query<CompanyRow>(
        `INSERT INTO platform_companies
           (id, slug, legal_name, trade_name, rif, country_code, economic_activity, address, phone, email, logo_url, fiscal, workspace, onboarding_step, status)
         VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6, $7, $8, $9, $10, $11, '{}'::jsonb, $12::jsonb, 2, 'onboarding')
         RETURNING *`,
        [id, `${slugBase}-${id.slice(0, 8)}`, companyInput.legalName, companyInput.tradeName, companyInput.taxId,
          companyInput.countryCode, companyInput.activity, companyInput.address, companyInput.phone,
          companyInput.email, companyInput.logoUrl, JSON.stringify({ industryTemplate })],
      );
      await client.query(
        `INSERT INTO company_memberships (company_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')`,
        [id, userId],
      );
      await client.query(
        `INSERT INTO company_subscriptions (company_id, plan_id, status, current_period_start, current_period_end)
         VALUES ($1, $2, 'trialing', NOW(), NOW() + INTERVAL '14 days')`,
        [id, trial.rows[0].id],
      );
      await client.query(
        `INSERT INTO tenant_database_connections (company_id, provider, status)
         VALUES ($1, 'neon', 'provisioning')`,
        [id],
      );
      await this.audit(client, identity.uid, 'company.created', id, { source: 'self_service' });
      return mapCompany(result.rows[0]);
    }).catch((error: unknown) => {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        throw new Error('Ya existe una empresa con esa identificación fiscal.');
      }
      throw error;
    });
  }

  async getOnboarding(identityUid: string | undefined, companyId: string): Promise<OnboardingResult | null> {
    const result = await this.pool.connect().then(async (client) => {
      try {
        return await client.query(
          `SELECT c.*, s.plan_id, s.status AS subscription_status, s.current_period_start, s.current_period_end,
                  s.updated_at AS subscription_updated_at, p.name AS plan_name
           FROM platform_users u
           JOIN company_memberships m ON m.user_id = u.id AND m.company_id = $2
             AND m.status = 'active' AND m.role IN ('owner', 'admin')
           JOIN platform_companies c ON c.id = m.company_id AND c.status IN ('onboarding', 'active')
           JOIN company_subscriptions s ON s.company_id = c.id AND s.status IN ('trialing', 'active')
             AND s.current_period_end > NOW()
           JOIN platform_plans p ON p.id = s.plan_id AND p.active = TRUE
           WHERE u.auth_provider = 'firebase' AND u.auth_subject = $1
           LIMIT 1`,
          [identityUid || '', companyId],
        );
      } finally { client.release(); }
    });
    const row = result.rows[0];
    if (!row) return null;
    const company = mapCompany(row as CompanyRow);
    return {
      company, fiscal: company.fiscal, workspace: company.workspace, onboardingStep: company.onboardingStep,
      subscription: {
        companyId, planId: row.plan_id, status: row.subscription_status,
        startedAt: new Date(row.current_period_start).toISOString(),
        currentPeriodEnd: new Date(row.current_period_end).toISOString(),
        updatedAt: new Date(row.subscription_updated_at).toISOString(), plan: row.plan_name,
      },
    };
  }

  async saveOnboardingStep(
    identity: { uid: string; email: string; displayName?: string },
    companyId: string,
    requestedStep: number,
    data: unknown,
  ): Promise<{ status: string; onboardingStep: number; invitation?: { id: string; email: string; role: string; expiresAt: string }; companyName?: string } | null | { incomplete: true }> {
    if (!Number.isInteger(requestedStep) || requestedStep < 2 || requestedStep > 5) return null;
    return this.transaction(async (client) => {
      const locked = await client.query(
        `SELECT c.id, c.status, c.onboarding_step, c.country_code, c.address, c.phone, c.economic_activity,
                c.trade_name, c.legal_name,
                c.fiscal, c.workspace, u.id AS user_id, p.max_users, p.max_branches, p.max_warehouses, p.modules
         FROM platform_users u
         JOIN company_memberships m ON m.user_id = u.id AND m.company_id = $2
           AND m.status = 'active' AND m.role IN ('owner', 'admin')
         JOIN platform_companies c ON c.id = m.company_id
         JOIN company_subscriptions s ON s.company_id = c.id AND s.status IN ('trialing', 'active')
           AND s.current_period_end > NOW()
         JOIN platform_plans p ON p.id = s.plan_id AND p.active = TRUE
         WHERE u.auth_provider = 'firebase' AND u.auth_subject = $1
         FOR UPDATE OF c`,
        [identity.uid, companyId],
      );
      const row = locked.rows[0];
      if (!row || row.status !== 'onboarding' || Number(row.onboarding_step) !== requestedStep) return null;
      const source = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};

      if (requestedStep === 2) {
        const fiscal = safeFields(source, ['countryCode', 'currency', 'taxRegime', 'taxRate', 'invoicePrefix']);
        await client.query(
          `UPDATE platform_companies SET fiscal = fiscal || $2::jsonb, updated_at = NOW() WHERE id = $1`,
          [companyId, JSON.stringify(fiscal)],
        );
      }
      let onboardingInvitation: { id: string; email: string; role: string; expiresAt: string } | undefined;
      if (requestedStep === 3) {
        const email = typeof source.inviteEmail === 'string' ? source.inviteEmail.trim().toLowerCase() : '';
        const role = typeof source.inviteRole === 'string' ? source.inviteRole : 'cashier';
        if (email) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !isRole(role) || role === 'owner') return null;
          await client.query(
            `UPDATE company_invitations SET status = 'expired'
             WHERE company_id = $1 AND status = 'pending' AND expires_at <= NOW()`,
            [companyId],
          );
          const count = await client.query<{ count: string }>(
            `SELECT (
               (SELECT count(*) FROM company_memberships WHERE company_id = $1 AND status = 'active') +
               (SELECT count(*) FROM company_invitations WHERE company_id = $1 AND status = 'pending' AND expires_at > NOW())
             )::text AS count`,
            [companyId],
          );
          const active = await client.query(
            `SELECT id, role, expires_at FROM company_invitations WHERE company_id = $1 AND lower(email) = $2
             AND status = 'pending' AND expires_at > NOW()`,
            [companyId, email],
          );
          if (Number(count.rows[0].count) >= Number(row.max_users)) return null;
          if (!active.rows[0]) {
            const invitationId = randomUUID();
            const inserted = await client.query<{ expires_at: Date }>(
              `INSERT INTO company_invitations (id, company_id, email, role, invited_by_user_id, status, expires_at)
               VALUES ($1, $2, $3, $4, $5, 'pending', NOW() + INTERVAL '7 days') RETURNING expires_at`,
              [invitationId, companyId, email, role, row.user_id],
            );
            onboardingInvitation = { id: invitationId, email, role, expiresAt: new Date(inserted.rows[0].expires_at).toISOString() };
          } else {
            onboardingInvitation = { id: active.rows[0].id, email, role: active.rows[0].role, expiresAt: new Date(active.rows[0].expires_at).toISOString() };
          }
        }
        await client.query(
          `UPDATE platform_companies SET workspace = workspace || $2::jsonb, updated_at = NOW() WHERE id = $1`,
          [companyId, JSON.stringify({ teamSetup: email ? 'invitation_pending' : 'owner_only' })],
        );
      }
      if (requestedStep === 4) {
        const branches = Number(source.branches || 1);
        const warehouses = Number(source.warehouses || 1);
        const modules = Array.isArray(source.modules)
          ? source.modules.filter((value): value is string => typeof value === 'string' && row.modules.includes(value))
          : [];
        if (!Number.isInteger(branches) || branches < 1 || branches > Number(row.max_branches)
          || !Number.isInteger(warehouses) || warehouses < 1 || warehouses > Number(row.max_warehouses)) return null;
        await client.query(
          `UPDATE platform_companies SET workspace = workspace || $2::jsonb, updated_at = NOW() WHERE id = $1`,
          [companyId, JSON.stringify({ ...safeFields(source, ['categories']), branches, warehouses, modules })],
        );
      }
      if (requestedStep === 5) {
        const fiscal = row.fiscal || {};
        if (!row.address || !row.phone || !row.economic_activity || !fiscal.countryCode || !fiscal.currency) return { incomplete: true };
        await client.query(`UPDATE platform_companies SET status = 'active', updated_at = NOW() WHERE id = $1`, [companyId]);
      }
      const nextStep = Math.min(5, requestedStep + (requestedStep < 5 ? 1 : 0));
      await client.query(`UPDATE platform_companies SET onboarding_step = $2, updated_at = NOW() WHERE id = $1`, [companyId, nextStep]);
      await this.audit(client, identity.uid, `company.onboarding.step_${requestedStep}`, companyId);
      return { status: requestedStep === 5 ? 'active' : 'onboarding', onboardingStep: nextStep, ...(onboardingInvitation ? { invitation: onboardingInvitation, companyName: row.trade_name || row.legal_name || '' } : {}) };
    });
  }

  async acceptInvitation(invitationId: string, identity: { uid: string; email?: string; emailVerified: boolean; displayName?: string }): Promise<number> {
    if (!identity.uid || !identity.email || !identity.emailVerified || !invitationId) return 0;
    return this.transaction(async (client) => {
      const selected = await client.query(
        `SELECT i.id, i.company_id, i.email, i.role, i.status, i.expires_at, c.status AS company_status
         FROM company_invitations i
         JOIN platform_companies c ON c.id = i.company_id
         JOIN company_subscriptions s ON s.company_id = c.id AND s.status IN ('trialing', 'active')
           AND s.current_period_end > NOW()
         JOIN platform_plans p ON p.id = s.plan_id AND p.active = TRUE
         WHERE i.id = $1 AND lower(i.email) = lower($2) AND i.status = 'pending'
         FOR UPDATE OF i`,
        [invitationId, identity.email],
      );
      const invitation = selected.rows[0];
      if (!invitation) return 0;
      if (new Date(invitation.expires_at).getTime() <= Date.now()) {
        await client.query(`UPDATE company_invitations SET status = 'expired' WHERE id = $1 AND company_id = $2`, [invitationId, invitation.company_id]);
        return 0;
      }
      if (!['onboarding', 'active'].includes(invitation.company_status)) return 0;
      const userId = await this.ensureUser(client, { uid: identity.uid, email: identity.email, displayName: identity.displayName });
      await client.query(
        `INSERT INTO company_memberships (company_id, user_id, role, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (company_id, user_id) DO UPDATE
         SET role = CASE WHEN company_memberships.status = 'revoked' THEN EXCLUDED.role ELSE company_memberships.role END,
             status = 'active', updated_at = NOW()`,
        [invitation.company_id, userId, invitation.role],
      );
      await client.query(
        `UPDATE company_invitations SET status = 'accepted', accepted_by_user_id = $2, accepted_at = NOW()
         WHERE id = $1 AND company_id = $3`,
        [invitationId, userId, invitation.company_id],
      );
      await this.audit(client, identity.uid, 'membership.invitation_accepted', invitation.company_id);
      return 1;
    });
  }

  async createInvitation(companyId: string, email: string, role: Exclude<MembershipRole, 'owner'>, identity: { uid: string }): Promise<{ id: string; expiresAt: string } | null> {
    return this.transaction(async (client) => {
      const authorized = await client.query(
        `SELECT u.id AS user_id, p.max_users
         FROM platform_users u
         JOIN company_memberships m ON m.user_id = u.id AND m.company_id = $2
           AND m.status = 'active' AND m.role IN ('owner', 'admin')
         JOIN platform_companies c ON c.id = m.company_id AND c.status IN ('onboarding', 'active')
         JOIN company_subscriptions s ON s.company_id = c.id AND s.status IN ('trialing', 'active')
           AND s.current_period_end > NOW()
         JOIN platform_plans p ON p.id = s.plan_id AND p.active = TRUE
         WHERE u.auth_provider = 'firebase' AND u.auth_subject = $1
         FOR UPDATE OF c`,
        [identity.uid, companyId],
      );
      const owner = authorized.rows[0];
      if (!owner) return null;
      await client.query(
        `UPDATE company_invitations SET status = 'expired'
         WHERE company_id = $1 AND status = 'pending' AND expires_at <= NOW()`,
        [companyId],
      );
      const count = await client.query<{ count: string }>(
        `SELECT (
           (SELECT count(*) FROM company_memberships WHERE company_id = $1 AND status = 'active') +
           (SELECT count(*) FROM company_invitations WHERE company_id = $1 AND status = 'pending' AND expires_at > NOW())
         )::text AS count`,
        [companyId],
      );
      if (Number(count.rows[0].count) >= Number(owner.max_users)) return null;
      const existingMember = await client.query(
        `SELECT 1 FROM platform_users u
         JOIN company_memberships m ON m.user_id = u.id AND m.company_id = $2 AND m.status = 'active'
         WHERE lower(u.email) = lower($1) LIMIT 1`,
        [email, companyId],
      );
      if (existingMember.rows[0]) return null;
      const id = randomUUID();
      const result = await client.query<{ expires_at: Date }>(
        `INSERT INTO company_invitations (id, company_id, email, role, invited_by_user_id, status, expires_at)
         VALUES ($1, $2, lower($3), $4, $5, 'pending', NOW() + INTERVAL '7 days')
         ON CONFLICT (company_id, lower(email)) WHERE status = 'pending' DO NOTHING
         RETURNING expires_at`,
        [id, companyId, email, role, owner.user_id],
      );
      if (!result.rows[0]) return null;
      await this.audit(client, identity.uid, 'membership.invited', companyId, { role });
      return { id, expiresAt: new Date(result.rows[0].expires_at).toISOString() };
    });
  }

  async revokeInvitation(companyId: string, invitationId: string, actorUid: string): Promise<boolean> {
    return this.transaction(async (client) => {
      const result = await client.query(
        `UPDATE company_invitations i SET status = 'revoked', revoked_at = NOW()
         WHERE i.id = $1 AND i.company_id = $2 AND i.status = 'pending'
           AND EXISTS (
             SELECT 1 FROM platform_users u
             JOIN company_memberships m ON m.user_id = u.id
             WHERE u.auth_provider = 'firebase' AND u.auth_subject = $3
               AND m.company_id = i.company_id AND m.status = 'active' AND m.role IN ('owner', 'admin')
           )
         RETURNING i.company_id`,
        [invitationId, companyId, actorUid],
      );
      if (!result.rowCount) return false;
      await this.audit(client, actorUid, 'membership.invitation_revoked', companyId, { invitationId });
      return true;
    });
  }

  async updateMembershipRole(companyId: string, userId: string, role: Exclude<MembershipRole, 'owner'>, actorUid: string): Promise<boolean> {
    return this.transaction(async (client) => {
      const result = await client.query(
        `UPDATE company_memberships m SET role = $3, updated_at = NOW()
         WHERE m.company_id = $1 AND m.user_id = $2 AND m.status = 'active' AND m.role <> 'owner'
           AND EXISTS (
             SELECT 1 FROM platform_users actor
             JOIN company_memberships admin_membership ON admin_membership.user_id = actor.id
               AND admin_membership.company_id = m.company_id AND admin_membership.status = 'active'
               AND admin_membership.role IN ('owner', 'admin')
             WHERE actor.auth_provider = 'firebase' AND actor.auth_subject = $4
               AND actor.id <> m.user_id
           )
         RETURNING m.company_id`,
        [companyId, userId, role, actorUid],
      );
      if (!result.rowCount) return false;
      await this.audit(client, actorUid, 'membership.role_updated', companyId, { userId, role });
      return true;
    });
  }

  async revokeMembership(companyId: string, userId: string, actorUid: string): Promise<boolean> {
    return this.transaction(async (client) => {
      const result = await client.query(
        `UPDATE company_memberships m SET status = 'revoked', updated_at = NOW()
         WHERE m.company_id = $1 AND m.user_id = $2 AND m.status = 'active' AND m.role <> 'owner'
           AND EXISTS (
             SELECT 1 FROM platform_users actor
             JOIN company_memberships admin_membership ON admin_membership.user_id = actor.id
               AND admin_membership.company_id = m.company_id AND admin_membership.status = 'active'
               AND admin_membership.role IN ('owner', 'admin')
             WHERE actor.auth_provider = 'firebase' AND actor.auth_subject = $3
               AND actor.id <> m.user_id
           )
         RETURNING m.company_id`,
        [companyId, userId, actorUid],
      );
      if (!result.rowCount) return false;
      await this.audit(client, actorUid, 'membership.revoked', companyId, { userId });
      return true;
    });
  }

  async updateCompanyProfile(
    companyId: string,
    actorUid: string,
    profile: { legalName: string; tradeName: string; taxId: string; activity: string; address: string; phone: string; email: string; industryTemplate: string; logoUrl: string; mainBranchName: string; mainBranchAddress: string },
  ): Promise<boolean> {
    return this.transaction(async (client) => {
      const result = await client.query(
        `UPDATE platform_companies c SET legal_name = $3, trade_name = $4, rif = $5,
           economic_activity = $6, address = $7, phone = $8, email = $9,
           logo_url = $10,
           workspace = COALESCE(workspace, '{}'::jsonb) || jsonb_build_object(
             'industryTemplate', $11, 'mainBranchName', $12, 'mainBranchAddress', $13
           ),
           updated_at = NOW()
         WHERE c.id = $1
           AND EXISTS (
             SELECT 1 FROM platform_users actor
             JOIN company_memberships m ON m.user_id = actor.id AND m.company_id = c.id
               AND m.status = 'active' AND m.role IN ('owner', 'admin')
             WHERE actor.auth_provider = 'firebase' AND actor.auth_subject = $2
           )
         RETURNING c.id`,
        [companyId, actorUid, profile.legalName, profile.tradeName, profile.taxId,
          profile.activity, profile.address, profile.phone, profile.email, profile.logoUrl,
          profile.industryTemplate, profile.mainBranchName, profile.mainBranchAddress],
      );
      if (!result.rowCount) return false;
      await this.audit(client, actorUid, 'company.profile_updated', companyId, { industryTemplate: profile.industryTemplate });
      return true;
    });
  }

  async getCompanyIdentity(companyId: string): Promise<Pick<PlatformCompany, 'legalName' | 'tradeName' | 'address' | 'logoUrl' | 'workspace'> | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT legal_name, trade_name, address, logo_url, workspace FROM platform_companies WHERE id = $1 LIMIT 1`,
        [companyId],
      );
      const row = result.rows[0];
      return row ? {
        legalName: row.legal_name,
        tradeName: row.trade_name || '',
        address: row.address || '',
        logoUrl: row.logo_url || '',
        workspace: row.workspace || {},
      } : null;
    } finally {
      client.release();
    }
  }

  async getManagedCompanyProfile(companyId: string, actorUid: string): Promise<PlatformCompany | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT c.* FROM platform_companies c
         JOIN company_memberships m ON m.company_id = c.id AND m.status = 'active'
           AND m.role IN ('owner', 'admin')
         JOIN platform_users u ON u.id = m.user_id
         WHERE c.id = $1 AND u.auth_provider = 'firebase' AND u.auth_subject = $2
         LIMIT 1`,
        [companyId, actorUid],
      );
      return result.rows[0] ? mapCompany(result.rows[0] as CompanyRow) : null;
    } finally {
      client.release();
    }
  }

  async adminOverview(): Promise<{ companies: unknown[]; plans: Plan[]; audit: AuditEvent[] }> {
    const client = await this.pool.connect();
    try {
      const [companies, plans, audit] = await Promise.all([
        client.query(
          `SELECT c.*, to_jsonb(s) AS subscription, t.status AS tenant_connection_status,
                  count(m.user_id)::integer AS memberships
           FROM platform_companies c
           LEFT JOIN company_subscriptions s ON s.company_id = c.id
           LEFT JOIN tenant_database_connections t ON t.company_id = c.id
           LEFT JOIN company_memberships m ON m.company_id = c.id
           GROUP BY c.id, s.company_id, t.company_id`,
        ),
        client.query(`SELECT * FROM platform_plans ORDER BY name`),
        client.query(
          `SELECT a.*, u.auth_subject FROM platform_audit_events a
           LEFT JOIN platform_users u ON u.id = a.actor_user_id
           ORDER BY a.created_at DESC LIMIT 100`,
        ),
      ]);
      return {
        companies: companies.rows.map((row) => ({ ...mapCompany(row as CompanyRow), subscription: row.subscription, memberships: Number(row.memberships), tenantDatabaseStatus: row.tenant_connection_status || 'provisioning' })),
        plans: plans.rows.map(mapPlan),
        audit: audit.rows.map(mapAudit),
      };
    } finally { client.release(); }
  }

  async createPlan(plan: Plan, actorUid: string): Promise<boolean> {
    return this.transaction(async (client) => {
      const result = await client.query(
        `INSERT INTO platform_plans
           (id, name, price, currency, billing_interval, max_users, max_products, max_branches, max_warehouses, modules, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [plan.id, plan.name, plan.price, plan.currency, plan.interval, plan.limits.users, plan.limits.products,
          plan.limits.branches, plan.limits.warehouses, JSON.stringify(plan.modules), plan.active],
      );
      if (!result.rowCount) return false;
      await this.audit(client, actorUid, 'platform.plan.created', undefined, { planId: plan.id });
      return true;
    });
  }

  async updatePlan(planId: string, update: Partial<Plan>, actorUid: string): Promise<boolean> {
    return this.transaction(async (client) => {
      const selected = await client.query(`SELECT * FROM platform_plans WHERE id = $1 FOR UPDATE`, [planId]);
      if (!selected.rows[0]) return false;
      const current = mapPlan(selected.rows[0]);
      const next: Plan = {
        ...current, ...update,
        limits: { ...current.limits, ...update.limits },
        modules: update.modules || current.modules,
      };
      await client.query(
        `UPDATE platform_plans SET name = $2, price = $3, currency = $4, billing_interval = $5,
           max_users = $6, max_products = $7, max_branches = $8, max_warehouses = $9,
           modules = $10::jsonb, active = $11, updated_at = NOW() WHERE id = $1`,
        [planId, next.name, next.price, next.currency, next.interval, next.limits.users, next.limits.products,
          next.limits.branches, next.limits.warehouses, JSON.stringify(next.modules), next.active],
      );
      await this.audit(client, actorUid, 'platform.plan.updated', undefined, { planId });
      return true;
    });
  }

  async updateCompanyByAdmin(
    companyId: string,
    actorUid: string,
    update: { status?: string; subscriptionStatus?: string; currentPeriodEnd?: string; planId?: string },
  ): Promise<boolean> {
    return this.transaction(async (client) => {
      const company = await client.query(`SELECT onboarding_step FROM platform_companies WHERE id = $1 FOR UPDATE`, [companyId]);
      if (!company.rows[0] || (update.status === 'active' && Number(company.rows[0].onboarding_step) < 5)) return false;
      if (['active', 'suspended', 'archived'].includes(update.status || '')) {
        await client.query(`UPDATE platform_companies SET status = $2, updated_at = NOW() WHERE id = $1`, [companyId, update.status]);
      }
      if (update.subscriptionStatus && ['active', 'past_due', 'suspended', 'canceled', 'trialing'].includes(update.subscriptionStatus)) {
        const subscription = await client.query(
          `SELECT current_period_start, plan_id FROM company_subscriptions WHERE company_id = $1 FOR UPDATE`,
          [companyId],
        );
        if (!subscription.rows[0]) return false;
        const end = update.currentPeriodEnd ? new Date(update.currentPeriodEnd) : null;
        if (end && (!Number.isFinite(end.getTime()) || end.getTime() <= Date.now())) return false;
        if (update.planId) {
          const plan = await client.query(`SELECT id FROM platform_plans WHERE id = $1 AND active = TRUE`, [update.planId]);
          if (!plan.rows[0]) return false;
        }
        await client.query(
          `UPDATE company_subscriptions SET status = $2,
             current_period_end = COALESCE($3::timestamptz, current_period_end),
             current_period_start = CASE WHEN $2 = 'active' AND current_period_start < NOW() THEN NOW() ELSE current_period_start END,
             plan_id = COALESCE($4, plan_id), updated_at = NOW()
           WHERE company_id = $1`,
          [companyId, update.subscriptionStatus, end?.toISOString() || null, update.planId || null],
        );
      }
      await this.audit(client, actorUid, 'platform.company.updated', companyId, {
        companyStatus: update.status, subscriptionStatus: update.subscriptionStatus,
      });
      return true;
    });
  }
}

export function createPostgresControlPlaneRepositoryFromEnvironment(): PostgresControlPlaneRepository {
  return PostgresControlPlaneRepository.fromEnvironment();
}
