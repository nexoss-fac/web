/**
 * Registro con niveles para el servidor.
 * Sustituye a los console.* sueltos: permite silenciar el ruido en producción
 * (LOG_LEVEL=warn) y activar el detalle al depurar (LOG_LEVEL=debug).
 * Mantiene la firma de console para poder migrar sin cambiar los mensajes.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function parseLogLevel(value: string | undefined): LogLevel {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized in ORDER ? (normalized as LogLevel) : 'info';
}

export function createLogger(
  getLevel: () => LogLevel = () => parseLogLevel(process.env.LOG_LEVEL),
  sink: Pick<Console, 'log' | 'warn' | 'error'> = console,
) {
  const emit = (level: LogLevel, method: 'log' | 'warn' | 'error') => (...args: unknown[]): void => {
    if (ORDER[level] < ORDER[getLevel()]) return;
    sink[method](`${new Date().toISOString()} [${level}]`, ...args);
  };
  return {
    debug: emit('debug', 'log'),
    info: emit('info', 'log'),
    warn: emit('warn', 'warn'),
    error: emit('error', 'error'),
  };
}

export const logger = createLogger();
