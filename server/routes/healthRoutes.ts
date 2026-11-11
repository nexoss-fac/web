import type { Express, Request, RequestHandler, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { getNeonSql, initDatabaseSchema, getNextInvoiceNumber } from '../db.ts';
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
    try { await initDatabaseSchema(); await handler(req, res, sql); }
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

  // Facturación clínica: comparte el registro de ventas y la secuencia fiscal de NEXOSS,
  // sin descontar existencias de shoe_products.
  app.get('/api/health/invoices', ...route(async (_req, res, sql) => {
    const invoices = await sql`SELECT id, numero_factura, cliente_nombre, cliente_apellido, subtotal_usd, iva_monto_usd, total_usd, total_bs, tasa_cambio, items, pagos, fecha, estado, notas
      FROM sales_transactions WHERE notas LIKE 'INTERMED|%' ORDER BY fecha DESC LIMIT 300`;
    return res.json({ invoices });
  }));

  app.post('/api/health/invoices', ...route(async (req, res, sql) => {
    const patientId = text(req.body?.patientId, 64);
    const patientRows = await sql`SELECT id, first_name, last_name, national_id, phone, email FROM health_patients WHERE id = ${patientId} LIMIT 1`;
    const patient = patientRows[0];
    if (!patient) return res.status(404).json({ error: 'Selecciona un paciente válido.' });
    const rawLines = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!rawLines.length || rawLines.length > 50) return res.status(400).json({ error: 'La factura debe contener entre 1 y 50 servicios o tratamientos.' });
    const items = rawLines.map((line: any) => ({
      producto_id: '', tipo: 'servicio_clinico',
      nombre_producto: text(line?.description, 240),
      descripcion: text(line?.description, 500),
      talla: text(line?.category, 80) || 'Servicio',
      cantidad: Number(line?.quantity),
      precio_unitario: Number(line?.unitPrice),
      costo_unitario: 0,
      subtotal: Number(line?.quantity) * Number(line?.unitPrice),
    }));
    if (items.some((line: any) => !line.nombre_producto || !Number.isFinite(line.cantidad) || line.cantidad <= 0 || !Number.isFinite(line.precio_unitario) || line.precio_unitario < 0)) {
      return res.status(400).json({ error: 'Revisa la descripción, cantidad y precio de cada servicio.' });
    }
    const subtotal = Math.round(items.reduce((sum: number, line: any) => sum + line.subtotal, 0) * 100) / 100;
    const ivaEnabled = req.body?.applyTax === true;
    const taxRate = ivaEnabled ? Number(req.body?.taxRate) : 0;
    if (ivaEnabled && (!Number.isFinite(taxRate) || taxRate <= 0 || taxRate > 100)) return res.status(400).json({ error: 'Indica una alícuota fiscal válida y configurada para esta empresa.' });
    const tax = Math.round(subtotal * taxRate) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;
    const exchangeRate = Number(req.body?.exchangeRate);
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return res.status(400).json({ error: 'Indica la tasa de cambio aplicable a la fecha de la factura.' });
    const received = Number(req.body?.paidAmount || 0);
    const paymentCurrency = req.body?.paymentCurrency === 'VES' ? 'Bs' : 'USD';
    const paidUsd = paymentCurrency === 'Bs' ? received / exchangeRate : received;
    if (!Number.isFinite(received) || received < 0 || !Number.isFinite(paidUsd) || paidUsd > total + 0.005) return res.status(400).json({ error: 'El abono supera el saldo de la factura o no es válido.' });
    const paymentMethod = text(req.body?.paymentMethod, 80);
    if (received > 0 && !paymentMethod) return res.status(400).json({ error: 'Indica el método de pago para registrar el abono.' });
    const invoiceNumber = await getNextInvoiceNumber();
    if (!invoiceNumber) return res.status(503).json({ error: 'No se pudo reservar el correlativo fiscal de NEXOSS.' });
    const id = randomUUID();
    const payments = received > 0 ? [{ cuenta: paymentMethod, moneda: paymentCurrency, monto: received, referencia: text(req.body?.paymentReference, 100) }] : [];
    const status = paidUsd + 0.005 >= total ? 'completada' : 'pendiente';
    const notes = `INTERMED|patient_id=${patientId}|provider=${text(req.body?.providerName, 180)}`;
    const rows = await sql`INSERT INTO sales_transactions
      (id, numero_factura, cliente_nombre, cliente_apellido, cliente_rif, cliente_telefono, cliente_correo,
       subtotal_usd, descuento_usd, aplica_iva, iva_incluido, porcentaje_iva, iva_monto_usd,
       total_usd, total_bs, costo_total_usd, ganancia_neta_usd, tasa_cambio, items, pagos, fecha,
       usuario, notas, estado, total_positivo_inmediato_usd, total_cashea_pendiente_usd, estado_cashea)
      VALUES (${id}, ${invoiceNumber}, ${patient.first_name}, ${patient.last_name}, ${patient.national_id || null},
       ${patient.phone || null}, ${patient.email || null}, ${subtotal}, 0, ${ivaEnabled}, false, ${taxRate},
       ${tax}, ${total}, ${Math.round(total * exchangeRate * 100) / 100}, 0, 0, ${exchangeRate},
       ${JSON.stringify(items)}, ${JSON.stringify(payments)}, NOW(), ${text(req.body?.providerName, 180) || identity(req)},
       ${notes}, ${status}, ${paidUsd}, 0, 'sin_cashea') RETURNING *`;
    return res.status(201).json({ invoice: rows[0] });
  }));


  // Abonos sucesivos: el identificador enviado por el cliente hace idempotente
  // el reintento. La factura y health_payments se actualizan en una sola sentencia.
  app.post('/api/health/invoices/:invoiceId/payments', ...route(async (req, res, sql) => {
    const invoiceId = text(req.params.invoiceId, 64);
    const paymentId = text(req.body?.paymentId, 64);
    const received = Number(req.body?.amount);
    const currency = req.body?.currency === 'VES' ? 'VES' : 'USD';
    const exchangeRate = Number(req.body?.exchangeRate);
    const method = text(req.body?.method, 80);
    const reference = text(req.body?.reference, 120);
    if (!paymentId || !invoiceId || !Number.isFinite(received) || received <= 0 || !method) {
      return res.status(400).json({ error: 'Identificador, monto positivo y método de pago son obligatorios.' });
    }
    if (currency === 'VES' && (!Number.isFinite(exchangeRate) || exchangeRate <= 0)) {
      return res.status(400).json({ error: 'Indica una tasa de cambio válida para el abono en bolívares.' });
    }
    const amountUsd = Math.round((currency === 'VES' ? received / exchangeRate : received) * 100) / 100;
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) return res.status(400).json({ error: 'El equivalente del abono no es válido.' });
    const concept = `Abono factura clínica ${invoiceId}`;
    const paymentJson = JSON.stringify([{ cuenta: method, moneda: currency === 'VES' ? 'Bs' : 'USD', monto: received, referencia: reference }]);
    const result = await sql`
      WITH prior AS (
        SELECT id, patient_id, sale_id, concept, amount, currency, method, status, paid_at, notes, created_by
        FROM health_payments WHERE id = ${paymentId} LIMIT 1
      ),
      changed AS (
        UPDATE sales_transactions s
        SET pagos = COALESCE(s.pagos, '[]'::jsonb) || ${paymentJson}::jsonb,
            total_positivo_inmediato_usd = COALESCE(s.total_positivo_inmediato_usd, 0) + ${amountUsd},
            estado = CASE WHEN COALESCE(s.total_positivo_inmediato_usd, 0) + ${amountUsd} + 0.005 >= s.total_usd THEN 'completada' ELSE 'pendiente' END
        WHERE s.id = ${invoiceId}
          AND s.notas LIKE 'INTERMED|%'
          AND NOT EXISTS (SELECT 1 FROM prior)
          AND COALESCE(s.total_positivo_inmediato_usd, 0) + ${amountUsd} <= s.total_usd + 0.005
        RETURNING s.id, s.total_usd, s.total_positivo_inmediato_usd, s.estado,
          substring(s.notas from 'patient_id=([^|]+)') AS patient_id
      ),
      inserted AS (
        INSERT INTO health_payments
          (id, patient_id, sale_id, concept, amount, currency, method, status, paid_at, notes, created_by)
        SELECT ${paymentId}, changed.patient_id, changed.id, ${concept}, ${received}, ${currency},
          ${method}, 'paid', NOW(), ${reference}, ${identity(req)}
        FROM changed
        RETURNING *
      )
      SELECT 'created' AS outcome, inserted.id AS payment_id, inserted.sale_id,
        changed.total_usd, changed.total_positivo_inmediato_usd, changed.estado
      FROM inserted JOIN changed ON changed.id = inserted.sale_id
      UNION ALL
      SELECT 'duplicate' AS outcome, prior.id AS payment_id, prior.sale_id,
        s.total_usd, s.total_positivo_inmediato_usd, s.estado
      FROM prior JOIN sales_transactions s ON s.id = prior.sale_id
    `;
    if (!result.length) {
      const invoice = await sql`SELECT id, total_usd, total_positivo_inmediato_usd FROM sales_transactions WHERE id = ${invoiceId} AND notas LIKE 'INTERMED|%' LIMIT 1`;
      if (!invoice.length) return res.status(404).json({ error: 'No se encontró la factura clínica.' });
      return res.status(409).json({ error: 'El abono supera el saldo pendiente o no pudo registrarse. Actualiza la factura antes de reintentar.' });
    }
    return res.status(200).json({ paymentId: result[0].payment_id, invoice: result[0], duplicate: result[0].outcome === 'duplicate' });
  }));

}
