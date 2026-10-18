import type { Express, Request, RequestHandler, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getNeonSql } from '../db.ts';
import type { TenantAuthenticatedRequest } from '../multiempresa/companyAccess.ts';

type Sql = NonNullable<ReturnType<typeof getNeonSql>>;
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';

function authorizedClinic(req: Request, res: Response): boolean {
  const tenant = (req as TenantAuthenticatedRequest).tenant;
  if (!tenant || tenant.industryTemplate !== 'health') {
    res.status(403).json({ error: 'El expediente clínico solo está disponible para empresas del rubro Salud.' });
    return false;
  }
  return true;
}

function identity(req: Request) {
  return (req as TenantAuthenticatedRequest).tenant?.uid || 'system';
}

export function registerHealthRoutes(app: Express, ownerOnly: RequestHandler): void {
  const route = (handler: (req: Request, res: Response, sql: Sql) => Promise<unknown>) => [ownerOnly, async (req: Request, res: Response) => {
    if (!authorizedClinic(req, res)) return;
    const sql = getNeonSql();
    if (!sql) return res.status(503).json({ error: 'La base de datos clínica no está disponible.' });
    try { await handler(req, res, sql); }
    catch { return res.status(503).json({ error: 'No se pudo procesar la información clínica.' }); }
  }] as const;

  app.get('/api/health/patients', ...route(async (_req, res, sql) => {
    const patients = await sql`SELECT id, patient_number, first_name, last_name, birth_date, phone, email, created_at FROM health_patients ORDER BY last_name, first_name LIMIT 500`;
    return res.json({ patients });
  }));

  app.post('/api/health/patients', ...route(async (req, res, sql) => {
    const firstName = text(req.body?.firstName, 120); const lastName = text(req.body?.lastName, 120);
    if (!firstName || !lastName) return res.status(400).json({ error: 'Nombre y apellido del paciente son obligatorios.' });
    const id = randomUUID(); const patientNumber = `HC-${id.slice(0, 8).toUpperCase()}`;
    const result = await sql`INSERT INTO health_patients (id, patient_number, first_name, last_name, birth_date, phone, email, address, emergency_contact_name, emergency_contact_phone, general_clinical_info, allergies, created_by)
      VALUES (${id}, ${patientNumber}, ${firstName}, ${lastName}, ${text(req.body?.birthDate, 10) || null}, ${text(req.body?.phone, 40)}, ${text(req.body?.email, 180)}, ${text(req.body?.address, 1000)}, ${text(req.body?.emergencyContactName, 180)}, ${text(req.body?.emergencyContactPhone, 40)}, ${text(req.body?.generalClinicalInfo, 4000)}, ${text(req.body?.allergies, 2000)}, ${identity(req)}) RETURNING id, patient_number, first_name, last_name, birth_date, phone, email`;
    return res.status(201).json({ patient: result[0] });
  }));

  app.get('/api/health/patients/:patientId/record', ...route(async (req, res, sql) => {
    const patientId = text(req.params.patientId, 64);
    const found = await sql`SELECT * FROM health_patients WHERE id = ${patientId} LIMIT 1`;
    if (!found[0]) return res.status(404).json({ error: 'No se encontró el paciente.' });
    const [appointments, consultations, prescriptions, examOrders, reports, payments] = await Promise.all([
      sql`SELECT * FROM health_appointments WHERE patient_id = ${patientId} ORDER BY starts_at DESC LIMIT 200`,
      sql`SELECT * FROM health_consultations WHERE patient_id = ${patientId} ORDER BY consulted_at DESC LIMIT 200`,
      sql`SELECT * FROM health_prescriptions WHERE patient_id = ${patientId} ORDER BY issued_at DESC LIMIT 200`,
      sql`SELECT * FROM health_exam_orders WHERE patient_id = ${patientId} ORDER BY ordered_at DESC LIMIT 200`,
      sql`SELECT * FROM health_patient_reports WHERE patient_id = ${patientId} ORDER BY issued_at DESC LIMIT 200`,
      sql`SELECT * FROM health_payments WHERE patient_id = ${patientId} ORDER BY created_at DESC LIMIT 200`,
    ]);
    return res.json({ patient: found[0], appointments, consultations, prescriptions, examOrders, reports, payments });
  }));

  app.post('/api/health/patients/:patientId/appointments', ...route(async (req, res, sql) => {
    const patientId = text(req.params.patientId, 64); const provider = text(req.body?.providerName, 180); const startsAt = text(req.body?.startsAt, 40);
    if (!provider || !Number.isFinite(Date.parse(startsAt))) return res.status(400).json({ error: 'Indica profesional y fecha válida para la cita.' });
    const id = randomUUID();
    const rows = await sql`INSERT INTO health_appointments (id, patient_id, starts_at, duration_minutes, provider_name, reason, created_by) VALUES (${id}, ${patientId}, ${startsAt}, ${Number(req.body?.durationMinutes) || 30}, ${provider}, ${text(req.body?.reason, 1000)}, ${identity(req)}) RETURNING *`;
    return res.status(201).json({ appointment: rows[0] });
  }));

  app.post('/api/health/patients/:patientId/consultations', ...route(async (req, res, sql) => {
    const patientId = text(req.params.patientId, 64); const provider = text(req.body?.providerName, 180);
    if (!provider) return res.status(400).json({ error: 'Indica el profesional responsable de la consulta.' });
    const id = randomUUID();
    const rows = await sql`INSERT INTO health_consultations (id, patient_id, appointment_id, provider_name, reason, symptoms, findings, diagnosis, treatment_plan, internal_notes, created_by)
      VALUES (${id}, ${patientId}, ${text(req.body?.appointmentId, 64) || null}, ${provider}, ${text(req.body?.reason, 2000)}, ${text(req.body?.symptoms, 4000)}, ${text(req.body?.findings, 4000)}, ${text(req.body?.diagnosis, 4000)}, ${text(req.body?.treatmentPlan, 4000)}, ${text(req.body?.internalNotes, 6000)}, ${identity(req)}) RETURNING *`;
    return res.status(201).json({ consultation: rows[0] });
  }));

  app.post('/api/health/patients/:patientId/prescriptions', ...route(async (req, res, sql) => {
    const patientId = text(req.params.patientId, 64); const provider = text(req.body?.providerName, 180); const medication = text(req.body?.medicationName, 240);
    if (!provider || !medication) return res.status(400).json({ error: 'Profesional y medicamento son obligatorios.' });
    const id = randomUUID();
    const rows = await sql`INSERT INTO health_prescriptions (id, patient_id, consultation_id, provider_name, medication_name, dosage, frequency, duration, instructions, created_by)
      VALUES (${id}, ${patientId}, ${text(req.body?.consultationId, 64) || null}, ${provider}, ${medication}, ${text(req.body?.dosage, 160)}, ${text(req.body?.frequency, 160)}, ${text(req.body?.duration, 120)}, ${text(req.body?.instructions, 3000)}, ${identity(req)}) RETURNING *`;
    return res.status(201).json({ prescription: rows[0] });
  }));

  app.post('/api/health/patients/:patientId/exam-orders', ...route(async (req, res, sql) => {
    const patientId = text(req.params.patientId, 64); const provider = text(req.body?.providerName, 180); const examName = text(req.body?.examName, 240);
    if (!provider || !examName) return res.status(400).json({ error: 'Profesional y examen son obligatorios.' });
    const id = randomUUID();
    const rows = await sql`INSERT INTO health_exam_orders (id, patient_id, consultation_id, provider_name, exam_name, instructions, created_by)
      VALUES (${id}, ${patientId}, ${text(req.body?.consultationId, 64) || null}, ${provider}, ${examName}, ${text(req.body?.instructions, 3000)}, ${identity(req)}) RETURNING *`;
    return res.status(201).json({ examOrder: rows[0] });
  }));

  app.post('/api/health/patients/:patientId/reports', ...route(async (req, res, sql) => {
    const patientId = text(req.params.patientId, 64); const provider = text(req.body?.providerName, 180); const title = text(req.body?.title, 240); const content = text(req.body?.content, 12_000);
    if (!provider || !title || !content) return res.status(400).json({ error: 'Título, contenido del informe y profesional son obligatorios.' });
    const id = randomUUID();
    const rows = await sql`INSERT INTO health_patient_reports (id, patient_id, consultation_id, title, patient_visible_content, provider_name, created_by)
      VALUES (${id}, ${patientId}, ${text(req.body?.consultationId, 64) || null}, ${title}, ${content}, ${provider}, ${identity(req)}) RETURNING *`;
    return res.status(201).json({ report: rows[0] });
  }));

  app.post('/api/health/patients/:patientId/payments', ...route(async (req, res, sql) => {
    const patientId = text(req.params.patientId, 64); const concept = text(req.body?.concept, 240); const amount = Number(req.body?.amount);
    if (!concept || !Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: 'Indica concepto y monto válido.' });
    const id = randomUUID();
    const rows = await sql`INSERT INTO health_payments (id, patient_id, concept, amount, currency, method, status, paid_at, notes, created_by)
      VALUES (${id}, ${patientId}, ${concept}, ${amount}, ${req.body?.currency === 'VES' ? 'VES' : 'USD'}, ${text(req.body?.method, 80)}, ${req.body?.status === 'pending' ? 'pending' : 'paid'}, CASE WHEN ${req.body?.status === 'pending'} THEN NULL ELSE NOW() END, ${text(req.body?.notes, 1000)}, ${identity(req)}) RETURNING *`;
    return res.status(201).json({ payment: rows[0] });
  }));
}
