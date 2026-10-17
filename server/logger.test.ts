import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogger, parseLogLevel } from './logger.ts';

function capture(level: 'debug' | 'info' | 'warn' | 'error') {
  const lines: string[] = [];
  const sink = {
    log: (...a: unknown[]) => lines.push(a.join(' ')),
    warn: (...a: unknown[]) => lines.push(a.join(' ')),
    error: (...a: unknown[]) => lines.push(a.join(' ')),
  };
  return { lines, logger: createLogger(() => level, sink as unknown as Console) };
}

test('con nivel warn se silencian debug e info', () => {
  const { lines, logger } = capture('warn');
  logger.debug('a'); logger.info('b'); logger.warn('c'); logger.error('d');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /\[warn\] c$/);
});

test('con nivel debug se emite todo', () => {
  const { lines, logger } = capture('debug');
  logger.debug('a'); logger.info('b');
  assert.equal(lines.length, 2);
});

test('un nivel inválido vuelve a info', () => {
  assert.equal(parseLogLevel('ruidoso'), 'info');
  assert.equal(parseLogLevel(undefined), 'info');
  assert.equal(parseLogLevel(' WARN '), 'warn');
});
