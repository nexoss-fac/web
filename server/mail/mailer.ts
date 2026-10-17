/**
 * Envío de correo del servidor. Dos proveedores, elegidos por variables de entorno:
 *   - SMTP (por ejemplo Gmail con contraseña de aplicación): requiere `npm install nodemailer`.
 *   - Resend (API por HTTPS): no requiere instalar nada, pero el remitente debe estar verificado en Resend.
 * Si no hay ninguno configurado, no se envía nada y se informa con claridad.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type MailProvider = 'smtp' | 'resend' | 'none';

export interface MailConfig {
  provider: MailProvider;
  from: string;
  smtp?: { host: string; port: number; secure: boolean; user: string; pass: string };
  resendApiKey?: string;
}

export interface MailResult {
  sent: boolean;
  provider: MailProvider;
  error?: string;
}

export interface MailDeps {
  fetch?: typeof fetch;
  /** Fábrica del transporte SMTP; por defecto carga `nodemailer` si está instalado. */
  createTransport?: (options: Record<string, unknown>) => { sendMail: (message: Record<string, unknown>) => Promise<unknown> };
}

type Env = Record<string, string | undefined>;

export function readMailConfig(env: Env = process.env): MailConfig {
  const from = (env.MAIL_FROM || '').trim();
  const requested = (env.MAIL_PROVIDER || '').trim().toLowerCase();
  const smtpHost = (env.SMTP_HOST || '').trim();
  const resendKey = (env.RESEND_API_KEY || '').trim();

  const provider: MailProvider = requested === 'smtp' || requested === 'resend'
    ? requested
    : smtpHost ? 'smtp' : resendKey ? 'resend' : 'none';

  if (provider === 'smtp') {
    const port = Number(env.SMTP_PORT) || 587;
    return {
      provider, from: from || (env.SMTP_USER || '').trim(),
      smtp: {
        host: smtpHost, port,
        // 465 usa TLS directo; 587 y 25 negocian STARTTLS.
        secure: env.SMTP_SECURE ? env.SMTP_SECURE.toLowerCase() === 'true' : port === 465,
        user: (env.SMTP_USER || '').trim(), pass: env.SMTP_PASS || '',
      },
    };
  }
  if (provider === 'resend') return { provider, from, resendApiKey: resendKey };
  return { provider: 'none', from };
}

/** Texto de ayuda para quien configura: qué falta, sin mostrar valores secretos. */
export function mailConfigProblem(config: MailConfig): string | null {
  if (config.provider === 'none') return 'No hay correo configurado (define SMTP_HOST o RESEND_API_KEY en el archivo .env).';
  if (!config.from) return 'Falta MAIL_FROM (el remitente) en el archivo .env.';
  if (config.provider === 'smtp' && (!config.smtp?.host || !config.smtp.user || !config.smtp.pass)) return 'Faltan SMTP_HOST, SMTP_USER o SMTP_PASS en el archivo .env.';
  if (config.provider === 'resend' && !config.resendApiKey) return 'Falta RESEND_API_KEY en el archivo .env.';
  return null;
}

const isValidEmail = (value: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);

async function loadNodemailer(): Promise<MailDeps['createTransport']> {
  try {
    const moduleName = 'nodemailer'; // variable: el módulo es opcional y no debe romper la compilación
    const loaded = await import(moduleName);
    const factory = loaded.createTransport ?? loaded.default?.createTransport;
    return typeof factory === 'function' ? factory : undefined;
  } catch {
    return undefined;
  }
}

export async function sendMail(message: MailMessage, config: MailConfig = readMailConfig(), deps: MailDeps = {}): Promise<MailResult> {
  const problem = mailConfigProblem(config);
  if (problem) return { sent: false, provider: config.provider, error: problem };
  if (!isValidEmail(message.to)) return { sent: false, provider: config.provider, error: 'El correo del destinatario no es válido.' };

  try {
    if (config.provider === 'resend') {
      const doFetch = deps.fetch ?? fetch;
      const response = await doFetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: config.from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        return { sent: false, provider: 'resend', error: `Resend respondió ${response.status}. ${detail.slice(0, 200)}`.trim() };
      }
      return { sent: true, provider: 'resend' };
    }

    const createTransport = deps.createTransport ?? await loadNodemailer();
    if (!createTransport) return { sent: false, provider: 'smtp', error: 'Falta instalar nodemailer: ejecuta "npm install nodemailer" en la carpeta del proyecto.' };
    const smtp = config.smtp!;
    const transport = createTransport({
      host: smtp.host, port: smtp.port, secure: smtp.secure, auth: { user: smtp.user, pass: smtp.pass },
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
    });
    await transport.sendMail({ from: config.from, to: message.to, subject: message.subject, text: message.text, html: message.html });
    return { sent: true, provider: 'smtp' };
  } catch (error) {
    // El mensaje del proveedor puede ayudar (clave inválida, puerto bloqueado), pero nunca incluye la contraseña.
    const detail = error instanceof Error ? error.message : 'error desconocido';
    return { sent: false, provider: config.provider, error: detail.slice(0, 240) };
  }
}
