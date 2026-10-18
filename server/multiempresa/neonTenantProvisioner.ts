type NeonOperation = { id?: string; status?: string };
type NeonProject = {
  id?: string;
  name?: string;
  branch?: { id?: string };
  operations?: NeonOperation[];
};

export class NeonTenantProvisioner {
  private readonly environment: NodeJS.ProcessEnv;
  private readonly fetcher: typeof fetch;

  constructor(environment: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch) {
    this.environment = environment;
    this.fetcher = fetcher;
  }

  async createTenantConnection(companyId: string): Promise<{ connectionString: string; projectId: string }> {
    const apiKey = this.environment.NEON_API_KEY?.trim();
    if (!apiKey) throw new Error('NEON_API_KEY is not configured.');
    const projectName = `nexoss-${companyId}`;
    const orgId = this.environment.NEON_ORG_ID?.trim();
    const query = new URLSearchParams({ search: projectName, limit: '10' });
    if (orgId) query.set('org_id', orgId);
    const listed = await this.request(`/projects?${query}`, apiKey);
    const existing = Array.isArray(listed.projects)
      ? (listed.projects as NeonProject[]).find((project) => project.name === projectName)
      : undefined;

    let project = existing;
    if (!project) {
      const createQuery = orgId ? `?org_id=${encodeURIComponent(orgId)}` : '';
      const created = await this.request(`/projects${createQuery}`, apiKey, {
        method: 'POST',
        body: JSON.stringify({
          project: {
            name: projectName,
            region_id: this.environment.NEON_REGION_ID?.trim() || 'aws-us-west-2',
            pg_version: 17,
            branch: { name: 'main', role_name: 'nexoss_owner', database_name: 'nexoss' },
          },
        }),
      });
      project = created.project as NeonProject | undefined;
      if (!project?.id) throw new Error('Neon did not return a project ID.');
      await this.waitForOperations(project.id, created.operations as NeonOperation[] | undefined, apiKey);
    }

    if (!project?.id) throw new Error('Neon project could not be resolved.');
    const connectionQuery = new URLSearchParams({ database_name: 'nexoss', role_name: 'nexoss_owner', pooled: 'true' });
    const connectionData = await this.request(`/projects/${encodeURIComponent(project.id)}/connection_uri?${connectionQuery}`, apiKey);
    const rows = Array.isArray(connectionData.connection_uris) ? connectionData.connection_uris as Array<{ connection_uri?: string }> : [];
    const connectionString = rows.find((item) => typeof item.connection_uri === 'string')?.connection_uri?.trim();
    if (!connectionString) throw new Error('Neon did not return a tenant database connection URI.');
    const parsed = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.password) {
      throw new Error('Neon returned an invalid tenant database connection URI.');
    }
    return { connectionString, projectId: project.id };
  }

  private async waitForOperations(projectId: string, operations: NeonOperation[] | undefined, apiKey: string): Promise<void> {
    for (const operation of operations || []) {
      if (!operation.id || operation.status === 'finished') continue;
      let status = operation.status || 'running';
      for (let attempt = 0; attempt < 60 && status !== 'finished'; attempt += 1) {
        if (status === 'failed' || status === 'cancelled') throw new Error('Neon project provisioning operation failed.');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const data = await this.request(`/projects/${encodeURIComponent(projectId)}/operations/${encodeURIComponent(operation.id)}`, apiKey);
        status = String((data.operation as NeonOperation | undefined)?.status || 'running');
      }
      if (status !== 'finished') throw new Error('Neon project provisioning timed out.');
    }
  }

  private async request(path: string, apiKey: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const response = await this.fetcher(`https://console.neon.tech/api/v2${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...init.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Neon API request failed with status ${response.status}.`);
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Neon API returned an invalid response.');
    return payload as Record<string, unknown>;
  }
}
