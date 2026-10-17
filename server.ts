import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { addMoney, subtractMoney } from './server/money.ts';
import { registerSalesRoutes } from './server/routes/salesRoutes.ts';
import { createServer as createViteServer } from 'vite';
import { 
  checkDatabaseConnection, 
  getNeonSql, 
  initDatabaseSchema, 
  getNeonTables, 
  getNeonTableData,
  getDailyClosures,
  addDailyClosure,
  replaceDailyClosures,
  normalizeProducts,
  normalizeSales,
  normalizeExpenses,
  normalizeBankReconciliations,
  normalizeLayaways,
  voidSale,
  updateSale,
  getLayawaysFromDb,
  saveLayawayToDb,
  deleteLayawayFromDb,
  getSalesClosures,
  addSalesClosure,
  getAccountingLedger,
  saveAccountingEntry,
  deleteAccountingEntry,
} from './server/db.ts';
import { verifyBdvPayment, getBdvApiConfig, getRecentVerifications } from './server/bdv.ts';
import { analyzeShoeImage } from './server/shoeAi.ts';
import { analyzeReceiptImage } from './server/receiptAi.ts';
import { requireFirebaseAuth } from './server/auth/firebaseAuth.ts';
import { LocalPlatformStore, acceptCompanyInvitation, createCompanyForVerifiedUser, createCompanyInvitation, findCompanyEmailMatches, getCompanyOnboardingMembership, hasActiveSubscription, isInvitationPending, normalizeInventoryCategories, platformAdminUids, type MembershipRole, type Plan } from './server/multiempresa/platformStore.ts';
import { createPostgresControlPlaneRepositoryFromEnvironment, type PostgresControlPlaneRepository } from './server/multiempresa/postgresControlPlaneRepository.ts';
import { createCompanyAccessMiddleware, createPostgresCompanyAccessMiddleware, requireTenantRole, tenantStorageContext, type TenantAuthenticatedRequest } from './server/multiempresa/companyAccess.ts';
import { LocalEnvironmentTenantSecretProvider } from './server/multiempresa/tenantSecretProvider.ts';
import { readJsonFileWithBackup, tenantDataFiles, writeJsonFileAtomic } from './server/multiempresa/tenantFileStore.ts';
import { FiscalBoardValidationError, matchesPublicBoardToken, publicFiscalBoard, readFiscalBoard, saveFiscalBoard, validateFiscalBoardState } from './server/multiempresa/fiscalBoardStore.ts';
import { NATIONAL_FISCAL_REQUIREMENTS } from './src/domain/fiscalBoard.ts';
import { isIndustryTemplate, normalizeIndustryTemplate, resolveIndustryTemplate } from './src/domain/companyIndustries.ts';
import { assertProductionRuntimeSupported } from './server/productionRuntime.ts';
import { logger } from './server/logger.ts';
import { sendMail } from './server/mail/mailer.ts';
import { buildExpenseNotice, buildSaleNotice, sendNotice, type Notice } from './server/notify/notifier.ts';
import { isWebPushConfigured, saveWebPushSubscription, removeWebPushSubscription, sendWebPushToCompanyAdmins, hasWebPushSubscription, sendWebPushTest } from './server/notify/webPush.ts';
import { buildInvitationEmail } from './server/mail/invitationEmail.ts';
import type { AccountBalance, Sale, ShoeProduct } from './src/types.ts';

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
assertProductionRuntimeSupported();
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const PLATFORM_STORE = new LocalPlatformStore();
let postgresControlPlane: PostgresControlPlaneRepository | undefined;

/**
 * Envía el correo de invitación. No hace fallar la invitación si el correo no sale:
 * la invitación queda creada y la respuesta indica si el correo se envió y por qué no.
 */
