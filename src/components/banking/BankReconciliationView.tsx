import React, { useState, useMemo } from 'react';
import { useStore } from '../../context/StoreContext';
import { BankMovement } from '../../types';
import {
  Landmark,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  PlusCircle,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  ChevronRight,
  X,
  FileSpreadsheet,
  UploadCloud
} from 'lucide-react';
import { BdvFileImportModal } from './BdvFileImportModal';
import { GoogleSheetsSyncModal } from '../common/GoogleSheetsSyncModal';
import { CasheaExcelImportModal } from './CasheaExcelImportModal';

export const BankReconciliationView: React.FC = () => {
  const {
    bankMovements,
    addBankMovement,
    updateBankMovement,
    sales,
    expenses,
    exchangeRate,
    accounts,
    reconcileCasheaPayment,
    importBankMovements,
    applyCasheaExcelAbonos,
  } = useStore();

  const [activeReconciliationTab, setActiveReconciliationTab] = useState<'bancos' | 'cashea'>('bancos');
  const [isBdvModalOpen, setIsBdvModalOpen] = useState(false);
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [isCasheaExcelModalOpen, setIsCasheaExcelModalOpen] = useState(false);

  // Cashea Reconciliation Target State
  const [casheaReconcileTarget, setCasheaReconcileTarget] = useState<{
    saleId: string;
    paymentId: string;
    factura: string;
    cliente: string;
    montoUsd: number;
    montoBs: number;
  } | null>(null);
  const [casheaBankDest, setCasheaBankDest] = useState('Banco de Venezuela (0102)');
  const [casheaBankRef, setCasheaBankRef] = useState('');

  // Bank reconciliation filters
  const [bankFilter, setBankFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [movSearch, setMovSearch] = useState('');
  const [isNewMovModalOpen, setIsNewMovModalOpen] = useState(false);

  // New Movement Form State
  const todayIso = new Date().toISOString().split('T')[0];
  const [fecha, setFecha] = useState(todayIso);
  const [banco, setBanco] = useState('Banco de Venezuela (0102)');
  const [tipo, setTipo] = useState<'credito_ingreso' | 'debito_egreso'>('credito_ingreso');
  const [referencia, setReferencia] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [montoBs, setMontoBs] = useState('');
  const [notas, setNotas] = useState('');

  // Filtered bank movements
  const filteredMovements = useMemo(() => {
    return bankMovements.filter((m) => {
      const matchBank = bankFilter === 'todos' || m.banco.includes(bankFilter);
      const matchStatus = statusFilter === 'todos' || m.estado_conciliacion === statusFilter;
      const term = movSearch.toLowerCase();
      const matchSearch =
        (m.referencia || '').toLowerCase().includes(term) ||
        (m.descripcion || '').toLowerCase().includes(term) ||
        (m.banco || '').toLowerCase().includes(term);
      return matchBank && matchStatus && matchSearch;
    });
  }, [bankMovements, bankFilter, statusFilter, movSearch]);

  // Reconciliation Metrics
  const totalCreditosBs = useMemo(() => {
    return bankMovements
      .filter((m) => m.tipo === 'credito_ingreso')
      .reduce((sum, m) => sum + m.monto_bs, 0);
  }, [bankMovements]);

  const totalDebitosBs = useMemo(() => {
    return bankMovements
      .filter((m) => m.tipo === 'debito_egreso')
      .reduce((sum, m) => sum + m.monto_bs, 0);
  }, [bankMovements]);

  const totalConciliadoBs = useMemo(() => {
    return bankMovements
      .filter((m) => m.estado_conciliacion === 'conciliado')
      .reduce((sum, m) => sum + m.monto_bs, 0);
  }, [bankMovements]);

  const totalPendienteBs = useMemo(() => {
    return bankMovements
      .filter((m) => m.estado_conciliacion === 'pendiente')
      .reduce((sum, m) => sum + m.monto_bs, 0);
  }, [bankMovements]);

  // Cashea Payments Extraction (Pending bank credit vs already credited)
  const casheaItems = useMemo(() => {
    const pending: Array<{
      saleId: string;
      factura: string;
      cliente: string;
      fecha: string;
      totalFacturaUsd: number;
      paymentId: string;
      montoUsd: number;
      montoBs: number;
      montoExcelConciliadoUsd: number;
      estado: string;
      referencia?: string;
    }> = [];

    const conciliados: Array<{
      saleId: string;
      factura: string;
      cliente: string;
      fecha: string;
      totalFacturaUsd: number;
      paymentId: string;
      montoUsd: number;
      montoBs: number;
      montoExcelConciliadoUsd: number;
      estado: string;
      referencia?: string;
      bancoReceptor?: string;
    }> = [];

    sales.forEach((s) => {
      s.pagos.forEach((p) => {
        if ((p.cuenta || '').toLowerCase().includes('cashea')) {
          const excelAssignedUsd = bankMovements
            .filter((m) => m.vinculado_id === s.id && (m.notas || '').startsWith('CASHEA_EXCEL_ROW:'))
            .reduce((sum, m) => {
              try {
                const raw = (m.notas || '').split('CASHEA_EXCEL_ROW:')[1]?.split(' | ')[0];
                const details = JSON.parse(raw || '{}');
                return sum + Number(details.montoAsignado || details.montoUSD || 0);
              } catch { return sum; }
            }, 0);
          const restanteUsd = Math.max(0, p.monto_equivalente_usd - excelAssignedUsd);
          const item = {
            saleId: s.id,
            factura: s.numero_factura,
            cliente: `${s.cliente_nombre} ${s.cliente_apellido || ''}`.trim(),
            fecha: s.fecha,
            totalFacturaUsd: s.total_usd,
            paymentId: p.id,
            montoUsd: p.estado_liquidacion === 'conciliado_en_banco' ? p.monto_equivalente_usd : (restanteUsd <= 0.005 ? Math.min(p.monto_equivalente_usd, excelAssignedUsd) : restanteUsd),
            montoBs: (p.estado_liquidacion === 'conciliado_en_banco' ? p.monto_equivalente_usd : (restanteUsd <= 0.005 ? Math.min(p.monto_equivalente_usd, excelAssignedUsd) : restanteUsd)) * exchangeRate,
            montoExcelConciliadoUsd: excelAssignedUsd,
            estado: p.estado_liquidacion || 'pendiente_banco',
            referencia: p.referencia,
            bancoReceptor: p.cuenta_banco_liquidacion || (excelAssignedUsd > 0 ? 'Importado desde Excel Cashea' : undefined),
          };
          if (p.estado_liquidacion === 'conciliado_en_banco' || restanteUsd <= 0.005) {
            conciliados.push(item);
          } else {
            pending.push(item);
          }
        }
      });
    });

    return { pending, conciliados };
  }, [sales, exchangeRate, bankMovements]);

  const totalCasheaPendingUsd = useMemo(() => {
    return casheaItems.pending.reduce((sum, item) => sum + item.montoUsd, 0);
  }, [casheaItems.pending]);

  const handleConfirmCasheaReconciliation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!casheaReconcileTarget) return;

    reconcileCasheaPayment(
      casheaReconcileTarget.saleId,
      casheaReconcileTarget.paymentId,
      casheaBankDest,
      casheaBankRef.trim() || undefined
    );

    setCasheaReconcileTarget(null);
    setCasheaBankRef('');
  };

  // Auto-reconciliation algorithm: match bank movements with POS sales references
  const handleAutoReconcile = () => {
    let reconciledCount = 0;
    bankMovements.forEach((mov) => {
      if (mov.estado_conciliacion === 'pendiente') {
        // Find matching sale by reference
        const matchingSale = sales.find((s) =>
          s.pagos.some((p) => p.referencia && p.referencia.trim() === mov.referencia.trim())
        );

        // Or matching expense by reference
        const matchingExpense = expenses.find(
          (e) => e.comprobante_ref && e.comprobante_ref.trim() === mov.referencia.trim()
        );

        if (matchingSale) {
          updateBankMovement(mov.id, {
            estado_conciliacion: 'conciliado',
            vinculado_tipo: 'venta',
            vinculado_id: matchingSale.id,
            notas: `Conciliado automáticamente con Venta Factura N° ${matchingSale.numero_factura}`,
          });
          reconciledCount++;
        } else if (matchingExpense) {
          updateBankMovement(mov.id, {
            estado_conciliacion: 'conciliado',
            vinculado_tipo: 'gasto',
            vinculado_id: matchingExpense.id,
            notas: `Conciliado automáticamente con Gasto: ${matchingExpense.descripcion}`,
          });
          reconciledCount++;
        }
      }
    });

    if (reconciledCount > 0) {
      alert(`✅ Conciliación completada: Se cruzaron y cuadraron ${reconciledCount} movimiento(s) bancario(s).`);
    } else {
      alert('ℹ️ No se encontraron nuevas coincidencias exactas de referencia entre las ventas/gastos y los movimientos pendientes.');
    }
  };

  // Submit new movement
  const handleAddMovement = (e: React.FormEvent) => {
    e.preventDefault();
    const monto = parseFloat(montoBs);
    if (isNaN(monto) || monto <= 0 || !referencia.trim() || !descripcion.trim()) {
      alert('Por favor complete todos los campos requeridos con valores válidos.');
      return;
    }

    const usdVal = Number((monto / exchangeRate).toFixed(2));

    addBankMovement({
      fecha,
      banco,
      tipo,
      referencia: referencia.trim(),
      descripcion: descripcion.trim(),
      monto_bs: monto,
      monto_usd: usdVal,
      estado_conciliacion: 'pendiente',
      notas: notas.trim() || undefined,
    });

    setReferencia('');
    setDescripcion('');
    setMontoBs('');
    setNotas('');
    setIsNewMovModalOpen(false);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-600">
            <Landmark className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Conciliación Bancaria
            </h1>
            <p className="text-xs text-slate-500">
              Concilia cuentas bancarias (Banco de Venezuela, Banesco, etc.), carga tus estados de cuenta oficiales y cruza pagos automáticamente con tus ventas.
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsSheetsModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold transition cursor-pointer shadow-2xs"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Google Sheets</span>
          </button>

          <button
            onClick={() => setIsBdvModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-xs"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Importar Archivo BDV</span>
          </button>

          <button
            onClick={() => setIsNewMovModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-xs"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Nuevo Movimiento</span>
          </button>
        </div>
      </div>

      {/* RECONCILIATION DASHBOARD */}
      <div className="space-y-6">
          {/* Metric cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
                <span>Créditos / Ingresos Banco</span>
                <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-md">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-xl font-bold text-slate-900">
                  {totalCreditosBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                ≈ ${(totalCreditosBs / exchangeRate).toFixed(2)} USD
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
                <span>Débitos / Pagos Emitidos</span>
                <div className="p-1.5 bg-rose-50 text-rose-600 rounded-md">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-xl font-bold text-slate-900">
                  {totalDebitosBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                ≈ ${(totalDebitosBs / exchangeRate).toFixed(2)} USD
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
              <div className="flex items-center justify-between text-emerald-700 text-xs font-semibold uppercase">
                <span>Total Conciliado</span>
                <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-md">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-xl font-bold text-emerald-800">
                  {totalConciliadoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                </span>
              </div>
              <p className="text-[11px] text-emerald-600 mt-1">
                Verificados y cuadrados en banco
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs">
              <div className="flex items-center justify-between text-amber-700 text-xs font-semibold uppercase">
                <span>Bancos Pendiente</span>
                <div className="p-1.5 bg-amber-100 text-amber-700 rounded-md">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-xl font-bold text-amber-800">
                  {totalPendienteBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                </span>
              </div>
              <p className="text-[11px] text-amber-600 mt-1">
                Por cruzar con referencia POS
              </p>
            </div>

            {/* 5th Card: Cashea por Conciliar */}
            <div
              onClick={() => setActiveReconciliationTab('cashea')}
              className={`p-5 rounded-xl border shadow-xs transition cursor-pointer ${
                activeReconciliationTab === 'cashea'
                  ? 'bg-amber-500 text-white border-amber-600 ring-2 ring-amber-400'
                  : 'bg-amber-50/70 border-amber-200 text-slate-900 hover:bg-amber-100/50'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-semibold uppercase">
                <span className={activeReconciliationTab === 'cashea' ? 'text-amber-100' : 'text-amber-800 font-bold'}>
                  Cashea en Banco
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                  activeReconciliationTab === 'cashea' ? 'bg-amber-600 text-white' : 'bg-amber-200 text-amber-900'
                }`}>
                  {casheaItems.pending.length} Pend.
                </span>
              </div>
              <div className="mt-2">
                <span className="text-xl font-bold">
                  ${totalCasheaPendingUsd.toFixed(2)} USD
                </span>
              </div>
              <p className={`text-[11px] mt-1 ${activeReconciliationTab === 'cashea' ? 'text-amber-100' : 'text-amber-700 font-medium'}`}>
                ≈ {(totalCasheaPendingUsd * exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
              </p>
            </div>
          </div>

          {/* Module Tabs */}
          <div className="flex border-b border-slate-200 gap-4">
            <button
              type="button"
              onClick={() => setActiveReconciliationTab('bancos')}
              className={`pb-3 text-xs md:text-sm font-bold flex items-center gap-2 border-b-2 transition cursor-pointer ${
                activeReconciliationTab === 'bancos'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Landmark className="w-4 h-4" />
              <span>Movimientos de Cuentas Bancarias</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-normal">
                {bankMovements.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveReconciliationTab('cashea')}
              className={`pb-3 text-xs md:text-sm font-bold flex items-center gap-2 border-b-2 transition cursor-pointer ${
                activeReconciliationTab === 'cashea'
                  ? 'border-amber-500 text-amber-800'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Clock className="w-4 h-4 text-amber-600" />
              <span>Liquidaciones Cashea en Banco</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                casheaItems.pending.length > 0 ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-600'
              }`}>
                {casheaItems.pending.length} por conciliar
              </span>
            </button>
          </div>

          {/* VIEW: CASHEA RECONCILIATION */}
          {activeReconciliationTab === 'cashea' && (
            <div className="space-y-4">
              {/* Guidance banner */}
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
                <div className="p-2 bg-amber-500 text-white rounded-lg shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div className="text-xs text-amber-950 space-y-1">
                  <p className="font-bold text-sm">Conciliación de Liquidaciones Cashea en Banco</p>
                  <p className="text-amber-800 leading-relaxed">
                    Las facturas cobradas con Cashea quedan registradas en el sistema. La <strong>Inicial</strong> pagada con Punto de Venta o Pago Móvil ingresó en positivo de inmediato a tu caja. El <strong>saldo financiado por Cashea</strong> queda registrado aquí para ser acreditado en positivo a tu cuenta bancaria cuando Cashea liquide los fondos.
                  </p>
                </div>
              </div>

              {/* Pending Cashea Invoices */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">
                      Ventas con Cuotas Cashea Pendientes por Recibir en Banco
                    </h3>
                    <p className="text-xs text-slate-500">
                      Selecciona una factura para marcar la liquidación recibida en tu banco
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                      Total: ${totalCasheaPendingUsd.toFixed(2)} USD
                    </span>
                    <button type="button" onClick={() => setIsCasheaExcelModalOpen(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm">
                      <UploadCloud className="w-4 h-4" /> Conciliar subiendo Excel
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Factura</th>
                        <th className="py-3 px-4 font-semibold">Fecha Venta</th>
                        <th className="py-3 px-4 font-semibold">Cliente</th>
                        <th className="py-3 px-4 font-semibold text-right">Total Factura</th>
                        <th className="py-3 px-4 font-semibold text-right">Por Liquidar Cashea (USD)</th>
                        <th className="py-3 px-4 font-semibold text-right">Por Liquidar Cashea (Bs)</th>
                        <th className="py-3 px-4 font-semibold text-center">Estado</th>
                        <th className="py-3 px-4 font-semibold text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {casheaItems.pending.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-slate-400">
                            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                            <p className="font-semibold text-slate-700">¡Al día! No hay ventas Cashea pendientes por conciliar.</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">Todas las liquidaciones han sido acreditadas en tus cuentas bancarias.</p>
                          </td>
                        </tr>
                      ) : (
                        casheaItems.pending.map((item) => (
                          <tr key={`${item.saleId}-${item.paymentId}`} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-4 font-mono font-bold text-indigo-700 whitespace-nowrap">
                              {item.factura}
                            </td>
                            <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                              {item.fecha}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-900">
                              {item.cliente || 'Cliente General'}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold text-slate-600 whitespace-nowrap">
                              ${item.totalFacturaUsd.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-amber-700 whitespace-nowrap">
                              ${item.montoUsd.toFixed(2)} USD
                            </td>
                            <td className="py-3 px-4 text-right font-medium text-slate-700 whitespace-nowrap">
                              {item.montoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                            </td>
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                <Clock className="w-3 h-3 text-amber-600" />
                                <span>Pendiente en Banco</span>
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              <button
                                type="button"
                                disabled={item.montoExcelConciliadoUsd > 0.005}
                                title={item.montoExcelConciliadoUsd > 0.005 ? 'Esta factura ya tiene cuotas registradas desde Excel. Importa las cuotas restantes para evitar duplicar el abono.' : 'Conciliar manualmente'}
                                onClick={() => {
                                  setCasheaReconcileTarget({
                                    saleId: item.saleId,
                                    paymentId: item.paymentId,
                                    factura: item.factura,
                                    cliente: item.cliente,
                                    montoUsd: item.montoUsd,
                                    montoBs: item.montoBs,
                                  });
                                  setCasheaBankRef('');
                                }}
                                className="px-3 py-1 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-[11px] font-bold shadow-2xs transition cursor-pointer"
                              >
                                {item.montoExcelConciliadoUsd > 0.005 ? 'Continuar por Excel' : 'Conciliar en Banco'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Reconciled Cashea Invoices History */}
              {casheaItems.conciliados.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="p-4 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800">
                      Historial de Liquidaciones Cashea Acreditadas en Banco ({casheaItems.conciliados.length})
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-600">
                      <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4 font-semibold">Factura</th>
                          <th className="py-3 px-4 font-semibold">Fecha Venta</th>
                          <th className="py-3 px-4 font-semibold">Cliente</th>
                          <th className="py-3 px-4 font-semibold">Banco Receptor</th>
                          <th className="py-3 px-4 font-semibold">Referencia / Lote</th>
                          <th className="py-3 px-4 font-semibold text-right">Monto Acreditado (USD)</th>
                          <th className="py-3 px-4 font-semibold text-center">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {casheaItems.conciliados.map((item) => (
                          <tr key={`conc-${item.saleId}-${item.paymentId}`} className="hover:bg-slate-50">
                            <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                              {item.factura}
                            </td>
                            <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                              {item.fecha}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-800">
                              {item.cliente || 'Cliente General'}
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-700 whitespace-nowrap">
                              {item.bancoReceptor || 'Banco de Venezuela (0102)'}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                              {item.referencia || 'N/A'}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-emerald-700 whitespace-nowrap">
                              +${item.montoUsd.toFixed(2)} USD
                            </td>
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Acreditado en Banco</span>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW: BANK MOVEMENTS (BDV, Banesco, etc.) */}
          {activeReconciliationTab === 'bancos' && (
            <>
              {/* Action Bar & Filters */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative min-w-[200px] flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar por referencia, banco o descripción..."
                  value={movSearch}
                  onChange={(e) => setMovSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              <select
                value={bankFilter}
                onChange={(e) => setBankFilter(e.target.value)}
                className="text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none"
              >
                <option value="todos">Todos los Bancos</option>
                <option value="Venezuela">Banco de Venezuela (BDV)</option>
                <option value="Banesco">Banesco</option>
                <option value="Mercantil">Mercantil</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none"
              >
                <option value="todos">Todos los Estados</option>
                <option value="conciliado">Conciliados</option>
                <option value="pendiente">Pendientes</option>
                <option value="discrepancia">Discrepancias</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setIsBdvModalOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
                title="Subir archivo o pegar estado de cuenta de Banco de Venezuela (0102)"
              >
                <Landmark className="w-3.5 h-3.5" />
                <span>Subir Formato BDV</span>
              </button>

              <button
                onClick={() => setIsSheetsModalOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
                title="Sincronizar conciliación bancaria y balance con Google Sheets"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Google Sheets</span>
              </button>

              <button
                onClick={handleAutoReconcile}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                title="Cruce automático de referencias con las ventas registradas"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Auto-Conciliar</span>
              </button>

              <button
                onClick={() => setIsNewMovModalOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Registrar Manual</span>
              </button>
            </div>
          </div>

          {/* Movements Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Fecha</th>
                    <th className="py-3 px-4 font-semibold">Banco</th>
                    <th className="py-3 px-4 font-semibold">Tipo</th>
                    <th className="py-3 px-4 font-semibold">Referencia</th>
                    <th className="py-3 px-4 font-semibold">Descripción & Cruce</th>
                    <th className="py-3 px-4 font-semibold text-right">Monto (Bs)</th>
                    <th className="py-3 px-4 font-semibold text-right">Equiv. (USD)</th>
                    <th className="py-3 px-4 font-semibold text-center">Estado</th>
                    <th className="py-3 px-4 font-semibold text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        No hay movimientos bancarios que coincidan con los filtros.
                      </td>
                    </tr>
                  ) : (
                    filteredMovements.map((mov) => {
                      const isIngreso = mov.tipo === 'credito_ingreso';
                      const isConciliado = mov.estado_conciliacion === 'conciliado';
                      return (
                        <tr key={mov.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-800">
                            {mov.fecha}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                            {mov.banco}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                              isIngreso ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                            }`}>
                              {isIngreso ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                              <span>{isIngreso ? 'Crédito / Abono' : 'Débito / Cargo'}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-indigo-700 whitespace-nowrap">
                            {mov.referencia}
                          </td>
                          <td className="py-3 px-4 max-w-[240px]">
                            <p className="font-medium text-slate-800 truncate" title={mov.descripcion}>
                              {mov.descripcion}
                            </p>
                            {mov.notas && (
                              <p className="text-[11px] text-emerald-600 truncate" title={mov.notas}>
                                {mov.notas}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
                            {isIngreso ? '+' : '-'}{mov.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-slate-500 whitespace-nowrap">
                            ${mov.monto_usd ? mov.monto_usd.toFixed(2) : (mov.monto_bs / exchangeRate).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isConciliado
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : mov.estado_conciliacion === 'discrepancia'
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}>
                              {isConciliado ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Conciliado</span>
                                </>
                              ) : mov.estado_conciliacion === 'discrepancia' ? (
                                <>
                                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                                  <span>Discrepancia</span>
                                </>
                              ) : (
                                <>
                                  <Clock className="w-3 h-3 text-amber-600" />
                                  <span>Pendiente</span>
                                </>
                              )}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <button
                              onClick={() => {
                                const nextState = isConciliado ? 'pendiente' : 'conciliado';
                                updateBankMovement(mov.id, {
                                  estado_conciliacion: nextState,
                                  notas: nextState === 'conciliado' ? 'Marcado como conciliado manualmente' : undefined
                                });
                              }}
                              className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                                isConciliado
                                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {isConciliado ? 'Desmarcar' : 'Validar'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      </div>

      {/* Modal: Conciliar Liquidación Cashea en Banco */}
      {casheaReconcileTarget && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-amber-600 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="w-5 h-5 text-amber-200" />
                <h3 className="font-bold text-sm">Conciliar Liquidación Cashea en Banco</h3>
              </div>
              <button
                onClick={() => setCasheaReconcileTarget(null)}
                className="text-amber-200 hover:text-white p-1 rounded-lg hover:bg-amber-700/50 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs space-y-1">
                <div className="flex justify-between font-bold text-slate-800">
                  <span>Factura: {casheaReconcileTarget.factura}</span>
                  <span className="text-amber-800">${casheaReconcileTarget.montoUsd.toFixed(2)} USD</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Cliente: {casheaReconcileTarget.cliente || 'General'}</span>
                  <span>{casheaReconcileTarget.montoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cuenta Bancaria donde cayó la liquidación *
                </label>
                <select
                  value={casheaBankDest}
                  onChange={(e) => setCasheaBankDest(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500 font-medium"
                >
                  <option value="Banco de Venezuela (0102)">Banco de Venezuela (0102)</option>
                  <option value="Banesco (0134)">Banesco (0134)</option>
                  <option value="Mercantil (0105)">Mercantil (0105)</option>
                  <option value="Bancamiga (0172)">Bancamiga (0172)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  N° Referencia Bancaria / Lote Cashea *
                </label>
                <input
                  type="text"
                  placeholder="Ej: CSH-884920 o ref de transferencia"
                  value={casheaBankRef}
                  onChange={(e) => setCasheaBankRef(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500 font-mono"
                  required
                />
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-[11px] text-emerald-800 space-y-0.5">
                <p className="font-bold flex items-center gap-1 text-emerald-900">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Efecto contable automático
                </p>
                <p>
                  Al confirmar, se creará un <strong>Crédito (+) en {casheaBankDest}</strong> por <strong>{casheaReconcileTarget.montoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</strong> (${casheaReconcileTarget.montoUsd.toFixed(2)} USD) aumentando tu saldo real en banco, y la cuota de la factura quedará 100% conciliada.
                </p>
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCasheaReconcileTarget(null)}
                  className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCasheaReconciliation}
                  disabled={!casheaBankRef.trim()}
                  className="flex-1 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg transition shadow-xs cursor-pointer"
                >
                  Confirmar en Banco
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Registrar Movimiento Bancario */}
      {isNewMovModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Landmark className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-sm">Registrar Movimiento Bancario</h3>
              </div>
              <button
                onClick={() => setIsNewMovModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddMovement} className="p-5 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Fecha</label>
                  <input
                    type="date"
                    required
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Banco</label>
                  <select
                    value={banco}
                    onChange={(e) => setBanco(e.target.value)}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <option value="Banco de Venezuela (0102)">Banco de Venezuela (0102)</option>
                    <option value="Banesco (0134)">Banesco (0134)</option>
                    <option value="Mercantil (0105)">Mercantil (0105)</option>
                    <option value="BBVA Provincial (0108)">BBVA Provincial (0108)</option>
                    <option value="Bancaribe (0114)">Bancaribe (0114)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Movimiento</label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as 'credito_ingreso' | 'debito_egreso')}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                  >
                    <option value="credito_ingreso">+ Crédito / Ingreso (Pago Móvil / Abono)</option>
                    <option value="debito_egreso">- Débito / Egreso (Pago / Comisión)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    N° Referencia Bancaria *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: 481920"
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-indigo-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Descripción o Concepto del Banco *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: PAGO MOVIL C2P / TRANSFERENCIA CLIENTE"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Monto en Bolívares (Bs) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    required
                    min="0.01"
                    placeholder="0.00"
                    value={montoBs}
                    onChange={(e) => setMontoBs(e.target.value)}
                    className="w-full text-sm font-bold p-2 bg-slate-50 border border-slate-200 rounded-lg pl-8"
                  />
                  <span className="absolute left-2.5 top-2 text-xs text-slate-400 font-bold">Bs</span>
                </div>
                {parseFloat(montoBs) > 0 && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Equivalente: <span className="font-bold text-slate-800">${(parseFloat(montoBs) / exchangeRate).toFixed(2)} USD</span> al cambio BCV ({exchangeRate.toFixed(2)} Bs/USD).
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notas internas</label>
                <input
                  type="text"
                  placeholder="Observación opcional..."
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewMovModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                >
                  Guardar Movimiento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BDV Import Modal */}
      <BdvFileImportModal
        isOpen={isBdvModalOpen}
        onClose={() => setIsBdvModalOpen(false)}
      />

      <CasheaExcelImportModal
        isOpen={isCasheaExcelModalOpen}
        onClose={() => setIsCasheaExcelModalOpen(false)}
        sales={sales}
        bankMovements={bankMovements}
        exchangeRate={exchangeRate}
        importBankMovements={importBankMovements}
        applyCasheaExcelAbonos={applyCasheaExcelAbonos}
      />

      {/* Google Sheets Sync Modal */}
      <GoogleSheetsSyncModal
        isOpen={isSheetsModalOpen}
        onClose={() => setIsSheetsModalOpen(false)}
        periodLabel="Conciliación BDV & Movimientos"
      />
    </div>
  );
};
