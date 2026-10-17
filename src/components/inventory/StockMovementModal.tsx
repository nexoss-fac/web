import React, { useState } from 'react';
import { X, Check, Plus, Minus, ArrowDownRight, ArrowUpRight, RotateCcw } from 'lucide-react';
import { ShoeProduct, MovementType } from '../../types';

interface StockMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ShoeProduct | null;
  onConfirm: (
    productId: string,
    quantityChange: number,
    motivo: string,
    movementType: 'entrada' | 'salida_ajuste' | 'devolucion'
  ) => void;
}

export const StockMovementModal: React.FC<StockMovementModalProps> = ({
  isOpen,
  onClose,
  product,
  onConfirm,
}) => {
  if (!isOpen || !product) return null;

  const [type, setType] = useState<'entrada' | 'salida_ajuste' | 'devolucion'>('entrada');
  const [amount, setAmount] = useState('5');
  const [motivo, setMotivo] = useState('');

  const numAmount = parseInt(amount, 10) || 0;
  const multiplier = type === 'salida_ajuste' ? -1 : 1;
  const finalDelta = numAmount * multiplier;
  const previewStock = Math.max(0, product.stock + finalDelta);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount <= 0) {
      alert('Ingresa una cantidad válida mayor a cero.');
      return;
    }

    if (type === 'salida_ajuste' && numAmount > product.stock) {
      alert(`No puedes retirar ${numAmount} pares porque solo hay ${product.stock} en stock.`);
      return;
    }

    const defaultMotivo =
      type === 'entrada'
        ? 'Recepción de lote de mercancía'
        : type === 'salida_ajuste'
        ? 'Ajuste de inventario / Merma'
        : 'Devolución de cliente';

    onConfirm(product.id, finalDelta, motivo.trim() || defaultMotivo, type);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full shadow-xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-900">Movimiento de Inventario</h3>
            <p className="text-[11px] text-slate-500">
              {product.nombre} (Talla {product.talla} • {product.color})
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          
          {/* Movement Type Selectors */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setType('entrada')}
              className={`p-2 rounded-lg border flex flex-col items-center gap-1 cursor-pointer transition-colors ${
                type === 'entrada'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-bold'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>Entrada / Lote</span>
            </button>

            <button
              type="button"
              onClick={() => setType('salida_ajuste')}
              className={`p-2 rounded-lg border flex flex-col items-center gap-1 cursor-pointer transition-colors ${
                type === 'salida_ajuste'
                  ? 'bg-rose-50 border-rose-300 text-rose-700 font-bold'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <ArrowDownRight className="w-4 h-4" />
              <span>Salida / Merma</span>
            </button>

            <button
              type="button"
              onClick={() => setType('devolucion')}
              className={`p-2 rounded-lg border flex flex-col items-center gap-1 cursor-pointer transition-colors ${
                type === 'devolucion'
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              <span>Devolución</span>
            </button>
          </div>

          {/* Amount input & Live Stock Preview */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Cantidad de Pares a {type === 'salida_ajuste' ? 'Retirar' : 'Ingresar'}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max={type === 'salida_ajuste' ? product.stock : 9999}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-base font-bold focus:outline-none focus:border-indigo-500"
                  autoFocus
                />
                <span className="text-slate-500 font-semibold">Pares</span>
              </div>
            </div>

            {/* Live calculation */}
            <div className="flex justify-between items-center text-xs font-mono pt-2 border-t border-slate-200">
              <span className="text-slate-500">Stock actual: {product.stock} pares</span>
              <span className="text-slate-400">➔</span>
              <span
                className={`font-bold ${
                  previewStock <= product.stock_minimo
                    ? 'text-amber-600'
                    : 'text-emerald-600'
                }`}
              >
                Nuevo stock: {previewStock} pares
              </span>
            </div>
          </div>

          {/* Reason / Motivo */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              Motivo o Justificación (Para el Kardex en vivo)
            </label>
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={
                type === 'entrada'
                  ? 'Ej. Llegada de lote contenedor Nike #401'
                  : type === 'salida_ajuste'
                  ? 'Ej. Calzado enviado a exhibición o merma'
                  : 'Ej. Devolución de cliente con ticket #MK-1002'
              }
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
            />
            {type === 'salida_ajuste' && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-slate-500">En el Libro de Inventario aparece como:</span>
                {['Autoconsumo', 'Donación', 'Merma / producto dañado'].map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setMotivo(reason)}
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${motivo === reason ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-400'}`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>Registrar Movimiento</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
