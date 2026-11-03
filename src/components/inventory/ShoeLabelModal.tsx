import React, { useState, useMemo } from 'react';
import {
  X,
  Printer,
  Tag,
  Sliders,
  Sparkles,
  Download,
  CheckCircle2,
  FileCheck,
  Layers
} from 'lucide-react';
import { ShoeProduct } from '../../types';
import { BarcodeSvg } from '../common/BarcodeSvg';
import {
  LabelFormat,
  downloadLabelImage,
  renderLabelToCanvas
} from '../../utils/labelImageGenerator';
import { printCanvasToMxw01 } from '../../utils/mxw01Bluetooth';

interface ShoeLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ShoeProduct | null;
  exchangeRate: number;
  allProducts?: ShoeProduct[];
}

export const ShoeLabelModal: React.FC<ShoeLabelModalProps> = ({
  isOpen,
  onClose,
  product,
  exchangeRate,
  allProducts = [],
}) => {
  const [copies, setCopies] = useState<number>(1);
  const [showCost, setShowCost] = useState<boolean>(true);
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showBsPrice, setShowBsPrice] = useState<boolean>(true);
  const [showBarcode, setShowBarcode] = useState<boolean>(true);
  const [showStoreAddress, setShowStoreAddress] = useState<boolean>(true);
  const [showAvailableSizes, setShowAvailableSizes] = useState<boolean>(true);
  const [labelFormat, setLabelFormat] = useState<LabelFormat>('thermal_40x20');
  const [customWidthMm, setCustomWidthMm] = useState(40);
  const [customHeightMm, setCustomHeightMm] = useState(20);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [printMessage, setPrintMessage] = useState<string | null>(null);

  // Calculate available sizes for this shoe style in inventory
  const availableSizes = useMemo(() => {
    if (!product) return [];
    const baseList = allProducts || [];
    const currentName = (product.nombre || '').trim().toLowerCase();
    const currentMarca = (product.marca || '').trim().toLowerCase();

    // Match by same name or same brand and style model
    const matching = baseList.filter((p) => {
      if (!p.activo || p.stock <= 0) return false;
      const pName = (p.nombre || '').trim().toLowerCase();
      const pMarca = (p.marca || '').trim().toLowerCase();
      if (pName === currentName) return true;
      if (
        currentMarca &&
        pMarca === currentMarca &&
        pName.split(' ')[0] === currentName.split(' ')[0]
      ) {
        return true;
      }
      return false;
    });

    const sizeSet = new Set<string>();
    // Always include current shoe's size
    if (product.talla && product.talla.trim()) {
      sizeSet.add(product.talla.trim());
    }
    matching.forEach((p) => {
      if (p.talla && p.talla.trim()) sizeSet.add(p.talla.trim());
    });

    return Array.from(sizeSet).sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  }, [product, allProducts]);

  const previewDataUrl = useMemo(() => {
    if (!product) return '';
    return renderLabelToCanvas(product, {
      format: labelFormat, showCost, showPrice, showBsPrice, showBarcode,
      showStoreAddress, exchangeRate, availableSizes, showAvailableSizes,
      customWidthMm, customHeightMm,
    }).toDataURL('image/png');
  }, [product, labelFormat, showCost, showPrice, showBsPrice, showBarcode, showStoreAddress, exchangeRate, availableSizes, showAvailableSizes, customWidthMm, customHeightMm]);

  if (!isOpen || !product) return null;

  const priceBs = product.precio * exchangeRate;
  const costBs = product.costo * exchangeRate;

  const handlePrint = async () => {
    if (!product || isPrinting) return;
    setIsPrinting(true);
    try {
      const canvas = renderLabelToCanvas(product, {
        format: labelFormat, showCost, showPrice, showBsPrice, showBarcode,
        showStoreAddress, exchangeRate, availableSizes, showAvailableSizes,
        customWidthMm, customHeightMm,
      });
      const dataUrl = canvas.toDataURL('image/png');
      const dimensions: Record<LabelFormat, [number, number]> = {
        thermal_40x20: [40, 20], thermal_40x25: [40, 25], thermal_50x15: [50, 15],
        thermal_50x30: [50, 30], thermal_50x70: [50, 70],
        custom: [customWidthMm, customHeightMm], hangtag: [40, 58], box: [55, 38],
      };
      const [widthMm, heightMm] = dimensions[labelFormat];
      const printWindow = window.open('', '_blank');
      if (!printWindow) throw new Error('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para NEXOSS.');
      const labels = Array.from({ length: Math.min(100, Math.max(1, copies)) }, () =>
        `<img class="label" src="${dataUrl}" alt="Etiqueta ${product.sku}" />`
      ).join('');
      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas NEXOSS</title><style>
        @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; width: ${widthMm}mm; background: #fff; }
        .label { display: block; width: ${widthMm}mm; height: ${heightMm}mm; object-fit: fill; page-break-after: always; break-after: page; }
        .label:last-child { page-break-after: auto; break-after: auto; }
        @media screen { body { padding: 12px; } .label { margin: 0 auto 12px; outline: 1px solid #ddd; } }
      </style></head><body>${labels}<script>window.onload = () => { window.focus(); window.print(); }; window.onafterprint = () => window.close();</script></body></html>`);
      printWindow.document.close();
    } catch (error) {
      setPrintMessage(error instanceof Error ? error.message : 'No se pudo preparar la impresión.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleBluetoothPrint = async () => {
    if (!product || isPrinting) return;
    setIsPrinting(true);
    setPrintMessage('Selecciona la impresora MXW01 en la ventana Bluetooth del navegador…');
    try {
      const canvas = renderLabelToCanvas(product, {
        format: labelFormat,
        showCost,
        showPrice,
        showBsPrice,
        showBarcode,
        showStoreAddress,
        exchangeRate,
        availableSizes,
        showAvailableSizes,
        customWidthMm,
        customHeightMm,
      });
      await printCanvasToMxw01(canvas, copies);
      setPrintMessage('Trabajo enviado a la MXW01. Verifica la etiqueta impresa.');
    } catch (error) {
      setPrintMessage(error instanceof Error ? error.message : 'No se pudo enviar la etiqueta a la impresora.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownload = async (format: 'png' | 'jpeg' = 'png') => {
    if (!product) return;
    setIsDownloading(true);

    const success = await downloadLabelImage(
      product,
      {
        format: labelFormat,
        showCost,
        showPrice,
        showBsPrice,
        showBarcode,
        showStoreAddress,
        exchangeRate,
        availableSizes,
        showAvailableSizes,
        customWidthMm,
        customHeightMm,
      },
      format
    );

    setIsDownloading(false);
    if (success) {
      const sizeLabel =
        labelFormat === 'thermal_40x20'
          ? '40×20mm'
          : labelFormat === 'thermal_40x25'
          ? '40×25mm'
          : labelFormat === 'thermal_50x30'
          ? '50×30mm'
          : 'etiqueta';
      setDownloadSuccess(`¡Imagen ${sizeLabel} (${format.toUpperCase()}) descargada con éxito!`);
      setTimeout(() => {
        setDownloadSuccess(null);
      }, 4000);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden my-4 sm:my-6 space-y-0">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-400 flex items-center justify-center">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">
                  Etiqueta para Calzado (Térmica 40×20 / 40×25mm)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Sin Bordes Negros • Talla y Precio Predominantes
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Lista para imprimir o descargar en imagen (PNG / JPG) para impresoras térmicas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Layout */}
        <div className="p-4 sm:p-6 space-y-4 text-xs max-h-[82vh] overflow-y-auto">
          
          {/* Success Download Banner */}
          {downloadSuccess && (
            <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-xl shadow-xs animate-in fade-in duration-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="text-xs font-semibold">{downloadSuccess}</div>
            </div>
          )}

          {/* Controls & Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            
            {/* Format & Copies */}
            <div className="space-y-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Tamaño y Formato de Etiqueta</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    ['thermal_40x20', '40 × 20 mm'],
                    ['thermal_40x25', '40 × 25 mm'],
                    ['thermal_50x15', '50 × 15 mm'],
                    ['thermal_50x30', '50 × 30 mm'],
                    ['thermal_50x70', '50 × 70 mm'],
                    ['custom', 'Personalizado'],
                  ].map(([format, title]) => (
                    <button key={format} type="button" onClick={() => setLabelFormat(format as LabelFormat)}
                      className={`min-h-[54px] rounded-xl border px-2 py-2 text-[11px] font-bold ${labelFormat === format ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
                      {title}
                    </button>
                  ))}
                </div>
                {labelFormat === 'custom' && (
                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border bg-indigo-50 p-3">
                    <label>Ancho (mm)<input type="number" min="20" max="100" value={customWidthMm} onChange={(e) => setCustomWidthMm(Math.min(100, Math.max(20, Number(e.target.value) || 20)))} className="mt-1 w-full rounded border p-2" /></label>
                    <label>Alto (mm)<input type="number" min="10" max="150" value={customHeightMm} onChange={(e) => setCustomHeightMm(Math.min(150, Math.max(10, Number(e.target.value) || 10)))} className="mt-1 w-full rounded border p-2" /></label>
                  </div>
                )}</div>
              </div>

              {/* Number of Copies */}
              <div>
                <label className="block text-slate-700 font-bold mb-1 flex items-center justify-between">
                  <span>Cantidad de Copias</span>
                  <button
                    type="button"
                    onClick={() => setCopies(product.stock > 0 ? product.stock : 1)}
                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer underline"
                  >
                    Usar stock actual ({product.stock})
                  </button>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={copies}
                    onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24 px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900 text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-slate-500 text-[11px]">
                    {copies === 1 ? '1 etiqueta' : `${copies} etiquetas para calzado`}
                  </span>
                </div>
              </div>
            </div>

            {/* Field Toggles */}
            <div className="space-y-2">
              <label className="block text-slate-700 font-bold mb-1">
                Datos a Incluir en la Etiqueta:
              </label>
              
              <div className="space-y-1.5 bg-white p-2.5 rounded-lg border border-slate-200">
                {/* Available Sizes for this Shoe Style Toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAvailableSizes}
                    onChange={(e) => setShowAvailableSizes(e.target.checked)}
                    className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Tallas Disponibles en este Estilo ({availableSizes.length})</span>
                    <span className="text-[9px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-bold">
                      Solicitado
                    </span>
                  </span>
                </label>

                {showAvailableSizes && availableSizes.length > 0 && (
                  <div className="pl-6 pt-0.5 pb-1 flex flex-wrap gap-1 items-center">
                    <span className="text-[10px] text-slate-500 font-medium mr-1">En inventario:</span>
                    {availableSizes.map((sz) => (
                      <span
                        key={sz}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                          sz.trim() === product.talla.trim()
                            ? 'bg-slate-950 text-white'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {sz}
                      </span>
                    ))}
                  </div>
                )}

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showCost}
                    onChange={(e) => setShowCost(e.target.checked)}
                    className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <span className="font-semibold text-slate-800 flex items-center gap-1">
                    <span>Costo de Compra (${product.costo.toFixed(2)})</span>
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPrice}
                    onChange={(e) => setShowPrice(e.target.checked)}
                    className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <span className="font-semibold text-slate-800 flex items-center gap-1">
                    <span>Precio Venta PVP (${product.precio.toFixed(2)})</span>
                    <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
                      Predominante
                    </span>
                  </span>
                </label>

                {showPrice && (
                  <label className="flex items-center gap-2 pl-5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showBsPrice}
                      onChange={(e) => setShowBsPrice(e.target.checked)}
                      className="w-3 h-3 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                    <span className="text-slate-500 text-[11px]">
                      Equivalente en Bs ({priceBs.toFixed(0)} Bs a tasa BCV)
                    </span>
                  </label>
                )}

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showBarcode}
                    onChange={(e) => setShowBarcode(e.target.checked)}
                    className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <span className="text-slate-700">Código de barras interno (Code 128)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showStoreAddress}
                    onChange={(e) => setShowStoreAddress(e.target.checked)}
                    className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <span className="text-slate-700">Sede: Ubicación no configurada - Sede no configurada, Sede no configurada</span>
                </label>
              </div>
            </div>

          </div>

          {/* Real-time Label Preview & Quick Download */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>
                  Vista Previa {labelFormat === 'custom' ? `${customWidthMm}×${customHeightMm}mm` : labelFormat.replace('thermal_', '').replace('x', '×') + 'mm'}
                </span>
                <span className="text-[10px] text-slate-400 font-normal">
                  (Sin bordes negros alrededor)
                </span>
              </span>

              {printMessage && <div role="status" className="w-full text-[10px] text-indigo-700 font-semibold">{printMessage}</div>}
              {/* Quick Image Download Badges */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleDownload('png')}
                  disabled={isDownloading}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  title="Descargar en formato PNG de alta resolución (300 DPI)"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar Imagen PNG</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload('jpeg')}
                  disabled={isDownloading}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium text-[11px] transition-colors cursor-pointer border border-slate-200"
                  title="Descargar en formato JPG para rotuladoras Bluetooth"
                >
                  JPG
                </button>
              </div>
            </div>

            {/* Label Visual Canvas Container (Clean sticker mockup on soft backdrop) */}
            <div className="bg-slate-100/90 p-5 sm:p-7 rounded-2xl flex flex-col items-center justify-center border border-slate-200 overflow-x-auto">
              
              <div className="flex flex-col items-center gap-3">
                <img
                  id="label-preview-image"
                  src={previewDataUrl}
                  alt={`Vista previa de etiqueta ${product.sku}`}
                  className="max-w-full h-auto bg-white shadow-xl rounded-lg"
                  style={{ width: `${(labelFormat === 'thermal_40x20' || labelFormat === 'thermal_40x25' ? 40 : labelFormat === 'thermal_50x15' || labelFormat === 'thermal_50x30' || labelFormat === 'thermal_50x70' ? 50 : customWidthMm) * 8}px`, maxHeight: '420px', objectFit: 'contain' }}
                />
                <p className="text-[10px] text-slate-500">La misma imagen se utilizará para descargar, imprimir y enviar a MXW01.</p>
              </div>

              {/* Dimension tag helper */}
              <div className="mt-3 text-[10px] text-slate-600 font-medium flex items-center gap-1.5 bg-white/90 px-3 py-1 rounded-full border border-slate-200 shadow-2xs">
                <FileCheck className="w-3.5 h-3.5 text-indigo-600" />
                <span>
                  {labelFormat === 'thermal_40x20'
                    ? 'Medida exacta: 40mm ancho × 20mm alto'
                    : labelFormat === 'thermal_40x25'
                    ? 'Medida exacta: 40mm ancho × 25mm alto (ideal para rollos térmicos de calzado y cajas)'
                    : labelFormat === 'thermal_50x30'
                    ? 'Medida: 50mm × 30mm'
                    : labelFormat === 'hangtag'
                    ? 'Etiqueta Colgante con perforación para hilo'
                    : 'Etiqueta para Caja 70×50mm'}
                </span>
              </div>

            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition cursor-pointer"
            >
              Cerrar
            </button>

            {/* Download as Image Button */}
            <button
              type="button"
              onClick={() => handleDownload('png')}
              disabled={isDownloading}
              className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>
                {isDownloading ? 'Generando imagen...' : `Descargar Imagen (${labelFormat === 'thermal_40x20' ? '40×20mm' : labelFormat === 'thermal_40x25' ? '40×25mm' : 'etiqueta'})`}
              </span>
            </button>

            <button
              type="button"
              onClick={handleBluetoothPrint}
              disabled={isPrinting || isDownloading}
              className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50"
              title="Conectar por Bluetooth e imprimir directamente en la MXW01"
            >
              <Printer className="w-4 h-4" />
              <span>{isPrinting ? 'Conectando / enviando…' : 'Imprimir MXW01'}</span>
            </button>

            {/* Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir {copies} {copies === 1 ? 'Etiqueta' : 'Etiquetas'}</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
