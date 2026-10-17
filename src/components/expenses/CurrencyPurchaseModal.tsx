import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  ArrowRightLeft,
  X,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { CurrencyPurchaseMethod } from '../../types';

interface CurrencyPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CurrencyPurchaseModal: React.FC<CurrencyPurchaseModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { addCurrencyPurchase, exchangeRate } = useStore();

  const todayIso = new Date().toISOString().split('T')[0];
  const [fecha, setFecha] = useState(todayIso);
  const [metodo, setMetodo] = useState<CurrencyPurchaseMethod>('Binance P2P (USDT)');
  const [montoBs, setMontoBs] = useState('');
  const [tasaCompra, setTasaCompra] = useState(exchangeRate.toString());
  const [montoUsd, setMontoUsd] = useState('');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');

  // Update calculated USD when Bs or Rate changes
  const handleBsChange = (val: string) => {
    setMontoBs(val);
    const bsNum = parseFloat(val);
    const tasaNum = parseFloat(tasaCompra);
    if (!isNaN(bsNum) && !isNaN(tasaNum) && tasaNum > 0) {
      setMontoUsd((bsNum / tasaNum).toFixed(2));
    } else {
      setMontoUsd('');
    }
  };

  const handleTasaChange = (val: string) => {
    setTasaCompra(val);
    const bsNum = parseFloat(montoBs);
    const tasaNum = parseFloat(val);
    if (!isNaN(bsNum) && !isNaN(tasaNum) && tasaNum > 0) {
      setMontoUsd((bsNum / tasaNum).toFixed(2));
    }
  };

  const handleUsdChange = (val: string) => {
    setMontoUsd(val);
    const usdNum = parseFloat(val);
    const tasaNum = parseFloat(tasaCompra);
    if (!isNaN(usdNum) && !isNaN(tasaNum) && tasaNum > 0) {
      setMontoBs((usdNum * tasaNum).toFixed(2));
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const bsNum = parseFloat(montoBs);
    const tasaNum = parseFloat(tasaCompra);
    const usdNum = parseFloat(montoUsd);

    if (isNaN(bsNum) || bsNum <= 0) {
      setError('Por favor ingrese una cantidad válida en Bolívares.');
      return;
    }

    if (isNaN(tasaNum) || tasaNum <= 0) {
      setError('Por favor especifique una tasa de cambio válida.');
      return;
    }

    if (isNaN(usdNum) || usdNum <= 0) {
      setError('El monto en dólares resultante debe ser mayor a cero.');
      return;
    }

    addCurrencyPurchase({
      fecha,
      metodo,
      monto_bs_gastado: Number(bsNum.toFixed(2)),
      tasa_compra: Number(tasaNum.toFixed(2)),
      monto_usd_recibido: Number(usdNum.toFixed(2)),
      referencia: referencia.trim() || undefined,
      usuario: 'Administrador de demostración',
      notas: notas.trim() || undefined,
    });

    // Reset
    setMontoBs('');
    setMontoUsd('');
    setReferencia('');
    setNotas('');
    onClose();
  };

  const calculatedBs = parseFloat(montoBs) || 0;
  const calculatedUsd = parseFloat(montoUsd) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/15 rounded-xl backdrop-blur-xs">
              <ArrowRightLeft className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Comprar Divisas con Bs Positivos</h2>
              <p className="text-xs text-blue-200">
                Convierte bolívares en positivo a Binance USDT, Zelle o Dólares Efectivo.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Destino de Divisa
              </label>
              <select
                value={metodo}
                onChange={(e) => setMetodo(e.target.value as CurrencyPurchaseMethod)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden font-medium"
              >
                <option value="Binance P2P (USDT)">Binance P2P (USDT)</option>
                <option value="Zelle">Zelle</option>
                <option value="Dólares Efectivo">Dólares Efectivo (Caja)</option>
                <option value="Transferencia USD">Transferencia USD</option>
              </select>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bolívares Gastados (Bs.)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">Bs.</span>
                  <input
                    type="number"
                    step="any"
                    value={montoBs}
                    onChange={(e) => handleBsChange(e.target.value)}
                    placeholder="Ej. 15000"
                    className="w-full text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    required
                  />
                </div>
                <span className="text-[10px] text-slate-500">Se descuenta del saldo en Bs</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tasa de Compra (Bs/$)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">Bs.</span>
                  <input
                    type="number"
                    step="any"
                    value={tasaCompra}
                    onChange={(e) => handleTasaChange(e.target.value)}
                    placeholder="Ej. 69.50"
                    className="w-full text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    required
                  />
                </div>
                <span className="text-[10px] text-slate-500">Tasa acordada o P2P</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Dólares Netos Recibidos ($ USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">$</span>
                <input
                  type="number"
                  step="any"
                  value={montoUsd}
                  onChange={(e) => handleUsdChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full text-xs pl-7 pr-3 py-2 border border-blue-400 rounded-lg font-black text-blue-900 bg-blue-50/40 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  required
                />
              </div>
              <span className="text-[10px] text-blue-700 font-medium">Se acredita al positivo en dólares</span>
            </div>
          </div>

          {/* Visual Accounting Impact */}
          {calculatedBs > 0 && calculatedUsd > 0 && (
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1 text-xs">
              <span className="font-bold text-emerald-900 block flex items-center">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                Impacto en el Arqueo de Fin de Mes:
              </span>
              <p className="text-slate-700">
                • <strong className="text-rose-700">-{calculatedBs.toLocaleString('es-VE')} Bs</strong> se restan del total de ingresos en Bolívares.
              </p>
              <p className="text-slate-700">
                • <strong className="text-emerald-700">+${calculatedUsd.toFixed(2)} USD</strong> se suman a tu balance positivo en solo dólares ({metodo}).
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Referencia / Orden P2P / N° Comprobante (Opcional)
            </label>
            <input
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Ej. BIN-992148 o ZLL-4412"
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Notas / Observaciones (Opcional)
            </label>
            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej. Compra para pago de importación de zapatos"
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-all active:scale-95"
            >
              Registrar Compra de Divisas
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
