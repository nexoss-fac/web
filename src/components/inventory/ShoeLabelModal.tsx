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
  downloadLabelImage
} from '../../utils/labelImageGenerator';

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
  const [labelFormat, setLabelFormat] = useState<LabelFormat>('thermal_40x25');
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

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

  if (!isOpen || !product) return null;

  const priceBs = product.precio * exchangeRate;
  const costBs = product.costo * exchangeRate;

  const handlePrint = () => {
    window.print();
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
      },
      format
    );

    setIsDownloading(false);
    if (success) {
      const sizeLabel =
        labelFormat === 'thermal_40x25'
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
                  Etiqueta para Calzado (Térmica 40×25mm)
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
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLabelFormat('thermal_40x25')}
                    className={`py-2 px-2.5 rounded-lg font-bold text-[11px] border transition cursor-pointer flex flex-col items-center justify-center text-center ${
                      labelFormat === 'thermal_40x25'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <span>Térmica 40×25mm</span>
                    <span
                      className={`text-[9px] ${
                        labelFormat === 'thermal_40x25'
                          ? 'text-indigo-200 font-semibold'
                          : 'text-emerald-600 font-bold'
                      }`}
                    >
                      ★ Estándar Solicitado
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLabelFormat('thermal_50x30')}
                    className={`py-2 px-2.5 rounded-lg font-bold text-[11px] border transition cursor-pointer flex flex-col items-center justify-center text-center ${
                      labelFormat === 'thermal_50x30'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <span>Térmica 50×30mm</span>
                    <span className="text-[9px] text-slate-400">Rollo mediano</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLabelFormat('hangtag')}
                    className={`py-2 px-2.5 rounded-lg font-bold text-[11px] border transition cursor-pointer flex flex-col items-center justify-center text-center ${
                      labelFormat === 'hangtag'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <span>Colgante (HangTag)</span>
                    <span className="text-[9px] text-slate-400">Con perforación</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLabelFormat('box')}
                    className={`py-2 px-2.5 rounded-lg font-bold text-[11px] border transition cursor-pointer flex flex-col items-center justify-center text-center ${
                      labelFormat === 'box'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <span>Caja Calzado</span>
                    <span className="text-[9px] text-slate-400">70×50mm</span>
                  </button>
                </div>
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
                  <span className="text-slate-700">Código de Barras Escaneable (Code 39)</span>
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
                  Vista Previa {labelFormat === 'thermal_40x25' ? '40×25mm (Medida Exacta)' : 'de la Etiqueta'}
                </span>
                <span className="text-[10px] text-slate-400 font-normal">
                  (Sin bordes negros alrededor)
                </span>
              </span>

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
              
              {/* 40x25mm Label Card Preview: NO BLACK BORDER AROUND, PREDOMINANT TALLA & PRECIO */}
              {labelFormat === 'thermal_40x25' ? (
                <div
                  id="printable-shoe-label"
                  className="w-[340px] min-h-[212px] bg-white text-slate-900 p-3 shadow-xl rounded-xl relative select-none flex flex-col justify-between border-0"
                  style={{ boxSizing: 'border-box' }}
                >
                  {/* Top Section: Store Brand + Predominant TALLA */}
                  <div className="flex items-start justify-between gap-2 pb-1.5 border-b border-slate-100">
                    <div className="flex-1 min-w-0">
                      <span className="font-black text-sm tracking-wider text-slate-900 block leading-tight">
                        NEXOSS
                      </span>
                      {showStoreAddress && (
                        <span className="text-[8px] text-slate-500 font-medium block tracking-tight">
                          Ubicación no configurada • Cdad. Sede no configurada, Loc. 163
                        </span>
                      )}
                      <div className="font-black text-xs uppercase text-slate-900 truncate mt-1 leading-snug">
                        {product.nombre}
                      </div>
                      <div className="text-[9px] text-slate-600 font-semibold truncate">
                        {product.marca} • {product.tipo} | {product.color}
                      </div>
                    </div>

                    {/* PREDOMINANT TALLA DISPLAY */}
                    <div className="bg-slate-950 text-white px-3.5 py-1.5 rounded-xl flex flex-col items-center justify-center shrink-0 shadow-xs min-w-[70px]">
                      <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest leading-none mb-0.5">
                        TALLA
                      </span>
                      <span className="text-2xl font-black font-mono leading-none tracking-tight text-white">
                        {product.talla}
                      </span>
                    </div>
                  </div>

                  {/* Available Sizes for this Shoe Style */}
                  {showAvailableSizes && availableSizes.length > 0 && (
                    <div className="my-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                      <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-wider text-slate-500 mb-1">
                        <span>Tallas Disp. en este Estilo:</span>
                        <span className="text-[7px] text-emerald-700 font-bold bg-emerald-50 px-1 rounded">
                          {availableSizes.length} disp.
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {availableSizes.slice(0, 9).map((sz) => {
                          const isCurrent = sz.trim() === product.talla.trim();
                          return (
                            <span
                              key={sz}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold leading-tight ${
                                isCurrent
                                  ? 'bg-slate-950 text-white shadow-2xs ring-1 ring-slate-950'
                                  : 'bg-white text-slate-700 border border-slate-200'
                              }`}
                            >
                              {sz}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Barcode & SKU */}
                  <div className="text-center py-1 bg-slate-50/70 rounded-lg my-1">
                    {showBarcode && (
                      <div className="flex justify-center my-0.5">
                        <BarcodeSvg value={product.sku} width={220} height={26} />
                      </div>
                    )}
                    <div className="font-mono font-black text-[10px] tracking-wider text-slate-800">
                      SKU: {product.sku}
                    </div>
                  </div>

                  {/* Bottom Row: Cost and PREDOMINANT PRECIO */}
                  <div className="pt-1.5 border-t border-slate-100 flex items-end justify-between">
                    {showCost ? (
                      <div className="text-left bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                        <div className="text-[7px] uppercase tracking-wider text-slate-500 font-bold leading-tight">
                          Costo Compra
                        </div>
                        <div className="font-mono font-bold text-xs text-slate-800 leading-tight">
                          ${product.costo.toFixed(2)}
                        </div>
                      </div>
                    ) : (
                      <div />
                    )}

                    {showPrice && (
                      <div className="text-right">
                        <div className="text-[8px] uppercase tracking-wider text-slate-500 font-black leading-tight">
                          PVP VENTA
                        </div>
                        <div className="font-mono font-black text-2xl sm:text-3xl text-slate-950 leading-none">
                          ${product.precio.toFixed(2)}
                        </div>
                        {showBsPrice && (
                          <div className="text-[10px] font-mono text-slate-700 font-bold leading-tight mt-0.5">
                            {priceBs.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Bs
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Other Label Formats Preview (Clean, No Harsh Black Outlines) */
                <div
                  id="printable-shoe-label"
                  className={`bg-white text-slate-900 p-4 shadow-xl flex flex-col justify-between transition-all border-0 rounded-xl relative ${
                    labelFormat === 'thermal_50x30'
                      ? 'w-76 min-h-48'
                      : labelFormat === 'hangtag'
                      ? 'w-64 min-h-60 rounded-2xl relative'
                      : 'w-84 min-h-52'
                  }`}
                >
                  {/* Hangtag punch hole */}
                  {labelFormat === 'hangtag' && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-slate-200 border-2 border-slate-400 flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-white" />
                    </div>
                  )}

                  {/* Brand & Predominant Size Header */}
                  <div className="flex items-start justify-between border-b border-slate-100 pb-2 mb-1.5">
                    <div>
                      <span className="font-black text-sm tracking-wider text-slate-900 block">
                        NEXOSS
                      </span>
                      {showStoreAddress && (
                        <div className="text-[8px] text-slate-500 font-medium tracking-tight">
                          Ubicación no configurada • Cdad. Sede no configurada, Sede no configurada
                        </div>
                      )}
                    </div>
                    <div className="bg-slate-950 text-white px-3.5 py-1.5 rounded-xl flex flex-col items-center justify-center shadow-xs">
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        TALLA
                      </span>
                      <span className="text-xl font-black font-mono leading-tight">{product.talla}</span>
                    </div>
                  </div>

                  {/* Product Description */}
                  <div className="space-y-0.5 my-1">
                    <div className="font-black text-xs leading-tight text-slate-900 uppercase">
                      {product.nombre}
                    </div>
                    <div className="text-[10px] text-slate-600 flex items-center justify-between">
                      <span className="font-semibold">{product.marca} • {product.tipo}</span>
                      <span className="text-slate-500 font-mono">{product.color}</span>
                    </div>
                  </div>

                  {/* Available Sizes for this Shoe Style */}
                  {showAvailableSizes && availableSizes.length > 0 && (
                    <div className="my-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                      <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-wider text-slate-500 mb-1">
                        <span>Tallas Disp. en este Estilo:</span>
                        <span className="text-[7px] text-emerald-700 font-bold bg-emerald-50 px-1 rounded">
                          {availableSizes.length} disp.
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {availableSizes.slice(0, 10).map((sz) => {
                          const isCurrent = sz.trim() === product.talla.trim();
                          return (
                            <span
                              key={sz}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold leading-tight ${
                                isCurrent
                                  ? 'bg-slate-950 text-white'
                                  : 'bg-white text-slate-700 border border-slate-200'
                              }`}
                            >
                              {sz}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* SKU and Barcode Section */}
                  <div className="my-1 text-center py-1 bg-slate-50/80 rounded-lg">
                    {showBarcode && (
                      <div className="flex justify-center my-0.5">
                        <BarcodeSvg value={product.sku} width={200} height={32} />
                      </div>
                    )}
                    <div className="font-mono font-black text-xs tracking-widest text-slate-900">
                      SKU: {product.sku}
                    </div>
                  </div>

                  {/* Cost and PREDOMINANT PRECIO */}
                  <div className="pt-2 border-t border-slate-100 mt-auto flex items-end justify-between">
                    {showCost ? (
                      <div className="bg-slate-50 px-2 py-1 rounded-lg text-left border border-slate-100">
                        <div className="text-[8px] uppercase tracking-wider text-slate-500 font-bold">
                          Costo Compra
                        </div>
                        <div className="font-mono font-bold text-xs text-slate-900">
                          ${product.costo.toFixed(2)}
                        </div>
                      </div>
                    ) : (
                      <div />
                    )}

                    {showPrice && (
                      <div className="text-right">
                        <div className="text-[8px] uppercase tracking-wider text-slate-500 font-bold">
                          PVP Venta
                        </div>
                        <div className="font-mono font-black text-2xl text-slate-950 leading-none">
                          ${product.precio.toFixed(2)}
                        </div>
                        {showBsPrice && (
                          <div className="text-[10px] font-mono text-slate-600 font-bold mt-0.5">
                            {priceBs.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Bs
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Dimension tag helper */}
              <div className="mt-3 text-[10px] text-slate-600 font-medium flex items-center gap-1.5 bg-white/90 px-3 py-1 rounded-full border border-slate-200 shadow-2xs">
                <FileCheck className="w-3.5 h-3.5 text-indigo-600" />
                <span>
                  {labelFormat === 'thermal_40x25'
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

          {/* Hidden Print Container with repeat copies for thermal printer */}
          <div className="hidden print:block print:w-full" id="print-label-batch">
            <style>{`
              @media print {
                body * {
                  visibility: hidden !important;
                }
                #print-label-batch, #print-label-batch * {
                  visibility: visible !important;
                }
                #print-label-batch {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  padding: 0 !important;
                  margin: 0 !important;
                }
                ${
                  labelFormat === 'thermal_40x25'
                    ? `
                    @page {
                      size: 40mm 25mm;
                      margin: 0;
                    }
                    .shoe-tag-item {
                      width: 40mm !important;
                      height: 25mm !important;
                      max-width: 40mm !important;
                      max-height: 25mm !important;
                      page-break-inside: avoid;
                      break-inside: avoid;
                      padding: 1.2mm !important;
                      box-sizing: border-box !important;
                      overflow: hidden !important;
                      border: none !important;
                    }
                    `
                    : `
                    .shoe-tag-item {
                      page-break-inside: avoid;
                      break-inside: avoid;
                      margin-bottom: 8mm;
                      border: none !important;
                    }
                    `
                }
              }
            `}</style>
            
            <div className="flex flex-wrap gap-2 p-1">
              {Array.from({ length: copies }).map((_, idx) => (
                <div
                  key={idx}
                  className={`shoe-tag-item p-2 bg-white text-black font-sans flex flex-col justify-between border-0 ${
                    labelFormat === 'thermal_40x25' ? 'w-[40mm] h-[25mm]' : 'w-72 min-h-44'
                  }`}
                  style={{ boxSizing: 'border-box' }}
                >
                  {/* Top Bar with Predominant Size */}
                  <div className="flex justify-between items-start pb-0.5 mb-0.5">
                    <div>
                      <strong className="text-[10px] font-black leading-tight block">NEXOSS</strong>
                      <div className="text-[8px] font-black uppercase truncate max-w-[24mm] leading-tight">
                        {product.nombre}
                      </div>
                    </div>
                    <div className="bg-black text-white px-1.5 py-0.5 rounded text-center shrink-0">
                      <div className="text-[6px] font-bold uppercase leading-none">TALLA</div>
                      <div className="text-[12px] font-black font-mono leading-none">{product.talla}</div>
                    </div>
                  </div>

                  {/* Available Sizes for this style (Print) */}
                  {showAvailableSizes && availableSizes.length > 0 && (
                    <div className="text-[6px] font-bold text-gray-800 leading-tight my-0.2">
                      <span>Tallas: </span>
                      {availableSizes.map((sz, sIdx) => (
                        <span
                          key={sIdx}
                          className={sz.trim() === product.talla.trim() ? 'font-black underline mr-1' : 'mr-1'}
                        >
                          {sz}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Barcode & SKU */}
                  <div className="text-center my-0.2">
                    {showBarcode && (
                      <div className="flex justify-center my-0.2">
                        <BarcodeSvg
                          value={product.sku}
                          width={labelFormat === 'thermal_40x25' ? 140 : 190}
                          height={labelFormat === 'thermal_40x25' ? 18 : 30}
                        />
                      </div>
                    )}
                    <div className="font-mono font-black text-[8px] tracking-wider leading-none">
                      SKU: {product.sku}
                    </div>
                  </div>

                  {/* Bottom Row with Predominant Price */}
                  <div className="flex justify-between items-end pt-0.5 border-t border-gray-200">
                    {showCost ? (
                      <div className="text-left">
                        <div className="text-[5px] uppercase font-bold text-gray-600">Costo</div>
                        <div className="font-mono font-bold text-[8px]">${product.costo.toFixed(2)}</div>
                      </div>
                    ) : (
                      <div />
                    )}

                    {showPrice && (
                      <div className="text-right">
                        <div className="text-[5px] uppercase font-bold text-gray-600">PVP Venta</div>
                        <div className="font-mono font-black text-[13px] leading-tight text-black">
                          ${product.precio.toFixed(2)}
                        </div>
                        {showBsPrice && (
                          <div className="text-[7px] font-mono font-bold leading-tight">
                            {priceBs.toFixed(0)} Bs
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
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
                {isDownloading ? 'Generando imagen...' : 'Descargar Imagen (40×25mm)'}
              </span>
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
