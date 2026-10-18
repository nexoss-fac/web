import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const CIPHER = 'aes-256-gcm';
const VERSION = 'v1';

function encryptionKey(environment: NodeJS.ProcessEnv): Buffer {
  const encoded = environment.TENANT_DATABASE_ENCRYPTION_KEY?.trim() || '';
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('TENANT_DATABASE_ENCRYPTION_KEY must be a base64 encoded 32-byte key.');
  return key;
}

export function encryptTenantConnectionString(connectionString: string, environment: NodeJS.ProcessEnv = process.env): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(CIPHER, encryptionKey(environment), iv);
  const ciphertext = Buffer.concat([cipher.update(connectionString, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptTenantConnectionString(encrypted: string, environment: NodeJS.ProcessEnv = process.env): string {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded, extra] = encrypted.split('.');
  if (version !== VERSION || !ivEncoded || !tagEncoded || !ciphertextEncoded || extra) {
    throw new Error('Unsupported encrypted tenant database credential format.');
  }
  const decipher = createDecipheriv(CIPHER, encryptionKey(environment), Buffer.from(ivEncoded, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
