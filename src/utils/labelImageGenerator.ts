import { ShoeProduct } from '../types';
import JsBarcode from 'jsbarcode';

export type LabelFormat = 'thermal_40x20' | 'thermal_40x25' | 'thermal_50x15' | 'thermal_50x30' | 'thermal_50x70' | 'custom' | 'hangtag' | 'box';

export interface LabelOptions {
  format: LabelFormat;
  showCost: boolean;
  showPrice: boolean;
  showBsPrice: boolean;
  showBarcode: boolean;
  showStoreAddress: boolean;
  exchangeRate: number;
  availableSizes?: string[];
  showAvailableSizes?: boolean;
  customWidthMm?: number;
  customHeightMm?: number;
}

/**
 * Helper to draw rounded rectangle safely on any HTML5 canvas.
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

/**
 * Dibuja SKU en Code 128-B. JsBarcode genera start/stop y checksum.
 * El dato se conserva exactamente; no se reemplazan caracteres por guiones.
 */
function drawBarcode(ctx: CanvasRenderingContext2D, text: string, centerX: number, y: number, targetWidth: number, barHeight: number) {
  const value = text.trim();
  if (!value || !/^[\x20-\x7E]+$/.test(value)) {
    console.warn('SKU omitido: Code 128-B solo admite ASCII imprimible.', text);
    return;
  }
  const barcodeCanvas = document.createElement('canvas');
  try {
    JsBarcode(barcodeCanvas, value, {
      format: 'CODE128',
      displayValue: false,
      width: 2,
      height: Math.max(24, Math.round(barHeight)),
      margin: 10,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 10,
      marginRight: 10,
      lineColor: '#000000',
      background: '#ffffff',
    });
  } catch (error) {
    console.error('SKU no válido para Code 128:', error);
    return;
  }
  const scale = Math.min(1, targetWidth / barcodeCanvas.width);
  const drawWidth = barcodeCanvas.width * scale;
  const drawHeight = Math.min(barHeight, barcodeCanvas.height * scale);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(barcodeCanvas, centerX - drawWidth / 2, y, drawWidth, drawHeight);
}

/**
 * Truncates text with ellipsis if it exceeds maxWidth
 */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let current = text;
  while (current.length > 0 && ctx.measureText(current + '…').width > maxWidth) {
    current = current.slice(0, -1);
  }
  return current + '…';
}

/**
 * Renders a complete shoe label onto an HTML5 Canvas at high resolution.
 * User requirements:
 * 1. NO black lines / border around the label.
 * 2. TALLA and PRECIO are predominant and large.
 * 3. Shows available sizes for the same shoe style.
 */
