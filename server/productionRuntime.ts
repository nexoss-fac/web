export class ProductionRuntimeBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionRuntimeBlockedError';
  }
}

export function assertProductionRuntimeSupported(environment: NodeJS.ProcessEnv = process.env): void {
  if (environment.NODE_ENV !== 'production') return;

  if (environment.FIREBASE_AUTH_EMULATOR_HOST?.trim()) {
    throw new ProductionRuntimeBlockedError('Producción bloqueada: elimina FIREBASE_AUTH_EMULATOR_HOST y configura Firebase Admin con la identidad de servicio del entorno.');
  }

  throw new ProductionRuntimeBlockedError(
    'Producción bloqueada: NEXOSS todavía depende de persistencia JSON local y el repositorio PostgreSQL no está conectado a las rutas. No despliegues esta versión.',
  );
}
