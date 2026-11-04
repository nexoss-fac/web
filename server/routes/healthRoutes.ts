import type { Express, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getNeonSql, initDatabaseSchema } from '../db.ts';
import type { TenantAuthenticatedRequest } from '../multiempresa/companyAccess.ts';

type Sql = NonNullable<ReturnType<typeof getNeonSql>>;
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';

function authorizedClinic(req: Request, res: Response, write = false): boolean {
  const tenant = (req as TenantAuthenticatedRequest).tenant;
  if (!tenant || tenant.industryTemplate !== 'health') {
    res.status(403).json({ error: 'El expediente clínico solo está disponible para empresas del rubro Salud.' });
    return false;
  }
  const role = tenant.role;
  const canRead = ['owner', 'admin', 'auditor'].includes(role);
  const canWrite = ['owner', 'admin'].includes(role);
  if (!(write ? canWrite : canRead)) {
    res.status(403).json({ error: write ? 'Solo el propietario o administrador puede modificar registros clínicos.' : 'Tu rol no tiene permiso para consultar expedientes clínicos.' });
    return false;
  }
  return true;
}

function identity(req: Request) {
  return (req as TenantAuthenticatedRequest).tenant?.uid || 'system';
}

export function registerHealthRoutes(app: Express, _ownerOnly?: unknown): void {
  const route = (handler: (req: Request, res: Response, sql: Sql) => Promise<unknown>) => [async (req: Request, res: Response) => {
    if (!authorizedClinic(req, res, req.method !== 'GET' && req.method !== 'HEAD')) return;
    const sql = getNeonSql();
    if (!sql) return res.status(503).json({ error: 'La base de datos clínica no está disponible.' });
    try { await initDatabaseSchema(); await handler(req, res, sql); }
    catch { return res.status(503).json({ error: 'No se pudo procesar la información clínica.' }); }
  }] as const;

  app.get('/api/health/patients', ...route(async (_req, res, sql) => {
    const patients = await sql`SELECT id, patient_number, first_name, last_name, national_id, occupation, gender, birth_date, phone, email, created_at FROM health_patients ORDER BY last_name, first_name LIMIT 500`;
    return res.json({ patients });
  }));

  app.post('/api/health/patients', ...route(async (req, res, sql) => {
    const firstName = text(req.body?.firstName, 120); const lastName = text(req.body?.lastName, 120);
    if (!firstName || !lastName) return res.status(400).json({ error: 'Nombre y apellido del paciente son obligatorios.' });
    const id = randomUUID(); const patientNumber = `HC-${id.slice(0, 8).toUpperCase()}`;
    const result = await sql`INSERT INTO health_patients (id, patient_number, first_name, last_name, birth_date, phone, email, address, emergency_contact_name, emergency_contact_phone, general_clinical_info, allergies, national_id, occupation, gender, blood_type, personal_history, chronic_conditions, surgical_history, smoking_habits, current_medications, family_history, created_by)
      VALUES (${id}, ${patientNumber}, ${firstName}, ${lastName}, ${text(req.body?.birthDate, 10) || null}, ${text(req.body?.phone, 40)}, ${text(req.body?.email, 180)}, ${text(req.body?.address, 1000)}, ${text(req.body?.emergencyContactName, 180)}, ${text(req.body?.emergencyContactPhone, 40)}, ${text(req.body?.generalClinicalInfo, 4000)}, ${text(req.body?.allergies, 2000)}, ${text(req.body?.nationalId, 40)}, ${text(req.body?.occupation, 180)}, ${text(req.body?.gender, 40)}, ${text(req.body?.bloodType, 12)}, ${text(req.body?.personalHistory, 4000)}, ${text(req.body?.chronicConditions, 4000)}, ${text(req.body?.surgicalHistory, 4000)}, ${text(req.body?.smokingHabits, 1000)}, ${text(req.body?.currentMedications, 4000)}, ${text(req.body?.familyHistory, 4000)}, ${identity(req)}) RETURNING id, patient_number, first_name, last_name, national_id, birth_date, phone, email`;
    return res.status(201).json({ patient: result[0] });
  }));


  app.get('/api/health/providers', ...route(async (_req, res, sql) => {
    const providers = await sql`SELECT id, full_name, role, specialty, license_number, active, created_at FROM health_providers ORDER BY full_name LIMIT 300`;
    return res.json({ providers });
  }));

  app.post('/api/health/providers', ...route(async (req, res, sql) => {
    const fullName = text(req.body?.fullName, 180);
    const role = ['doctor','aesthetician','nurse','staff'].includes(req.body?.role) ? req.body.role : 'staff';
    if (!fullName) return res.status(400).json({ error: 'El nombre del profesional es obligatorio.' });
    const id = randomUUID();
    const rows = await sql`INSERT INTO health_providers (id, full_name, role, specialty, license_number, created_by)
      VALUES (${id}, ${fullName}, ${role}, ${text(req.body?.specialty,180)}, ${text(req.body?.licenseNumber,80)}, ${identity(req)}) RETURNING *`;
    return res.status(201).json({ provider: rows[0] });
  }));

  app.get('/api/health/appointment-requests', ...route(async (_req, res, sql) => {
    const requests = await sql`SELECT * FROM health_appointment_requests ORDER BY created_at DESC LIMIT 500`;
    return res.json({ requests });
  }));

  app.post('/api/health/appointment-requests', ...route(async (req, res, sql) => {
    const patientName = text(req.body?.patientName,180), phone = text(req.body?.phone,40);
    if (!patientName || !phone) return res.status(400).json({ error: 'Nombre y teléfono son obligatorios.' });
    const id = randomUUID(), preferred = text(req.body?.preferredAt,40);
    const rows = await sql`INSERT INTO health_appointment_requests (id,patient_name,phone,email,reason,preferred_at,source,created_by)
      VALUES (${id},${patientName},${phone},${text(req.body?.email,180)},${text(req.body?.reason,2000)},${Number.isFinite(Date.parse(preferred)) ? preferred : null},${text(req.body?.source,80)},${identity(req)}) RETURNING *`;
    return res.status(201).json({ request: rows[0] });
  }));

  app.patch('/api/health/appointment-requests/:requestId', ...route(async (req, res, sql) => {
    const status = ['new','contacted','scheduled','discarded'].includes(req.body?.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ error: 'Estado de solicitud no válido.' });
    const rows = await sql`UPDATE health_appointment_requests SET status=${status}, notes=COALESCE(${text(req.body?.notes,2000) || null},notes) WHERE id=${text(req.params.requestId,64)} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: 'No se encontró la solicitud.' });
    return res.json({ request: rows[0] });
  }));

  app.get('/api/health/blog', ...route(async (req, res, sql) => {
    const publishedOnly = req.query.published === 'true';
    const posts = publishedOnly
      ? await sql`SELECT id,title,slug,summary,cover_image,images,video_url,published,published_at,created_at,updated_at FROM health_blog_posts WHERE published=TRUE ORDER BY published_at DESC LIMIT 200`
      : await sql`SELECT * FROM health_blog_posts ORDER BY updated_at DESC LIMIT 200`;
    return res.json({ posts });
  }));

  app.post('/api/health/blog', ...route(async (req, res, sql) => {
    const title=text(req.body?.title,240), content=text(req.body?.content,30000);
    const slug=text(req.body?.slug,260).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'');
    if (!title || !content || !slug) return res.status(400).json({ error: 'Título, slug y contenido son obligatorios.' });
    const id=randomUUID();
    try {
      const rows=await sql`INSERT INTO health_blog_posts (id,author_id,title,slug,summary,content,cover_image,images,video_url,published,published_at,created_by)
        VALUES (${id},${identity(req)},${title},${slug},${text(req.body?.summary,3000)},${content},${text(req.body?.coverImage,2000)},${JSON.stringify(Array.isArray(req.body?.images)?req.body.images.slice(0,30):[])},${text(req.body?.videoUrl,1000)},${!!req.body?.published},CASE WHEN ${!!req.body?.published} THEN NOW() ELSE NULL END,${identity(req)}) RETURNING *`;
      return res.status(201).json({ post: rows[0] });
    } catch { return res.status(409).json({ error: 'Ya existe una publicación con ese slug.' }); }
  }));

  app.post('/api/health/patients/:patientId/aesthetic-histories', ...route(async (req, res, sql) => {
    const patientId=text(req.params.patientId,64), treatment=text(req.body?.treatmentType,180);
    if (!treatment) return res.status(400).json({ error: 'El tipo de tratamiento es obligatorio.' });
    const id=randomUUID();
    const rows=await sql`INSERT INTO health_aesthetic_histories (id,patient_id,provider_id,treatment_type,other_treatment,skin_type,product_allergies,contraindications,previous_treatments,treated_area,products_used,technique,observations,aftercare_recommendations,created_by)
      VALUES (${id},${patientId},${text(req.body?.providerId,64)||null},${treatment},${text(req.body?.otherTreatment,2000)},${text(req.body?.skinType,100)},${text(req.body?.productAllergies,2000)},${text(req.body?.contraindications,3000)},${text(req.body?.previousTreatments,3000)},${text(req.body?.treatedArea,1000)},${text(req.body?.productsUsed,3000)},${text(req.body?.technique,3000)},${text(req.body?.observations,4000)},${text(req.body?.aftercareRecommendations,4000)},${identity(req)}) RETURNING *`;
    return res.status(201).json({ aestheticHistory: rows[0] });
  }));

  app.post('/api/health/payments/:paymentId/installments', ...route(async (req, res, sql) => {
    const paymentId=text(req.params.paymentId,64), amount=Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount<=0) return res.status(400).json({ error: 'El monto del abono debe ser mayor que cero.' });
    const payment=await sql`SELECT id,amount,currency FROM health_payments WHERE id=${paymentId} LIMIT 1`;
    if (!payment[0]) return res.status(404).json({ error: 'No se encontró la factura o pago.' });
    const totals=await sql`SELECT COALESCE(SUM(amount),0) AS paid FROM health_payment_installments WHERE payment_id=${paymentId}`;
    const outstanding=Number(payment[0].amount)-Number(totals[0]?.paid||0);
    if (amount>outstanding+0.005) return res.status(400).json({ error: 'El abono supera el saldo pendiente.' });
    const id=randomUUID();
    const rows=await sql`INSERT INTO health_payment_installments (id,payment_id,amount,method,reference,notes,created_by)
      VALUES (${id},${paymentId},${amount},${text(req.body?.method,80)},${text(req.body?.reference,120)},${text(req.body?.notes,1000)},${identity(req)}) RETURNING *`;
    return res.status(201).json({ installment: rows[0], balance: Math.max(0,outstanding-amount) });
  }));

  app.get('/api/health/patients/:patientId/record', ...route(async (req, res, sql) => {
    const patientId = text(req.params.patientId, 64);
    const found = await sql`SELECT * FROM health_patients WHERE id = ${patientId} LIMIT 1`;
    if (!found[0]) return res.status(404).json({ error: 'No se encontró el paciente.' });
    const [appointments, consultations, prescriptions, examOrders, reports, payments, aestheticHistories] = await Promise.all([
      sql`SELECT * FROM health_appointments WHERE patient_id = ${patientId} ORDER BY starts_at DESC LIMIT 200`,
      sql`SELECT * FROM health_consultations WHERE patient_id = ${patientId} ORDER BY consulted_at DESC LIMIT 200`,
      sql`SELECT * FROM health_prescriptions WHERE patient_id = ${patientId} ORDER BY issued_at DESC LIMIT 200`,
      sql`SELECT * FROM health_exam_orders WHERE patient_id = ${patientId} ORDER BY ordered_at DESC LIMIT 200`,
      sql`SELECT * FROM health_patient_reports WHERE patient_id = ${patientId} ORDER BY issued_at DESC LIMIT 200`,
      sql`SELECT p.*, COALESCE(json_agg(i ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL), '[]'::json) AS installments FROM health_payments p LEFT JOIN health_payment_installments i ON i.payment_id = p.id WHERE p.patient_id = ${patientId} GROUP BY p.id ORDER BY p.created_at DESC LIMIT 200`,
      sql`SELECT * FROM health_aesthetic_histories WHERE patient_id = ${patientId} ORDER BY performed_at DESC LIMIT 200`,
    ]);
    return res.json({ patient: found[0], appointments, consultations, prescriptions, examOrders, reports, payments, aestheticHistories });
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
