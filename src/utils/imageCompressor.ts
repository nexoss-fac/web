/**
 * Utility for client-side image compression and optimization.
 * Reduces file sizes from 10MB+ down to < 500KB (or customizable target)
 * while maintaining excellent visual fidelity for product displays and AI scanning.
 */

export interface CompressOptions {
  /** Maximum width or height in pixels. Default: 1280 */
  maxDimension?: number;
  /** Initial compression quality (0 to 1). Default: 0.82 */
  quality?: number;
  /** Maximum target size in bytes. Default: 600KB (614,400 bytes) */
  maxSizeBytes?: number;
  /** Target MIME type. Default: 'image/jpeg' */
  mimeType?: 'image/jpeg' | 'image/webp';
}

export interface CompressionResult {
  dataUrl: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  reductionPercentage: number;
}

/**
 * Formats a byte number into a human-readable string (KB, MB).
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Accurately estimates binary size in bytes of a Base64 data URL.
 */
export function estimateDataUrlSize(dataUrl: string): number {
  if (!dataUrl) return 0;
  const commaIdx = dataUrl.indexOf(',');
  const base64Str = commaIdx !== -1 ? dataUrl.substring(commaIdx + 1) : dataUrl;
  const padding = (base64Str.match(/=*$/) || [''])[0].length;
  return Math.floor((base64Str.length * 3) / 4) - padding;
}

/**
 * Loads an image from a Data URL or URL into an HTMLImageElement safely.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error('Error al cargar la imagen para compresión: ' + err));
    img.src = src;
  });
}

/**
 * Compresses an image Data URL to a target resolution and file size.
 * Performs iterative optimization if the file exceeds the requested size budget.
 */
export async function compressImageDataUrl(
  dataUrl: string,
  options: CompressOptions = {}
): Promise<CompressionResult> {
  const {
    maxDimension = 1280,
    quality = 0.82,
    maxSizeBytes = 600 * 1024, // 600 KB default target (well below 10MB)
    mimeType = 'image/jpeg',
  } = options;

  const originalSize = estimateDataUrlSize(dataUrl);

  try {
    const img = await loadImage(dataUrl);
    let originalWidth = img.naturalWidth || img.width;
    let originalHeight = img.naturalHeight || img.height;

    // Calculate scaled dimensions keeping aspect ratio
    let targetWidth = originalWidth;
    let targetHeight = originalHeight;

    if (targetWidth > maxDimension || targetHeight > maxDimension) {
      if (targetWidth > targetHeight) {
        targetHeight = Math.round((targetHeight * maxDimension) / targetWidth);
        targetWidth = maxDimension;
      } else {
        targetWidth = Math.round((targetWidth * maxDimension) / targetHeight);
        targetHeight = maxDimension;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { alpha: false });

    if (!ctx) {
      return {
        dataUrl,
        originalSize,
        compressedSize: originalSize,
        width: originalWidth,
        height: originalHeight,
        reductionPercentage: 0,
      };
    }

    // Use high quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Fill white background for JPEGs to prevent black backgrounds for transparent PNGs
    if (mimeType === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    let currentQuality = quality;
    let resultDataUrl = canvas.toDataURL(mimeType, currentQuality);
    let compressedSize = estimateDataUrlSize(resultDataUrl);

    // If still exceeds maxSizeBytes (or 10MB hard ceiling), iterate down quality & scale
    let iteration = 0;
    while (compressedSize > maxSizeBytes && currentQuality > 0.45 && iteration < 4) {
      iteration++;
      currentQuality -= 0.12;
      resultDataUrl = canvas.toDataURL(mimeType, Math.max(0.45, currentQuality));
      compressedSize = estimateDataUrlSize(resultDataUrl);
    }

    // If still too large, downscale canvas dimensions
    if (compressedSize > maxSizeBytes) {
      const halfCanvas = document.createElement('canvas');
      const scaleFactor = 0.75;
      halfCanvas.width = Math.round(targetWidth * scaleFactor);
      halfCanvas.height = Math.round(targetHeight * scaleFactor);
      const halfCtx = halfCanvas.getContext('2d', { alpha: false });
      if (halfCtx) {
        halfCtx.imageSmoothingEnabled = true;
        halfCtx.imageSmoothingQuality = 'high';
        if (mimeType === 'image/jpeg') {
          halfCtx.fillStyle = '#FFFFFF';
          halfCtx.fillRect(0, 0, halfCanvas.width, halfCanvas.height);
        }
        halfCtx.drawImage(canvas, 0, 0, halfCanvas.width, halfCanvas.height);
        resultDataUrl = halfCanvas.toDataURL(mimeType, 0.75);
        compressedSize = estimateDataUrlSize(resultDataUrl);
        targetWidth = halfCanvas.width;
        targetHeight = halfCanvas.height;
      }
    }

    const reductionPercentage =
      originalSize > 0 ? Math.max(0, Math.round(((originalSize - compressedSize) / originalSize) * 100)) : 0;

    return {
      dataUrl: resultDataUrl,
      originalSize,
      compressedSize,
      width: targetWidth,
      height: targetHeight,
      reductionPercentage,
    };
  } catch (err) {
    console.warn('Image compression fallback:', err);
    return {
      dataUrl,
      originalSize,
      compressedSize: originalSize,
      width: 0,
      height: 0,
      reductionPercentage: 0,
    };
  }
}

/**
 * Compresses a File object directly from an input or drag & drop.
 */
export async function compressImageFile(
  file: File,
  options: CompressOptions = {}
): Promise<CompressionResult> {
  const originalSize = file.size;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen'));
    reader.onload = async (e) => {
      const rawDataUrl = e.target?.result;
      if (typeof rawDataUrl !== 'string') {
        reject(new Error('Formato de imagen no válido'));
        return;
      }
      try {
        const result = await compressImageDataUrl(rawDataUrl, options);
        // Ensure original size comes from the actual File metadata if greater
        if (originalSize > result.originalSize) {
          result.originalSize = originalSize;
          result.reductionPercentage = Math.max(
            0,
            Math.round(((originalSize - result.compressedSize) / originalSize) * 100)
          );
        }
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsDataURL(file);
  });
}