export function renderLabelToCanvas(
  product: ShoeProduct,
  options: LabelOptions
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Determine canvas pixel dimensions based on label format (scaled for crisp 300+ DPI print)
  // Raster de 12 px/mm para conservar proporción y resolución en impresión.
  const fixedDimensions: Partial<Record<LabelFormat, [number, number]>> = {
    thermal_40x20: [40, 20],
    thermal_40x25: [40, 25],
    thermal_50x15: [50, 15],
    thermal_50x30: [50, 30],
    thermal_50x70: [50, 70],
  };
  let width = 480;
  let height = 240;
  const fixed = fixedDimensions[options.format];
  if (fixed) {
    width = Math.round(fixed[0] * 12);
    height = Math.round(fixed[1] * 12);
  } else if (options.format === 'custom') {
    const w = Math.min(100, Math.max(20, options.customWidthMm || 40));
    const h = Math.min(150, Math.max(10, options.customHeightMm || 20));
    width = Math.round(w * 12);
    height = Math.round(h * 12);
  } else if (options.format === 'hangtag') {
    width = 480;
    height = 700;
  } else if (options.format === 'box') {
    width = 650;
    height = 450;
  }

  canvas.width = width;
  canvas.height = height;

  // 1. Fill clean white background without outer border (no black line around!)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  const priceBs = product.precio * options.exchangeRate;
  // Prioriza el EAN/UPC escaneado y guardado; usa SKU solo como respaldo temporal.
  const barcodeValue = (product.codigo_barras || product.sku || '').trim();
  const showSizes = options.showAvailableSizes !== false && options.availableSizes && options.availableSizes.length > 0;
  const availableSizesList = options.availableSizes || (product.talla ? [product.talla] : []);

  if (options.format === 'thermal_40x20' || options.format === 'thermal_40x25') {
    // Ambos formatos comparten el diseño; 40x20 comprime verticalmente el arte 20%.
    if (options.format === 'thermal_40x20') ctx.scale(1, 0.8);
    const margin = 12;

    if (options.showPrice) {
      ctx.fillStyle = '#090d16';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 62px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
      const priceText = `$${product.precio.toFixed(2)}`;
      ctx.fillText(fitText(ctx, priceText, width - margin * 2), width / 2, 43);

      if (options.showBsPrice) {
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(
          `${priceBs.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Bs`,
          width / 2,
          67
        );
      }
    }

    if (options.showStoreAddress) {
      ctx.fillStyle = '#64748b';
      ctx.font = '11px sans-serif';
      ctx.fillText('Ubicación no configurada • Sede no configurada', width / 2, 91);
    }
    if (options.showCost) {
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`Costo: ${product.costo.toFixed(2)}`, width / 2, 106);
    }

    // Talla predominante en el centro; marca y modelo debajo.
    ctx.fillStyle = '#090d16';
    ctx.textAlign = 'center';
    ctx.font = '900 70px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
    ctx.fillText(fitText(ctx, product.talla || '--', width - margin * 2), width / 2, 153);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 19px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(fitText(ctx, product.nombre.toUpperCase(), width - margin * 2), width / 2, 199);

    ctx.fillStyle = '#475569';
    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const details = [product.marca, product.tipo, product.color, product.sku]
      .filter(Boolean)
      .join(' • ');
    ctx.fillText(fitText(ctx, details, width - margin * 2), width / 2, 221);

    if (showSizes) {
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(
        fitText(ctx, `Tallas: ${availableSizesList.slice(0, 8).join(' · ')}`, width - margin * 2),
        width / 2,
        239
      );
    }

    // Solo barras: sin SKU impreso, sin dígitos ni leyenda.
    if (options.showBarcode) {
      drawBarcode(ctx, barcodeValue, width / 2, 258, width - margin * 2, 34);
    }
  } else {
    // -------------------------------------------------------------
    // GENERAL / STANDARD LAYOUT (50x30mm, HangTag, Box)
    // Also no outer black border; Predominant Talla and Price; Tallas disp.
    // -------------------------------------------------------------
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('NEXOSS', 18, 16);

    if (options.showStoreAddress) {
      ctx.fillStyle = '#64748b';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('Ubicación no configurada • Cdad. Sede no configurada, Sede no configurada', 18, 44);
    }

    // PREDOMINANT TALLA
    const tallaVal = product.talla || '--';
    const tallaBoxWidth = 150;
    const tallaBoxHeight = 56;
    const tallaBoxX = width - 18 - tallaBoxWidth;
    const tallaBoxY = 14;

    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    drawRoundedRect(ctx, tallaBoxX, tallaBoxY, tallaBoxWidth, tallaBoxHeight, 8);
    ctx.fill();

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TALLA', tallaBoxX + tallaBoxWidth / 2, tallaBoxY + 6);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 32px monospace';
    ctx.fillText(tallaVal, tallaBoxX + tallaBoxWidth / 2, tallaBoxY + 20);

    // Shoe title & details
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(fitText(ctx, product.nombre.toUpperCase(), tallaBoxX - 25), 18, 70);

    ctx.fillStyle = '#334155';
    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const details = `${product.marca || ''} • ${product.tipo || ''} | ${product.color || ''}`.trim();
    ctx.fillText(fitText(ctx, details, width - 36), 18, 98);

    // Available Sizes Row
    let curY = 126;
    if (showSizes) {
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('TALLAS DISP. EN ESTE ESTILO:', 18, curY);

      let chipX = 18;
      const chipY = curY + 16;
      const chipHeight = 24;

      availableSizesList.slice(0, 10).forEach((sz) => {
        ctx.font = 'bold 13px monospace';
        const txtW = ctx.measureText(sz).width;
        const chipW = Math.max(28, txtW + 12);
        if (chipX + chipW > width - 18) return;

        const isCurrent = sz.trim() === product.talla.trim();
        if (isCurrent) {
          ctx.fillStyle = '#090d16';
          ctx.beginPath();
          drawRoundedRect(ctx, chipX, chipY, chipW, chipHeight, 5);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.fillText(sz, chipX + chipW / 2, chipY + 4);
        } else {
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          drawRoundedRect(ctx, chipX, chipY, chipW, chipHeight, 5);
          ctx.fill();
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = '#334155';
          ctx.textAlign = 'center';
          ctx.fillText(sz, chipX + chipW / 2, chipY + 4);
        }
        chipX += chipW + 6;
      });

      curY = chipY + chipHeight + 14;
    }

    // Barcode Section
    if (options.showBarcode) {
      drawBarcode(ctx, barcodeValue, width / 2, curY, width - 80, 48);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`Código: ${barcodeValue}`, width / 2, curY + 54);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`SKU: ${product.sku}`, width / 2, curY + 20);
    }

    // Bottom Section: Cost & Giant Price
    const bottomY = height - 80;

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(18, bottomY - 8);
    ctx.lineTo(width - 18, bottomY - 8);
    ctx.stroke();

    if (options.showCost) {
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('COSTO COMPRA', 18, bottomY + 2);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(`$${product.costo.toFixed(2)}`, 18, bottomY + 20);

      const costBs = product.costo * options.exchangeRate;
      ctx.fillStyle = '#64748b';
      ctx.font = '11px monospace';
      ctx.fillText(`≈ ${costBs.toFixed(0)} Bs`, 18, bottomY + 46);
    }

    if (options.showPrice) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('PVP VENTA', width - 18, bottomY + 2);

      ctx.fillStyle = '#090d16';
      ctx.font = '900 40px monospace';
      ctx.fillText(`$${product.precio.toFixed(2)}`, width - 18, bottomY + 18);

      if (options.showBsPrice) {
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(
          `${priceBs.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Bs`,
          width - 18,
          bottomY + 54
        );
      }
    }
  }

  return canvas;
}

