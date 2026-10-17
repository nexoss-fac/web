import type { MailMessage } from './mailer.ts';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador', accountant: 'Contador', auditor: 'Auditor', supervisor: 'Supervisor', cashier: 'Cajero',
};

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));

export interface InvitationEmailInput {
  to: string;
  companyName: string;
  role: string;
  invitedBy?: string;
  expiresAt: string;
  invitationUrl: string;
}

/** Los datos de la empresa los escribe un usuario: se escapan antes de entrar al HTML. */
export function buildInvitationEmail(input: InvitationEmailInput): MailMessage {
  const company = input.companyName.trim() || 'una empresa';
  const role = ROLE_LABELS[input.role] || input.role;
  const expires = new Date(input.expiresAt).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });
  const by = input.invitedBy ? ` por ${input.invitedBy}` : '';
  const subject = `Te invitaron a ${company} en NEXOSS`;

  const text = [
    `Hola,`, '',
    `Te invitaron${by} a unirte al equipo de ${company} en NEXOSS con el rol de ${role}.`, '',
    `Para aceptar la invitación:`,
    `1. Abre este enlace directo: ${input.invitationUrl}`,
    `2. Inicia sesión o crea tu cuenta con este mismo correo (${input.to}) y verifícalo.`,
    `3. Pulsa “Aceptar y entrar” para activar tu rol de ${role}.`, '',
    `La invitación vence el ${expires}. Si no esperabas este mensaje, puedes ignorarlo.`,
  ].join('\n');

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
<h2 style="margin:0 0 12px">Te invitaron a ${escapeHtml(company)}</h2>
<p>Te invitaron${escapeHtml(by)} a unirte al equipo de <strong>${escapeHtml(company)}</strong> en NEXOSS con el rol de <strong>${escapeHtml(role)}</strong>.</p>
<p><a href="${escapeHtml(input.invitationUrl)}" style="display:inline-block;padding:12px 18px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Abrir invitación y entrar</a></p>
<ol style="line-height:1.6"><li>Inicia sesión o crea tu cuenta con este mismo correo (<strong>${escapeHtml(input.to)}</strong>) y verifícalo.</li>
<li>Pulsa “Aceptar y entrar”; se activará el rol de <strong>${escapeHtml(role)}</strong>.</li></ol>
<p style="color:#475569;font-size:13px">La invitación vence el ${escapeHtml(expires)}. Si no esperabas este mensaje, puedes ignorarlo.</p></div>`;

  return { to: input.to, subject, text, html };
}
