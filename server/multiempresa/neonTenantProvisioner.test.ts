import assert from 'node:assert/strict';
import test from 'node:test';
import { NeonTenantProvisioner } from './neonTenantProvisioner.ts';

function mockFetcher(connectionPayload: Record<string, unknown>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/projects?')) {
      return new Response(JSON.stringify({
        projects: [{ id: 'project-123', name: 'nexoss-company-123' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/connection_uri?')) {
      return new Response(JSON.stringify(connectionPayload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

test('accepts the direct uri response returned by Neon', async () => {
  const provisioner = new NeonTenantProvisioner(
    { NEON_API_KEY: 'test-key' },
    mockFetcher({ uri: 'postgresql://nexoss_owner:secret@ep-example.neon.tech/nexoss?sslmode=require' }),
  );

  const result = await provisioner.createTenantConnection('company-123');
  assert.equal(result.projectId, 'project-123');
  assert.equal(result.connectionString, 'postgresql://nexoss_owner:secret@ep-example.neon.tech/nexoss?sslmode=require');
});

test('keeps compatibility with connection_uris response', async () => {
  const provisioner = new NeonTenantProvisioner(
    { NEON_API_KEY: 'test-key' },
    mockFetcher({ connection_uris: [{ connection_uri: 'postgresql://nexoss_owner:secret@ep-example.neon.tech/nexoss?sslmode=require' }] }),
  );

  const result = await provisioner.createTenantConnection('company-123');
  assert.equal(result.projectId, 'project-123');
  assert.match(result.connectionString, /^postgresql:\/\//);
});

test('rejects a malformed direct URI from Neon', async () => {
  const provisioner = new NeonTenantProvisioner(
    { NEON_API_KEY: 'test-key' },
    mockFetcher({ uri: 'https://example.invalid/not-postgres' }),
  );

  await assert.rejects(
    provisioner.createTenantConnection('company-123'),
    /invalid tenant database connection URI/i,
  );
});
