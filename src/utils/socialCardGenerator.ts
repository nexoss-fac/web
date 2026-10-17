/**
 * High-Resolution Social Card Generator for NEXOSS.
 * Generates downloadable 1080x1080 (Square Feed) and 1080x1920 (Story 9:16)
 * cards matching the exact athletic editorial style with white studio shoe background.
 */

import { loadImageElement, downloadImage } from './backgroundRemover';

interface SocialCardShoe {
  nombre: string;
  marca?: string;
  precio: number;
  talla?: string | number;
  imagen?: string;
  sku?: string;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Wraps text into lines that fit within maxWidth
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Generates the full social card image as a PNG data URL.
 */
export async function generateSocialCardImage(
  shoe: SocialCardShoe,
  exchangeRate: number,
  format: 'square' | 'story' = 'square'
): Promise<string> {
  const isSquare = format === 'square';
  const width = 1080;
  const height = isSquare ? 1080 : 1920;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo inicializar el lienzo gráfico.');

  // Outer padding from canvas edge to the card
  const outerPad = isSquare ? 36 : 48;
  const cardX = outerPad;
  const cardY = outerPad;
  const cardW = width - outerPad * 2;
  const cardH = height - outerPad * 2;
  const cardRadius = 44;

  // 1. Clear background & draw outer card background
  // Deep black / slate base
  ctx.fillStyle = '#030712';
  ctx.fillRect(0, 0, width, height);

  // Clip everything inside the rounded card
  ctx.save();
  roundRect(ctx, cardX, cardY, cardW, cardH, cardRadius);
  ctx.clip();

  // Card gradient
  const bgGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
  bgGrad.addColorStop(0, '#060B15');
  bgGrad.addColorStop(0.5, '#020617');
  bgGrad.addColorStop(1, '#050914');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(cardX, cardY, cardW, cardH);

  // 2. Three angled Adidas/Sport stripes in the upper-right corner
  ctx.save();
  ctx.translate(cardX + cardW - 140, cardY);
  ctx.transform(1, 0, -0.36, 1, 0, 0); // skew angle ~20deg
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  const stripeW = 34;
  const stripeGap = 24;
  const stripeH = cardH;
  ctx.fillRect(0, 0, stripeW, stripeH);
  ctx.fillRect(stripeW + stripeGap, 0, stripeW, stripeH);
  ctx.fillRect((stripeW + stripeGap) * 2, 0, stripeW, stripeH);
  ctx.restore();

  // Content inner margins
  const contentPad = isSquare ? 42 : 54;
  const innerX = cardX + contentPad;
  const innerW = cardW - contentPad * 2;

  // 3. Top Header: Cyan Label + Brand Badge Pill
  const headerY = cardY + (isSquare ? 46 : 68);

  // Brand Badge (Top Right)
  const brandText = (shoe.marca || 'ORIGINAL').toUpperCase();
  ctx.font = '900 18px system-ui, -apple-system, sans-serif';
  const brandMetrics = ctx.measureText(brandText);
  const brandPillW = Math.max(100, brandMetrics.width + 36);
  const brandPillH = 40;
  const brandPillX = innerX + innerW - brandPillW;
  const brandPillY = headerY - 6;

  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, brandPillX, brandPillY, brandPillW, brandPillH, 12);
  ctx.fill();

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(brandText, brandPillX + brandPillW / 2, brandPillY + brandPillH / 2 + 1);

  // Cyan Label (Top Left)
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#22D3EE'; // Cyan 400
  ctx.font = '900 16px system-ui, -apple-system, sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText('NEXOSS • DROP EXCLUSIVO', innerX, headerY + 12);
  ctx.letterSpacing = '0px';

  // Product Name (White Uppercase)
  ctx.fillStyle = '#FFFFFF';
  const titleFontSize = isSquare ? 32 : 40;
  ctx.font = `900 ${titleFontSize}px system-ui, -apple-system, sans-serif`;
  const maxTitleW = brandPillX - innerX - 24;
  const titleLines = wrapText(ctx, (shoe.nombre || 'CALZADO DEPORTIVO').toUpperCase(), maxTitleW);

  let currentTitleY = headerY + 52;
  for (let i = 0; i < Math.min(titleLines.length, 2); i++) {
    ctx.fillText(titleLines[i], innerX, currentTitleY);
    currentTitleY += titleFontSize + 8;
  }

  // 4. Center Shoe Container (Pure White Studio Backdrop matching the user's capture)
  // Calculate vertical space
  const bottomCardH = isSquare ? 186 : 240;
  const bottomMargin = isSquare ? 38 : 54;
  const bottomCardY = cardY + cardH - bottomCardH - bottomMargin;

  const shoeBoxY = currentTitleY + 14;
  const shoeBoxH = bottomCardY - shoeBoxY - 24;
  const shoeBoxX = innerX;
  const shoeBoxW = innerW;
  const shoeBoxRadius = 30;

  // Dark background frame with border
  ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
  roundRect(ctx, shoeBoxX, shoeBoxY, shoeBoxW, shoeBoxH, shoeBoxRadius);
  ctx.fill();
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Inner PURE WHITE Studio Box (as requested: "con ese mismo estilo de la foto del zapato que subí en el capture")
  const whitePad = 12;
  const whiteX = shoeBoxX + whitePad;
  const whiteY = shoeBoxY + whitePad;
  const whiteW = shoeBoxW - whitePad * 2;
  const whiteH = shoeBoxH - whitePad * 2;
  const whiteRadius = shoeBoxRadius - 8;

