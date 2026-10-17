import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExpenseNotice, buildSaleNotice, hasNotifyChannel, readNotifyConfig, sendNotice } from './notifier.ts';

const sale = { numero_factura: 'F-10', cliente_nombre: 'Ana', cliente_apellido: 'Pérez', cliente_rif: 'V-12345678', cliente_telefono: '0414-0000000', total_usd: 100, total_bs: 4000, items: [{ cantidad: 2 }, { cantidad: 1 }], pagos: [{ cuenta: 'Zelle' }, { cuenta: 'Zelle' }], usuario: 'Cajera' };

test('sin variables no hay canales y no se envía nada', async () => {
  const config = readNotifyConfig({});
  assert.equal(hasNotifyChannel(config), false);
  assert.deepEqual(await sendNotice(buildSaleNotice(sale), config, (async () => { throw new Error('no debe llamarse'); }) as any), []);
});

test('lee Telegram y ntfy y respeta qué eventos avisar', () => {
  const config = readNotifyConfig({ NOTIFY_TELEGRAM_BOT_TOKEN: '123:ABC', NOTIFY_TELEGRAM_CHAT_ID: '99', NOTIFY_NTFY_TOPIC: 'nexoss-secreto-123', NOTIFY_EVENTS: 'sale' });
  assert.equal(config.telegram?.chatId, '99');
  assert.equal(config.ntfy?.server, 'https://ntfy.sh');
  assert.deepEqual(config.events, ['sale']);
});

test('el aviso de venta no incluye RIF ni teléfono del cliente', () => {
  const notice = buildSaleNotice(sale, 'MAKD SHOP');
  const text = `${notice.title}\n${notice.body}`;
  assert.ok(text.includes('F-10') && text.includes('$100.00') && text.includes('Artículos: 3') && text.includes('Cobro: Zelle'));
  assert.equal(text.includes('12345678'), false);
  assert.equal(text.includes('0414'), false);
});

test('el aviso de gasto muestra subcuenta, monto y quién lo registró', () => {
  const notice = buildExpenseNotice({ categoria: 'Arrendamientos', monto_usd: 50, monto_bs: 2000, descripcion: 'Alquiler de octubre', registrado_por: 'Admin', cuenta_origen: 'Efectivo USD' });
  assert.ok(notice.body.includes('Arrendamientos: $50.00') && notice.body.includes('Alquiler de octubre') && notice.body.includes('Registró: Admin'));
});

test('envía a Telegram y a ntfy y reporta cada resultado', async () => {
  const calls: any[] = [];
  const fakeFetch = (async (url: string, init: any) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response('{}', { status: url.includes('telegram') ? 200 : 403 }); }) as any;
  const config = readNotifyConfig({ NOTIFY_TELEGRAM_BOT_TOKEN: '123:ABC', NOTIFY_TELEGRAM_CHAT_ID: '99', NOTIFY_NTFY_TOPIC: 'mi-tema' });
  const results = await sendNotice(buildSaleNotice(sale), config, fakeFetch);
  assert.deepEqual(results.map((r) => [r.channel, r.sent]), [['telegram', true], ['ntfy', false]]);
  assert.equal(calls[0].url, 'https://api.telegram.org/bot123:ABC/sendMessage');
  assert.equal(calls[0].body.chat_id, '99');
  assert.equal(calls[1].body.topic, 'mi-tema');
});

test('un fallo de red no lanza error ni filtra el token del bot', async () => {
  const config = readNotifyConfig({ NOTIFY_TELEGRAM_BOT_TOKEN: '123:ABC', NOTIFY_TELEGRAM_CHAT_ID: '99' });
  const results = await sendNotice(buildSaleNotice(sale), config, (async () => { throw new Error('fetch failed https://api.telegram.org/bot123:ABC/sendMessage'); }) as any);
  assert.equal(results[0].sent, false);
  assert.equal(JSON.stringify(results).includes('123:ABC'), false);
});

test('un evento desactivado no se envía', async () => {
  const config = readNotifyConfig({ NOTIFY_NTFY_TOPIC: 't', NOTIFY_EVENTS: 'expense' });
  assert.deepEqual(await sendNotice(buildSaleNotice(sale), config, (async () => new Response('', { status: 200 })) as any), []);
});
