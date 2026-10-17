import React, { useState, useMemo } from 'react';
import {
  Wallet,
  Calendar,
  CheckCircle,
  FileText,
  Printer,
  DollarSign,
  Smartphone,
  CreditCard,
  Coins,
  CircleDollarSign,
  Banknote,
  Clock,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  X
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { DailyCashClosure, AccountBalance } from '../../types';
import { getTodayVenezuela, getSaleDateKey } from '../../utils/dateUtils';

export const CashClosure: React.FC = () => {
  const {
    accounts,
    sales,
    cashClosures,
    recordCashClosure,
    exchangeRate,
    userRole,
  } = useStore();

  const [notes, setNotes] = useState('');
  const [selectedClosureForPrint, setSelectedClosureForPrint] = useState<DailyCashClosure | null>(null);

  // Selected Date Calculation (default today in local Venezuela time YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayVenezuela());

  // Sales Calculation for Selected Date (excluding annulled sales!)
  const todaySales = useMemo(() => {
    return sales.filter((s) => s.estado !== 'anulada' && getSaleDateKey(s.fecha) === selectedDate);
  }, [sales, selectedDate]);

  const existingClosureForDate = useMemo(() => {
    return cashClosures.find((c) => c.fecha === selectedDate);
  }, [cashClosures, selectedDate]);

  const todayTotalUsd = useMemo(() => {
    return todaySales.reduce((acc, s) => acc + s.total_usd, 0);
  }, [todaySales]);

  const todayTotalBs = useMemo(() => {
    return todaySales.reduce((acc, s) => acc + s.total_bs, 0);
  }, [todaySales]);

  const todayPairsSold = useMemo(() => {
    return todaySales.reduce(
      (acc, s) => acc + s.items.reduce((sum, it) => sum + it.cantidad, 0),
      0
    );
  }, [todaySales]);

  // Today Breakdown by account
  const todayBreakdown = useMemo(() => {
    const map: Record<string, { moneda: 'USD' | 'Bs'; monto: number; monto_usd: number }> = {};
    todaySales.forEach((s) => {
      s.pagos.forEach((p) => {
        if (!map[p.cuenta]) {
          map[p.cuenta] = { moneda: p.moneda, monto: 0, monto_usd: 0 };
        }
        map[p.cuenta].monto += p.monto;
        map[p.cuenta].monto_usd += p.monto_equivalente_usd;
      });
    });

    return Object.entries(map).map(([cuenta, data]) => ({
      cuenta,
      moneda: data.moneda,
      monto: data.monto,
      monto_usd: data.monto_usd,
    }));
  }, [todaySales]);

  const handleExecuteClosure = () => {
    if (todaySales.length === 0) {
      if (!confirm(`No se han registrado ventas activas para la fecha ${selectedDate}. ¿Deseas guardar el arqueo con saldo cero?`)) {
        return;
      }
    }

    const closure = recordCashClosure(notes, selectedDate);
    setNotes('');
    setSelectedClosureForPrint(closure);
  };

  const getAccountIcon = (name: string) => {
    if (name.includes('Efectivo')) return <Banknote className="w-4 h-4 text-emerald-600" />;
    if (name.includes('Pago Móvil')) return <Smartphone className="w-4 h-4 text-amber-600" />;
    if (name.includes('Zelle')) return <CreditCard className="w-4 h-4 text-indigo-600" />;
    if (name.includes('Binance')) return <Coins className="w-4 h-4 text-yellow-600" />;
    if (name.includes('Cashea')) return <CircleDollarSign className="w-4 h-4 text-purple-600" />;
    return <Wallet className="w-4 h-4 text-slate-500" />;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
            <span>Arqueo y Cierre Diario de Caja</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Conciliación de pagos en multimoneda (USD, Bolívares, Pago Móvil, Zelle, Cashea) y corte de ventas del día.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-xs">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <span className="text-slate-500 font-medium">Fecha de Corte:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="font-bold text-slate-900 bg-white border border-slate-300 rounded px-2 py-0.5 font-mono text-xs focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Existing Closure Notice if already closed for this date */}
      {existingClosureForDate && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Arqueo registrado previamente:</strong> Ya existe un cierre de caja para el {selectedDate} por{' '}
              <strong>${existingClosureForDate.total_ventas_usd.toFixed(2)}</strong> ({existingClosureForDate.cantidad_transacciones} ventas) cerrado por {existingClosureForDate.usuario}.
            </span>
          </div>
          <button
            onClick={() => setSelectedClosureForPrint(existingClosureForDate)}
            className="px-2.5 py-1 bg-white border border-emerald-300 text-emerald-700 font-bold rounded-lg hover:bg-emerald-100 transition cursor-pointer"
          >
            Ver Comprobante
          </button>
        </div>
      )}

      {/* Account Balances Grid */}
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
          Saldos Actuales por Cuenta / Billetera
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="p-3 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2 gap-1">
                <span className="text-xs font-semibold text-slate-700 truncate">{acc.nombre}</span>
                <span className="shrink-0">{getAccountIcon(acc.nombre)}</span>
              </div>
              <div className="min-w-0">
                <div className="text-sm sm:text-base font-bold font-mono text-slate-900 truncate">
                  {acc.moneda === 'Bs'
                    ? `${acc.saldo.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Bs`
                    : `$${acc.saldo.toFixed(2)}`}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                  {acc.moneda === 'Bs'
                    ? `~$${(acc.saldo / exchangeRate).toFixed(2)} USD`
                    : `~${(acc.saldo * exchangeRate).toFixed(0)} Bs`}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Today's Cash Register Summary (Corte de Hoy) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* Left Column: Today's breakdown & Registering closure (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-4">
          
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-slate-900">
                {selectedDate === new Date().toISOString().split('T')[0] ? 'Corte del Día en Curso' : `Corte de Fecha: ${selectedDate}`}
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-500">
              {todaySales.length} {todaySales.length === 1 ? 'venta activa' : 'ventas activas'}
            </span>
          </div>

          {/* Totals Banner */}
          <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-center">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Total en USD</span>
              <div className="text-xl font-bold text-indigo-600 font-mono mt-0.5">
                ${todayTotalUsd.toFixed(2)}
              </div>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Equivalente en Bs</span>
              <div className="text-sm font-bold text-slate-800 font-mono mt-1">
                {todayTotalBs.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Bs
              </div>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Pares Vendidos</span>
              <div className="text-xl font-bold text-slate-900 font-mono mt-0.5">
                {todayPairsSold} <span className="text-xs font-normal text-slate-500">pares</span>
              </div>
            </div>
          </div>

          {/* Breakdown Table by Payment Account */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-800">
              Cobranza Desglosada por Billetera (Hoy):
            </div>

            {todayBreakdown.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                Aún no se han completado transacciones el día de hoy.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                {todayBreakdown.map((item) => (
                  <div key={item.cuenta} className="p-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {getAccountIcon(item.cuenta)}
                      <span className="font-medium text-slate-800">{item.cuenta}</span>
                    </div>
                    <div className="text-right font-mono">
                      <div className="font-bold text-slate-900">
                        {item.moneda === 'Bs'
                          ? `${item.monto.toFixed(2)} Bs`
                          : `$${item.monto.toFixed(2)}`}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {item.moneda === 'Bs'
                          ? `(~$${item.monto_usd.toFixed(2)} USD)`
                          : `(~${(item.monto * exchangeRate).toFixed(0)} Bs)`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Closure Notes & Execution */}
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Observaciones o Novedades de Caja (Opcional):
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej. Caja cuadrada al 100%. Sin faltantes ni sobrantes. Se cambiaron billetes deteriorados..."
                rows={2}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white"
              />
            </div>

            <button
              id="execute-closure-btn"
              onClick={handleExecuteClosure}
              className="w-full py-2.5 sm:py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>Registrar y Guardar Arqueo de Caja</span>
            </button>
          </div>

        </div>

        {/* Right Column: Historical Cash Closures (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-4">
          
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-900">Historial de Cierres de Caja</h2>
            </div>
            <span className="text-xs text-slate-500 font-semibold">
              {cashClosures.length} registros
            </span>
          </div>

          <div className="max-h-[500px] overflow-y-auto space-y-2.5 pr-1">
            {cashClosures.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No se han registrado cierres de caja aún. Haz clic en "Registrar y Guardar Arqueo" cuando concluya la jornada de ventas.
              </div>
            ) : (
              cashClosures.map((cl) => (
                <div
                  key={cl.id}
                  className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900 font-mono">{cl.fecha}</span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(cl.cerrado_at).toLocaleTimeString('es-VE')} • {cl.usuario}
                    </span>
                  </div>

                  <div className="flex justify-between items-baseline font-mono">
                    <span className="text-xs text-slate-500">{cl.cantidad_transacciones} ventas ({cl.pares_vendidos} pares):</span>
                    <span className="text-sm font-bold text-indigo-600">${cl.total_ventas_usd.toFixed(2)}</span>
                  </div>

                  {cl.notas && (
                    <p className="text-[11px] text-slate-600 italic bg-white p-2 rounded border border-slate-200">
                      "{cl.notas}"
                    </p>
                  )}

                  <div className="pt-2 border-t border-slate-200 flex justify-end">
                    <button
                      onClick={() => setSelectedClosureForPrint(cl)}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Ver / Imprimir Comprobante</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>

      </div>

      {/* Printable Closure Slip Modal */}
      {selectedClosureForPrint && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50 backdrop-blur-xs print:p-0 print:bg-white">
          <div className="bg-white border border-slate-200 rounded-xl max-w-sm w-full p-5 shadow-xl print:border-none print:shadow-none print:bg-white print:text-black font-mono text-xs">
            
            <div className="flex justify-between items-center pb-2 mb-2 border-b border-slate-100 print:hidden">
              <span className="font-bold text-slate-900 text-xs">Comprobante de Cierre</span>
              <button
                onClick={() => setSelectedClosureForPrint(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-center border-b border-dashed border-slate-300 pb-3 mb-3">
              <h2 className="text-base font-black tracking-wider text-slate-900">NEXOSS</h2>
              <p className="text-[11px] text-slate-600">COMPROBANTE DE CIERRE DE CAJA</p>
              <p className="text-[10px] text-slate-500">Fecha: {selectedClosureForPrint.fecha}</p>
              <p className="text-[10px] text-slate-500">
                Hora: {new Date(selectedClosureForPrint.cerrado_at).toLocaleTimeString('es-VE')}
              </p>
              <p className="text-[10px] text-slate-500">
                Responsable: {selectedClosureForPrint.usuario}
              </p>
            </div>

            <div className="space-y-1.5 border-b border-dashed border-slate-300 pb-3 mb-3 text-slate-800">
              <div className="flex justify-between font-bold">
                <span>TOTAL INGRESOS ($):</span>
                <span className="text-indigo-600">${selectedClosureForPrint.total_ventas_usd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>TOTAL INGRESOS (Bs):</span>
                <span>{selectedClosureForPrint.total_ventas_bs.toFixed(2)} Bs</span>
              </div>
              <div className="flex justify-between">
                <span>TRANSACCIONES:</span>
                <span>{selectedClosureForPrint.cantidad_transacciones}</span>
              </div>
              <div className="flex justify-between">
                <span>PARES DESPACHADOS:</span>
                <span>{selectedClosureForPrint.pares_vendidos} pares</span>
              </div>
            </div>

            {/* Breakdown */}
            <div className="border-b border-dashed border-slate-300 pb-3 mb-3 space-y-1 text-slate-800">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Detalle por Cuentas:</div>
              {selectedClosureForPrint.desglose_cuentas.map((d, i) => (
                <div key={i} className="flex justify-between text-[11px]">
                  <span>{d.cuenta}:</span>
                  <span className="font-semibold">{d.moneda === 'Bs' ? `${d.monto.toFixed(2)} Bs` : `$${d.monto.toFixed(2)}`}</span>
                </div>
              ))}
            </div>

            {selectedClosureForPrint.notas && (
              <div className="text-[10px] text-slate-600 mb-3 bg-slate-50 p-2 rounded">
                Notas: {selectedClosureForPrint.notas}
              </div>
            )}

            <div className="text-center text-[10px] text-slate-500 pt-3 border-t border-dashed border-slate-300">
              <div className="h-8 border-b border-slate-300 mb-1"></div>
              <p>Firma de Conformidad del Cajero / Administrador</p>
            </div>

            <div className="flex gap-2 mt-4 print:hidden">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimir
              </button>
              <button
                onClick={() => setSelectedClosureForPrint(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-medium rounded-lg text-xs cursor-pointer transition-colors"
              >
                Cerrar
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
