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
  appUrl: string;
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
    `1. Entra a ${input.appUrl}`,
    `2. Inicia sesión o crea tu cuenta con este mismo correo (${input.to}) y verifícalo.`,
    `3. Acepta la invitación en la pantalla de empresas.`, '',
    `La invitación vence el ${expires}. Si no esperabas este mensaje, puedes ignorarlo.`,
  ].join('\n');

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
<h2 style="margin:0 0 12px">Te invitaron a ${escapeHtml(company)}</h2>
<p>Te invitaron${escapeHtml(by)} a unirte al equipo de <strong>${escapeHtml(company)}</strong> en NEXOSS con el rol de <strong>${escapeHtml(role)}</strong>.</p>
<ol style="line-height:1.6"><li>Entra a <a href="${escapeHtml(input.appUrl)}">${escapeHtml(input.appUrl)}</a></li>
<li>Inicia sesión o crea tu cuenta con este mismo correo (<strong>${escapeHtml(input.to)}</strong>) y verifícalo.</li>
<li>Acepta la invitación en la pantalla de empresas.</li></ol>
<p style="color:#475569;font-size:13px">La invitación vence el ${escapeHtml(expires)}. Si no esperabas este mensaje, puedes ignorarlo.</p></div>`;

  return { to: input.to, subject, text, html };
}
