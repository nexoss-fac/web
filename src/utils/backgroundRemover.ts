/**
 * Utility for intelligent background removal and studio white background creation.
 * Optimized for shoe and product photography in NEXOSS.
 */

/**
 * Loads an image from a URL or base64 Data URL safely into an HTMLImageElement
 */
export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error('No se pudo cargar la imagen: ' + err));
    img.src = src;
  });
}

/**
 * Downloads an image directly to the user's computer or phone
 */
export function downloadImage(dataUrl: string, filename: string) {
  try {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Error al descargar imagen:', err);
    // Fallback for some restricted browsers
    window.open(dataUrl, '_blank');
  }
}

/**
 * Attempts to remove background using server-side Gemini AI with timeout.
 * Returns null if not available, timing out, or failing.
 */
async function tryGeminiBackgroundRemoval(imageBase64: string, timeoutMs = 6000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch('/api/ai/remove-background', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ imageBase64 }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.imageBase64) {
        return data.imageBase64;
      }
    }
  } catch (err) {
    // Graceful fallback to client-side canvas engine
  }
  return null;
}

/**
 * High-performance client-side Canvas background removal & studio white background engine.
 * Uses perimeter seed flood-fill with edge gradient barrier protection so white shoes/laces
 * are never erased, and renders a realistic studio contact shadow under the sole.
 */
