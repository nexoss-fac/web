import type { Express, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { tenantStorageContext } from '../multiempresa/companyAccess.ts';
import { logger } from '../logger.ts';

type ContactType = 'cliente' | 'proveedor';

let pool: Pool | undefined;
function controlPlane(): Pool {
  const connectionString = process.env.CONTROL_PLANE_DATABASE_URL?.trim();
  if (!connectionString) throw new Error('CONTROL_PLANE_DATABASE_URL no está configurada.');
  if (!pool) {
    const parsed = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname) {
      throw new Error('CONTROL_PLANE_DATABASE_URL no es válida.');
    }
    pool = new Pool({
      connectionString,
      max: 4,
      connectionTimeoutMillis: 5000,
      ssl: parsed.hostname.endsWith('.neon.tech') ? { rejectUnauthorized: true } : undefined,
    });
  }
  return pool;
}

function normalizeDocument(value: unknown): string {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 60);
}
function contactType(value: unknown): ContactType | '' {
  return value === 'cliente' || value === 'proveedor' ? value : '';
}
function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function identity(req: Request): { uid: string } | null {
  const tenant = tenantStorageContext.getStore();
  const firebase = (req as Request & { firebaseIdentity?: { uid?: string } }).firebaseIdentity;
  const uid = tenant?.uid || firebase?.uid || '';
  return uid ? { uid } : null;
}

async function assertMembership(client: any, uid: string, companyId: string): Promise<boolean> {
  const result = await client.query(
    `SELECT 1
     FROM platform_users u
     JOIN company_memberships m ON m.user_id = u.id AND m.status = 'active'
     JOIN platform_companies c ON c.id = m.company_id AND c.status = 'active'
     JOIN company_subscriptions s ON s.company_id = c.id
       AND s.status IN ('trialing', 'active') AND s.current_period_end > NOW()
     JOIN platform_plans p ON p.id = s.plan_id AND p.active = TRUE
     WHERE u.auth_provider = 'firebase' AND u.auth_subject = $1 AND c.id = $2
     LIMIT 1`,
    [uid, companyId],
  );
  return Boolean(result.rows[0]);
}

async function audit(client: any, uid: string, companyId: string, action: string, contactId: string): Promise<void> {
  const actor = await client.query(
    `SELECT id FROM platform_users WHERE auth_provider = 'firebase' AND auth_subject = $1 LIMIT 1`,
    [uid],
  );
  await client.query(
    `INSERT INTO platform_audit_events
       (id, actor_user_id, company_id, action, resource_type, resource_id, outcome, metadata)
     VALUES ($1, $2, $3, $4, 'shared_contact', $5, 'success', $6::jsonb)`,
    [randomUUID(), actor.rows[0]?.id || null, companyId, action, contactId, JSON.stringify({ contactId })],
  );
}

export interface SharedContactsRouteDependencies { controlPlane?: () => Pick<Pool, 'connect'>; }

