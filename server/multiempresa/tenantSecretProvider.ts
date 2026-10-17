import type { TenantSecretProvider } from './tenantResolver.ts';

export class LocalEnvironmentTenantSecretProvider implements TenantSecretProvider {
  private readonly environment: NodeJS.ProcessEnv;

  constructor(environment: NodeJS.ProcessEnv = process.env) {
    this.environment = environment;
  }

  async getConnectionString(secretReference: string): Promise<string> {
    if (this.environment.NODE_ENV === 'production') {
      throw new Error('La resolución de secretos tenant requiere un proveedor de secretos del entorno productivo.');
    }
    const match = /^local-env:([A-Z][A-Z0-9_]*_DATABASE_URL)$/.exec(secretReference);
    if (!match || match[1] === 'CONTROL_PLANE_DATABASE_URL') {
      throw new Error('Referencia de secreto local no permitida.');
    }
    const connectionString = this.environment[match[1]]?.trim();
    if (!connectionString) throw new Error('No está configurada la conexión de la empresa.');
    return connectionString;
  }
}