export async function removeBackgroundClientCanvas(imageSrc: string): Promise<string> {
  const img = await loadImageElement(imageSrc);

  // Optimal resolution for processing: keep max dimension ~1200px
  let width = img.naturalWidth || img.width || 800;
  let height = img.naturalHeight || img.height || 800;
  const maxDim = 1200;
  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  // Work canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return imageSrc;

  ctx.drawImage(img, 0, 0, width, height);
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const totalPixels = width * height;

  // 1. Compute perimeter background color profile (Top, Bottom, Left, Right)
  const bgSamples: [number, number, number][] = [];
  const borderMargin = Math.max(3, Math.floor(Math.min(width, height) * 0.025));

  for (let x = 0; x < width; x += 4) {
    for (let y = 0; y < borderMargin; y++) {
      const idx = (y * width + x) * 4;
      bgSamples.push([data[idx], data[idx + 1], data[idx + 2]]);
    }
    for (let y = height - borderMargin; y < height; y++) {
      const idx = (y * width + x) * 4;
      bgSamples.push([data[idx], data[idx + 1], data[idx + 2]]);
    }
  }

  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < borderMargin; x++) {
      const idx = (y * width + x) * 4;
      bgSamples.push([data[idx], data[idx + 1], data[idx + 2]]);
    }
    for (let x = width - borderMargin; x < width; x++) {
      const idx = (y * width + x) * 4;
      bgSamples.push([data[idx], data[idx + 1], data[idx + 2]]);
    }
  }

  let avgR = 0, avgG = 0, avgB = 0;
  for (const [r, g, b] of bgSamples) {
    avgR += r;
    avgG += g;
    avgB += b;
  }
  avgR /= bgSamples.length;
  avgG /= bgSamples.length;
  avgB /= bgSamples.length;

  // Color distance helper
  const colorDist = (r: number, g: number, b: number, tr: number, tg: number, tb: number): number => {
    const dr = r - tr;
    const dg = g - tg;
    const db = b - tb;
    // Perceptual weighting: human eye is more sensitive to green
    return Math.sqrt(0.299 * dr * dr + 0.587 * dg * dg + 0.114 * db * db);
  };

  // 2. Multi-seed perimeter flood-fill to identify outer background
  // 0 = unvisited, 1 = background, 2 = foreground (shoe)
  const pixelStatus = new Uint8Array(totalPixels);
  const queue: Int32Array = new Int32Array(totalPixels);
  let qHead = 0;
  let qTail = 0;

  // Adaptive threshold based on background variation
  let diffSum = 0;
  for (const [r, g, b] of bgSamples) {
    diffSum += colorDist(r, g, b, avgR, avgG, avgB);
  }
  const avgBgVar = diffSum / bgSamples.length;
  const floodThreshold = Math.max(22, Math.min(52, avgBgVar * 2.1));

  // Seed all perimeter pixels
  for (let x = 0; x < width; x++) {
    // Top border
    queue[qTail++] = x;
    pixelStatus[x] = 1;
    // Bottom border
    const bIdx = (height - 1) * width + x;
    queue[qTail++] = bIdx;
    pixelStatus[bIdx] = 1;
  }
  for (let y = 1; y < height - 1; y++) {
    // Left border
    const lIdx = y * width;
    queue[qTail++] = lIdx;
    pixelStatus[lIdx] = 1;
    // Right border
    const rIdx = y * width + (width - 1);
    queue[qTail++] = rIdx;
    pixelStatus[rIdx] = 1;
  }

  // Flood fill algorithm
  while (qHead < qTail) {
    const curr = queue[qHead++];
    const cx = curr % width;
    const cy = Math.floor(curr / width);
    const cIdx = curr * 4;
    const cr = data[cIdx];
    const cg = data[cIdx + 1];
    const cb = data[cIdx + 2];

    // 4-neighborhood
    const neighbors = [
      cx > 0 ? curr - 1 : -1,
      cx < width - 1 ? curr + 1 : -1,
      cy > 0 ? curr - width : -1,
      cy < height - 1 ? curr + width : -1,
    ];

    for (const n of neighbors) {
      if (n === -1 || pixelStatus[n] !== 0) continue;

      const nIdx = n * 4;
      const nr = data[nIdx];
      const ng = data[nIdx + 1];
      const nb = data[nIdx + 2];

      // Distance to average background AND step distance from current pixel
      const distToBg = colorDist(nr, ng, nb, avgR, avgG, avgB);
      const stepDist = colorDist(nr, ng, nb, cr, cg, cb);

      // If it looks like background and transition isn't an edge barrier
      if (distToBg < floodThreshold && stepDist < 36) {
        pixelStatus[n] = 1; // background
        queue[qTail++] = n;
      }
    }
  }

  // 3. Mark foreground and compute shoe bounding box
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (pixelStatus[idx] !== 1) {
        // Pixel is NOT background, it is the shoe!
        pixelStatus[idx] = 2; // foreground
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Safety check: If flood-fill failed to find shoe or isolated too much, fallback gracefully
  if (maxX <= minX || maxY <= minY || (maxX - minX) < width * 0.15) {
    minX = Math.round(width * 0.08);
    maxX = Math.round(width * 0.92);
    minY = Math.round(height * 0.12);
    maxY = Math.round(height * 0.88);
  }

  // Keep generous safety margins around the detected shoe. The previous exact bounding-box
  // crop could clip the toe, heel, sole or laces when segmentation touched the edge.
  const padX = Math.max(24, Math.round((maxX - minX + 1) * 0.10));
  const padY = Math.max(24, Math.round((maxY - minY + 1) * 0.10));
  minX = Math.max(0, minX - padX);
  maxX = Math.min(width - 1, maxX + padX);
  minY = Math.max(0, minY - padY);
  maxY = Math.min(height - 1, maxY + padY);

  const rawShoeWidth = Math.max(10, maxX - minX + 1);
  const rawShoeHeight = Math.max(10, maxY - minY + 1);

  // 4. Extract Cutout Shoe to Isolated Canvas with Smooth Edge Anti-Aliasing
  const cutoutCanvas = document.createElement('canvas');
  cutoutCanvas.width = rawShoeWidth;
  cutoutCanvas.height = rawShoeHeight;
  const cutoutCtx = cutoutCanvas.getContext('2d');
  if (!cutoutCtx) return imageSrc;

  const cutoutImgData = cutoutCtx.createImageData(rawShoeWidth, rawShoeHeight);
  const cutoutData = cutoutImgData.data;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const srcIdx = y * width + x;
      const srcPixel = srcIdx * 4;

      const destX = x - minX;
      const destY = y - minY;
      const destPixel = (destY * rawShoeWidth + destX) * 4;

      if (pixelStatus[srcIdx] === 2) {
        let fgCount = 0;
        if (x > 0 && pixelStatus[srcIdx - 1] === 2) fgCount++;
        if (x < width - 1 && pixelStatus[srcIdx + 1] === 2) fgCount++;
        if (y > 0 && pixelStatus[srcIdx - width] === 2) fgCount++;
        if (y < height - 1 && pixelStatus[srcIdx + width] === 2) fgCount++;

        const alpha = fgCount === 4 ? 255 : Math.round(((fgCount / 4) * 0.7 + 0.3) * 255);

        cutoutData[destPixel] = data[srcPixel];
        cutoutData[destPixel + 1] = data[srcPixel + 1];
        cutoutData[destPixel + 2] = data[srcPixel + 2];
        cutoutData[destPixel + 3] = alpha;
      } else {
        cutoutData[destPixel + 3] = 0;
      }
    }
  }
  cutoutCtx.putImageData(cutoutImgData, 0, 0);

  // 5. Create Pro Studio Cyclorama Output Canvas (Matching Reference Aesthetic)
  const outW = 1200;
  const outH = 900;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return imageSrc;

  // Seamless Studio Cyclorama Background (#F4F6F8 with soft key-light highlight)
  const bgGrad = outCtx.createRadialGradient(
    outW * 0.5, outH * 0.38, 0,
    outW * 0.5, outH * 0.38, outW * 0.72
  );
  bgGrad.addColorStop(0, '#FFFFFF');
  bgGrad.addColorStop(0.45, '#FAFCFE');
  bgGrad.addColorStop(0.82, '#F4F6F8');
  bgGrad.addColorStop(1, '#ECEFF2');
  outCtx.fillStyle = bgGrad;
  outCtx.fillRect(0, 0, outW, outH);

  // 6. Optimal Shoe Framing & Grounding (Profile Centering matching Adidas & Amazon specs)
  const maxAllowedW = outW * 0.82;
  const maxAllowedH = outH * 0.65;
  const scale = Math.min(maxAllowedW / rawShoeWidth, maxAllowedH / rawShoeHeight);

  const finalW = Math.round(rawShoeWidth * scale);
  const finalH = Math.round(rawShoeHeight * scale);
  const finalX = Math.round((outW - finalW) / 2);

  // Ground plane: sole/cleats rest naturally at ~77% of canvas height
  const groundY = Math.round(outH * 0.77);
  const finalY = groundY - finalH;

  // 7. REALISTIC STUDIO CONTACT SHADOW (Sombra Real de Estudio)
  outCtx.save();

  // A) Ambient Diffuse Ground Shadow (Sombra difusa amplia que ancla el zapato)
  const ambShadowW = finalW * 0.90;
  const ambShadowH = Math.max(16, Math.min(42, finalH * 0.10));
  const ambGrad = outCtx.createRadialGradient(
    outW / 2, groundY + 4, 0,
    outW / 2, groundY + 4, ambShadowW / 2
  );
  ambGrad.addColorStop(0, 'rgba(40, 44, 52, 0.24)');
  ambGrad.addColorStop(0.38, 'rgba(50, 55, 65, 0.13)');
  ambGrad.addColorStop(0.72, 'rgba(70, 75, 85, 0.04)');
  ambGrad.addColorStop(1, 'rgba(244, 246, 248, 0)');

  outCtx.beginPath();
  outCtx.ellipse(outW / 2, groundY + 4, ambShadowW / 2, ambShadowH / 2, 0, 0, Math.PI * 2);
  outCtx.fillStyle = ambGrad;
  outCtx.fill();

  // B) Direct Contact Occlusion Shadow (Sombra de contacto oscura bajo la suela)
  const contactW = finalW * 0.76;
  const contactH = Math.max(6, Math.min(18, finalH * 0.038));
  const contactGrad = outCtx.createRadialGradient(
    outW / 2, groundY + 1, 0,
    outW / 2, groundY + 1, contactW / 2
  );
  contactGrad.addColorStop(0, 'rgba(30, 34, 42, 0.48)');
  contactGrad.addColorStop(0.45, 'rgba(35, 40, 50, 0.22)');
  contactGrad.addColorStop(0.85, 'rgba(45, 50, 60, 0.05)');
  contactGrad.addColorStop(1, 'rgba(244, 246, 248, 0)');

  outCtx.beginPath();
  outCtx.ellipse(outW / 2, groundY + 1, contactW / 2, contactH / 2, 0, 0, Math.PI * 2);
  outCtx.fillStyle = contactGrad;
  outCtx.fill();

  // C) Heel & Forefoot Weight Contact Accents
  const heelX = finalX + finalW * 0.22;
  const forefootX = finalX + finalW * 0.78;
  const accentRadius = Math.max(16, finalW * 0.10);

  const heelGrad = outCtx.createRadialGradient(heelX, groundY + 1, 0, heelX, groundY + 1, accentRadius);
  heelGrad.addColorStop(0, 'rgba(30, 34, 42, 0.32)');
  heelGrad.addColorStop(1, 'rgba(244, 246, 248, 0)');
  outCtx.beginPath();
  outCtx.ellipse(heelX, groundY + 1, accentRadius, contactH * 0.8, 0, 0, Math.PI * 2);
  outCtx.fillStyle = heelGrad;
  outCtx.fill();

  const ffGrad = outCtx.createRadialGradient(forefootX, groundY + 1, 0, forefootX, groundY + 1, accentRadius);
  ffGrad.addColorStop(0, 'rgba(30, 34, 42, 0.26)');
  ffGrad.addColorStop(1, 'rgba(244, 246, 248, 0)');
  outCtx.beginPath();
  outCtx.ellipse(forefootX, groundY + 1, accentRadius, contactH * 0.8, 0, 0, Math.PI * 2);
  outCtx.fillStyle = ffGrad;
  outCtx.fill();

  outCtx.restore();

  // 8. Render Shoe Foreground Cutout with High-Fidelity Smoothing
  outCtx.save();
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.drawImage(cutoutCanvas, finalX, finalY, finalW, finalH);
  outCtx.restore();

  return outCanvas.toDataURL('image/jpeg', 0.92);
}

