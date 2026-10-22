import { existsSync } from 'node:fs';

export class ProductionRuntimeBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionRuntimeBlockedError';
  }
}

function hasInlineFirebaseAdminCredentials(value: string | undefined, expectedProjectId: string): boolean {
  if (!value?.trim()) return false;
  try {
    const credentials = JSON.parse(value) as Record<string, unknown>;
    return credentials.project_id === expectedProjectId
      && typeof credentials.client_email === 'string'
      && credentials.client_email.includes('@')
      && typeof credentials.private_key === 'string'
      && credentials.private_key.includes('PRIVATE KEY');
  } catch {
    return false;
  }
}

export function assertProductionRuntimeSupported(environment: NodeJS.ProcessEnv = process.env): void {
  if (environment.NODE_ENV !== 'production') return;

  if (environment.FIREBASE_AUTH_EMULATOR_HOST?.trim()) {
    throw new ProductionRuntimeBlockedError('Producción bloqueada: elimina FIREBASE_AUTH_EMULATOR_HOST y configura Firebase Admin con la identidad de servicio del entorno.');
  }

  if (environment.NEXOSS_PLATFORM_STORAGE?.trim() !== 'postgres') {
    throw new ProductionRuntimeBlockedError('Producción bloqueada: configura NEXOSS_PLATFORM_STORAGE=postgres para usar el control de empresas en PostgreSQL.');
  }
  if (!environment.CONTROL_PLANE_DATABASE_URL?.trim()) {
    throw new ProductionRuntimeBlockedError('Producción bloqueada: falta CONTROL_PLANE_DATABASE_URL para el control de empresas.');
  }
  if (!(environment.FIREBASE_PROJECT_ID?.trim() || environment.GOOGLE_CLOUD_PROJECT?.trim())) {
    throw new ProductionRuntimeBlockedError('Producción bloqueada: falta el ID del proyecto Firebase.');
  }
  const projectId = environment.FIREBASE_PROJECT_ID?.trim() || environment.GOOGLE_CLOUD_PROJECT?.trim() || '';
  const inlineCredentials = environment.FIREBASE_ADMIN_CREDENTIALS_JSON?.trim();
  if (inlineCredentials) {
    if (hasInlineFirebaseAdminCredentials(inlineCredentials, projectId)) return;
    throw new ProductionRuntimeBlockedError('Producción bloqueada: FIREBASE_ADMIN_CREDENTIALS_JSON no contiene credenciales válidas para el proyecto configurado.');
  }

  const credentialPath = environment.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!credentialPath || !existsSync(credentialPath)) {
    throw new ProductionRuntimeBlockedError('Producción bloqueada: configura FIREBASE_ADMIN_CREDENTIALS_JSON como secreto o GOOGLE_APPLICATION_CREDENTIALS con un archivo secreto de Firebase Admin disponible en Render.');
  }
}
