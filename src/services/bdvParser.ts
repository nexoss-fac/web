import * as XLSX from 'xlsx';
import { BdvParsedMovement } from '../types';

/**
 * Normalizes Venezuelan currency strings (e.g., "1.250,50", "1250.50", "Bs. 1.250,50") into number
 */
export function parseBsAmount(raw: any): number {
  if (typeof raw === 'number') return Math.abs(raw);
  if (!raw) return 0;

  let str = String(raw).trim();
  // Remove currency symbol and whitespace
  str = str.replace(/Bs\.?|VES|\$/gi, '').trim();

  // Check if negative
  const isNegative = str.startsWith('-') || str.endsWith('-');
  str = str.replace(/[-+]/g, '').trim();

  // If format is like "1.234,56" (thousands dot, decimal comma)
  if (str.includes(',') && str.includes('.')) {
    if (str.indexOf('.') < str.indexOf(',')) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    // Only comma, likely decimal
    str = str.replace(',', '.');
  }

  const val = parseFloat(str);
  return isNaN(val) ? 0 : Math.abs(val);
}

/**
 * Parses BDV date format (DD/MM/YYYY or YYYY-MM-DD) into standard YYYY-MM-DD
 */
export function parseBdvDate(raw: any): string {
  if (!raw) return new Date().toISOString().split('T')[0];

  // If it's an Excel date serial number
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) {
      const month = String(d.m).padStart(2, '0');
      const day = String(d.d).padStart(2, '0');
      return `${d.y}-${month}-${day}`;
    }
  }

  const str = String(raw).trim();
  // DD/MM/YYYY
  const ddmmyyyy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3];
    return `${year}-${month}-${day}`;
  }

  // YYYY-MM-DD
  const yyyymmdd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (yyyymmdd) {
    const year = yyyymmdd[1];
    const month = yyyymmdd[2].padStart(2, '0');
    const day = yyyymmdd[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return new Date().toISOString().split('T')[0];
}

/**
 * Parses an Excel or CSV file from Banco de Venezuela
 */
export function parseBdvFile(fileData: ArrayBuffer | string): BdvParsedMovement[] {
  let workbook: XLSX.WorkBook;

  if (typeof fileData === 'string') {
    workbook = XLSX.read(fileData, { type: 'string' });
  } else {
    workbook = XLSX.read(fileData, { type: 'array' });
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (!rawRows || rawRows.length === 0) {
    return [];
  }

  // Detect header row by scanning first 15 rows for BDV keywords
  let headerRowIndex = -1;
  let colIndexMap: {
    fecha: number;
    referencia: number;
    descripcion: number;
    monto: number;
    credito: number;
    debito: number;
    saldo: number;
  } = {
    fecha: -1,
    referencia: -1,
    descripcion: -1,
    monto: -1,
    credito: -1,
    debito: -1,
    saldo: -1,
  };

  for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
    const row = rawRows[r].map((cell) => String(cell).toLowerCase().trim());

    const fIdx = row.findIndex((c) => c.includes('fecha'));
    const rIdx = row.findIndex((c) => c.includes('ref') || c.includes('secuencia') || c.includes('documento') || c.includes('operación'));
    const dIdx = row.findIndex((c) => c.includes('descrip') || c.includes('concepto') || c.includes('detalle') || c.includes('transaccion') || c.includes('canal'));
    const mIdx = row.findIndex((c) => c === 'monto' || c.includes('monto') || c.includes('importe'));
    const cIdx = row.findIndex((c) => c.includes('credito') || c.includes('crédito') || c.includes('abono'));
    const debIdx = row.findIndex((c) => c.includes('debito') || c.includes('débito') || c.includes('cargo'));
    const sIdx = row.findIndex((c) => c.includes('saldo'));

    if (fIdx !== -1 && (rIdx !== -1 || dIdx !== -1 || mIdx !== -1 || cIdx !== -1)) {
      headerRowIndex = r;
      colIndexMap = {
        fecha: fIdx,
        referencia: rIdx !== -1 ? rIdx : 1,
        descripcion: dIdx !== -1 ? dIdx : 2,
        monto: mIdx,
        credito: cIdx,
        debito: debIdx,
        saldo: sIdx,
      };
      break;
    }
  }

  // If header not detected, assume default columns: 0: Fecha, 1: Ref, 2: Desc, 3: Monto/Crédito
  if (headerRowIndex === -1) {
    headerRowIndex = 0;
    colIndexMap = {
      fecha: 0,
      referencia: 1,
      descripcion: 2,
      monto: 3,
      credito: -1,
      debito: -1,
      saldo: 4,
    };
  }

  const parsedMovements: BdvParsedMovement[] = [];

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const fechaRaw = row[colIndexMap.fecha];
    if (!fechaRaw) continue;

    const fechaStr = parseBdvDate(fechaRaw);
    let referenciaStr = String(row[colIndexMap.referencia] || '').trim();
    // Clean reference number to only digits or meaningful string
    if (!referenciaStr || referenciaStr === '0') {
      referenciaStr = `BDV-${Date.now().toString().slice(-6)}-${r}`;
    }

    const descripcionStr = String(row[colIndexMap.descripcion] || 'Movimiento BDV').trim();

    let monto = 0;
    let tipo: 'credito_ingreso' | 'debito_egreso' = 'credito_ingreso';

    // Check separate Credito / Debito columns
    if (colIndexMap.credito !== -1 && row[colIndexMap.credito]) {
      const cVal = parseBsAmount(row[colIndexMap.credito]);
      if (cVal > 0) {
        monto = cVal;
        tipo = 'credito_ingreso';
      }
    }

    if (colIndexMap.debito !== -1 && row[colIndexMap.debito] && monto === 0) {
      const dVal = parseBsAmount(row[colIndexMap.debito]);
      if (dVal > 0) {
        monto = dVal;
        tipo = 'debito_egreso';
      }
    }

    // Single Monto column
    if (monto === 0 && colIndexMap.monto !== -1 && row[colIndexMap.monto] !== undefined) {
      const rawMontoCell = row[colIndexMap.monto];
      monto = parseBsAmount(rawMontoCell);
      const strCell = String(rawMontoCell);
      if (strCell.includes('-') || descripcionStr.toLowerCase().includes('comision') || descripcionStr.toLowerCase().includes('cargo') || descripcionStr.toLowerCase().includes('debito')) {
        tipo = 'debito_egreso';
      } else {
        tipo = 'credito_ingreso';
      }
    }

    // Skip blank or zero amount rows
    if (monto <= 0) continue;

    let saldo: number | undefined = undefined;
    if (colIndexMap.saldo !== -1 && row[colIndexMap.saldo]) {
      saldo = parseBsAmount(row[colIndexMap.saldo]);
    }

    parsedMovements.push({
      id: `bdv_import_${Date.now()}_${r}_${Math.random().toString(36).substr(2, 4)}`,
      fecha: fechaStr,
      referencia: referenciaStr,
      descripcion: descripcionStr,
      tipo,
      monto_bs: Number(monto.toFixed(2)),
      saldo_bs: saldo ? Number(saldo.toFixed(2)) : undefined,
      estado_conciliacion: 'pendiente',
    });
  }

  return parsedMovements;
}

/**
 * Parses raw text pasted directly from BDV En Línea
 */
export function parseBdvRawText(text: string): BdvParsedMovement[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const movements: BdvParsedMovement[] = [];

  lines.forEach((line, idx) => {
    // Check if line contains tab or multiple spaces or semicolons
    const tokens = line.split(/\t| {2,}|;/).map((t) => t.trim()).filter(Boolean);
    if (tokens.length >= 3) {
      const fecha = parseBdvDate(tokens[0]);
      const referencia = tokens[1] || `BDV-${idx + 1}`;
      const descripcion = tokens[2] || 'Pago Móvil / Transferencia BDV';
      let monto = 0;
      let tipo: 'credito_ingreso' | 'debito_egreso' = 'credito_ingreso';

      if (tokens[3]) {
        monto = parseBsAmount(tokens[3]);
        if (tokens[3].includes('-')) tipo = 'debito_egreso';
      }

      if (monto > 0) {
        movements.push({
          id: `bdv_text_${Date.now()}_${idx}`,
          fecha,
          referencia,
          descripcion,
          tipo,
          monto_bs: monto,
          estado_conciliacion: 'pendiente',
        });
      }
    }
  });

  return movements;
}
