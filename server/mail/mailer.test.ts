import assert from 'node:assert/strict';
import test from 'node:test';
import { mailConfigProblem, readMailConfig, sendMail } from './mailer.ts';
import { buildInvitationEmail } from './invitationEmail.ts';

const message = { to: 'ana@example.com', subject: 'Hola', text: 'texto', html: '<p>texto</p>' };

test('sin variables no hay proveedor y se explica qué falta', async () => {
  const config = readMailConfig({});
  assert.equal(config.provider, 'none');
  const result = await sendMail(message, config);
  assert.equal(result.sent, false);
  assert.match(result.error || '', /SMTP_HOST|RESEND_API_KEY/);
});

test('detecta SMTP y Resend por las variables y aplica el puerto seguro', () => {
  const gmail = readMailConfig({ SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: 'tienda@gmail.com', SMTP_PASS: 'clave' });
  assert.equal(gmail.provider, 'smtp');
  assert.equal(gmail.smtp?.secure, true);
  assert.equal(gmail.from, 'tienda@gmail.com');
  assert.equal(readMailConfig({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'a@b.com', SMTP_PASS: 'x' }).smtp?.secure, false);
  assert.equal(readMailConfig({ RESEND_API_KEY: 're_123', MAIL_FROM: 'NEXOSS <hola@midominio.com>' }).provider, 'resend');
});

test('avisa cuando falta el remitente o las credenciales', () => {
  assert.match(mailConfigProblem(readMailConfig({ RESEND_API_KEY: 're_1' })) || '', /MAIL_FROM/);
  assert.match(mailConfigProblem(readMailConfig({ SMTP_HOST: 'h', MAIL_FROM: 'a@b.com' })) || '', /SMTP_USER|SMTP_PASS/);
});

test('envía por SMTP con el transporte indicado y no filtra la contraseña si falla', async () => {
  const sent: any[] = [];
  const config = readMailConfig({ SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: 'tienda@gmail.com', SMTP_PASS: 'SECRETA', MAIL_FROM: 'NEXOSS <tienda@gmail.com>' });
  const ok = await sendMail(message, config, { createTransport: () => ({ sendMail: async (m) => { sent.push(m); } }) });
  assert.equal(ok.sent, true);
  assert.equal(sent[0].to, 'ana@example.com');

  const failed = await sendMail(message, config, { createTransport: () => ({ sendMail: async () => { throw new Error('Invalid login'); } }) });
  assert.equal(failed.sent, false);
  assert.equal(JSON.stringify(failed).includes('SECRETA'), false);
});

test('envía por Resend con la clave en el encabezado y reporta errores del servicio', async () => {
  const calls: any[] = [];
  const config = readMailConfig({ RESEND_API_KEY: 're_abc', MAIL_FROM: 'hola@midominio.com' });
  const ok = await sendMail(message, config, { fetch: (async (url: string, init: any) => { calls.push({ url, init }); return new Response('{}', { status: 200 }); }) as any });
  assert.equal(ok.sent, true);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer re_abc');
  assert.deepEqual(JSON.parse(calls[0].init.body).to, ['ana@example.com']);

  const denied = await sendMail(message, config, { fetch: (async () => new Response('domain not verified', { status: 403 })) as any });
  assert.equal(denied.sent, false);
  assert.match(denied.error || '', /403/);
});

test('rechaza destinatarios inválidos y SMTP sin nodemailer da una instrucción clara', async () => {
  const config = readMailConfig({ RESEND_API_KEY: 're_1', MAIL_FROM: 'a@b.com' });
  assert.equal((await sendMail({ ...message, to: 'no-es-correo' }, config)).sent, false);
  assert.equal((await sendMail({ ...message, to: 'a@b.com,c@d.com' }, config)).sent, false);
});

test('el correo de invitación escapa el nombre de la empresa y trae el enlace', () => {
  const mail = buildInvitationEmail({ to: 'ana@example.com', companyName: '<img src=x onerror=alert(1)>', role: 'cashier', invitedBy: 'dueno@tienda.com', expiresAt: '2026-10-23T00:00:00Z', appUrl: 'https://app.nexoss.com' });
  assert.equal(mail.html.includes('<img'), false);
  assert.ok(mail.html.includes('&lt;img'));
  assert.ok(mail.text.includes('https://app.nexoss.com'));
  assert.ok(mail.text.includes('Cajero'));
  assert.ok(mail.subject.startsWith('Te invitaron a'));
});
