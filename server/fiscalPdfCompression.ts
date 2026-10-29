import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const PDF_DATA_URL = /^data:application\/pdf;base64,([A-Za-z0-9+/]+=*)$/;

export interface PdfCompressionResult {
  dataUrl: string;
  originalBytes: number;
  storedBytes: number;
  compressed: boolean;
  reason?: 'signed_pdf' | 'compressor_unavailable' | 'not_smaller' | 'invalid_output' | 'compression_failed';
}

/**
 * Compresses unsigned PDFs with Ghostscript when it is installed.
 * Signed PDFs are intentionally left byte-for-byte unchanged because rewriting
 * a signed PDF invalidates its cryptographic signature. The original is kept
 * whenever compression is unavailable, fails, or produces a larger file.
 */
export async function compressFiscalPdfDataUrl(dataUrl: string): Promise<PdfCompressionResult | null> {
  const match = PDF_DATA_URL.exec(dataUrl);
  if (!match) return null;
  const original = Buffer.from(match[1], 'base64');
  const originalBytes = original.byteLength;

  // A rewrite would invalidate a PDF's embedded digital signature.
  const pdfTextPrefix = original.subarray(0, Math.min(original.length, 2 * 1024 * 1024)).toString('latin1');
  if (/\/ByteRange\s*\[|\/Type\s*\/Sig\b|\/FT\s*\/Sig\b/.test(pdfTextPrefix)) {
    return { dataUrl, originalBytes, storedBytes: originalBytes, compressed: false, reason: 'signed_pdf' };
  }

  const directory = await mkdtemp(path.join(os.tmpdir(), 'nexoss-pdf-'));
  const inputPath = path.join(directory, 'original.pdf');
  const outputPath = path.join(directory, 'compressed.pdf');
  try {
    await writeFile(inputPath, original);
    try {
      await execFileAsync('gs', [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.7',
        '-dPDFSETTINGS=/ebook',
        '-dDetectDuplicateImages=true',
        '-dCompressFonts=true',
        '-dSubsetFonts=true',
        '-dNOPAUSE',
        '-dBATCH',
        '-dSAFER',
        '-dQUIET',
        `-sOutputFile=${outputPath}`,
        inputPath,
      ], { timeout: 90000, maxBuffer: 2 * 1024 * 1024 });
    } catch (error) {
      const cause = error as NodeJS.ErrnoException;
      if (cause.code === 'ENOENT') {
        return { dataUrl, originalBytes, storedBytes: originalBytes, compressed: false, reason: 'compressor_unavailable' };
      }
      return { dataUrl, originalBytes, storedBytes: originalBytes, compressed: false, reason: 'compression_failed' };
    }

    let compressed: Buffer;
    try {
      compressed = await readFile(outputPath);
    } catch {
      return { dataUrl, originalBytes, storedBytes: originalBytes, compressed: false, reason: 'invalid_output' };
    }
    if (compressed.length < 8 || compressed.subarray(0, 5).toString('ascii') !== '%PDF-') {
      return { dataUrl, originalBytes, storedBytes: originalBytes, compressed: false, reason: 'invalid_output' };
    }
    if (compressed.byteLength >= originalBytes) {
      return { dataUrl, originalBytes, storedBytes: originalBytes, compressed: false, reason: 'not_smaller' };
    }
    return {
      dataUrl: `data:application/pdf;base64,${compressed.toString('base64')}`,
      originalBytes,
      storedBytes: compressed.byteLength,
      compressed: true,
    };
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}