  ctx.save();
  roundRect(ctx, whiteX, whiteY, whiteW, whiteH, whiteRadius);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.clip();

  // Subtle studio light vignette
  const studioLight = ctx.createRadialGradient(
    whiteX + whiteW / 2,
    whiteY + whiteH * 0.45,
    20,
    whiteX + whiteW / 2,
    whiteY + whiteH * 0.45,
    whiteW * 0.7
  );
  studioLight.addColorStop(0, '#FFFFFF');
  studioLight.addColorStop(0.85, '#FFFFFF');
  studioLight.addColorStop(1, '#F1F5F9');
  ctx.fillStyle = studioLight;
  ctx.fillRect(whiteX, whiteY, whiteW, whiteH);

  // Draw Shoe Image inside the white studio box
  if (shoe.imagen) {
    try {
      const img = await loadImageElement(shoe.imagen);
      const imgNaturalW = img.naturalWidth || 600;
      const imgNaturalH = img.naturalHeight || 400;

      // Fit shoe neatly with margin
      const maxImgW = whiteW * 0.88;
      const maxImgH = whiteH * 0.84;
      const scale = Math.min(maxImgW / imgNaturalW, maxImgH / imgNaturalH);
      const drawW = imgNaturalW * scale;
      const drawH = imgNaturalH * scale;

      const drawX = whiteX + (whiteW - drawW) / 2;
      const drawY = whiteY + (whiteH - drawH) / 2 - (whiteH * 0.02);

      // Studio floor contact shadow
      ctx.save();
      ctx.beginPath();
      const shadowCx = whiteX + whiteW / 2;
      const shadowCy = drawY + drawH - (drawH * 0.04);
      const shadowRx = drawW * 0.45;
      const shadowRy = Math.max(10, drawH * 0.07);
      ctx.ellipse(shadowCx, shadowCy, shadowRx, shadowRy, 0, 0, Math.PI * 2);

      const shadowGrad = ctx.createRadialGradient(
        shadowCx, shadowCy, 0,
        shadowCx, shadowCy, shadowRx
      );
      shadowGrad.addColorStop(0, 'rgba(15, 23, 42, 0.22)');
      shadowGrad.addColorStop(0.5, 'rgba(15, 23, 42, 0.08)');
      shadowGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = shadowGrad;
      ctx.fill();
      ctx.restore();

      // Render shoe
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    } catch (err) {
      console.warn('Error loading shoe image for social card:', err);
    }
  }
  ctx.restore(); // end clip white box

  // 5. Bottom Card Container: Price, Size, Store Address & Shipping
  ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
  roundRect(ctx, innerX, bottomCardY, innerW, bottomCardH, 28);
  ctx.fill();
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Inner padding for bottom card
  const bPadX = 28;
  const bPadY = 24;

  // Price USD
  const priceNum = Number(shoe.precio) || 0;
  const priceBsNum = priceNum * exchangeRate;
  const priceStr = `$${priceNum.toFixed(2)}`;

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 42px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const priceTopY = bottomCardY + (isSquare ? 48 : 64);
  ctx.fillText(priceStr, innerX + bPadX, priceTopY);

  const priceMetrics = ctx.measureText(priceStr);

  // Price Bs.
  ctx.fillStyle = '#94A3B8'; // Slate 400
  ctx.font = '600 20px "SF Mono", Menlo, Consolas, monospace';
  const bsText = `Bs. ${priceBsNum.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  ctx.fillText(bsText, innerX + bPadX + priceMetrics.width + 18, priceTopY);

  // Size Tag (Right side)
  const sizeText = `TALLA: ${shoe.talla || '37'}`.toUpperCase();
  ctx.fillStyle = '#34D399'; // Emerald 400
  ctx.font = '900 18px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(sizeText, innerX + innerW - bPadX, priceTopY);

  // Divider line
  const dividerY = priceTopY + (isSquare ? 38 : 52);
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(innerX + bPadX, dividerY);
  ctx.lineTo(innerX + innerW - bPadX, dividerY);
  ctx.stroke();

  // Footer Store & Shipping info
  const footerY = dividerY + (isSquare ? 28 : 42);
  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 16px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('📍 Sede no configurada, Sede no configurada ', innerX + bPadX, footerY);

  ctx.textAlign = 'right';
  ctx.fillText('🚚 Envíos a todo el país', innerX + innerW - bPadX, footerY);

  ctx.restore(); // end outer card clip

  // 6. Outer Border of the Card
  ctx.strokeStyle = '#334155'; // Slate 700 border
  ctx.lineWidth = 4;
  roundRect(ctx, cardX, cardY, cardW, cardH, cardRadius);
  ctx.stroke();

  return canvas.toDataURL('image/png', 0.96);
}

/**
 * Convenience helper to generate and automatically trigger the download
 */
export async function downloadSocialCard(
  shoe: SocialCardShoe,
  exchangeRate: number,
  format: 'square' | 'story' = 'square'
): Promise<void> {
  const dataUrl = await generateSocialCardImage(shoe, exchangeRate, format);
  const slug = (shoe.nombre || 'calzado')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const filename = `nexoss-demo-${slug}-${format}.png`;
  downloadImage(dataUrl, filename);
}
