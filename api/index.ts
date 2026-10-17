import type { IncomingMessage, ServerResponse } from 'http';

// OBSOLETO: esta función serverless exponía server/app.ts, que no tiene
// autenticación ni separación por empresa. La API vigente es server.ts
// (Firebase + membresías). Se responde 410 para que un despliegue accidental
// en Vercel no deje datos expuestos.
export default function handler(_req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 410;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: 'Esta API fue retirada. Usa el servidor principal (server.ts).' }));
}
