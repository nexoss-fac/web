import type { TenantSecretProvider } from './tenantResolver.ts';

export class LocalEnvironmentTenantSecretProvider implements TenantSecretProvider {
  private readonly environment: NodeJS.ProcessEnv;

  constructor(environment: NodeJS.ProcessEnv = process.env) {
    this.environment = environment;
  }

  async getConnectionString(secretReference: string): Promise<string> {
    const match = /^(?:local-env|render-env):([A-Z][A-Z0-9_]*_DATABASE_URL)$/.exec(secretReference);
    if (!match || match[1] === 'CONTROL_PLANE_DATABASE_URL' || match[1] === 'DATABASE_URL') {
      throw new Error('Referencia de conexión de empresa no permitida.');
    }
    if (this.environment.NODE_ENV === 'production' && !secretReference.startsWith('render-env:')) {
      throw new Error('En producción use referencias render-env configuradas como variables secretas.');
    }
    const connectionString = this.environment[match[1]]?.trim();
    if (!connectionString) throw new Error('No está configurada la conexión de la empresa.');
    return connectionString;
  }
}
