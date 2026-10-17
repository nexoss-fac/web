import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { createCompanyAccessMiddleware, tenantStorageContext } from './companyAccess.ts';
import { acceptCompanyInvitation, createCompanyForVerifiedUser, createCompanyInvitation, findCompanyEmailMatches, getCompanyOnboardingMembership, LocalPlatformStore, hasActiveSubscription, isInvitationPending, normalizeCompanyInput, normalizeInventoryCategories } from './platformStore.ts';

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexoss-platform-test-'));
  const store = new LocalPlatformStore(path.join(directory, 'control-plane.json'));
  process.env.NEXOSS_MULTIEMPRESA_MODE = 'local-demo';
  process.env.NODE_ENV = 'test';
  const company = createCompanyForVerifiedUser(store, { legalName: 'Empresa Prueba', activity: 'Pruebas', address: 'Local', phone: '0000', email: 'test@example.invalid' }, { uid: 'uid-owner', email: 'owner@example.invalid', emailVerified: true });
  store.update((state) => {
    const item = state.companies.find((row) => row.id === company.id)!;
    item.fiscal = { countryCode: 'VE', currency: 'USD' };
    item.status = 'active';
  });
  return { directory, store, company };
}

function invoke(middleware: RequestHandler, companyId?: string, uid = 'uid-owner', method = 'GET', originalUrl = '/api/products') {
  const result: { status?: number; body?: unknown; next: boolean; tenant?: unknown } = { next: false };
  const req = { get: (name: string) => name.toLowerCase() === 'x-company-id' ? companyId : undefined, firebaseIdentity: { uid }, method, originalUrl } as unknown as Request;
  const res = { status(code: number) { result.status = code; return this; }, json(body: unknown) { result.body = body; return this; } } as unknown as Response;
  const next = (() => { result.next = true; result.tenant = tenantStorageContext.getStore(); }) as NextFunction;
  middleware(req, res, next);
  return result;
}

