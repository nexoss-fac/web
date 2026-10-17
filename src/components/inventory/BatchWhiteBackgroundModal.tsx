import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  CheckCircle2,
  X,
  Play,
  Pause,
  RotateCcw,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { ShoeProduct } from '../../types';
import { removeBackgroundToWhite } from '../../utils/backgroundRemover';

interface BatchWhiteBackgroundModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BatchWhiteBackgroundModal: React.FC<BatchWhiteBackgroundModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { products, updateProduct, addNotification } = useStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  // Live preview comparison
  const [currentProduct, setCurrentProduct] = useState<ShoeProduct | null>(null);
  const [lastProcessedBefore, setLastProcessedBefore] = useState<string | null>(null);
  const [lastProcessedAfter, setLastProcessedAfter] = useState<string | null>(null);

  const stopRequestedRef = useRef(false);

  // Products with images (accept data URLs, absolute URLs, or local asset paths)
  const productsWithImage = products.filter((p) => p.activo && p.imagen && p.imagen.trim().length > 4);

  useEffect(() => {
    if (isOpen) {
      setIsFinished(false);
      setIsProcessing(false);
      setCurrentIndex(0);
      setProcessedCount(0);
      setErrorCount(0);
      setCurrentProduct(null);
      setLastProcessedBefore(null);
      setLastProcessedAfter(null);
      stopRequestedRef.current = false;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartProcessing = async () => {
    if (productsWithImage.length === 0) return;

    setIsProcessing(true);
    setIsFinished(false);
    stopRequestedRef.current = false;

    let successful = 0;
    let failed = 0;

    for (let i = 0; i < productsWithImage.length; i++) {
      if (stopRequestedRef.current) {
        break;
      }

      const prod = productsWithImage[i];
      setCurrentIndex(i);
      setCurrentProduct(prod);
      setLastProcessedBefore(prod.imagen || null);

      try {
        if (prod.imagen) {
          // Process with white studio background engine (Gemini AI + Canvas edge anti-aliasing + realistic contact shadow)
          const cleanWhiteImage = await removeBackgroundToWhite(prod.imagen);

          // Update product in local state, localStorage and cloud database
          const updatedShoe = { ...prod, imagen: cleanWhiteImage, imagen_url: cleanWhiteImage };
          updateProduct(prod.id, { imagen: cleanWhiteImage, imagen_url: cleanWhiteImage } as any);

          // Explicitly push to backend to ensure persistence
          try {
            await fetch('/api/products', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updatedShoe),
            });
          } catch (apiErr) {
            console.warn('Backend sync warning in batch:', apiErr);
          }

          setLastProcessedAfter(cleanWhiteImage);
          successful++;
          setProcessedCount(successful);
        }
      } catch (err) {
        console.error(`Error procesando fondo blanco para ${prod.nombre}:`, err);
        failed++;
        setErrorCount(failed);
      }

      // Small breathe interval between shoes for smooth UI rendering
      await new Promise((r) => setTimeout(r, 200));
    }

    setIsProcessing(false);
    setIsFinished(true);
    addNotification(
      'Fondo Blanco de Estudio Aplicado',
      `Se actualizaron ${successful} fotos de calzado con fondo blanco profesional.`,
      'success'
    );
  };

  const handleStop = () => {
    stopRequestedRef.current = true;
    setIsProcessing(false);
  };

  const total = productsWithImage.length;
  const progressPercent = total > 0 ? Math.round(((currentIndex + (isFinished ? 1 : 0)) / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                Fondo Blanco de Estudio Masivo
              </h2>
              <p className="text-xs text-slate-400">
                Aplica fondo blanco puro de catálogo a todos los calzados registrados en el sistema.
              </p>
            </div>
          </div>

          {!isProcessing && (
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-slate-200">
          {/* Summary Box */}
          <div className="bg-slate-950/60 rounded-2xl border border-slate-800 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                <ImageIcon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Calzados con Foto en el Sistema</p>
                <p className="text-[11px] text-slate-400">
                  {total} {total === 1 ? 'modelo listo' : 'modelos listos'} para optimización con fondo blanco
                </p>
              </div>
            </div>

            <span className="px-3 py-1 bg-cyan-950 text-cyan-300 border border-cyan-800/60 rounded-full text-xs font-mono font-bold">
              {total} Calzados
            </span>
          </div>

          {/* If finished */}
          {isFinished ? (
            <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-6 text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">¡Proceso Completado con Éxito!</h3>
                <p className="text-xs text-slate-300 mt-1">
                  Se colocó fondo blanco de estudio a <span className="text-emerald-400 font-bold">{processedCount}</span> calzados.
                  Tus fichas publicitarias y catálogo web ahora lucen idénticos a la foto de estudio.
                </p>
              </div>

              {lastProcessedAfter && (
                <div className="max-w-xs mx-auto p-3 bg-white rounded-2xl border border-slate-300 shadow-md">
                  <img
                    src={lastProcessedAfter}
                    alt="Resultado final"
                    className="w-full h-36 object-contain"
                  />
                  <p className="text-[10px] text-slate-500 font-bold text-center mt-2">
                    Último calzado procesado en fondo blanco
                  </p>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Progress Bar (if processing or paused) */}
              {(isProcessing || currentIndex > 0) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-cyan-400 flex items-center gap-1.5">
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Procesando {currentIndex + 1} de {total}...
                        </>
                      ) : (
                        'Pausado'
                      )}
                    </span>
                    <span className="font-mono text-slate-400">{progressPercent}%</span>
                  </div>

                  <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="h-full bg-linear-to-r from-cyan-500 to-indigo-500 transition-all duration-300 rounded-full"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  {currentProduct && (
                    <p className="text-xs text-slate-300 font-medium truncate">
                      Calzado actual: <span className="font-bold text-white">{currentProduct.nombre}</span> ({currentProduct.marca || 'Original'})
                    </p>
                  )}
                </div>
              )}

              {/* Before / After Preview Card */}
              {currentProduct && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 text-center space-y-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Foto Original
                    </span>
                    <div className="h-32 bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center p-2">
                      {lastProcessedBefore ? (
                        <img
                          src={lastProcessedBefore}
                          alt="Original"
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <ImageIcon className="w-8 h-8 text-slate-700" />
                      )}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 text-center space-y-2">
                    <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider flex items-center justify-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Fondo Blanco Estudio
                    </span>
                    <div className="h-32 bg-white rounded-xl overflow-hidden flex items-center justify-center p-2 border border-slate-300 shadow-inner">
                      {lastProcessedAfter ? (
                        <img
                          src={lastProcessedAfter}
                          alt="Estudio Blanco"
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : isProcessing ? (
                        <div className="flex flex-col items-center gap-1.5 text-slate-400">
                          <Loader2 className="w-6 h-6 animate-spin text-cyan-600" />
                          <span className="text-[10px] font-bold text-slate-500">Limpiando...</span>
                        </div>
                      ) : (
                        <ImageIcon className="w-8 h-8 text-slate-300" />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Info guidelines */}
              {!isProcessing && currentIndex === 0 && (
                <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800 text-xs text-slate-300 space-y-2">
                  <p className="font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    ¿Qué hace esta herramienta?
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-400 text-[11px]">
                    <li>Recorre uno por uno todos los zapatos que ya subiste al inventario.</li>
                    <li>Elimina el fondo exterior y coloca una base blanca pura de estudio fotográfico (#FFFFFF).</li>
                    <li>Agrega sombra de contacto realista bajo la suela para que el calzado no se vea plano.</li>
                    <li>Guarda automáticamente la nueva foto optimizada en tu inventario y catálogo.</li>
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:px-6 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded-xl transition cursor-pointer disabled:opacity-50"
          >
            {isFinished ? 'Cerrar' : 'Cancelar'}
          </button>

          <div className="flex items-center gap-2">
            {isProcessing ? (
              <button
                type="button"
                onClick={handleStop}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pausar Proceso</span>
              </button>
            ) : isFinished ? (
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-cyan-600/20"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Ver Catálogo con Fondo Blanco</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartProcessing}
                disabled={total === 0}
                className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer shadow-lg shadow-cyan-600/25 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>Poner Fondo Blanco a Todos ({total})</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
