import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  Landmark,
  Smartphone,
  Hash,
  FileText,
  DollarSign,
  Edit3,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { verifyBdvPagoMovil } from '../../services/api';
import { BdvVerificationResponse } from '../../types';
import { useStore } from '../../context/StoreContext';

interface BdvVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  expectedAmountBs?: number;
  expectedAmountUsd?: number;
  initialCustomerPhone?: string;
  initialCustomerRif?: string;
  onVerificationSuccess?: (result: BdvVerificationResponse) => void;
}

const VENEZUELAN_BANKS = [
  { code: '0102', name: '0102 - Banco de Venezuela (BDV)' },
  { code: '0105', name: '0105 - Banco Mercantil' },
  { code: '0134', name: '0134 - Banesco' },
  { code: '0108', name: '0108 - Banco Provincial (BBVA)' },
  { code: '0114', name: '0114 - Bancaribe' },
  { code: '0116', name: '0116 - Banco Occidental de Descuento (BOD/BNC)' },
  { code: '0172', name: '0172 - Bancamiga' },
  { code: '0175', name: '0175 - Banco Bicentenario' },
  { code: '0151', name: '0151 - Banco Fondo Común (BFC)' },
  { code: '0169', name: '0169 - Mi Banco' },
];

export const BdvVerificationModal: React.FC<BdvVerificationModalProps> = ({
  isOpen,
  onClose,
  expectedAmountBs = 0,
  expectedAmountUsd,
  initialCustomerPhone = '',
  initialCustomerRif = '',
  onVerificationSuccess,
}) => {
  const { exchangeRate } = useStore();

  const [referencia, setReferencia] = useState('');
  const [bancoOrigen, setBancoOrigen] = useState('0102 - Banco de Venezuela (BDV)');
  const [telefono, setTelefono] = useState(initialCustomerPhone || '0414-1234567');
  const [cedula, setCedula] = useState(initialCustomerRif || 'V-18900123');

  // Editable Amount State (Default/Suggested amount is expectedAmountBs)
  const [montoBs, setMontoBs] = useState<number>(expectedAmountBs || 0);
  const [montoInput, setMontoInput] = useState<string>(
    expectedAmountBs > 0 ? expectedAmountBs.toFixed(2) : ''
  );

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<BdvVerificationResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync suggestion whenever expectedAmountBs changes
  useEffect(() => {
    if (expectedAmountBs > 0) {
      setMontoBs(parseFloat(expectedAmountBs.toFixed(2)));
      setMontoInput(expectedAmountBs.toFixed(2));
    }
  }, [expectedAmountBs]);

  if (!isOpen) return null;

  const suggestedBs = expectedAmountBs > 0 ? parseFloat(expectedAmountBs.toFixed(2)) : 0;
  const isAmountModified = Math.abs(montoBs - suggestedBs) > 0.01;
  const equivalentUsd = exchangeRate > 0 ? montoBs / exchangeRate : 0;

  const handleResetToSuggested = () => {
    setMontoBs(suggestedBs);
    setMontoInput(suggestedBs.toFixed(2));
  };

  const handleApplyPreset = (percent: number) => {
    if (suggestedBs > 0) {
      const val = parseFloat(((suggestedBs * percent) / 100).toFixed(2));
      setMontoBs(val);
      setMontoInput(val.toFixed(2));
    }
  };

  const handleMontoInputChange = (valStr: string) => {
    setMontoInput(valStr);
    const num = parseFloat(valStr);
    if (!isNaN(num) && num >= 0) {
      setMontoBs(num);
    } else if (valStr === '') {
      setMontoBs(0);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referencia || referencia.length < 4) {
      setErrorMsg('Ingresa al menos 4 dígitos de la referencia bancaria.');
      return;
    }
    if (!montoBs || montoBs <= 0) {
      setErrorMsg('El monto a verificar en Bs debe ser mayor a 0.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const response = await verifyBdvPagoMovil({
        referencia: referencia.trim(),
        banco_origen: bancoOrigen,
        telefono_origen: telefono.trim(),
        cedula_cliente: cedula.trim(),
        monto_bs: montoBs,
        monto_usd: equivalentUsd,
      });

      setResult(response);
      if (response.aprobado && onVerificationSuccess) {
        onVerificationSuccess(response);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al conectar con la pasarela BDV';
      setErrorMsg(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[95vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center border border-red-200 shadow-2xs">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Verificación Pago Móvil BDV
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                  API 0102
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Conciliación directa con el Banco de Venezuela
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Expected Amount Suggestion & Active Amount Panel */}
        <div className="p-3.5 rounded-xl bg-slate-900 text-white shadow-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider">
                Monto Sugerido Factura
              </span>
            </div>
            <div className="text-right text-[11px] text-slate-400">
              <span className="font-mono text-slate-300">
                Tasa BCV: {exchangeRate.toFixed(2)} Bs/$
              </span>
            </div>
          </div>

          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-emerald-400">
                {montoBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
              </span>
              <span className="text-xs text-slate-300 font-mono">
                (~${equivalentUsd.toFixed(2)} USD)
              </span>
            </div>

            {isAmountModified && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                Monto Editado
              </span>
            )}
          </div>

          {/* Quick suggestions presets */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-400">Sugerencias rápidas:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleResetToSuggested}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                  !isAmountModified
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
                title="Restablecer al total sugerido de la venta"
              >
                100% Sugerido ({suggestedBs.toFixed(0)} Bs)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset(50)}
                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                title="Cobrar 50% en Pago Móvil"
              >
                50% ({(suggestedBs / 2).toFixed(0)} Bs)
              </button>
            </div>
          </div>
        </div>

        {/* Form Inputs */}
        <form onSubmit={handleVerify} className="space-y-3.5">
          
          {/* Editable Amount Input Box */}
          <div className="p-3 bg-amber-50/50 border border-amber-200/80 rounded-xl space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                <span>Monto a Comprobar en Pago Móvil (Bs)</span>
              </label>
              {isAmountModified && (
                <button
                  type="button"
                  onClick={handleResetToSuggested}
                  className="text-[10px] text-amber-700 hover:text-amber-900 font-semibold flex items-center gap-1 underline cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Restablecer sugerencia
                </button>
              )}
            </div>

            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={montoInput}
                onChange={(e) => handleMontoInputChange(e.target.value)}
                placeholder="Ej. 1500.00"
                className="w-full pl-3 pr-20 py-2 bg-white border border-amber-300 rounded-lg text-base font-bold font-mono text-slate-900 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 shadow-2xs"
              />
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                <span className="text-xs font-bold font-mono text-slate-500">
                  Bs (~${equivalentUsd.toFixed(2)})
                </span>
              </div>
            </div>

            <p className="text-[10px] text-slate-500">
              Colocamos de sugerencia el monto a pagar ({suggestedBs.toFixed(2)} Bs), pero puedes modificarlo libremente si el cliente abona una fracción o monto diferente.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Referencia */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-indigo-600" />
                <span>N° Referencia (4 a 8 dígitos)</span>
              </label>
              <input
                type="text"
                required
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Ej. 481920"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono text-slate-900 focus:outline-none focus:border-red-500 focus:bg-white"
              />
            </div>

            {/* Banco Emisor */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-indigo-600" />
                <span>Banco Emisor</span>
              </label>
              <select
                value={bancoOrigen}
                onChange={(e) => setBancoOrigen(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-red-500 focus:bg-white"
              >
                {VENEZUELAN_BANKS.map((b) => (
                  <option key={b.code} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Teléfono */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                <span>Teléfono Pagador</span>
              </label>
              <input
                type="text"
                required
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Ej. 04141234567"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:border-red-500 focus:bg-white"
              />
            </div>

            {/* Cédula / RIF */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                <span>Cédula / RIF</span>
              </label>
              <input
                type="text"
                required
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                placeholder="Ej. V-18900123"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:border-red-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Verification Result Card */}
          {result && (
            <div
              className={`p-3.5 rounded-xl border transition-all ${
                result.aprobado
                  ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <div className="flex items-start gap-3">
                {result.aprobado ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1 text-xs flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">
                      {result.aprobado ? '¡Pago Acreditado en BDV!' : 'Transacción No Confirmada'}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        result.aprobado
                          ? 'bg-emerald-200 text-emerald-800'
                          : 'bg-rose-200 text-rose-800'
                      }`}
                    >
                      {result.codigo_aprobacion}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed">{result.mensaje}</p>
                  {result.aprobado && (
                    <div className="text-[10px] text-emerald-700 font-mono pt-1 border-t border-emerald-200 flex justify-between">
                      <span>Ref: {result.referencia}</span>
                      <span>{new Date(result.fecha_transaccion).toLocaleTimeString()}</span>
                      <span className="font-bold">Monto: {result.monto_bs.toFixed(2)} Bs</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
            >
              Cerrar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-2 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Consultando BDV en Línea...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verificar Pago Móvil en BDV</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Informative Footer */}
        <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>API Conciliación Banco de Venezuela Activa</span>
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            {result?.modo === 'PRODUCCION' ? 'Modo Producción' : 'Modo Asistido / Sandbox'}
          </span>
        </div>

      </div>
    </div>
  );
};
