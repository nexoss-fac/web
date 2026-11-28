import type { Sale } from '../../src/types.ts';

export interface InvoicePdfCompany {
  legalName?: string;
  tradeName?: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
  mainBranchName?: string;
  mainBranchAddress?: string;
}

function cleanPdfText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function money(value: unknown, currency = '$'): string {
  const amount = Number(value);
  return `${currency}${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
}

function wrap(value: string, width = 88): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** Builds a small, self-contained PDF using the standard Helvetica font (no runtime dependency). */
export function buildSaleInvoicePdf(sale: Sale, company: InvoicePdfCompany = {}): Buffer {
  const companyName = company.tradeName || company.legalName || 'NEXOSS';
  const rows: string[] = [
    companyName.toUpperCase(),
    company.legalName && company.tradeName && company.legalName !== company.tradeName ? company.legalName : '',
    company.taxId ? `RIF: ${company.taxId}` : '',
    company.address || '',
    company.phone ? `Telefono: ${company.phone}` : '',
    company.email ? `Correo: ${company.email}` : '',
    company.mainBranchName ? `Sede: ${company.mainBranchName}` : '',
    company.mainBranchAddress || '',
    '',
    'FACTURA / COMPROBANTE DE VENTA',
    `Numero: ${sale.numero_factura || sale.id}`,
    `Fecha: ${new Date(sale.fecha).toLocaleString('es-VE', { timeZone: 'America/Caracas' })}`,
    `Cliente: ${[sale.cliente_nombre, sale.cliente_apellido].filter(Boolean).join(' ') || 'Consumidor Final'}`,
    sale.cliente_rif ? `Cedula / RIF: ${sale.cliente_rif}` : '',
    sale.cliente_direccion ? `Direccion: ${sale.cliente_direccion}` : '',
    sale.cliente_telefono ? `Telefono: ${sale.cliente_telefono}` : '',
    '',
    'DETALLE DE PRODUCTOS',
    'Producto | Marca | Talla | Cant. | Precio unit. | Subtotal',
    ...((sale.items || []).flatMap((item) => wrap(
      `${item.nombre_producto} | ${item.marca || '-'} | ${item.talla || '-'} | ${item.cantidad} | ${money(item.precio_unitario)} | ${money(item.subtotal)}`,
      88,
    ))),
    '',
    `Subtotal: ${money(sale.subtotal_usd)}`,
    sale.descuento_usd ? `Descuento: -${money(sale.descuento_usd)}` : '',
    sale.aplica_iva ? `IVA (${Number(sale.porcentaje_iva || 0).toFixed(2)}%): ${money(sale.iva_monto_usd)}` : '',
    `TOTAL USD: ${money(sale.total_usd)}`,
    `TOTAL Bs: ${money(sale.total_bs, 'Bs ')}`,
    `Tasa de cambio: Bs ${Number(sale.tasa_cambio || 0).toFixed(4)} / USD`,
    '',
    'FORMAS DE PAGO',
    ...((sale.pagos || []).map((payment) => `- ${payment.cuenta}: ${money(payment.monto, payment.moneda === 'Bs' ? 'Bs ' : '$')}`)),
    sale.condicion_pago === 'credito' ? 'Condicion: CREDITO' : 'Condicion: CONTADO',
    sale.notas ? `Notas: ${sale.notas}` : '',
    '',
    'Documento generado por NEXOSS.',
  ].filter((line) => line !== '');

  const pageLines: string[][] = [];
  for (let i = 0; i < rows.length; i += 48) pageLines.push(rows.slice(i, i + 48));
  if (!pageLines.length) pageLines.push(['FACTURA']);

  const objects: string[] = [];
  const pageObjectIds = pageLines.map((_, index) => 4 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageLines.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';

  pageLines.forEach((lines, index) => {
    const pageId = pageObjectIds[index];
    const streamId = pageId + 1;
    const commands = [
      'BT',
      '/F1 9 Tf',
      '48 794 Td',
      '12 TL',
      ...lines.flatMap((line, lineIndex) => [
        lineIndex === 0 && index === 0 ? '/F1 13 Tf' : '/F1 9 Tf',
        `(${cleanPdfText(line)}) Tj`,
        'T*',
      ]),
      'ET',
    ].join('\n');
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`;
    objects[streamId] = `<< /Length ${Buffer.byteLength(commands, 'ascii')} >>\nstream\n${commands}\nendstream`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(pdf, 'ascii');
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}