/**
 * Downloads the generated shoe label image to the user's computer.
 */
export function downloadLabelImage(
  product: ShoeProduct,
  options: LabelOptions,
  formatType: 'png' | 'jpeg' = 'png'
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const canvas = renderLabelToCanvas(product, options);
      const mimeType = formatType === 'jpeg' ? 'image/jpeg' : 'image/png';
      const extension = formatType === 'jpeg' ? 'jpg' : 'png';
      const sizeLabel =
        options.format === 'thermal_40x20'
          ? '40x20mm'
          : options.format === 'thermal_40x25'
          ? '40x25mm'
          : options.format === 'thermal_50x15'
          ? '50x15mm'
          : options.format === 'thermal_50x30'
          ? '50x30mm'
          : options.format === 'thermal_50x70'
          ? '50x70mm'
          : options.format === 'custom'
          ? `${options.customWidthMm || 40}x${options.customHeightMm || 20}mm`
          : options.format;

      const dataUrl = canvas.toDataURL(mimeType, 0.98);
      const link = document.createElement('a');
      link.download = `etiqueta-${sizeLabel}-${product.sku.replace(/[^a-zA-Z0-9_-]/g, '')}.${extension}`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      resolve(true);
    } catch (err) {
      console.error('Error generating label image:', err);
      resolve(false);
    }
  });
}
