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
