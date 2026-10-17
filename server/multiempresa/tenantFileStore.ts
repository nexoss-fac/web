import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function tenantDataFiles(dataRoot: string, companyId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) throw new Error('Identificador de empresa inválido.');
  const root = path.resolve(dataRoot, 'tenants');
  const tenantRoot = path.resolve(root, companyId);
  if (!tenantRoot.startsWith(`${root}${path.sep}`)) throw new Error('Ruta de empresa inválida.');
  return {
    directory: tenantRoot,
    store: path.join(tenantRoot, 'store_state.json'),
    products: path.join(tenantRoot, 'products.json'),
    sales: path.join(tenantRoot, 'sales.json'),
    fiscalBoard: path.join(tenantRoot, 'fiscal_board.json'),
  };
}

export function backupPathFor(filePath: string): string {
  return `${filePath}.prev`;
}

/**
 * Escribe en un temporal y lo renombra encima del destino, para que un corte a mitad
 * de escritura nunca deje un JSON truncado. La versión anterior queda en `<archivo>.prev`.
 * Los errores se propagan: quien llama no debe responder "guardado" si esto falla.
 */
export function writeJsonFileAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(value, null, 2), { encoding: 'utf8', flag: 'wx' });
    if (fs.existsSync(filePath)) fs.copyFileSync(filePath, backupPathFor(filePath));
    fs.renameSync(temp, filePath);
  } catch (error) {
    fs.rmSync(temp, { force: true });
    throw error;
  }
}

/**
 * Lee un JSON; si está dañado, recurre a la copia `.prev`. Devuelve `undefined` solo
 * cuando no existe ninguno de los dos. Si ambos están dañados lanza un error en vez de
 * devolver un estado vacío, para que nadie sobrescriba los datos que aún se pueden recuperar.
 */
export function readJsonFileWithBackup(filePath: string, onRecovered?: (error: unknown) => void): unknown {
  if (!fs.existsSync(filePath)) {
    const backup = backupPathFor(filePath);
    return fs.existsSync(backup) ? JSON.parse(fs.readFileSync(backup, 'utf8')) : undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const backup = backupPathFor(filePath);
    if (!fs.existsSync(backup)) throw new Error(`El archivo de datos ${path.basename(filePath)} está dañado y no hay copia de respaldo.`);
    let recovered: unknown;
    try {
      recovered = JSON.parse(fs.readFileSync(backup, 'utf8'));
    } catch {
      throw new Error(`El archivo de datos ${path.basename(filePath)} y su copia de respaldo están dañados.`);
    }
    onRecovered?.(error);
    return recovered;
  }
}