async function sendInvitationNotice(input: { to: string; companyName: string; role: string; invitationId: string; invitedBy?: string; expiresAt: string }) {
  const port = Number(process.env.PORT) || 3000;
  const publicBaseUrl = process.env.APP_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${port}`;
  const appUrl = publicBaseUrl.replace(/\/+$/, '');
  const invitationUrl = new URL('/', `${appUrl}/`);
  invitationUrl.searchParams.set('invitation', input.invitationId);
  const result = await sendMail(buildInvitationEmail({ ...input, invitationUrl: invitationUrl.toString() }));
  if (!result.sent) logger.warn('[Invitación] No se pudo enviar el correo:', result.error);
  const localOnly = !process.env.APP_PUBLIC_URL && !process.env.RENDER_EXTERNAL_URL;
  return {
    emailSent: result.sent,
    ...(result.sent ? {} : { emailError: result.error }),
    activation: result.sent
      ? `Se envió la invitación a ${input.to}. Debe iniciar sesión con ese correo y verificarlo en Firebase.${localOnly ? ' Aviso: el enlace del correo apunta a esta computadora; define APP_PUBLIC_URL para que la otra persona pueda abrirlo.' : ''}`
      : 'La invitación quedó creada, pero el correo no se pudo enviar. Avisa a la persona de forma manual: debe iniciar sesión con ese correo y verificarlo en Firebase.',
  };
}

/** Avisa al teléfono sin esperar la respuesta: un fallo del aviso no debe afectar la venta ni el gasto. */
function notifyInBackground(build: (company: string) => Notice) {
  const tenant = tenantStorageContext.getStore();
  const company = tenant?.companySlug || '';
  const notice = build(company);
  void sendNotice(notice)
    .then((results) => results.filter((item) => !item.sent).forEach((item) => logger.warn(`[Aviso] No se pudo enviar por ${item.channel}:`, item.error)))
    .catch((error) => logger.warn('[Aviso] Error inesperado al avisar:', error));

  // Web Push solo consulta suscripciones guardadas en el contexto de la empresa activa.
  // No incluye identificadores ni datos de clientes; cada tenant mantiene su propia tabla.
  if (isWebPushConfigured() && tenant?.companyId) {
    void (async () => {
      const sql = getNeonSql();
      if (!sql) return;
      await sendWebPushToCompanyAdmins(sql, {
        title: notice.title,
        body: notice.body,
        url: '/?tab=admin',
      });
    })().catch((error) => logger.warn('[Web Push] No se pudo enviar la notificación:', error instanceof Error ? error.message : 'error'));
  }
}

function usePostgresControlPlane(): boolean {
  return process.env.NEXOSS_PLATFORM_STORAGE === 'postgres';
}

function getPostgresControlPlane(): PostgresControlPlaneRepository {
  if (!postgresControlPlane) postgresControlPlane = createPostgresControlPlaneRepositoryFromEnvironment();
  return postgresControlPlane;
}

function getTenantFiles() {
  const tenant = tenantStorageContext.getStore();
  if (!tenant?.companyId) throw new Error('No existe un contexto de empresa autorizado para la persistencia.');
  const files = tenantDataFiles(DATA_DIR, tenant.companyId);
  fs.mkdirSync(files.directory, { recursive: true });
  return files;
}

export interface ServerStoreState {
  products: ShoeProduct[];
  sales: Sale[];
  layaways?: any[];
  movements: any[];
  accounts: AccountBalance[];
  cashClosures: any[];
  expenses: any[];
  bankMovements: any[];
  currencyPurchases: any[];
  accountingEntries?: any[];
  exchangeRate: number;
  historicalRates?: Record<string, number>;
  adminPin: string;
  updatedAt: string;
}

const DEFAULT_ACCOUNTS: AccountBalance[] = [
  { id: 'acc-1', nombre: 'Efectivo USD', moneda: 'USD', saldo: 0.00, icono: 'Banknote' },
  { id: 'acc-2', nombre: 'Efectivo Bs', moneda: 'Bs', saldo: 0.00, icono: 'Banknote' },
  { id: 'acc-3', nombre: 'Pago Móvil (BDV)', moneda: 'Bs', saldo: 0.00, icono: 'Smartphone' },
  { id: 'acc-pos', nombre: 'Punto de Venta', moneda: 'Bs', saldo: 0.00, icono: 'CreditCard' },
  { id: 'acc-4', nombre: 'Zelle', moneda: 'USD', saldo: 0.00, icono: 'CreditCard' },
  { id: 'acc-5', nombre: 'Binance USDT', moneda: 'USD', saldo: 0.00, icono: 'Coins' },
  { id: 'acc-6', nombre: 'Cashea', moneda: 'USD', saldo: 0.00, icono: 'CircleDollarSign' },
];

function readServerStore(): ServerStoreState {
  const files = getTenantFiles();
  // Si el archivo está dañado y tampoco hay respaldo, esto lanza: nunca se reinicializa
  // encima de datos que todavía podrían recuperarse a mano.
  const data = readJsonFileWithBackup(files.store, (error) => {
    logger.error('store_state.json dañado; se usó la copia de respaldo .prev:', error);
  }) as any;
  if (data && typeof data === 'object') {
      return {
        products: Array.isArray(data.products) ? data.products : [],
        sales: Array.isArray(data.sales) ? data.sales : [],
        layaways: Array.isArray(data.layaways) ? data.layaways : [],
        movements: Array.isArray(data.movements) ? data.movements : [],
        accounts: Array.isArray(data.accounts) && data.accounts.length > 0 ? data.accounts : DEFAULT_ACCOUNTS,
        cashClosures: Array.isArray(data.cashClosures) ? data.cashClosures : [],
        expenses: Array.isArray(data.expenses) ? data.expenses : [],
        bankMovements: Array.isArray(data.bankMovements) ? data.bankMovements : [],
        currencyPurchases: Array.isArray(data.currencyPurchases) ? data.currencyPurchases : [],
        accountingEntries: Array.isArray(data.accountingEntries) ? data.accountingEntries : [],
        exchangeRate: typeof data.exchangeRate === 'number' ? data.exchangeRate : 68.50,
        historicalRates: (data.historicalRates && typeof data.historicalRates === 'object') ? data.historicalRates : {},
        adminPin: data.adminPin || '1234',
        updatedAt: data.updatedAt || new Date().toISOString(),
      };
  }
  if (data !== undefined) throw new Error('El archivo de datos de la empresa tiene un formato inválido.');

  const initial: ServerStoreState = {
    products: [],
    sales: [],
    layaways: [],
    movements: [],
    accounts: DEFAULT_ACCOUNTS,
    cashClosures: [],
    expenses: [],
    bankMovements: [],
    currencyPurchases: [],
    accountingEntries: [],
    exchangeRate: 68.50,
    historicalRates: {},
    adminPin: '1234',
    updatedAt: new Date().toISOString(),
  };

  writeJsonFileAtomic(files.store, initial);
  return initial;
}

function writeServerStore(state: ServerStoreState) {
  const files = getTenantFiles();
  state.updatedAt = new Date().toISOString();
  // store_state.json es la fuente de verdad; products/sales.json son copias de lectura.
  writeJsonFileAtomic(files.store, state);
  try {
    writeJsonFileAtomic(files.products, state.products);
    writeJsonFileAtomic(files.sales, state.sales);
  } catch (e) {
    logger.error('No se pudieron actualizar las copias products/sales.json:', e);
  }
}

function readLocalProducts(): any[] {
  return readServerStore().products;
}

function writeLocalProducts(products: any[]) {
  const store = readServerStore();
  store.products = products;
  writeServerStore(store);
}

function readLocalSales(): any[] {
  return readServerStore().sales;
}

function writeLocalSales(sales: any[]) {
  const store = readServerStore();
  store.sales = sales;
  writeServerStore(store);
}

function sanitizeStoreForTenantRole(store: ServerStoreState, role: MembershipRole): ServerStoreState {
  if (role === 'owner' || role === 'admin') return store;
  if (role !== 'cashier') return { ...store, adminPin: '' };
  return { ...store, sales: [], movements: [], cashClosures: [], expenses: [], bankMovements: [], currencyPurchases: [], accountingEntries: [], adminPin: '' };
}

/**
 * Express 4 no captura promesas rechazadas: un error lanzado en un handler `async`
 * (por ejemplo, un archivo de datos dañado) dejaría la petición colgada o tumbaría
 * el proceso. Esto envuelve los handlers de rutas para enviarlos a `next(err)`.
 */
function forwardAsyncRouteErrors(app: express.Express) {
  type Handler = (req: express.Request, res: express.Response, next: express.NextFunction) => unknown;
  const wrap = (handler: unknown) => {
    // Los manejadores de error (4 parámetros) y lo que no sea función se dejan igual.
    if (typeof handler !== 'function' || handler.length >= 4) return handler;
    const fn = handler as Handler;
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      try {
        const result = fn(req, res, next);
        if (result && typeof (result as Promise<unknown>).catch === 'function') (result as Promise<unknown>).catch(next);
      } catch (error) {
        next(error);
      }
    };
  };
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'all'] as const) {
    const original = (app[method] as (...args: unknown[]) => unknown).bind(app);
    (app as any)[method] = (...args: unknown[]) => {
      // app.get('ajuste') es el getter de configuración, no una ruta.
      if (method === 'get' && args.length === 1) return original(...args);
      return original(...args.map(wrap));
    };
  }
}

async function startServer() {
  const app = express();
  forwardAsyncRouteErrors(app);
  // Render (y la mayoría de hostings) asignan el puerto por variable de
  // entorno. Si se deja fijo en 3000, el servicio arranca pero el hosting
  // nunca logra conectarse y el sitio queda caído.
  const PORT = Number(process.env.PORT) || 3000;

  // JSON & URL-encoded middleware (25MB limit for high-res camera sneaker photos)
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // 1. Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'NEXOSS API',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  app.get('/api/public/fiscal-board/:companyId/:token', (req, res) => {
    const token = req.params.token;
    if (!/^[0-9a-f-]{36}$/i.test(req.params.companyId) || !/^[0-9a-f]{64}$/i.test(token)) {
      return res.status(404).json({ error: 'La cartelera no está disponible.' });
    }

    try {
      const company = PLATFORM_STORE.readState().companies.find((item) => item.id === req.params.companyId && item.status === 'active');
      if (!company) return res.status(404).json({ error: 'La cartelera no está disponible.' });
      const filePath = tenantDataFiles(DATA_DIR, company.id).fiscalBoard;
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'La cartelera no está disponible.' });
      const board = readFiscalBoard(filePath, NATIONAL_FISCAL_REQUIREMENTS);
      if (!matchesPublicBoardToken(board.publicTokenHash, token)) {
        return res.status(404).json({ error: 'La cartelera no está disponible.' });
      }

      res.set({
        'Cache-Control': 'no-store, max-age=0',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
        'Referrer-Policy': 'no-referrer',
      });
      return res.json(publicFiscalBoard(company.tradeName || company.legalName, board));
    } catch (error) {
      logger.error('Error consultando cartelera fiscal pública:', error);
      return res.status(503).json({ error: 'No se pudo cargar la cartelera fiscal.' });
    }
  });

  // Salud permanece pública. Todas las rutas API operativas declaradas debajo
  // requieren un token Firebase verificado por el servidor.
  app.use('/api', requireFirebaseAuth);

  // Onboarding y administración central necesitan identidad Firebase, pero
  // todavía no tienen un tenant seleccionado.
  app.post('/api/platform/invitations/accept', async (req, res) => {
    const identity = (req as any).firebaseIdentity;
    if (!identity?.uid || !identity.email || identity.emailVerified !== true) return res.status(403).json({ error: 'Se requiere un correo Firebase verificado para aceptar invitaciones.' });
    const invitationId = typeof req.body?.invitationId === 'string' ? req.body.invitationId.trim() : '';
    if (!invitationId) return res.status(400).json({ error: 'Selecciona una invitación válida.' });
    if (usePostgresControlPlane()) {
      try {
        const accepted = await getPostgresControlPlane().acceptInvitation(invitationId, identity);
        return accepted ? res.json({ accepted }) : res.status(403).json({ error: 'La invitación no existe, venció o no corresponde al correo verificado.' });
      } catch {
        return res.status(503).json({ error: 'No se pudieron procesar las invitaciones.' });
      }
    }
    try {
      const accepted = acceptCompanyInvitation(PLATFORM_STORE, invitationId, identity);
      return accepted ? res.json({ accepted }) : res.status(403).json({ error: 'La invitación no existe, venció o no corresponde al correo verificado.' });
    } catch { return res.status(503).json({ error: 'No se pudieron procesar las invitaciones.' }); }
  });

  app.get('/api/platform/companies', async (req, res) => {
    const identity = (req as any).firebaseIdentity;
    if (!identity?.uid) return res.status(401).json({ error: 'Se requiere identidad verificada.' });
    if (usePostgresControlPlane()) {
      try {
        const result = await getPostgresControlPlane().listForIdentity(identity);
        return res.json({ ...result, platformAdmin: platformAdminUids().has(identity.uid) });
      } catch {
        return res.status(503).json({ error: 'Control de empresas no disponible.' });
      }
    }
    try {
      const state = PLATFORM_STORE.readState();
      const user = state.users.find((item) => item.subject === identity.uid);
      const memberships = user ? state.memberships.filter((item) => item.userId === user.id && item.status === 'active') : [];
      const rows = memberships.flatMap((membership) => {
        const company = state.companies.find((item) => item.id === membership.companyId);
        const subscription = state.subscriptions.find((item) => item.companyId === membership.companyId);
        const plan = subscription && state.plans.find((item) => item.id === subscription.planId);
        return company && (company.status !== 'onboarding' || ['owner', 'admin'].includes(membership.role))
          ? [{ id: company.id, slug: company.slug, legalName: company.legalName, tradeName: company.tradeName, industryTemplate: resolveIndustryTemplate(company.workspace.industryTemplate, company.activity), status: company.status, onboardingStep: company.onboardingStep, role: membership.role, subscription: subscription ? { status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd, plan: plan?.name || 'Sin plan' } : null }]
          : [];
      });
      const now = new Date();
      const invitations = identity.emailVerified === true && identity.email
        ? state.invitations.filter((item) => item.email.toLowerCase() === identity.email.toLowerCase() && isInvitationPending(item, now)).flatMap((invitation) => {
          const company = state.companies.find((item) => item.id === invitation.companyId && ['onboarding', 'active'].includes(item.status));
          return company && hasActiveSubscription(state, company.id, now)
            ? [{ id: invitation.id, companyId: company.id, companyName: company.tradeName || company.legalName, role: invitation.role, expiresAt: invitation.expiresAt }]
            : [];
        })
        : [];
      const manageableCompanyIds = new Set(memberships.filter((item) => ['owner', 'admin'].includes(item.role)).map((item) => item.companyId));
      const managedInvitations = state.invitations.filter((item) => manageableCompanyIds.has(item.companyId) && isInvitationPending(item, now)).flatMap((invitation) => {
        const company = state.companies.find((item) => item.id === invitation.companyId);
        return company ? [{ id: invitation.id, companyId: company.id, companyName: company.tradeName || company.legalName, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt }] : [];
      });
      const emailMatches = findCompanyEmailMatches(state, identity);
      return res.json({ companies: rows, emailMatches, invitations, managedInvitations, platformAdmin: platformAdminUids().has(identity.uid) });
    } catch {
      return res.status(503).json({ error: 'Control de empresas local no habilitado. Usa NEXOSS_MULTIEMPRESA_MODE=local-demo solo en desarrollo.' });
    }
  });

  app.post('/api/platform/companies', async (req, res) => {
    const identity = (req as any).firebaseIdentity;
    if (!identity?.uid || !identity.email) return res.status(401).json({ error: 'Firebase debe verificar una cuenta con correo.' });
    if (identity.emailVerified !== true) return res.status(403).json({ error: 'Verifica el correo de Firebase antes de registrar una empresa.' });
    if (usePostgresControlPlane()) {
      try {
        const company = await getPostgresControlPlane().createCompany(req.body, identity);
        return res.status(201).json({ company: { id: company.id, slug: company.slug, legalName: company.legalName, tradeName: company.tradeName, industryTemplate: resolveIndustryTemplate(company.workspace.industryTemplate, company.activity), status: company.status, onboardingStep: company.onboardingStep } });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message.includes('Ya existe')) return res.status(409).json({ error: message });
        if (message.includes('obligatoria') || message.includes('correo verificado')) return res.status(400).json({ error: message });
        return res.status(503).json({ error: 'No se pudo crear la empresa.' });
      }
    }
    try {
      const company = createCompanyForVerifiedUser(PLATFORM_STORE, req.body, { uid: identity.uid, email: identity.email, emailVerified: identity.emailVerified === true, displayName: identity.displayName });
      return res.status(201).json({ company: { id: company.id, slug: company.slug, legalName: company.legalName, tradeName: company.tradeName, industryTemplate: resolveIndustryTemplate(company.workspace.industryTemplate, company.activity), status: company.status, onboardingStep: company.onboardingStep } });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('Ya existe')) return res.status(409).json({ error: message });
      return res.status(message.includes('obligatoria') || message.includes('identidad') ? 400 : 503).json({ error: message || 'No se pudo crear la empresa.' });
    }
  });

  app.get('/api/platform/companies/:companyId/onboarding', async (req, res) => {
    const identity = (req as any).firebaseIdentity;
    if (usePostgresControlPlane()) {
      try {
        const result = await getPostgresControlPlane().getOnboarding(identity?.uid, req.params.companyId);
        if (!result) return res.status(403).json({ error: 'No tienes permisos para consultar la configuración de esta empresa.' });
        return res.json({
          company: {
            id: result.company.id, legalName: result.company.legalName, tradeName: result.company.tradeName,
            industryTemplate: resolveIndustryTemplate(result.company.workspace.industryTemplate, result.company.activity),
            taxId: result.company.taxId, countryCode: result.company.countryCode, activity: result.company.activity,
            address: result.company.address, phone: result.company.phone, email: result.company.email,
          },
          fiscal: result.fiscal, workspace: result.workspace, onboardingStep: result.onboardingStep,
          subscription: result.subscription ? {
            status: result.subscription.status, currentPeriodEnd: result.subscription.currentPeriodEnd,
            plan: result.subscription.plan,
          } : null,
        });
      } catch {
        return res.status(503).json({ error: 'Control de empresas no disponible.' });
      }
    }
    try {
      const state = PLATFORM_STORE.readState();
      const membership = getCompanyOnboardingMembership(state, identity?.uid, req.params.companyId);
      const company = state.companies.find((item) => item.id === req.params.companyId);
      if (!membership || !company) return res.status(403).json({ error: 'No tienes permisos para consultar la configuración de esta empresa.' });
      const subscription = state.subscriptions.find((item) => item.companyId === company.id);
      const plan = subscription && state.plans.find((item) => item.id === subscription.planId);
      return res.json({
        company: { id: company.id, legalName: company.legalName, tradeName: company.tradeName, taxId: company.taxId, countryCode: company.countryCode, activity: company.activity, industryTemplate: resolveIndustryTemplate(company.workspace.industryTemplate, company.activity), address: company.address, phone: company.phone, email: company.email },
        fiscal: company.fiscal,
        workspace: company.workspace,
        onboardingStep: company.onboardingStep,
        subscription: subscription ? { status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd, plan: plan?.name } : null,
      });
    } catch { return res.status(503).json({ error: 'Control de empresas no disponible.' }); }
  });

  app.put('/api/platform/companies/:companyId/onboarding', async (req, res) => {
    const identity = (req as any).firebaseIdentity;
    if (!identity?.uid || !identity.email || identity.emailVerified !== true) return res.status(403).json({ error: 'Se requiere un correo Firebase verificado para configurar la empresa.' });
    const requestedStep = Number(req.body?.step);
    if (!Number.isInteger(requestedStep) || requestedStep < 2 || requestedStep > 5) return res.status(400).json({ error: 'Paso de configuración inválido.' });
    let normalizedCategories: string[] | null = null;
    if (requestedStep === 4) {
      try {
        normalizedCategories = normalizeInventoryCategories(req.body?.data?.categories);
      } catch (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : 'Categorías de inventario inválidas.' });
      }
    }
    if (usePostgresControlPlane()) {
      try {
        const result = await getPostgresControlPlane().saveOnboardingStep(identity, req.params.companyId, requestedStep, req.body?.data);
        if (!result) return res.status(403).json({ error: 'No tienes permisos para configurar esta empresa.' });
        if ('incomplete' in result) return res.status(400).json({ error: 'Completa los datos empresariales y fiscales requeridos antes de finalizar.' });
        const notice = result.invitation
          ? await sendInvitationNotice({ to: result.invitation.email, companyName: result.companyName || '', role: result.invitation.role, invitationId: result.invitation.id, invitedBy: identity.email, expiresAt: result.invitation.expiresAt })
          : {};
        return res.json({ ...result, ...notice });
      } catch {
        return res.status(503).json({ error: 'No se pudo guardar la configuración.' });
      }
    }
    try {
      let onboardingInvitationId: string | null = null;
      const result = PLATFORM_STORE.update((state) => {
        const user = state.users.find((item) => item.subject === identity?.uid);
        const membership = user && state.memberships.find((item) => item.userId === user.id && item.companyId === req.params.companyId && item.status === 'active' && ['owner', 'admin'].includes(item.role));
        const company = state.companies.find((item) => item.id === req.params.companyId);
        if (!membership || !company || company.status !== 'onboarding' || company.onboardingStep !== requestedStep) return null;
        const data = req.body?.data && typeof req.body.data === 'object' ? req.body.data as Record<string, unknown> : {};
        const safeFields = (keys: string[]) => Object.fromEntries(keys.filter((key) => typeof data[key] === 'string' || typeof data[key] === 'number' || typeof data[key] === 'boolean').map((key) => [key, data[key]]));
        if (requestedStep === 2) company.fiscal = { ...company.fiscal, ...safeFields(['countryCode', 'currency', 'taxRegime', 'taxRate', 'invoicePrefix']) };
        if (requestedStep === 3) {
          const inviteEmail = typeof data.inviteEmail === 'string' ? data.inviteEmail.trim().toLowerCase() : '';
          const inviteRole = typeof data.inviteRole === 'string' ? data.inviteRole : 'cashier';
          if (inviteEmail) {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail) || !['admin', 'accountant', 'auditor', 'supervisor', 'cashier'].includes(inviteRole)) return null;
            const subscription = state.subscriptions.find((item) => item.companyId === company.id);
            const plan = subscription && state.plans.find((item) => item.id === subscription.planId);
            const activeSeats = state.memberships.filter((item) => item.companyId === company.id && item.status === 'active').length + state.invitations.filter((item) => item.companyId === company.id && isInvitationPending(item)).length;
            if (activeSeats >= (plan?.limits.users || 1)) return null;
            const existing = state.invitations.find((item) => item.companyId === company.id && item.email.toLowerCase() === inviteEmail && isInvitationPending(item));
            if (!existing) {
              const onboardingInvitation = createCompanyInvitation(company.id, inviteEmail, inviteRole as Exclude<MembershipRole, 'owner'>);
              state.invitations.push(onboardingInvitation);
              onboardingInvitationId = onboardingInvitation.id;
            } else onboardingInvitationId = existing.id;
          }
          company.workspace = { ...company.workspace, teamSetup: inviteEmail ? 'invitation_pending' : 'owner_only' };
        }
        if (requestedStep === 4) {
          const subscription = state.subscriptions.find((item) => item.companyId === company.id);
          const plan = subscription && state.plans.find((item) => item.id === subscription.planId);
          const branches = Number(data.branches || 1);
          const warehouses = Number(data.warehouses || 1);
          const modules = Array.isArray(data.modules) ? data.modules.filter((module): module is string => typeof module === 'string' && Boolean(plan?.modules.includes(module))) : [];
          if (!Number.isInteger(branches) || branches < 1 || branches > (plan?.limits.branches || 1) || !Number.isInteger(warehouses) || warehouses < 1 || warehouses > (plan?.limits.warehouses || 1)) return null;
          company.workspace = { ...company.workspace, branches, warehouses, categories: normalizedCategories || [], modules };
        }
        if (requestedStep === 5) {
          if (!company.address || !company.phone || !company.activity || !company.fiscal.countryCode || !company.fiscal.currency) return { incomplete: true as const };
          company.status = 'active';
        }
        company.onboardingStep = Math.min(5, requestedStep + (requestedStep < 5 ? 1 : 0));
        company.updatedAt = new Date().toISOString();
        state.audit.push({ id: randomUUID(), actorUid: identity.uid, companyId: company.id, action: `company.onboarding.step_${requestedStep}`, createdAt: new Date().toISOString(), metadata: {} });
        const onboardingInvitation = onboardingInvitationId ? state.invitations.find((item) => item.id === onboardingInvitationId) : undefined;
        return { incomplete: false as const, status: company.status, onboardingStep: company.onboardingStep, ...(onboardingInvitation ? { invitation: onboardingInvitation, companyName: company.tradeName || company.legalName || '' } : {}) };
      });
      if (!result) return res.status(403).json({ error: 'No tienes permisos para configurar esta empresa.' });
      if (result.incomplete) return res.status(400).json({ error: 'Completa los datos empresariales y fiscales requeridos antes de finalizar.' });
      const notice = result.invitation
        ? await sendInvitationNotice({ to: result.invitation.email, companyName: result.companyName || '', role: result.invitation.role, invitationId: result.invitation.id, invitedBy: identity.email, expiresAt: result.invitation.expiresAt })
        : {};
      return res.json({ ...result, ...notice });
    } catch { return res.status(503).json({ error: 'No se pudo guardar la configuración.' }); }
  });

  const requirePlatformAdmin = (req: any, res: any, next: any) => {
    const uid = req.firebaseIdentity?.uid;
    if (!uid || !platformAdminUids().has(uid)) return res.status(403).json({ error: 'Se requiere una cuenta administradora de plataforma configurada fuera del navegador.' });
    next();
  };
  app.get('/api/platform/admin/overview', requirePlatformAdmin, async (_req, res) => {
    if (usePostgresControlPlane()) {
      try {
        return res.json(await getPostgresControlPlane().adminOverview());
      } catch {
        return res.status(503).json({ error: 'Control de empresas no disponible.' });
      }
    }
    try {
      const state = PLATFORM_STORE.readState();
      return res.json({ companies: state.companies.map((company) => ({ ...company, subscription: state.subscriptions.find((item) => item.companyId === company.id), memberships: state.memberships.filter((item) => item.companyId === company.id).length })), plans: state.plans, audit: state.audit.slice(-100).reverse() });
    } catch { return res.status(503).json({ error: 'Control de empresas no disponible.' }); }
  });
  app.post('/api/platform/admin/plans', requirePlatformAdmin, async (req, res) => {
    const body = req.body || {};
    const id = typeof body.id === 'string' ? body.id.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const limits = body.limits || {};
    if (!/^[a-z0-9_-]{2,40}$/.test(id) || name.length < 2 || typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price < 0
      || !['month', 'year'].includes(body.interval) || !/^[A-Z]{3}$/.test(body.currency || 'USD')
      || !['users', 'products', 'branches', 'warehouses'].every((key) => Number.isInteger(Number(limits[key])) && Number(limits[key]) > 0)
      || !Array.isArray(body.modules)) return res.status(400).json({ error: 'Datos del plan inválidos.' });
    if (usePostgresControlPlane()) {
      const modules = [...new Set<string>(body.modules.filter((value: unknown) => typeof value === 'string' && /^[a-z0-9_-]{2,40}$/.test(value)))];
      const plan: Plan = {
        id, name: name.slice(0, 80), price: body.price, currency: body.currency || 'USD',
        interval: body.interval,
        limits: { users: Number(limits.users), products: Number(limits.products), branches: Number(limits.branches), warehouses: Number(limits.warehouses) },
        modules, active: true,
      };
      try {
        const result = await getPostgresControlPlane().createPlan(plan, (req as any).firebaseIdentity.uid);
        return result ? res.status(201).json({ success: true, id }) : res.status(409).json({ error: 'Ya existe un plan con ese ID.' });
      } catch {
        return res.status(503).json({ error: 'No se pudo crear el plan.' });
      }
    }
    try {
      const result = PLATFORM_STORE.update((state) => {
        if (state.plans.some((plan) => plan.id === id)) return false;
        const modules = [...new Set<string>(body.modules.filter((value: unknown) => typeof value === 'string' && /^[a-z0-9_-]{2,40}$/.test(value)) as string[])];
        state.plans.push({ id, name: name.slice(0, 80), price: body.price, currency: body.currency || 'USD', interval: body.interval, limits: { users: Number(limits.users), products: Number(limits.products), branches: Number(limits.branches), warehouses: Number(limits.warehouses) }, modules, active: true });
        state.audit.push({ id: randomUUID(), actorUid: (req as any).firebaseIdentity.uid, action: 'platform.plan.created', createdAt: new Date().toISOString(), metadata: { planId: id } });
        return true;
      });
      return result ? res.status(201).json({ success: true, id }) : res.status(409).json({ error: 'Ya existe un plan con ese ID.' });
    } catch { return res.status(503).json({ error: 'No se pudo crear el plan.' }); }
  });
  app.patch('/api/platform/admin/plans/:planId', requirePlatformAdmin, async (req, res) => {
    if (usePostgresControlPlane()) {
      try {
        const result = await getPostgresControlPlane().updatePlan(req.params.planId, req.body || {}, (req as any).firebaseIdentity.uid);
        return result ? res.json({ success: true }) : res.status(404).json({ error: 'Plan no encontrado.' });
      } catch {
        return res.status(503).json({ error: 'No se pudo actualizar el plan.' });
      }
    }
    try {
      const result = PLATFORM_STORE.update((state) => {
        const plan = state.plans.find((item) => item.id === req.params.planId);
        if (!plan) return false;
        const body = req.body || {};
        if (typeof body.name === 'string' && body.name.trim()) plan.name = body.name.trim().slice(0, 80);
        if (typeof body.price === 'number' && Number.isFinite(body.price) && body.price >= 0) plan.price = body.price;
        if (typeof body.currency === 'string' && /^[A-Z]{3}$/.test(body.currency)) plan.currency = body.currency;
        if (body.interval === 'month' || body.interval === 'year') plan.interval = body.interval;
        if (body.limits && typeof body.limits === 'object') {
          for (const key of ['users', 'products', 'branches', 'warehouses'] as const) {
            const value = Number(body.limits[key]);
            if (Number.isInteger(value) && value > 0) plan.limits[key] = value;
          }
        }
        if (Array.isArray(body.modules)) plan.modules = Array.from(new Set<string>(body.modules.filter((value: unknown) => typeof value === 'string' && /^[a-z0-9_-]{2,40}$/.test(value)) as string[]));
        if (typeof body.active === 'boolean') plan.active = body.active;
        state.audit.push({ id: randomUUID(), actorUid: (req as any).firebaseIdentity.uid, action: 'platform.plan.updated', createdAt: new Date().toISOString(), metadata: { planId: plan.id } });
        return true;
      });
      return result ? res.json({ success: true }) : res.status(404).json({ error: 'Plan no encontrado.' });
    } catch { return res.status(503).json({ error: 'No se pudo actualizar el plan.' }); }
  });
  app.patch('/api/platform/admin/companies/:companyId', requirePlatformAdmin, async (req, res) => {
    const allowedStatuses = ['active', 'suspended', 'archived'];
    const status = req.body?.status;
    const subscriptionStatus = req.body?.subscriptionStatus;
    if (usePostgresControlPlane()) {
      try {
        const result = await getPostgresControlPlane().updateCompanyByAdmin(req.params.companyId, (req as any).firebaseIdentity.uid, {
          ...(allowedStatuses.includes(status) ? { status } : {}),
          ...(typeof subscriptionStatus === 'string' ? { subscriptionStatus } : {}),
          ...(typeof req.body?.currentPeriodEnd === 'string' ? { currentPeriodEnd: req.body.currentPeriodEnd } : {}),
          ...(typeof req.body?.planId === 'string' ? { planId: req.body.planId } : {}),
        });
        return result ? res.json({ success: true }) : res.status(404).json({ error: 'Empresa no encontrada o actualización inválida.' });
      } catch {
        return res.status(503).json({ error: 'No se pudo actualizar la cuenta.' });
      }
    }
    try {
      const result = PLATFORM_STORE.update((state) => {
        const company = state.companies.find((item) => item.id === req.params.companyId);
        if (!company) return false;
        if (status === 'active' && company.onboardingStep < 5) return false;
        if (allowedStatuses.includes(status)) company.status = status;
        const subscription = state.subscriptions.find((item) => item.companyId === company.id);
        if (subscription && ['active', 'past_due', 'suspended', 'canceled', 'trialing'].includes(subscriptionStatus)) {
          subscription.status = subscriptionStatus;
          if (typeof req.body?.currentPeriodEnd === 'string') {
            const end = Date.parse(req.body.currentPeriodEnd);
            if (!Number.isFinite(end) || end <= Date.now()) return false;
            subscription.currentPeriodEnd = new Date(end).toISOString();
            if (Date.parse(subscription.startedAt) >= end || Date.parse(subscription.startedAt) < Date.now() && subscriptionStatus === 'active') subscription.startedAt = new Date().toISOString();
          }
          if (typeof req.body?.planId === 'string' && state.plans.some((plan) => plan.id === req.body.planId && plan.active)) subscription.planId = req.body.planId;
          subscription.updatedAt = new Date().toISOString();
        }
        company.updatedAt = new Date().toISOString();
        state.audit.push({ id: randomUUID(), actorUid: (req as any).firebaseIdentity.uid, companyId: company.id, action: 'platform.company.updated', createdAt: new Date().toISOString(), metadata: { companyStatus: company.status, subscriptionStatus: subscription?.status } });
        return true;
      });
      return result ? res.json({ success: true }) : res.status(404).json({ error: 'Empresa no encontrada.' });
    } catch { return res.status(503).json({ error: 'No se pudo actualizar la cuenta.' }); }
  });

  app.post('/api/platform/companies/:companyId/invitations', async (req, res) => {
    const identity = (req as any).firebaseIdentity;
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const role = req.body?.role;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['admin', 'accountant', 'auditor', 'supervisor', 'cashier'].includes(role)) return res.status(400).json({ error: 'Correo o rol inválido.' });
    if (usePostgresControlPlane()) {
      try {
        const invitation = await getPostgresControlPlane().createInvitation(
          req.params.companyId, email, role as Exclude<MembershipRole, 'owner'>, identity,
        );
        if (!invitation) return res.status(403).json({ error: 'No se pudo crear la invitación: verifica permisos, empresa, capacidad del plan y membresías existentes.' });
        let companyName = '';
        try {
          const profile = await getPostgresControlPlane().getManagedCompanyProfile(req.params.companyId, identity?.uid || '');
          companyName = profile?.tradeName || profile?.legalName || '';
        } catch { /* el nombre es solo para el correo */ }
        const notice = await sendInvitationNotice({ to: email, companyName, role, invitationId: invitation.id, invitedBy: identity?.email, expiresAt: invitation.expiresAt });
        return res.status(201).json({ success: true, invitationId: invitation.id, expiresAt: invitation.expiresAt, ...notice });
      } catch {
        return res.status(503).json({ error: 'No se pudo crear la invitación.' });
      }
    }
    try {
      const result = PLATFORM_STORE.update((state) => {
        const user = state.users.find((item) => item.subject === identity?.uid);
        const ownerMembership = user && state.memberships.find((item) => item.userId === user.id && item.companyId === req.params.companyId && item.status === 'active' && ['owner', 'admin'].includes(item.role));
        const company = state.companies.find((item) => item.id === req.params.companyId && item.status === 'active');
        const subscription = state.subscriptions.find((item) => item.companyId === req.params.companyId);
        const plan = subscription && state.plans.find((item) => item.id === subscription.planId);
        if (!ownerMembership || !company || !subscription || !hasActiveSubscription(state, req.params.companyId)) return { error: 'No autorizado o empresa deshabilitada.' };
        if (state.memberships.filter((item) => item.companyId === company.id && item.status === 'active').length + state.invitations.filter((item) => item.companyId === company.id && isInvitationPending(item)).length >= (plan?.limits.users || 1)) return { error: 'El plan alcanzó el límite de usuarios.' };
        if (state.invitations.some((item) => item.companyId === company.id && item.email.toLowerCase() === email && isInvitationPending(item))) return { error: 'Ya existe una invitación pendiente para ese correo.' };
        if (state.users.some((item) => item.email.toLowerCase() === email) && state.memberships.some((item) => item.companyId === company.id && item.userId === state.users.find((candidate) => candidate.email.toLowerCase() === email)?.id && item.status === 'active')) return { error: 'Ese correo ya es miembro de la empresa.' };
        const invitation = createCompanyInvitation(company.id, email, role as Exclude<MembershipRole, 'owner'>);
        state.invitations.push(invitation);
        state.audit.push({ id: randomUUID(), actorUid: identity.uid, companyId: company.id, action: 'membership.invited', createdAt: new Date().toISOString(), metadata: { role } });
        return { invited: true, invitation, companyName: company.tradeName || company.legalName || '' };
      });
      if (!result.invited) return res.status(403).json({ error: result.error });
      const notice = await sendInvitationNotice({ to: email, companyName: result.companyName, role, invitationId: result.invitation.id, invitedBy: identity?.email, expiresAt: result.invitation.expiresAt });
      return res.status(201).json({ success: true, invitationId: result.invitation.id, expiresAt: result.invitation.expiresAt, ...notice });
    } catch { return res.status(503).json({ error: 'No se pudo crear la invitación.' }); }
  });

  app.delete('/api/platform/companies/:companyId/invitations/:invitationId', async (req, res) => {
    const identity = (req as any).firebaseIdentity;
    if (usePostgresControlPlane()) {
      try {
        const revoked = await getPostgresControlPlane().revokeInvitation(req.params.companyId, req.params.invitationId, identity?.uid || '');
        return revoked ? res.json({ success: true }) : res.status(403).json({ error: 'No se pudo revocar la invitación o no tienes permisos.' });
      } catch {
        return res.status(503).json({ error: 'No se pudo revocar la invitación.' });
      }
    }
    try {
      const revoked = PLATFORM_STORE.update((state) => {
        const user = state.users.find((item) => item.subject === identity?.uid);
        const membership = user && state.memberships.find((item) => item.userId === user.id && item.companyId === req.params.companyId && item.status === 'active' && ['owner', 'admin'].includes(item.role));
        const invitation = state.invitations.find((item) => item.id === req.params.invitationId && item.companyId === req.params.companyId && item.status === 'pending');
        if (!membership || !invitation) return false;
        invitation.status = 'revoked';
        state.audit.push({ id: randomUUID(), actorUid: identity.uid, companyId: req.params.companyId, action: 'membership.invitation_revoked', createdAt: new Date().toISOString(), metadata: { invitationId: invitation.id } });
        return true;
      });
      return revoked ? res.json({ success: true }) : res.status(403).json({ error: 'No se pudo revocar la invitación.' });
    } catch { return res.status(503).json({ error: 'No se pudo revocar la invitación.' }); }
  });

  // Solo las rutas comerciales requieren además membresía, empresa activa y suscripción vigente.
  app.use('/api', usePostgresControlPlane()
    ? createPostgresCompanyAccessMiddleware(getPostgresControlPlane(), new LocalEnvironmentTenantSecretProvider())
    : createCompanyAccessMiddleware(PLATFORM_STORE));

  const adminOnly = requireTenantRole('owner', 'admin');

  // Web Push: solo propietarios/administradores con membresía activa pueden registrar dispositivos.
  app.get('/api/push/public-key', adminOnly, (_req, res) => {
    const key = (process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim();
    if (!key || !isWebPushConfigured()) return res.status(503).json({ configured: false, error: 'Las notificaciones push aún no están configuradas en el servidor.' });
    return res.json({ configured: true, publicKey: key });
  });

  app.get('/api/push/status', adminOnly, async (req, res) => {
    const tenant = (req as TenantAuthenticatedRequest).tenant;
    const sql = getNeonSql();
    if (!tenant?.uid || !sql) return res.status(503).json({ configured: isWebPushConfigured(), active: false, error: 'No hay una base de datos disponible para esta empresa.' });
    try {
      const active = await hasWebPushSubscription(sql, tenant.uid);
      return res.json({ configured: isWebPushConfigured(), active });
    } catch {
      return res.status(503).json({ configured: isWebPushConfigured(), active: false, error: 'No se pudo consultar el estado de notificaciones.' });
    }
  });

  app.post('/api/push/test', adminOnly, async (req, res) => {
    const tenant = (req as TenantAuthenticatedRequest).tenant;
    const sql = getNeonSql();
    if (!tenant?.uid || !sql) return res.status(503).json({ error: 'No hay una base de datos disponible para esta empresa.' });
    try {
      const sent = await sendWebPushTest(sql, tenant.uid);
      return sent ? res.json({ sent: true }) : res.status(404).json({ sent: false, error: 'Este usuario no tiene un dispositivo activado en esta empresa.' });
    } catch (error) {
      logger.warn('[Web Push] Falló la notificación de prueba:', error instanceof Error ? error.message : 'error');
      return res.status(502).json({ sent: false, error: 'El servidor no pudo entregar la notificación de prueba. Revisa la configuración VAPID y el permiso del navegador.' });
    }
  });

  app.post('/api/push/subscribe', adminOnly, async (req, res) => {
    const identity = (req as any).firebaseIdentity;
    const sql = getNeonSql();
    if (!identity?.uid) return res.status(401).json({ error: 'Sesión no válida.' });
    if (!sql) return res.status(503).json({ error: 'La base de datos de la empresa no está disponible.' });
    if (!isWebPushConfigured()) return res.status(503).json({ error: 'Las notificaciones push no están configuradas.' });
    try {
      await saveWebPushSubscription(sql, identity.uid, req.body?.subscription);
      return res.json({ saved: true });
    } catch (error) {
      logger.warn('[Web Push] No se pudo guardar la suscripción:', error instanceof Error ? error.message : 'error');
      return res.status(400).json({ saved: false, error: 'No se pudo registrar este dispositivo.' });
    }
  });

  app.post('/api/push/unsubscribe', adminOnly, async (req, res) => {
    const identity = (req as any).firebaseIdentity;
    const sql = getNeonSql();
    const endpoint = req.body?.endpoint;
    if (!identity?.uid) return res.status(401).json({ error: 'Sesión no válida.' });
    if (!sql) return res.status(503).json({ error: 'La base de datos de la empresa no está disponible.' });
    if (typeof endpoint !== 'string' || endpoint.length > 4096) return res.status(400).json({ error: 'Endpoint inválido.' });
    try {
      await removeWebPushSubscription(sql, identity.uid, endpoint);
      return res.json({ removed: true });
    } catch {
      return res.status(500).json({ removed: false, error: 'No se pudo desactivar este dispositivo.' });
    }
  });
  app.get('/api/company/profile', adminOnly, async (req, res) => {
    const tenant = (req as TenantAuthenticatedRequest).tenant!;
    if (usePostgresControlPlane()) {
      try {
        const company = await getPostgresControlPlane().getManagedCompanyProfile(tenant.companyId, tenant.uid);
        if (!company) return res.status(403).json({ error: 'No tienes permisos para administrar esta empresa.' });
        return res.json({
          company: {
            id: company.id, legalName: company.legalName, tradeName: company.tradeName, taxId: company.taxId,
            activity: company.activity, address: company.address, phone: company.phone, email: company.email,
            industryTemplate: resolveIndustryTemplate(company.workspace.industryTemplate, company.activity),
          },
        });
      } catch (error) {
        logger.error('No se pudo leer el perfil de empresa:', error);
        return res.status(503).json({ error: 'No se pudo cargar la información de la empresa.' });
      }
    }
    try {
      const state = PLATFORM_STORE.readState();
      const membership = state.memberships.find((item) => item.companyId === tenant.companyId
        && item.userId === state.users.find((user) => user.subject === tenant.uid)?.id
        && item.status === 'active' && ['owner', 'admin'].includes(item.role));
      const company = state.companies.find((item) => item.id === tenant.companyId);
      if (!membership || !company) return res.status(403).json({ error: 'No tienes permisos para administrar esta empresa.' });
      return res.json({ company: {
        id: company.id, legalName: company.legalName, tradeName: company.tradeName, taxId: company.taxId,
        activity: company.activity, address: company.address, phone: company.phone, email: company.email,
        industryTemplate: resolveIndustryTemplate(company.workspace.industryTemplate, company.activity),
      } });
    } catch (error) {
      logger.error('No se pudo leer el perfil local de empresa:', error);
      return res.status(503).json({ error: 'No se pudo cargar la información de la empresa.' });
    }
  });

  app.put('/api/company/profile', adminOnly, async (req, res) => {
    const tenant = (req as TenantAuthenticatedRequest).tenant!;
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const field = (key: string, max: number) => typeof body[key] === 'string' ? body[key].trim().slice(0, max) : '';
    const profile = {
      legalName: field('legalName', 180), tradeName: field('tradeName', 180), taxId: field('taxId', 40),
      activity: field('activity', 180), address: field('address', 500), phone: field('phone', 40),
      email: field('email', 254), industryTemplate: field('industryTemplate', 40),
    };
    if (profile.legalName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)
      || !isIndustryTemplate(profile.industryTemplate)) {
      return res.status(400).json({ error: 'Revisa razón social, correo y rubro seleccionados.' });
    }
    if (usePostgresControlPlane()) {
      try {
        const saved = await getPostgresControlPlane().updateCompanyProfile(tenant.companyId, tenant.uid, profile);
        return saved ? res.json({ success: true }) : res.status(403).json({ error: 'No tienes permisos para editar esta empresa.' });
      } catch (error) {
        logger.error('No se pudo actualizar el perfil de empresa:', error);
        return res.status(503).json({ error: 'No se pudieron guardar los cambios de la empresa.' });
      }
    }
    try {
      const saved = PLATFORM_STORE.update((state) => {
        const user = state.users.find((item) => item.subject === tenant.uid);
        const membership = user && state.memberships.find((item) => item.companyId === tenant.companyId
          && item.userId === user.id && item.status === 'active' && ['owner', 'admin'].includes(item.role));
        const company = state.companies.find((item) => item.id === tenant.companyId);
        if (!membership || !company) return false;
        Object.assign(company, {
          legalName: profile.legalName, tradeName: profile.tradeName, taxId: profile.taxId,
          activity: profile.activity, address: profile.address, phone: profile.phone, email: profile.email,
          workspace: { ...company.workspace, industryTemplate: profile.industryTemplate },
          updatedAt: new Date().toISOString(),
        });
        state.audit.push({ id: randomUUID(), actorUid: tenant.uid, companyId: company.id, action: 'company.profile_updated', createdAt: new Date().toISOString(), metadata: { industryTemplate: profile.industryTemplate } });
        return true;
      });
      return saved ? res.json({ success: true }) : res.status(403).json({ error: 'No tienes permisos para editar esta empresa.' });
    } catch (error) {
      logger.error('No se pudo actualizar el perfil local de empresa:', error);
      return res.status(503).json({ error: 'No se pudieron guardar los cambios de la empresa.' });
    }
  });

  app.get('/api/company/members', adminOnly, async (req, res) => {
    const tenant = (req as TenantAuthenticatedRequest).tenant!;
    if (usePostgresControlPlane()) {
      try {
        const result = await getPostgresControlPlane().listForIdentity({ uid: tenant.uid });
        return res.json({ members: result.managedMembers.filter((member) => member.companyId === tenant.companyId) });
      } catch (error) {
        logger.error('No se pudo leer el equipo de empresa:', error);
        return res.status(503).json({ error: 'No se pudo cargar el equipo de la empresa.' });
      }
    }
    try {
      const state = PLATFORM_STORE.readState();
      const actor = state.users.find((user) => user.subject === tenant.uid);
      const adminMembership = actor && state.memberships.find((item) => item.companyId === tenant.companyId
        && item.userId === actor.id && item.status === 'active' && ['owner', 'admin'].includes(item.role));
      if (!adminMembership) return res.status(403).json({ error: 'No tienes permisos para consultar el equipo.' });
      const members = state.memberships.filter((item) => item.companyId === tenant.companyId && item.status === 'active')
        .flatMap((item) => {
          const user = state.users.find((candidate) => candidate.id === item.userId);
          return user ? [{ companyId: tenant.companyId, userId: user.id, email: user.email, displayName: user.displayName, role: item.role }] : [];
        });
      return res.json({ members });
    } catch (error) {
      logger.error('No se pudo leer el equipo local:', error);
      return res.status(503).json({ error: 'No se pudo cargar el equipo de la empresa.' });
    }
  });

  app.put('/api/company/members/:userId', adminOnly, async (req, res) => {
    const tenant = (req as TenantAuthenticatedRequest).tenant!;
    const role = req.body?.role;
    if (!['admin', 'accountant', 'auditor', 'supervisor', 'cashier'].includes(role)) {
      return res.status(400).json({ error: 'El rol seleccionado no es válido.' });
    }
    if (usePostgresControlPlane()) {
      try {
        const updated = await getPostgresControlPlane().updateMembershipRole(tenant.companyId, req.params.userId, role, tenant.uid);
        return updated ? res.json({ success: true }) : res.status(403).json({ error: 'No se puede cambiar el rol de esta membresía.' });
      } catch (error) {
        logger.error('No se pudo actualizar el rol del miembro:', error);
        return res.status(503).json({ error: 'No se pudo actualizar el rol.' });
      }
    }
    try {
      const updated = PLATFORM_STORE.update((state) => {
        const actor = state.users.find((item) => item.subject === tenant.uid);
        const current = state.memberships.find((item) => item.companyId === tenant.companyId && item.userId === actor?.id
          && item.status === 'active' && ['owner', 'admin'].includes(item.role));
        const target = state.memberships.find((item) => item.companyId === tenant.companyId && item.userId === req.params.userId
          && item.status === 'active' && item.role !== 'owner' && item.userId !== actor?.id);
        if (!current || !target) return false;
        target.role = role;
        state.audit.push({ id: randomUUID(), actorUid: tenant.uid, companyId: tenant.companyId, action: 'membership.role_updated', createdAt: new Date().toISOString(), metadata: { userId: target.userId, role } });
        return true;
      });
      return updated ? res.json({ success: true }) : res.status(403).json({ error: 'No se puede cambiar el rol de esta membresía.' });
    } catch (error) {
      logger.error('No se pudo actualizar el rol local:', error);
      return res.status(503).json({ error: 'No se pudo actualizar el rol.' });
    }
  });

  app.delete('/api/company/members/:userId', adminOnly, async (req, res) => {
    const tenant = (req as TenantAuthenticatedRequest).tenant!;
    if (usePostgresControlPlane()) {
      try {
        const revoked = await getPostgresControlPlane().revokeMembership(tenant.companyId, req.params.userId, tenant.uid);
        return revoked ? res.json({ success: true }) : res.status(403).json({ error: 'No se puede retirar esta membresía.' });
      } catch (error) {
        logger.error('No se pudo retirar el miembro:', error);
        return res.status(503).json({ error: 'No se pudo retirar al miembro de la empresa.' });
      }
    }
    try {
      const revoked = PLATFORM_STORE.update((state) => {
        const actor = state.users.find((item) => item.subject === tenant.uid);
        const current = state.memberships.find((item) => item.companyId === tenant.companyId && item.userId === actor?.id
          && item.status === 'active' && ['owner', 'admin'].includes(item.role));
        const target = state.memberships.find((item) => item.companyId === tenant.companyId && item.userId === req.params.userId
          && item.status === 'active' && item.role !== 'owner' && item.userId !== actor?.id);
        if (!current || !target) return false;
        target.status = 'revoked';
        state.audit.push({ id: randomUUID(), actorUid: tenant.uid, companyId: tenant.companyId, action: 'membership.revoked', createdAt: new Date().toISOString(), metadata: { userId: target.userId } });
        return true;
      });
      return revoked ? res.json({ success: true }) : res.status(403).json({ error: 'No se puede retirar esta membresía.' });
    } catch (error) {
      logger.error('No se pudo retirar al miembro local:', error);
      return res.status(503).json({ error: 'No se pudo retirar al miembro de la empresa.' });
    }
  });

  app.get('/api/company/categories', adminOnly, async (_req, res) => {
    const sql = getNeonSql();
    if (!sql) return res.status(503).json({ error: 'No se encontró la base de datos de la empresa.' });
    try {
      await initDatabaseSchema();
      const [saved, legacyProducts] = await Promise.all([
        sql`SELECT id, name, kind FROM business_categories ORDER BY kind, name`,
        sql`SELECT DISTINCT categoria AS name FROM shoe_products WHERE categoria IS NOT NULL AND trim(categoria) <> ''`,
      ]);
      const categories = [...saved.map((item: any) => ({ id: item.id, name: item.name, kind: item.kind })),
        ...legacyProducts.map((item: any) => ({ id: `legacy-${String(item.name).toLowerCase()}`, name: item.name, kind: 'product', legacy: true }))];
      return res.json({ categories });
    } catch (error) {
      logger.error('No se pudieron leer categorías:', error);
      return res.status(503).json({ error: 'No se pudieron cargar las categorías.' });
    }
  });

  app.post('/api/company/categories', adminOnly, async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 100) : '';
    const kind = req.body?.kind;
    if (name.length < 2 || !['product', 'service'].includes(kind)) return res.status(400).json({ error: 'Escribe una categoría válida y selecciona producto o servicio.' });
    const sql = getNeonSql();
    if (!sql) return res.status(503).json({ error: 'No se encontró la base de datos de la empresa.' });
    try {
      await initDatabaseSchema();
      const id = randomUUID();
      const rows = await sql`INSERT INTO business_categories (id, name, kind) VALUES (${id}, ${name}, ${kind}) RETURNING id, name, kind`;
      return res.status(201).json({ category: rows[0] });
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre.' });
      logger.error('No se pudo crear categoría:', error);
      return res.status(503).json({ error: 'No se pudo crear la categoría.' });
    }
  });

  app.put('/api/company/categories/:id', adminOnly, async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 100) : '';
    if (name.length < 2) return res.status(400).json({ error: 'El nombre de la categoría debe tener al menos 2 caracteres.' });
    const sql = getNeonSql();
    if (!sql) return res.status(503).json({ error: 'No se encontró la base de datos de la empresa.' });
    try {
      await initDatabaseSchema();
      const rows = await sql`
        WITH old_category AS (
          SELECT name, kind FROM business_categories WHERE id = ${req.params.id}
        ), updated_products AS (
          UPDATE shoe_products SET categoria = ${name}
          WHERE (SELECT kind FROM old_category) = 'product'
            AND categoria = (SELECT name FROM old_category)
        )
        UPDATE business_categories SET name = ${name}
        WHERE id = ${req.params.id}
        RETURNING id, name, kind
      `;
      if (!rows[0]) return res.status(404).json({ error: 'No se encontró la categoría.' });
      return res.json({ category: rows[0] });
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre.' });
      logger.error('No se pudo editar categoría:', error);
      return res.status(503).json({ error: 'No se pudo editar la categoría.' });
    }
  });

  app.delete('/api/company/categories/:id', adminOnly, async (req, res) => {
    const sql = getNeonSql();
    if (!sql) return res.status(503).json({ error: 'No se encontró la base de datos de la empresa.' });
    try {
      await initDatabaseSchema();
      const rows = await sql`SELECT name, kind FROM business_categories WHERE id = ${req.params.id}`;
      if (!rows[0]) return res.status(404).json({ error: 'No se encontró la categoría.' });
      if (rows[0].kind === 'product') {
        const references = await sql`SELECT count(*)::int AS count FROM shoe_products WHERE categoria = ${rows[0].name}`;
        if (Number(references[0]?.count || 0) > 0) return res.status(409).json({ error: 'La categoría tiene productos asociados; edítala o cambia esos productos antes de eliminarla.' });
      }
      await sql`DELETE FROM business_categories WHERE id = ${req.params.id}`;
      return res.json({ success: true });
    } catch (error) {
      logger.error('No se pudo eliminar categoría:', error);
      return res.status(503).json({ error: 'No se pudo eliminar la categoría.' });
    }
  });

  app.get('/api/fiscal-board', (req, res) => {
    try {
      const tenant = (req as TenantAuthenticatedRequest).tenant;
      if (!tenant) return res.status(403).json({ error: 'No hay una empresa autorizada.' });
      const board = readFiscalBoard(getTenantFiles().fiscalBoard, NATIONAL_FISCAL_REQUIREMENTS);
      const { publicTokenHash, ...visibleBoard } = board;
      return res.json({ ...visibleBoard, publicLinkEnabled: Boolean(publicTokenHash) });
    } catch (error) {
      logger.error('Error leyendo la carpeta fiscal:', error);
      return res.status(503).json({ error: 'No se pudo leer la carpeta fiscal.' });
    }
  });

  app.put('/api/fiscal-board', (req, res) => {
    try {
      const tenant = (req as TenantAuthenticatedRequest).tenant;
      if (!tenant) return res.status(403).json({ error: 'No hay una empresa autorizada.' });
      const filePath = getTenantFiles().fiscalBoard;
      const previous = readFiscalBoard(filePath, NATIONAL_FISCAL_REQUIREMENTS);
      const submitted = validateFiscalBoardState(req.body, NATIONAL_FISCAL_REQUIREMENTS);
      const changedRequirements = submitted.requirements.filter((item) => {
        const old = previous.requirements.find((requirement) => requirement.id === item.id);
        return old && (old.status !== item.status || old.responsible !== item.responsible || old.dueDate !== item.dueDate || old.notes !== item.notes || old.evidenceDocumentId !== item.evidenceDocumentId);
      }).length;
      const now = new Date().toISOString();
      const auditEvents = [...(previous.auditEvents || []), {
        id: randomUUID(),
        actorUid: tenant.uid,
        action: 'fiscal_board.updated',
        createdAt: now,
        summary: `Actualizó ${submitted.documents.length} documentos y ${changedRequirements} requisitos.`,
      }].slice(-200);
      const nextBoard = {
        ...(previous.calendar ? { calendar: previous.calendar } : {}),
        ...(previous.settings ? { settings: previous.settings } : {}),
        ...submitted,
        auditEvents,
        ...(previous.publicTokenHash ? { publicTokenHash: previous.publicTokenHash } : {}),
        updatedAt: now,
      };
      saveFiscalBoard(filePath, nextBoard);
      const { publicTokenHash, ...visibleBoard } = nextBoard;
      return res.json({ ...visibleBoard, publicLinkEnabled: Boolean(publicTokenHash) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar la carpeta fiscal.';
      logger.error('Error guardando la carpeta fiscal:', error);
      return res.status(error instanceof FiscalBoardValidationError ? 400 : 503).json({ error: message });
    }
  });

  app.post('/api/fiscal-board/public-link', (req, res) => {
    try {
      const tenant = (req as TenantAuthenticatedRequest).tenant;
      if (!tenant) return res.status(403).json({ error: 'No hay una empresa autorizada.' });
      const filePath = getTenantFiles().fiscalBoard;
      const board = readFiscalBoard(filePath, NATIONAL_FISCAL_REQUIREMENTS);
      const token = randomBytes(32).toString('hex');
      board.publicTokenHash = createHash('sha256').update(token).digest('hex');
      board.updatedAt = new Date().toISOString();
      board.auditEvents = [...(board.auditEvents || []), {
        id: randomUUID(),
        actorUid: tenant.uid,
        action: 'fiscal_board.public_link_created',
        createdAt: board.updatedAt,
        summary: 'Creó o renovó el enlace público de la cartelera.',
      }].slice(-200);
      saveFiscalBoard(filePath, board);
      return res.status(201).json({ token });
    } catch (error) {
      logger.error('Error creando el enlace público de la cartelera:', error);
      return res.status(503).json({ error: 'No se pudo crear el enlace público.' });
    }
  });

  app.delete('/api/fiscal-board/public-link', (req, res) => {
    try {
      const tenant = (req as TenantAuthenticatedRequest).tenant;
      if (!tenant) return res.status(403).json({ error: 'No hay una empresa autorizada.' });
      const filePath = getTenantFiles().fiscalBoard;
      const board = readFiscalBoard(filePath, NATIONAL_FISCAL_REQUIREMENTS);
      delete board.publicTokenHash;
      board.updatedAt = new Date().toISOString();
      board.auditEvents = [...(board.auditEvents || []), {
        id: randomUUID(),
        actorUid: tenant.uid,
        action: 'fiscal_board.public_link_revoked',
        createdAt: board.updatedAt,
        summary: 'Revocó el enlace público de la cartelera.',
      }].slice(-200);
      saveFiscalBoard(filePath, board);
      return res.json({ success: true });
    } catch (error) {
      logger.error('Error revocando el enlace público de la cartelera:', error);
      return res.status(503).json({ error: 'No se pudo revocar el enlace público.' });
    }
  });

  const enforceProductLimit = (bulk = false) => (req: any, res: any, next: any) => {
    try {
      const tenant = tenantStorageContext.getStore();
      if (!tenant) return res.status(403).json({ error: 'No hay una empresa autorizada.' });
      const state = PLATFORM_STORE.readState();
      const subscription = state.subscriptions.find((item) => item.companyId === tenant.companyId);
      const plan = subscription && state.plans.find((item) => item.id === subscription.planId);
      if (!plan) return res.status(403).json({ error: 'La empresa no tiene un plan activo.' });
      const existing = readServerStore().products;
      const incoming = bulk && Array.isArray(req.body?.products) ? req.body.products : [req.body];
      const ids = new Set(existing.map((product: any) => String(product?.id || '')).filter(Boolean));
      for (const product of incoming) if (product?.id) ids.add(String(product.id));
      const projected = bulk && req.body?.replaceAll === true ? incoming.length : ids.size;
      if (projected > plan.limits.products) return res.status(403).json({ error: `El plan permite hasta ${plan.limits.products} productos.` });
      next();
    } catch { return res.status(503).json({ error: 'No se pudo comprobar el límite del plan.' }); }
  };
  app.post('/api/products', enforceProductLimit());
  app.post('/api/products/bulk', enforceProductLimit(true));

  // 2. Neon Database Status
  app.get('/api/db/status', async (req, res) => {
    try {
      const status = await checkDatabaseConnection();
      res.json(status);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ connected: false, error: msg });
    }
  });

  // 3. Neon DB Seed / Sync Demo Data
  app.post('/api/db/seed', async (req, res) => {
    const sql = getNeonSql();
    if (!sql) {
      return res.status(400).json({
        success: false,
        message: 'DATABASE_URL no configurada en Neon',
      });
    }

    try {
      await initDatabaseSchema();
      const { products, sales } = req.body;

      if (Array.isArray(products) && products.length > 0) {
        for (const p of products) {
          await sql`
            INSERT INTO shoe_products (
              id, nombre, marca, modelo, color, genero, categoria,
              talla, sku, precio, costo, stock, stock_minimo, stock_maximo,
              imagen_url, ubicacion, descripcion
            ) VALUES (
              ${p.id}, ${p.nombre}, ${p.marca}, ${p.modelo || ''}, ${p.color || ''},
              ${p.genero || 'Unisex'}, ${p.categoria || 'Casual'}, ${p.talla}, ${p.sku},
              ${p.precio}, ${p.costo}, ${p.stock}, ${p.stock_minimo || 3}, ${p.stock_maximo || 30},
              ${p.imagen_url || null}, ${p.ubicacion || 'Almacén'}, ${p.descripcion || ''}
            )
            ON CONFLICT (id) DO UPDATE SET
              stock = EXCLUDED.stock,
              precio = EXCLUDED.precio,
              costo = EXCLUDED.costo;
          `;
        }
      }

      if (Array.isArray(sales) && sales.length > 0) {
        for (const s of sales) {
          await sql`
            INSERT INTO sales_transactions (
              id, numero_factura, cliente_nombre, cliente_apellido,
              cliente_rif, cliente_telefono, subtotal_usd, descuento_usd,
              aplica_iva, porcentaje_iva, iva_monto_usd, total_usd, total_bs,
              costo_total_usd, ganancia_neta_usd, tasa_cambio, items, pagos,
              fecha, usuario
            ) VALUES (
              ${s.id}, ${s.numero_factura}, ${s.cliente_nombre || ''}, ${s.cliente_apellido || ''},
              ${s.cliente_rif || null}, ${s.cliente_telefono || null},
              ${s.subtotal_usd}, ${s.descuento_usd || 0}, ${Boolean(s.aplica_iva)},
              ${s.porcentaje_iva || 0}, ${s.iva_monto_usd || 0}, ${s.total_usd}, ${s.total_bs},
              ${s.costo_total_usd || 0}, ${s.ganancia_neta_usd || 0}, ${s.tasa_cambio},
              ${JSON.stringify(s.items)}, ${JSON.stringify(s.pagos)},
              ${s.fecha}, ${s.usuario || 'Cajero'}
            )
            ON CONFLICT (id) DO NOTHING;
          `;
        }
      }

      const prodCount = await sql`SELECT COUNT(*) as count FROM shoe_products`;
      const salesCount = await sql`SELECT COUNT(*) as count FROM sales_transactions`;

      res.json({
        success: true,
        message: 'Datos de la zapatería sincronizados exitosamente con Neon PostgreSQL',
        productsCount: Number(prodCount[0]?.count || 0),
        salesCount: Number(salesCount[0]?.count || 0),
      });
    } catch (err: unknown) {
      logger.error('Error al poblar Neon:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  });

  // 4. Global Store Synchronization API (Master State across all devices)
  app.get('/api/pos/version', async (_req, res) => {
    const store = readServerStore();
    const sql = getNeonSql();
    if (sql) {
      try {
        const [products, sales] = await Promise.all([
          sql`SELECT id, stock, precio FROM shoe_products ORDER BY id`,
          sql`SELECT id, fecha, total_usd FROM sales_transactions ORDER BY fecha, id`,
        ]);
        return res.json({
          success: true,
          version: {
            products: createHash('sha256').update(JSON.stringify(products)).digest('hex'),
            sales: createHash('sha256').update(JSON.stringify(sales)).digest('hex'),
          },
        });
      } catch (err) {
        logger.error('Neon /api/pos/version fetch error:', err);
        return res.status(503).json({ success: false, error: 'No se pudo comprobar la versión del punto de venta.' });
      }
    }
    const prodHash = `${store.products?.length || 0}-${store.products?.reduce((acc: number, p: any) => acc + (Number(p.stock) || 0), 0)}-${store.updatedAt}`;
    const salesHash = `${store.sales?.length || 0}-${store.sales?.[0]?.id || ''}-${store.sales?.[0]?.fecha || ''}`;
    res.json({ success: true, version: { products: prodHash, sales: salesHash } });
  });

  app.get('/api/pos/state', async (_req, res) => {
    const sql = getNeonSql();
    const store = readServerStore();
    const posAccounts = (store.accounts?.length ? store.accounts : DEFAULT_ACCOUNTS)
      .map((account: any) => ({
        id: account.id,
        nombre: account.nombre,
        moneda: account.moneda,
        icono: account.icono,
        saldo: 0,
      }));
    if (sql) {
      try {
        await initDatabaseSchema();
        const [products, sales] = await Promise.all([
          sql`SELECT * FROM shoe_products ORDER BY nombre ASC`,
          sql`SELECT * FROM sales_transactions ORDER BY fecha DESC`,
        ]);
        return res.json({
          success: true,
          source: 'neon_postgres',
          data: {
            products: normalizeProducts(products as any[]),
            sales: normalizeSales(sales as any[]),
            accounts: posAccounts,
            exchangeRate: store.exchangeRate || 807.39,
            historicalRates: store.historicalRates || {},
          },
        });
      } catch (err) {
        logger.error('Neon /api/pos/state fetch error:', err);
        return res.status(503).json({ success: false, error: 'No se pudieron cargar los datos del punto de venta.' });
      }
    }
    return res.json({
      success: true,
      source: 'server_store',
      data: {
        products: normalizeProducts(store.products || []),
        sales: normalizeSales(store.sales || []),
        accounts: posAccounts,
        exchangeRate: store.exchangeRate || 807.39,
        historicalRates: store.historicalRates || {},
      },
    });
  });

  app.get('/api/store/version', (req, res) => {
    const store = readServerStore();
    const prodHash = `${store.products?.length || 0}-${store.products?.reduce((acc: number, p: any) => acc + (Number(p.stock) || 0), 0)}-${store.updatedAt}`;
    const salesHash = `${store.sales?.length || 0}-${store.sales?.[0]?.id || ''}-${store.sales?.[0]?.fecha || ''}`;
    const expHash = `${store.expenses?.length || 0}-${store.expenses?.[0]?.id || ''}`;
    const closuresHash = `${store.cashClosures?.length || 0}-${store.cashClosures?.[0]?.id || ''}`;
    const bankHash = `${store.bankMovements?.length || 0}`;

    res.json({
      success: true,
      version: {
        products: prodHash,
        sales: salesHash,
        expenses: expHash,
        bankReconciliations: bankHash,
        closures: closuresHash,
        updatedAt: store.updatedAt,
      },
    });
  });

  app.get('/api/store/state', async (req, res) => {
    const role = (req as any).tenant?.role as MembershipRole;
    const sql = getNeonSql();
    if (sql) {
      try {
        await initDatabaseSchema();
        const [products, sales, expenses, reconciliations, closures, layaways] = await Promise.all([
          sql`SELECT * FROM shoe_products ORDER BY nombre ASC`,
          sql`SELECT * FROM sales_transactions ORDER BY fecha DESC`,
          sql`SELECT * FROM expenses ORDER BY fecha DESC, created_at DESC`,
          sql`SELECT * FROM bank_reconciliations ORDER BY fecha DESC, created_at DESC`,
          sql`SELECT * FROM cash_closures ORDER BY fecha DESC, created_at DESC`,
          sql`SELECT * FROM layaways ORDER BY fecha_apartado DESC`,
        ]);
        const store = sanitizeStoreForTenantRole(readServerStore(), role);
        return res.json({
          success: true,
          source: 'neon_postgres',
          data: {
            products: normalizeProducts(products as any[]),
            sales: normalizeSales(sales as any[]),
            movements: store.movements || [],
            cashClosures: closures || [],
            expenses: normalizeExpenses(expenses as any[]),
            accounts: store.accounts || DEFAULT_ACCOUNTS,
            layaways: (Array.isArray(layaways) && layaways.length > 0)
              ? normalizeLayaways(layaways as any[])
              : (store.layaways || []),
            bankMovements: normalizeBankReconciliations(reconciliations as any[]),
            currencyPurchases: store.currencyPurchases || [],
            exchangeRate: store.exchangeRate || 807.39,
            historicalRates: store.historicalRates || {},
            adminPin: role === 'cashier' ? '' : store.adminPin || '1234',
            updatedAt: new Date().toISOString(),
          },
        });
      } catch (err) {
        logger.error('Neon /api/store/state fetch error, using local fallback:', err);
      }
    }
    const store = sanitizeStoreForTenantRole(readServerStore(), role);
    res.json({
      success: true,
      source: 'server_store',
      data: {
        ...store,
        products: normalizeProducts(store.products || []),
        sales: normalizeSales(store.sales || []),
        expenses: normalizeExpenses(store.expenses || []),
        layaways: normalizeLayaways(store.layaways || []),
      },
    });
  });

  app.post('/api/store/sync', (req, res) => {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ success: false, error: 'Cuerpo de sincronización inválido' });
    }

    const current = readServerStore();
    if (Array.isArray(updates.products)) {
      if (updates.allowReplaceProducts) {
        current.products = updates.products;
      } else if (updates.products.length > 0) {
        const prodMap = new Map((current.products || []).map((p: any) => [p.id, p]));
        updates.products.forEach((p: any) => {
          if (p && p.id) {
            prodMap.set(p.id, { ...(prodMap.get(p.id) || {}), ...p });
          }
        });
        current.products = Array.from(prodMap.values());
      }
    }
    if (Array.isArray(updates.sales)) {
      if (updates.allowReplaceSales) {
        current.sales = updates.sales;
      } else if (updates.sales.length > 0) {
        const salesMap = new Map((current.sales || []).map((s: any) => [s.id, s]));
        updates.sales.forEach((s: any) => {
          if (s && s.id) salesMap.set(s.id, s);
        });
        current.sales = Array.from(salesMap.values());
      }
    }
    if (Array.isArray(updates.layaways)) {
      if (updates.layaways.length > 0 || updates.allowEmpty) {
        current.layaways = updates.layaways;
      }
    }
    if (Array.isArray(updates.movements)) {
      if (updates.movements.length > 0 || updates.allowEmpty) {
        current.movements = updates.movements;
      }
    }
    if (Array.isArray(updates.accounts)) current.accounts = updates.accounts;
    if (Array.isArray(updates.cashClosures)) current.cashClosures = updates.cashClosures;
    if (Array.isArray(updates.expenses)) current.expenses = updates.expenses;
    if (typeof updates.exchangeRate === 'number') current.exchangeRate = updates.exchangeRate;
    if (updates.historicalRates && typeof updates.historicalRates === 'object') {
      current.historicalRates = { ...(current.historicalRates || {}), ...updates.historicalRates };
    }
    if (typeof updates.adminPin === 'string') current.adminPin = updates.adminPin;

    writeServerStore(current);
    res.json({ success: true, data: current });
  });

  // Products API (Neon or Local JSON persistence)
  app.get('/api/products', async (req, res) => {
    const sql = getNeonSql();
    if (sql) {
      try {
        const rows = await sql`SELECT * FROM shoe_products ORDER BY nombre ASC`;
        return res.json({ source: 'neon_postgres', data: normalizeProducts(rows as any[]) });
      } catch (err) {
        logger.error('Neon products fetch error, using local fallback:', err);
      }
    }
    const local = readLocalProducts();
    res.json({ source: 'local_file', data: local });
  });

  app.post('/api/products', async (req, res) => {
    const p = req.body;
    if (!p || !p.id) {
      return res.status(400).json({ saved: false, error: 'Datos de producto inválidos' });
    }

    // Always update server store
    const store = readServerStore();
    const existingIndex = store.products.findIndex((item: any) => item.id === p.id);
    if (existingIndex >= 0) {
      store.products[existingIndex] = { ...store.products[existingIndex], ...p };
    } else {
      store.products.unshift(p);
    }
    writeServerStore(store);

    const sql = getNeonSql();
    if (sql) {
      try {
        await sql`
          INSERT INTO shoe_products (
            id, nombre, marca, modelo, color, genero, categoria,
            talla, sku, precio, costo, stock, stock_minimo, stock_maximo,
            imagen_url, ubicacion, descripcion, es_original
          ) VALUES (
            ${p.id}, ${p.nombre}, ${p.marca}, ${p.modelo || ''}, ${p.color || ''},
            ${p.genero || 'Unisex'}, ${p.categoria || 'Casual'}, ${p.talla}, ${p.sku},
            ${p.precio}, ${p.costo}, ${p.stock}, ${p.stock_minimo || 3}, ${p.stock_maximo || 30},
            ${p.imagen_url || p.imagen || null}, ${p.ubicacion || 'Almacén'}, ${p.descripcion || ''},
            ${p.es_original !== false}
          )
          ON CONFLICT (id) DO UPDATE SET
            nombre = EXCLUDED.nombre,
            marca = EXCLUDED.marca,
            modelo = EXCLUDED.modelo,
            color = EXCLUDED.color,
            genero = EXCLUDED.genero,
            categoria = EXCLUDED.categoria,
            talla = EXCLUDED.talla,
            sku = EXCLUDED.sku,
            precio = EXCLUDED.precio,
            costo = EXCLUDED.costo,
            stock = EXCLUDED.stock,
            stock_minimo = EXCLUDED.stock_minimo,
            stock_maximo = EXCLUDED.stock_maximo,
            imagen_url = EXCLUDED.imagen_url,
            ubicacion = EXCLUDED.ubicacion,
            descripcion = EXCLUDED.descripcion,
            es_original = EXCLUDED.es_original;
        `;
      } catch (err: unknown) {
        // Antes este error solo se registraba en el log del servidor y se le
        // respondía "guardado" al navegador de todas formas. Eso hacía que un
        // cambio de talla/precio pareciera guardarse pero en realidad nunca
        // llegara a Neon, y volviera al valor anterior en la siguiente
        // sincronización. Ahora se informa el fallo de verdad.
        logger.error('Error saving product to Neon:', err);
        return res.status(500).json({
          saved: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    res.json({ saved: true, id: p.id, product: p });
  });

  // Delete product API
  app.delete('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    const store = readServerStore();
    store.products = store.products.filter((item: any) => item.id !== id);
    writeServerStore(store);

    const sql = getNeonSql();
    if (sql) {
      try {
        await sql`DELETE FROM shoe_products WHERE id = ${id}`;
      } catch (err) {
        logger.error('Error deleting product from Neon:', err);
      }
    }

    res.json({ success: true, id });
  });

  // Bulk products import API
  app.post('/api/products/bulk', async (req, res) => {
    const { products, replaceExisting } = req.body;
    if (!Array.isArray(products)) {
      return res.status(400).json({ success: false, error: 'Se esperaba un arreglo de productos' });
    }

    let finalProducts: any[] = [];
    if (replaceExisting) {
      finalProducts = products;
    } else {
      const current = readLocalProducts();
      const existingMap = new Map(current.map((item: any) => [item.id, item]));
      products.forEach((p: any) => {
        existingMap.set(p.id, p);
      });
      finalProducts = Array.from(existingMap.values());
    }
    writeLocalProducts(finalProducts);

    const sql = getNeonSql();
    if (sql) {
      try {
        await initDatabaseSchema();
        if (replaceExisting) {
          await sql`DELETE FROM shoe_products`;
        }
        for (const p of products) {
          await sql`
            INSERT INTO shoe_products (
              id, nombre, marca, modelo, color, genero, categoria,
              talla, sku, precio, costo, stock, stock_minimo, stock_maximo,
              imagen_url, ubicacion, descripcion
            ) VALUES (
              ${p.id}, ${p.nombre}, ${p.marca}, ${p.modelo || ''}, ${p.color || ''},
              ${p.genero || 'Unisex'}, ${p.categoria || 'Casual'}, ${p.talla}, ${p.sku},
              ${p.precio}, ${p.costo}, ${p.stock}, ${p.stock_minimo || 3}, ${p.stock_maximo || 30},
              ${p.imagen_url || p.imagen || null}, ${p.ubicacion || 'Almacén'}, ${p.descripcion || ''}
            )
            ON CONFLICT (id) DO UPDATE SET
              stock = EXCLUDED.stock,
              precio = EXCLUDED.precio,
              costo = EXCLUDED.costo,
              nombre = EXCLUDED.nombre;
          `;
        }
      } catch (err) {
        logger.error('Error in bulk Neon insert:', err);
      }
    }

    res.json({ success: true, count: products.length, total: finalProducts.length });
  });

  // 5. Sales API (Neon or Local JSON persistence)
  registerSalesRoutes(app, { readServerStore, writeServerStore, readLocalSales, getNeonSql, normalizeSales, updateSale, voidSale, onSaleRegistered: (sale) => notifyInBackground((company) => buildSaleNotice(sale, company)) });

  // Layaways API (Sistema de Apartados)
  app.get('/api/layaways', async (req, res) => {
    const sql = getNeonSql();
    if (sql) {
      try {
        const layaways = await getLayawaysFromDb();
        if (Array.isArray(layaways) && layaways.length > 0) {
          return res.json({ success: true, data: layaways, source: 'neon_postgres' });
        }
      } catch (err) {
        logger.error('Error fetching layaways from Neon:', err);
      }
    }
    const store = readServerStore();
    res.json({ success: true, data: store.layaways || [], source: 'server_store' });
  });

  app.post('/api/layaways', async (req, res) => {
    const layaway = req.body;
    if (!layaway || !layaway.id) {
      return res.status(400).json({ success: false, error: 'Datos de apartado inválidos' });
    }
    const store = readServerStore();
    if (!store.layaways) store.layaways = [];
    const existingIndex = store.layaways.findIndex((item: any) => item.id === layaway.id);
    if (existingIndex >= 0) {
      store.layaways[existingIndex] = { ...store.layaways[existingIndex], ...layaway };
    } else {
      store.layaways.unshift(layaway);
    }
    writeServerStore(store);

    // Persist to Neon
    const sql = getNeonSql();
    if (sql) {
      saveLayawayToDb(layaway).catch((err) => logger.error('Error saving layaway to Neon:', err));
    }

    res.json({ success: true, layaway });
  });

  app.put('/api/layaways/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const store = readServerStore();
    if (!store.layaways) store.layaways = [];
    const index = store.layaways.findIndex((item: any) => item.id === id);
    if (index >= 0) {
      store.layaways[index] = { ...store.layaways[index], ...updates };
      writeServerStore(store);

      // Update in Neon
      const sql = getNeonSql();
      if (sql) {
        saveLayawayToDb(store.layaways[index]).catch((err) =>
          logger.error('Error updating layaway in Neon:', err)
        );
      }

      return res.json({ success: true, layaway: store.layaways[index] });
    }
    res.status(404).json({ success: false, error: 'Apartado no encontrado' });
  });

  app.delete('/api/layaways/:id', async (req, res) => {
    const { id } = req.params;
    const store = readServerStore();
    if (!store.layaways) store.layaways = [];
    store.layaways = store.layaways.filter((item: any) => item.id !== id);
    writeServerStore(store);

    // Delete in Neon
    const sql = getNeonSql();
    if (sql) {
      deleteLayawayFromDb(id).catch((err) => logger.error('Error deleting layaway from Neon:', err));
    }

    res.json({ success: true, id });
  });

  // Movements API
  app.get('/api/movements', (req, res) => {
    const store = readServerStore();
    res.json({ success: true, data: store.movements });
  });

  app.post('/api/movements', (req, res) => {
    const m = req.body;
    if (m && m.id) {
      const store = readServerStore();
      store.movements.unshift(m);
      writeServerStore(store);
    }
    res.json({ success: true });
  });

  // Accounts API
  app.get('/api/accounts', (req, res) => {
    const store = readServerStore();
    res.json({ success: true, data: store.accounts });
  });

  app.post('/api/accounts', (req, res) => {
    const { accounts } = req.body;
    if (Array.isArray(accounts)) {
      const store = readServerStore();
      store.accounts = accounts;
      writeServerStore(store);
    }
    res.json({ success: true });
  });

  // Cash Closures API
  // Arqueo de caja: se guarda en Neon (base de datos compartida), NO en un
  // archivo local. El disco del hosting es temporal y se borra en cada
  // redespliegue, así que un archivo local perdería todos los cierres.
  app.get('/api/closures', async (req, res) => {
    try {
      const closures = await getSalesClosures();
      res.json({ success: true, data: closures });
    } catch (err) {
      logger.error('Error leyendo cierres de caja:', err);
      res.status(503).json({ success: false, error: 'No se pudo leer el arqueo. Tus datos no se borraron.', data: [] });
    }
  });

  app.post('/api/closures', async (req, res) => {
    const closure = req.body;
    if (!closure || !closure.id) {
      return res.status(400).json({ success: false, error: 'Datos de cierre inválidos' });
    }
    try {
      await initDatabaseSchema();
      await addSalesClosure(closure);
      res.json({ success: true, id: closure.id });
    } catch (err) {
      logger.error('Error guardando cierre de caja:', err);
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Anular una venta con error (no se borra: queda marcada como 'anulada'
  // y el stock vendido se devuelve al inventario)
  // 6. BDV Payment Verification API
  app.get('/api/bdv/status', (req, res) => {
    const config = getBdvApiConfig();
    res.json(config);
  });

  app.post('/api/bdv/verificar', async (req, res) => {
    try {
      const { referencia, telefono_origen, cedula_cliente, banco_origen, monto_bs, monto_usd } = req.body;
      const result = await verifyBdvPayment({
        referencia,
        telefono_origen,
        cedula_cliente,
        banco_origen,
        monto_bs,
        monto_usd,
      });
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({
        aprobado: false,
        mensaje: message,
      });
    }
  });

  app.get('/api/bdv/historial', (req, res) => {
    res.json(getRecentVerifications());
  });

  // 7. Expenses API (Gastos Operativos & Finanzas de Fin de Mes)
  app.get('/api/expenses', async (req, res) => {
    const sql = getNeonSql();
    if (!sql) {
      return res.json({ source: 'local_fallback', data: [] });
    }
    try {
      await initDatabaseSchema();
      const rows = await sql`SELECT * FROM expenses ORDER BY fecha DESC, created_at DESC`;
      res.json({ source: 'neon_postgres', data: normalizeExpenses(rows as any[]) });
    } catch (err: unknown) {
      logger.error('Error al obtener gastos de Neon:', err);
      res.json({ source: 'local_fallback', error: String(err), data: [] });
    }
  });

  app.post('/api/expenses', async (req, res) => {
    const sql = getNeonSql();
    const exp = req.body;
    if (!sql) {
      return res.json({ saved: false, message: 'DATABASE_URL no configurada en Neon' });
    }
    try {
      await initDatabaseSchema();
      const written = await sql`
        INSERT INTO expenses (
          id, fecha, categoria, descripcion, beneficiario,
          cuenta_origen, moneda, monto, tasa_cambio, monto_usd, monto_bs,
          comprobante_ref, registrado_por, notas, foto_factura
        ) VALUES (
          ${exp.id}, ${exp.fecha}, ${exp.categoria}, ${exp.descripcion}, ${exp.beneficiario || ''},
          ${exp.cuenta_origen}, ${exp.moneda}, ${exp.monto}, ${exp.tasa_cambio}, ${exp.monto_usd}, ${exp.monto_bs},
          ${exp.comprobante_ref || null}, ${exp.registrado_por || 'Admin'}, ${exp.notas || ''}, ${exp.foto_factura || null}
        )
        ON CONFLICT (id) DO UPDATE SET
          fecha = EXCLUDED.fecha,
          categoria = EXCLUDED.categoria,
          descripcion = EXCLUDED.descripcion,
          monto = EXCLUDED.monto,
          monto_usd = EXCLUDED.monto_usd,
          monto_bs = EXCLUDED.monto_bs,
          foto_factura = COALESCE(EXCLUDED.foto_factura, expenses.foto_factura)
        RETURNING (xmax = 0) AS inserted;
      `;
      // xmax = 0 solo ocurre cuando la fila es nueva: reenviar o editar un gasto no vuelve a avisar.
      if ((written as any[])[0]?.inserted) notifyInBackground((company) => buildExpenseNotice(exp, company));
      res.json({ saved: true, id: exp.id });
    } catch (err: unknown) {
      logger.error('Error guardando gasto en Neon:', err);
      res.status(500).json({ saved: false, error: String(err) });
    }
  });

  // 7.1 Invoice & Receipt Scanner AI (Gemini Vision with Lite/Flash Fallbacks)
  const handleReceiptScan = async (req: express.Request, res: express.Response) => {
    try {
      const { imageBase64, exchangeRate, historicalRates } = req.body || {};
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Se requiere una imagen en formato Base64 de la factura o comprobante.',
        });
      }

      const rate = Number(exchangeRate) > 0 ? Number(exchangeRate) : 1;
      const result = await analyzeReceiptImage(imageBase64, rate, historicalRates);
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[API scan-receipt error]:', msg);

      let cleanError = msg;
      if (msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE')) {
        cleanError = 'Los servidores de IA están temporalmente saturados por alta demanda. Por favor, pulsa "Reintentar" o completa los campos manualmente con la foto.';
      } else if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        cleanError = 'Límite de solicitudes momentáneo. Espera unos segundos y vuelve a intentar.';
      }

      res.status(500).json({
        success: false,
        error: cleanError,
      });
    }
  };

  app.post('/api/expenses/scan-receipt', handleReceiptScan);
  app.post('/api/ai/scan-receipt', handleReceiptScan);

  app.delete('/api/expenses/:id', async (req, res) => {
    const sql = getNeonSql();
    const { id } = req.params;
    if (!sql) {
      return res.json({ deleted: false, message: 'DATABASE_URL no configurada' });
    }
    try {
      await sql`DELETE FROM expenses WHERE id = ${id}`;
      res.json({ deleted: true });
    } catch (err: unknown) {
      res.status(500).json({ deleted: false, error: String(err) });
    }
  });

  // 8. Neon Database Explorer API (Para ver tablas e información previa de conciliación en Neon)
  app.get('/api/db/tables', async (req, res) => {
    try {
      const tables = await getNeonTables();
      res.json({ success: true, tables });
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  app.get('/api/db/table-data', async (req, res) => {
    const tableName = req.query.table as string;
    const limit = Number(req.query.limit || 50);
    if (!tableName) {
      return res.status(400).json({ success: false, error: 'Parámetro table requerido' });
    }
    try {
      const data = await getNeonTableData(tableName, limit);
      res.json({ success: true, ...data });
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  // 9. Bank Reconciliations API (Conciliación Bancaria con Neon)
  app.get('/api/bank-reconciliations', async (req, res) => {
    const sql = getNeonSql();
    if (!sql) {
      return res.json({ source: 'local_fallback', data: [] });
    }
    try {
      await initDatabaseSchema();
      const rows = await sql`SELECT * FROM bank_reconciliations ORDER BY fecha DESC, created_at DESC`;
      res.json({ source: 'neon_postgres', data: normalizeBankReconciliations(rows as any[]) });
    } catch (err: unknown) {
      res.json({ source: 'local_fallback', error: String(err), data: [] });
    }
  });

  app.post('/api/bank-reconciliations', async (req, res) => {
    const sql = getNeonSql();
    const item = req.body;
    if (!sql) {
      return res.json({ saved: false, message: 'DATABASE_URL no configurada' });
    }
    try {
      await initDatabaseSchema();
      await sql`
        INSERT INTO bank_reconciliations (
          id, fecha, banco, tipo, referencia, descripcion,
          monto_bs, monto_usd, estado_conciliacion, vinculado_tipo, vinculado_id, notas
        ) VALUES (
          ${item.id}, ${item.fecha}, ${item.banco}, ${item.tipo}, ${item.referencia}, ${item.descripcion},
          ${item.monto_bs}, ${item.monto_usd || null}, ${item.estado_conciliacion || 'pendiente'},
          ${item.vinculado_tipo || null}, ${item.vinculado_id || null}, ${item.notas || ''}
        )
        ON CONFLICT (id) DO UPDATE SET
          estado_conciliacion = EXCLUDED.estado_conciliacion,
          vinculado_tipo = EXCLUDED.vinculado_tipo,
          vinculado_id = EXCLUDED.vinculado_id,
          notas = EXCLUDED.notas;
      `;
      res.json({ saved: true, id: item.id });
    } catch (err: unknown) {
      res.status(500).json({ saved: false, error: String(err) });
    }
  });

  app.put('/api/bank-reconciliations/:id', async (req, res) => {
    const sql = getNeonSql();
    const { id } = req.params;
    const { estado_conciliacion, notas, vinculado_tipo, vinculado_id } = req.body;
    if (!sql) {
      return res.json({ updated: false, message: 'DATABASE_URL no configurada' });
    }
    try {
      await sql`
        UPDATE bank_reconciliations
        SET 
          estado_conciliacion = COALESCE(${estado_conciliacion}, estado_conciliacion),
          notas = COALESCE(${notas}, notas),
          vinculado_tipo = COALESCE(${vinculado_tipo}, vinculado_tipo),
          vinculado_id = COALESCE(${vinculado_id}, vinculado_id)
        WHERE id = ${id};
      `;
      res.json({ updated: true });
    } catch (err: unknown) {
      res.status(500).json({ updated: false, error: String(err) });
    }
  });

  // 10. Gemini AI Shoe Image Recognition & Merchandising API
  const handleShoeAnalysis = async (req: express.Request, res: express.Response) => {
    // Enable CORS & Preflight headers
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    res.header('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    try {
      const { imageBase64, userHint } = req.body || {};
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Se requiere una imagen en formato Base64 para analizar el calzado.',
        });
      }

      const analysis = await analyzeShoeImage(imageBase64, userHint);

      // Return unified response compatible with both frontend interfaces
      res.json({
        ...analysis,
        // Also provide keys from user's custom prompt format
        marcaModelo: `${analysis.marca} ${analysis.modelo}`.trim(),
        estiloCategoria: analysis.tipo,
        colores: analysis.color,
        materiales: analysis.material,
        tituloComercial: analysis.nombre,
        descripcionTienda: analysis.descripcion_comercial,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[API analyze-shoe error]:', msg);
      res.status(500).json({
        success: false,
        error: msg,
      });
    }
  };

  // Support multiple endpoint paths and any HTTP verb to ensure maximum compatibility
  app.all('/api/ai/analyze-shoe', handleShoeAnalysis);
  app.all('/api/analyze-shoe', handleShoeAnalysis);
  app.all('/api/shoe-ai', handleShoeAnalysis);
  app.all('/api/ai/shoe', handleShoeAnalysis);

  // 10. Catálogo local; publicación externa desactivada.
  // Contabilidad local: evita enviar la petición al fallback HTML de Vite y
  // mantiene los asientos en el mismo almacén local de la demostración.
  app.get('/api/accounting', async (req, res) => {
    // En el modo multiempresa con Neon, el contexto autorizado resuelve la BD
    // propia del tenant. No leer el JSON local para una empresa conectada a Neon.
    if (getNeonSql()) {
      try {
        const start = String(req.query.start || '') || undefined;
        const end = String(req.query.end || '') || undefined;
        const data = await getAccountingLedger(start, end);
        return res.json({ source: 'neon_postgres', data });
      } catch (error) {
        logger.error('Error al consultar contabilidad en Neon:', error);
        return res.status(503).json({ error: 'No se pudieron cargar los datos contables de esta empresa.' });
      }
    }
    const state = readServerStore();
    const start = String(req.query.start || '');
    const end = String(req.query.end || '');
    const entries = (state.accountingEntries || []).filter((entry: any) => {
      const date = String(entry.fecha || '').slice(0, 10);
      return (!start || date >= start) && (!end || date <= end);
    }).sort((a: any, b: any) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
    const ledgerMap = new Map<string, any>();
    for (const entry of entries) {
      for (const line of Array.isArray(entry.lineas) ? entry.lineas : []) {
        const cuenta = String(line.cuenta || 'Sin cuenta');
        const item = ledgerMap.get(cuenta) || { cuenta, debe: 0, haber: 0, movimientos: [] };
        const debe = Number(line.debe || 0) * (String(line.moneda || 'Bs').toLowerCase() === 'usd' ? Number(entry.tasa_dolar || 0) : 1);
        const haber = Number(line.haber || 0) * (String(line.moneda || 'Bs').toLowerCase() === 'usd' ? Number(entry.tasa_dolar || 0) : 1);
        item.debe = addMoney(item.debe, debe);
        item.haber = addMoney(item.haber, haber);
        item.movimientos.push({ ...line, debe, haber, fecha: entry.fecha, documento: entry.documento, numero_asiento: entry.numero_asiento, origen: entry.origen, entry });
        ledgerMap.set(cuenta, item);
      }
    }
    const ledger = Array.from(ledgerMap.values()).map((item) => ({ ...item, saldo: subtractMoney(item.debe, item.haber) }));
    res.json({ source: 'local_demo', data: { entries, ledger } });
  });

  app.post('/api/accounting/journal', async (req, res) => {
    if (getNeonSql()) {
      try {
        const result = await saveAccountingEntry(req.body || {});
        return res.json({ source: 'neon_postgres', data: result });
      } catch (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar el asiento.' });
      }
    }
    const state = readServerStore();
    const entry = req.body || {};
    const lines = Array.isArray(entry.lineas) ? entry.lineas : [];
    const rate = Number(entry.tasa_dolar || 0);
    const totalDebe = lines.reduce((sum: number, line: any) => addMoney(sum, Number(line.debe || 0) * (String(line.moneda || 'Bs').toLowerCase() === 'usd' ? rate : 1)), 0);
    const totalHaber = lines.reduce((sum: number, line: any) => addMoney(sum, Number(line.haber || 0) * (String(line.moneda || 'Bs').toLowerCase() === 'usd' ? rate : 1)), 0);
    if (!lines.length || Math.abs(totalDebe - totalHaber) > 0.01) {
      return res.status(400).json({ error: 'El asiento debe estar cuadrado: Debe = Haber.' });
    }
    const entries = state.accountingEntries || [];
    const existing = entry.id ? entries.find((item: any) => String(item.id) === String(entry.id)) : null;
    const sequence = entries.reduce((max: number, item: any) => Math.max(max, Number(String(item.numero_asiento || '').replace(/^AS-/, '')) || 0), 0) + (existing ? 0 : 1);
    const saved = {
      ...entry,
      id: String(existing?.id || entry.id || `asi-${Date.now()}`),
      numero_asiento: String(existing?.numero_asiento || entry.numero_asiento || `AS-${String(sequence).padStart(6, '0')}`),
      tipo: entry.tipo || 'manual',
      origen: entry.origen || 'manual',
      fecha: entry.fecha || new Date().toISOString(),
      lineas: lines,
      total_debe: totalDebe,
      total_haber: totalHaber,
    };
    state.accountingEntries = existing
      ? entries.map((item: any) => String(item.id) === saved.id ? saved : item)
      : [...entries, saved];
    writeServerStore(state);
    res.json({ source: 'local_demo', data: { id: saved.id, numeroAsiento: saved.numero_asiento, totalDebe, totalHaber } });
  });

  app.delete('/api/accounting/journal/:id', async (req, res) => {
    if (getNeonSql()) {
      try {
        await deleteAccountingEntry(req.params.id);
        return res.json({ ok: true });
      } catch (error) {
        logger.error('Error al eliminar asiento contable en Neon:', error);
        return res.status(503).json({ error: 'No se pudo eliminar el asiento contable.' });
      }
    }
    const state = readServerStore();
    const entries = state.accountingEntries || [];
    const remaining = entries.filter((entry: any) => String(entry.id) !== String(req.params.id));
    if (remaining.length === entries.length) return res.status(404).json({ error: 'No se encontró el asiento contable.' });
    state.accountingEntries = remaining;
    writeServerStore(state);
    res.json({ ok: true });
  });

  app.get('/api/catalog/products', async (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const sql = getNeonSql();
    if (sql) {
      try {
        const rows = await sql`SELECT * FROM shoe_products WHERE stock > 0 ORDER BY nombre ASC`;
        const products = normalizeProducts(rows as any[]);
        return res.json({
          success: true,
          count: products.length,
          actualizado: new Date().toISOString(),
          products,
        });
      } catch (err) {
        logger.error('Error obteniendo productos de Neon para catálogo:', err);
      }
    }
    const localProducts = readLocalProducts().filter((p) => Number(p.stock) > 0);
    res.json({ success: true, count: localProducts.length, products: localProducts });
  });

  app.post('/api/catalog/sync-github', (_req, res) => {
    res.status(503).json({ success: false, error: 'La publicación en GitHub está desactivada en NEXOSS local.' });
  });

  app.use((req, res, next) => {
    if (/^\/cartelera\/[0-9a-f-]{36}\/[0-9a-f]{64}\/?$/i.test(req.path)) {
      res.set({
        'Cache-Control': 'no-store, max-age=0',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
        'Referrer-Policy': 'no-referrer',
      });
    }
    next();
  });

  // Never let an unknown API endpoint fall through to the SPA's index.html.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta API no encontrada.' }));
  app.use('/api', (err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Error no controlado en la API:', err);
    if (res.headersSent) return next(err);
    // Mensaje genérico: el detalle interno queda solo en el log.
    return res.status(500).json({ error: 'No se pudo completar la operación. Revisa el registro del servidor.' });
  });

  // 11. Vite Middleware for Development / Static serving for Production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // Estas carpetas no forman parte de la pantalla: sin ignorarlas, guardar la carpeta fiscal
        // o una venta (server/data) recargaba la página en pleno trabajo.
        watch: { ignored: ['**/server/**', '**/emulator-data/**', '**/docs/**', '**/tests/**', '**/*.test.ts', '**/*.md'] },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const HOST = process.env.RENDER ? '0.0.0.0' : '127.0.0.1';
  app.listen(PORT, HOST, () => {
    logger.info(`NEXOSS iniciado en http://${HOST}:${PORT}`);
  });
}

startServer();