test('crea empresa y membresía owner usando exclusivamente UID verificado, con prueba de 14 días', () => {
  const { directory, store, company } = fixture();
  try {
    const state = store.readState();
    assert.equal(company.status, 'onboarding');
    assert.equal(state.memberships.find((item) => item.companyId === company.id)?.role, 'owner');
    assert.equal(hasActiveSubscription(state, company.id), true);
    assert.equal(state.users[0].subject, 'uid-owner');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('no crea empresas con correo Firebase sin verificar', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexoss-platform-unverified-'));
  const store = new LocalPlatformStore(path.join(directory, 'control-plane.json'));
  process.env.NEXOSS_MULTIEMPRESA_MODE = 'local-demo'; process.env.NODE_ENV = 'test';
  try {
    assert.throws(() => createCompanyForVerifiedUser(store, { legalName: 'Empresa Prueba' }, { uid: 'uid-unverified', email: 'user@example.invalid', emailVerified: false }), /correo verificado/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('preserva el país OTHER seleccionado en onboarding', () => {
  assert.equal(normalizeCompanyInput({ legalName: 'Empresa', countryCode: 'OTHER' }).countryCode, 'OTHER');
});

test('permite localizar empresa por correo verificado sin crear una membresía', () => {
  const { directory, store, company } = fixture();
  try {
    store.update((state) => { state.companies[0].email = 'new-owner@example.invalid'; });
    const identity = { uid: 'uid-new', email: 'NEW-OWNER@example.invalid', emailVerified: true };
    const matches = findCompanyEmailMatches(store.readState(), identity);
    assert.deepEqual(matches, [{ id: company.id, legalName: company.legalName, tradeName: company.tradeName, status: 'active' }]);
    assert.equal(store.readState().memberships.some((membership) => membership.userId === 'uid-new'), false);
    assert.deepEqual(findCompanyEmailMatches(store.readState(), { ...identity, emailVerified: false }), []);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('valida y normaliza categorías de inventario para el onboarding', () => {
  assert.deepEqual(normalizeInventoryCategories(['Mercancía', 'Materia prima', 'Mercancía']), ['Mercancía', 'Materia prima']);
  assert.throws(() => normalizeInventoryCategories([]), /al menos una/);
  assert.throws(() => normalizeInventoryCategories(['Bienes inmuebles']), /válidas/);
});

test('rechaza selección sin empresa y empresa ajena', () => {
  const { directory, store, company } = fixture();
  try {
    assert.equal(invoke(createCompanyAccessMiddleware(store)).status, 400);
    assert.equal(invoke(createCompanyAccessMiddleware(store), company.id, 'uid-otro').status, 403);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('bloquea empresa suspendida y membresía revocada', () => {
  const { directory, store, company } = fixture();
  try {
    store.update((state) => { state.companies[0].status = 'suspended'; });
    assert.equal(invoke(createCompanyAccessMiddleware(store), company.id).status, 403);
    store.update((state) => { state.companies[0].status = 'active'; state.memberships[0].status = 'revoked'; });
    assert.equal(invoke(createCompanyAccessMiddleware(store), company.id).status, 403);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('bloquea conexiones/suscripciones inválidas o vencidas', () => {
  const { directory, store, company } = fixture();
  try {
    store.update((state) => { state.subscriptions[0].status = 'canceled'; });
    assert.equal(invoke(createCompanyAccessMiddleware(store), company.id).status, 403);
    store.update((state) => { state.subscriptions[0].status = 'active'; state.subscriptions[0].currentPeriodEnd = '2000-01-01T00:00:00.000Z'; });
    assert.equal(invoke(createCompanyAccessMiddleware(store), company.id).status, 403);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('acepta membresía válida y aplica el rol del servidor, nunca el rol del navegador', () => {
  const { directory, store, company } = fixture();
  try {
    const owner = invoke(createCompanyAccessMiddleware(store), company.id);
    assert.equal(owner.next, true);
    assert.deepEqual(owner.tenant, { companyId: company.id, uid: 'uid-owner', role: 'owner' });
    store.update((state) => { state.memberships[0].role = 'cashier'; });
    assert.equal(invoke(createCompanyAccessMiddleware(store), company.id, 'uid-owner', 'POST', '/api/products').status, 403);
    assert.equal(invoke(createCompanyAccessMiddleware(store), company.id, 'uid-owner', 'POST', '/api/sales').next, true);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('el supervisor no puede eludir la restricción con mayúsculas o barra final', () => {
  const { directory, store, company } = fixture();
  try {
    store.update((state) => { state.memberships[0].role = 'supervisor'; });
    assert.equal(invoke(createCompanyAccessMiddleware(store), company.id, 'uid-owner', 'POST', '/API/STORE/SYNC/').status, 403);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('las invitaciones expiran y solo el destinatario verificado puede aceptar una invitación específica', () => {
  const { directory, store, company } = fixture();
  const now = new Date('2026-10-12T00:00:00.000Z');
  try {
    const valid = createCompanyInvitation(company.id, 'teammate@example.invalid', 'cashier', now);
    const other = createCompanyInvitation(company.id, 'teammate@example.invalid', 'auditor', now);
    const expired = { ...createCompanyInvitation(company.id, 'teammate@example.invalid', 'admin', now), expiresAt: '2026-10-11T23:59:59.999Z' };
    store.update((state) => { state.invitations.push(valid, other, expired); });

    assert.equal(isInvitationPending(valid, now), true);
    assert.equal(isInvitationPending(expired, now), false);
    assert.equal(acceptCompanyInvitation(store, valid.id, { uid: 'uid-other', email: 'wrong@example.invalid', emailVerified: true }, now), 0);
    assert.equal(acceptCompanyInvitation(store, valid.id, { uid: 'uid-other', email: 'teammate@example.invalid', emailVerified: false }, now), 0);
    assert.equal(acceptCompanyInvitation(store, expired.id, { uid: 'uid-other', email: 'teammate@example.invalid', emailVerified: true }, now), 0);
    assert.equal(acceptCompanyInvitation(store, valid.id, { uid: 'uid-other', email: 'teammate@example.invalid', emailVerified: true }, now), 1);

    const state = store.readState();
    assert.equal(state.invitations.find((item) => item.id === valid.id)?.status, 'accepted');
    assert.equal(state.invitations.find((item) => item.id === other.id)?.status, 'pending');
    assert.equal(state.invitations.find((item) => item.id === expired.id)?.status, 'expired');
    assert.equal(state.memberships.find((item) => item.userId === state.users.find((user) => user.subject === 'uid-other')?.id)?.role, 'cashier');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('solo owner/admin de empresa habilitada puede leer configuración y datos fiscales', () => {
  const { directory, store, company } = fixture();
  try {
    let state = store.readState();
    assert.equal(getCompanyOnboardingMembership(state, 'uid-owner', company.id)?.role, 'owner');
    store.update((current) => { current.memberships[0].role = 'cashier'; });
    state = store.readState();
    assert.equal(getCompanyOnboardingMembership(state, 'uid-owner', company.id), null);
    store.update((current) => { current.memberships[0].role = 'admin'; current.companies[0].status = 'suspended'; });
    state = store.readState();
    assert.equal(getCompanyOnboardingMembership(state, 'uid-owner', company.id), null);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