export function registerSharedContactsRoutes(app: Express, dependencies: SharedContactsRouteDependencies = {}): void {
  const getControlPlane = dependencies.controlPlane ?? controlPlane;
  app.get('/api/contacts', async (req: Request, res: Response) => {
    const tenant = tenantStorageContext.getStore();
    const actor = identity(req);
    if (!tenant?.companyId || !actor) return res.status(403).json({ success: false, error: 'No hay una empresa activa autorizada.' });
    const tipo = contactType(req.query.tipo);
    if (req.query.tipo && !tipo) return res.status(400).json({ success: false, error: 'Tipo de contacto inválido.' });
    const document = normalizeDocument(req.query.documento);
    const search = text(req.query.nombre || req.query.q, 80);
    const db = getControlPlane();
    const client = await db.connect();
    try {
      if (!await assertMembership(client, actor.uid, tenant.companyId)) {
        return res.status(403).json({ success: false, error: 'La membresía de esta empresa ya no está activa.' });
      }

      // La búsqueda exacta por documento permite reutilizar identidad global.
      // Nunca devuelve las empresas que ya usan el contacto ni sus datos privados.
      if (document) {
        const result = await client.query(
          `SELECT c.id, r.contact_type AS tipo, c.document_display AS documento,
                  c.name AS nombre, c.surname AS apellido, c.trade_name,
                  c.phone AS telefono, c.email AS correo, c.fiscal_address AS direccion,
                  COALESCE(r.private_notes, '') AS notas,
                  c.created_at, GREATEST(c.updated_at, COALESCE(r.updated_at, c.updated_at)) AS updated_at,
                  (r.id IS NOT NULL) AS associated
           FROM platform_shared_contacts c
           LEFT JOIN company_shared_contact_relations r
             ON r.contact_id = c.id AND r.company_id = $2
             AND ($3 = '' OR r.contact_type = $3)
           WHERE c.document_normalized = $1
           ORDER BY r.created_at DESC NULLS LAST
           LIMIT 1`,
          [document, tenant.companyId, tipo],
        );
        return res.json({ success: true, contact: result.rows[0] || null });
      }

      // Búsquedas por nombre y listados solo muestran relaciones de la empresa activa.
      const result = await client.query(
        `SELECT c.id, r.contact_type AS tipo, c.document_display AS documento,
                c.name AS nombre, c.surname AS apellido, c.trade_name,
                c.phone AS telefono, c.email AS correo, c.fiscal_address AS direccion,
                r.private_notes AS notas, c.created_at, r.updated_at
         FROM company_shared_contact_relations r
         JOIN platform_shared_contacts c ON c.id = r.contact_id
         WHERE r.company_id = $1
           AND ($2 = '' OR r.contact_type = $2)
           AND ($3 = '' OR c.document_display ILIKE '%' || $3 || '%'
             OR c.name ILIKE '%' || $3 || '%' OR c.surname ILIKE '%' || $3 || '%'
             OR c.trade_name ILIKE '%' || $3 || '%')
         ORDER BY c.name, c.surname
         LIMIT 100`,
        [tenant.companyId, tipo, search],
      );
      return res.json({ success: true, contacts: result.rows });
    } catch (error) {
      logger.error('[Shared contacts] Error consultando directorio:', error);
      return res.status(503).json({ success: false, error: 'No se pudo consultar el directorio de contactos.' });
    } finally {
      client.release();
    }
  });

  app.post('/api/contacts', async (req: Request, res: Response) => {
    const tenant = tenantStorageContext.getStore();
    const actor = identity(req);
    if (!tenant?.companyId || !actor) return res.status(403).json({ success: false, error: 'No hay una empresa activa autorizada.' });
    const body = req.body || {};
    const tipo = contactType(body.tipo);
    const documento = text(body.documento, 60).toUpperCase();
    const normalized = normalizeDocument(documento);
    const nombre = text(body.nombre, 180);
    const apellido = text(body.apellido, 180);
    const tradeName = text(body.nombreComercial || body.trade_name, 180);
    const telefono = text(body.telefono, 60);
    const correo = text(body.correo, 254).toLowerCase();
    const direccion = text(body.direccion, 2000);
    const notas = text(body.notas, 2000);
    const notesProvided = typeof body.notas === 'string';
    const country = text(body.countryCode || body.pais, 3).toUpperCase();

    if (!tipo) return res.status(400).json({ success: false, error: 'Selecciona cliente o proveedor.' });
    if (!nombre || nombre.toLowerCase() === 'consumidor final') {
      return res.status(400).json({ success: false, error: 'El nombre o razón social es obligatorio.' });
    }
    if (tipo === 'cliente' && !normalized) {
      return res.status(400).json({ success: false, error: 'El documento es obligatorio para registrar un cliente.' });
    }

    const db = getControlPlane();
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      if (!await assertMembership(client, actor.uid, tenant.companyId)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ success: false, error: 'La membresía de esta empresa ya no está activa.' });
      }

      let contact: any;
      if (normalized) {
        const found = await client.query(
          `SELECT * FROM platform_shared_contacts
           WHERE document_normalized = $1 FOR UPDATE`,
          [normalized],
        );
        contact = found.rows[0];
      }

      let created = false;
      if (!contact) {
        const inserted = await client.query(
          `INSERT INTO platform_shared_contacts
             (id, document_normalized, document_display, name, surname, trade_name,
              phone, email, fiscal_address, country_code, created_by_uid, updated_by_uid)
           VALUES ($1, NULLIF($2, ''), $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
           ON CONFLICT (document_normalized)
             WHERE document_normalized IS NOT NULL AND document_normalized <> ''
           DO NOTHING
           RETURNING *`,
          [randomUUID(), normalized, documento, nombre, apellido, tradeName, telefono, correo, direccion, country, actor.uid],
        );
        contact = inserted.rows[0];
        created = Boolean(contact);
        // Si otra solicitud registró el mismo RIF simultáneamente, reutilizar el registro ganador.
        if (!contact && normalized) {
          const concurrent = await client.query(
            `SELECT * FROM platform_shared_contacts
             WHERE document_normalized = $1 FOR UPDATE`,
            [normalized],
          );
          contact = concurrent.rows[0];
        }
        if (!contact) throw new Error('No se pudo crear ni recuperar el contacto compartido.');
      }
      // Si el documento ya existe, los datos globales no se sobrescriben aquí.
      // La corrección de identidad compartida requiere un flujo explícito de revisión.
      const relation = await client.query(
        `INSERT INTO company_shared_contact_relations
           (id, company_id, contact_id, contact_type, private_notes, created_by_uid)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (company_id, contact_id, contact_type)
         DO UPDATE SET private_notes = CASE WHEN $7 THEN EXCLUDED.private_notes ELSE company_shared_contact_relations.private_notes END,
           updated_at = NOW()
         RETURNING id, contact_type, private_notes, created_at, updated_at`,
        [randomUUID(), tenant.companyId, contact.id, tipo, notas, actor.uid, notesProvided],
      );
      await audit(client, actor.uid, tenant.companyId, created ? 'shared_contact.created' : 'shared_contact.associated', contact.id);
      await client.query('COMMIT');

      return res.status(created ? 201 : 200).json({
        success: true,
        contact: {
          id: contact.id, tipo, documento: contact.document_display, nombre: contact.name,
          apellido: contact.surname, telefono: contact.phone, correo: contact.email,
          direccion: contact.fiscal_address, notas: relation.rows[0].private_notes,
          created_at: contact.created_at, updated_at: relation.rows[0].updated_at,
          associated: true,
        },
        created,
        associated: true,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('[Shared contacts] Error guardando contacto:', error);
      return res.status(503).json({ success: false, error: 'No se pudo guardar o asociar el contacto.' });
    } finally {
      client.release();
    }
  });
}