/**
 * Main function: Removes background and returns photo with pure white studio background.
 * Tries server-side Gemini first, then falls back instantly to client-side canvas.
 */
export async function removeBackgroundToWhite(imageSrc: string): Promise<string> {
  if (!imageSrc || imageSrc.length < 50) return imageSrc;

  // Try server-side Gemini AI (if available and fast)
  const geminiResult = await tryGeminiBackgroundRemoval(imageSrc, 5000);
  if (geminiResult) {
    return geminiResult;
  }

  // High-fidelity client canvas fallback
  return removeBackgroundClientCanvas(imageSrc);
}

/**
 * Generates an ultra-crisp 1080x1080 Instagram Post image card with pure white background,
 * product branding, price, and store info ready for download.
 */
export async function createInstagramPostImage(
  imageSrc: string,
  options: {
    nombre: string;
    marca?: string;
    precioUsd: number;
    exchangeRate: number;
    tallas?: string[];
  }
): Promise<string> {
  const postSize = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = postSize;
  canvas.height = postSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return imageSrc;

  // 1. Pure White / Premium Studio Gradient Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, postSize, postSize);

  // Subtle aesthetic soft vignette at the bottom
  const bgGrad = ctx.createLinearGradient(0, 0, 0, postSize);
  bgGrad.addColorStop(0, '#FFFFFF');
  bgGrad.addColorStop(0.85, '#FFFFFF');
  bgGrad.addColorStop(1, '#F8FAFC');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, postSize, postSize);

  // 2. Top Header Bar: Store Branding & Collection Badge
  // Store Logo
  ctx.fillStyle = '#0F172A';
  ctx.font = '900 38px system-ui, -apple-system, sans-serif';
  ctx.fillText('NEXOSS', 54, 78);

  ctx.fillStyle = '#64748B';
  ctx.font = '600 16px system-ui, -apple-system, sans-serif';
  ctx.fillText('EXCLUSIVE SNEAKERS & STREETWEAR', 54, 104);

  // "NUEVA COLECCIÓN" Pill
  const pillText = '🔥 NUEVO INGRESO';
  ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
  const pillWidth = ctx.measureText(pillText).width + 32;
  const pillX = postSize - 54 - pillWidth;
  const pillY = 56;

  ctx.fillStyle = '#0F172A';
  roundRect(ctx, pillX, pillY, pillWidth, 38, 19);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(pillText, pillX + 16, pillY + 24);

  // 3. Center: Product Photo with studio shadow
  try {
    const productImg = await loadImageElement(imageSrc);

    // Calculate aspect ratio containment within a 780x560 box
    const maxBoxW = 860;
    const maxBoxH = 580;
    let drawW = productImg.naturalWidth || 600;
    let drawH = productImg.naturalHeight || 400;

    const scale = Math.min(maxBoxW / drawW, maxBoxH / drawH);
    drawW = drawW * scale;
    drawH = drawH * scale;

    const drawX = (postSize - drawW) / 2;
    const drawY = 160 + (maxBoxH - drawH) / 2;

    // Contact shadow
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(postSize / 2, drawY + drawH - 12, drawW * 0.42, 22, 0, 0, Math.PI * 2);
    const shadowGrad = ctx.createRadialGradient(
      postSize / 2, drawY + drawH - 12, 0,
      postSize / 2, drawY + drawH - 12, drawW * 0.42
    );
    shadowGrad.addColorStop(0, 'rgba(15, 23, 42, 0.16)');
    shadowGrad.addColorStop(0.6, 'rgba(15, 23, 42, 0.05)');
    shadowGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.fill();
    ctx.restore();

    // Draw the clean product image
    ctx.drawImage(productImg, drawX, drawY, drawW, drawH);
  } catch (err) {
    console.warn('Could not draw product image onto canvas:', err);
  }

  // 4. Bottom Information Card
  const cardY = 780;
  const cardH = 240;
  const cardMargin = 54;
  const cardW = postSize - cardMargin * 2;

  // Background card with subtle border
  ctx.fillStyle = '#F8FAFC';
  roundRect(ctx, cardMargin, cardY, cardW, cardH, 28);
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 2;
  roundRect(ctx, cardMargin, cardY, cardW, cardH, 28);
  ctx.stroke();

  // Brand / Category Tag
  const brandName = (options.marca || 'SNEAKERS').toUpperCase();
  ctx.fillStyle = '#4F46E5';
  ctx.font = '800 15px system-ui, -apple-system, sans-serif';
  ctx.fillText(brandName, cardMargin + 28, cardY + 44);

  // Product Name
  ctx.fillStyle = '#0F172A';
  ctx.font = '900 30px system-ui, -apple-system, sans-serif';
  let titleText = options.nombre || 'Calzado Deportivo';
  if (titleText.length > 32) {
    titleText = titleText.substring(0, 30) + '...';
  }
  ctx.fillText(titleText, cardMargin + 28, cardY + 84);

  // Available Sizes if present
  if (options.tallas && options.tallas.length > 0) {
    ctx.fillStyle = '#64748B';
    ctx.font = '600 16px system-ui, -apple-system, sans-serif';
    ctx.fillText(`Tallas disponibles: ${options.tallas.join(' • ')}`, cardMargin + 28, cardY + 120);
  } else {
    ctx.fillStyle = '#64748B';
    ctx.font = '600 16px system-ui, -apple-system, sans-serif';
    ctx.fillText('Calidad 100% Garantizada • Horma estándar', cardMargin + 28, cardY + 120);
  }

  // Delivery / Location Footer
  ctx.fillStyle = '#047857';
  ctx.font = '700 15px system-ui, -apple-system, sans-serif';
  ctx.fillText('📍 Ubicación no configurada (Sede no configurada)   •   🚚 Envíos a toda Venezuela (Zoom/MRW)', cardMargin + 28, cardY + 168);

  // Price Badge (Right Side)
  const priceUsd = Number(options.precioUsd) || 0;
  const priceBs = priceUsd * (Number(options.exchangeRate) || 0);

  const priceBadgeW = 260;
  const priceBadgeH = 110;
  const priceBadgeX = cardMargin + cardW - priceBadgeW - 24;
  const priceBadgeY = cardY + 28;

  ctx.fillStyle = '#0F172A';
  roundRect(ctx, priceBadgeX, priceBadgeY, priceBadgeW, priceBadgeH, 20);
  ctx.fill();

  ctx.fillStyle = '#F8FAFC';
  ctx.font = '900 38px system-ui, -apple-system, sans-serif';
  ctx.fillText(`$${priceUsd.toFixed(2)}`, priceBadgeX + 24, priceBadgeY + 52);

  if (priceBs > 0) {
    ctx.fillStyle = '#34D399';
    ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
    ctx.fillText(`Bs. ${priceBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, priceBadgeX + 24, priceBadgeY + 86);
  }

  // 5. Watermark / Instagram CTA at the very bottom
  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
  ctx.fillText('PEDIDOS POR WHATSAPP & DIRECT  •  @NEXOSS_SHOP', 54, postSize - 22);

  return canvas.toDataURL('image/png');
}

/**
 * Helper to draw a rounded rectangle on a 2D canvas context
 */
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
