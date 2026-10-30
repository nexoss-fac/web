import React, { useState, useMemo } from 'react';
import { useStore } from '../../context/StoreContext';
import { Expense, ExpenseCategory, Currency } from '../../types';
import { EXPENSE_CUENTA, EXPENSE_PARTIDA, EXPENSE_SUBACCOUNTS, UNCLASSIFIED_EXPENSE, expenseSubaccountsAlphabetical, normalizeExpenseCategory } from '../../domain/expenseChart';
import {
  TrendingDown,
  TrendingUp,
  DollarSign,
  PlusCircle,
  Search,
  Filter,
  Trash2,
  Calendar,
  Building,
  Tag,
  CreditCard,
  FileText,
  PieChart,
  Download,
  AlertCircle,
  X,
  CheckCircle2,
  FileSpreadsheet,
  ArrowRightLeft,
  Coins,
  Receipt,
  Scale,
  HelpCircle,
  ExternalLink,
  Camera,
  Sparkles,
  Eye,
  Calculator
} from 'lucide-react';
import { CurrencyPurchaseModal } from './CurrencyPurchaseModal';
import { GoogleSheetsSyncModal } from '../common/GoogleSheetsSyncModal';
import { ReceiptScannerModal } from './ReceiptScannerModal';
import { ManufacturingCosting } from './ManufacturingCosting';

export const ExpensesManager: React.FC = () => {
  const {
    expenses: storedExpenses,
    addExpense,
    deleteExpense,
    sales,
    exchangeRate,
    accounts,
    currencyPurchases,
    deleteCurrencyPurchase,
    getExchangeRateForDate,
    setExchangeRateForDate,
  } = useStore();

  // Los gastos guardados antes de la norma se muestran con su subcuenta equivalente.
  const expenses = useMemo(
    () => storedExpenses.map((item) => ({ ...item, categoria: normalizeExpenseCategory(item.categoria) })),
    [storedExpenses],
  );
  const [categoryOrder, setCategoryOrder] = useState<'norma' | 'alfabetico'>('norma');
  const categoryOptions = useMemo<ExpenseCategory[]>(
    () => (categoryOrder === 'norma' ? [...EXPENSE_SUBACCOUNTS] : expenseSubaccountsAlphabetical()),
    [categoryOrder],
  );
  const hasUnclassified = expenses.some((item) => item.categoria === UNCLASSIFIED_EXPENSE);

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todas');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('este_mes'); // 'este_mes' | 'mes_anterior' | 'todo'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCurrencyModalOpen, setIsCurrencyModalOpen] = useState(false);
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [showCosting, setShowCosting] = useState(false);

  // Form State
  const todayIso = new Date().toISOString().split('T')[0];
  const [fecha, setFecha] = useState(todayIso);
  const [tasaGasto, setTasaGasto] = useState<string>(() => exchangeRate.toString());
  const [isCustomTasa, setIsCustomTasa] = useState(false);
  const [categoria, setCategoria] = useState<ExpenseCategory>(EXPENSE_SUBACCOUNTS[0]);
  const [descripcion, setDescripcion] = useState('');
  const [beneficiario, setBeneficiario] = useState('');
  const [beneficiarioRif, setBeneficiarioRif] = useState('');
  const [cuentaOrigen, setCuentaOrigen] = useState(accounts[0]?.nombre || 'Efectivo USD');
  const [moneda, setMoneda] = useState<Currency>('USD');
  const [montoInput, setMontoInput] = useState('');
  const [comprobanteRef, setComprobanteRef] = useState('');
  const [notas, setNotas] = useState('');
  const [formError, setFormError] = useState('');

  // Month date range helpers
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
  const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
  const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  // Filtered sales according to selected period
  const periodSales = useMemo(() => {
    return sales.filter((s) => {
      const saleDate = s.fecha.split('T')[0];
      if (selectedPeriod === 'este_mes') {
        return saleDate.startsWith(currentMonthStr);
      } else if (selectedPeriod === 'mes_anterior') {
        return saleDate.startsWith(lastMonthStr);
      }
      return true;
    });
  }, [sales, selectedPeriod, currentMonthStr, lastMonthStr]);

  // Filtered expenses according to period and search
  const periodExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (selectedPeriod === 'este_mes') {
        return e.fecha.startsWith(currentMonthStr);
      } else if (selectedPeriod === 'mes_anterior') {
        return e.fecha.startsWith(lastMonthStr);
      }
      return true;
    });
  }, [expenses, selectedPeriod, currentMonthStr, lastMonthStr]);

  const displayedExpenses = useMemo(() => {
    return periodExpenses.filter((e) => {
      const matchCat = selectedCategory === 'todas' || e.categoria === selectedCategory;
      const term = searchTerm.toLowerCase();
      const matchSearch =
        (e.descripcion || '').toLowerCase().includes(term) ||
        (e.beneficiario && (e.beneficiario || '').toLowerCase().includes(term)) ||
        (e.comprobante_ref && (e.comprobante_ref || '').toLowerCase().includes(term)) ||
        (e.cuenta_origen || '').toLowerCase().includes(term);
      return matchCat && matchSearch;
    });
  }, [periodExpenses, selectedCategory, searchTerm]);

  // Filtered currency purchases according to selected period
  const periodCurrencyPurchases = useMemo(() => {
    return currencyPurchases.filter((c) => {
      const pDate = c.fecha.split('T')[0];
      if (selectedPeriod === 'este_mes') {
        return pDate.startsWith(currentMonthStr);
      } else if (selectedPeriod === 'mes_anterior') {
        return pDate.startsWith(lastMonthStr);
      }
      return true;
    });
  }, [currencyPurchases, selectedPeriod, currentMonthStr, lastMonthStr]);

  // Bolívares usados para comprar divisas
  const totalBsGastadosDivisas = useMemo(() => {
    return periodCurrencyPurchases.reduce((sum, c) => sum + c.monto_bs_gastado, 0);
  }, [periodCurrencyPurchases]);

  // Dólares recibidos por la compra (Binance, Zelle, Efectivo)
  const totalUsdRecibidosDivisas = useMemo(() => {
    return periodCurrencyPurchases.reduce((sum, c) => sum + c.monto_usd_recibido, 0);
  }, [periodCurrencyPurchases]);

  // Financial Metrics (Fin de Mes / Profit & Loss)
  const totalIngresosUsd = useMemo(() => {
    return periodSales.reduce((sum, s) => sum + s.total_usd, 0);
  }, [periodSales]);

  const totalIngresosBs = useMemo(() => {
    return periodSales.reduce((sum, s) => sum + s.total_bs, 0);
  }, [periodSales]);

  const costoMercanciaUsd = useMemo(() => {
    return periodSales.reduce((sum, s) => sum + (s.costo_total_usd || 0), 0);
  }, [periodSales]);

  const totalGastosUsd = useMemo(() => {
    return periodExpenses.reduce((sum, e) => sum + e.monto_usd, 0);
  }, [periodExpenses]);

  const totalGastosBs = useMemo(() => {
    return periodExpenses.reduce((sum, e) => sum + e.monto_bs, 0);
  }, [periodExpenses]);

  // Utilidad Bruta = Ingresos - Costo Mercancía
  const utilidadBrutaUsd = totalIngresosUsd - costoMercanciaUsd;
  
  // Utilidad Neta (Cuánto va quedando en fin de mes) = Utilidad Bruta - Gastos Operativos
  const utilidadNetaUsd = utilidadBrutaUsd - totalGastosUsd;
  const utilidadNetaBs = utilidadNetaUsd * exchangeRate;

  // Lógica solicitada por el usuario:
  // "en el reporte de fin de mes se puede agregar divisas, binance o zelle que se hayan comprado
  // con los bs que se tienen en positivo teniendo un positivo en solo dolares a parte de la entrada
  // que se tiene de bs se descuente de ahí"
  
  // Saldo restante en Bolívares descontando los Bs usados para comprar divisas y gastos en Bs
  const saldoRestanteBs = Math.max(0, totalIngresosBs - totalGastosBs - totalBsGastadosDivisas);

  // Positivo en solo dólares: utilidad en USD más los dólares adquiridos con los Bs positivos
  const positivoEnSoloDolaresUsd = utilidadNetaUsd + totalUsdRecibidosDivisas;

  const margenNeto = totalIngresosUsd > 0 ? (utilidadNetaUsd / totalIngresosUsd) * 100 : 0;

  // Breakdown by category
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    periodExpenses.forEach((e) => {
      map[e.categoria] = (map[e.categoria] || 0) + e.monto_usd;
    });
    return Object.entries(map)
      .map(([cat, amount]) => ({
        categoria: cat,
        monto_usd: amount,
        porcentaje: totalGastosUsd > 0 ? (amount / totalGastosUsd) * 100 : 0,
      }))
      .sort((a, b) => b.monto_usd - a.monto_usd);
  }, [periodExpenses, totalGastosUsd]);

  const lookupSupplier = async (byDocument: boolean): Promise<boolean> => {
    const value = (byDocument ? beneficiarioRif : beneficiario).trim();
    if (!value) return false;
    try {
      const query = byDocument
        ? `tipo=proveedor&documento=${encodeURIComponent(value)}`
        : `tipo=proveedor&nombre=${encodeURIComponent(value)}`;
      const response = await fetch(`/api/contacts?${query}`);
      if (!response.ok) return false;
      const data = await response.json();
      if (data?.contact) {
        setBeneficiario(data.contact.nombre || beneficiario);
        setBeneficiarioRif(data.contact.documento || beneficiarioRif);
        return true;
      }
    } catch (error) { console.warn('No se pudo consultar el directorio de proveedores:', error); }
    return false;
  };

  // Alta/actualización automática al completar el nombre y el RIF/cédula.
  const saveSupplierContact = async () => {
    const name = beneficiario.trim();
    const document = beneficiarioRif.trim();
    if (!name || !document) return;
    try {
      await fetch('/api/contacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'proveedor', documento: document, nombre: name }),
      });
    } catch (error) { console.warn('No se pudo guardar el proveedor:', error); }
  };

  // Handle Form Submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const numMonto = parseFloat(montoInput);
    if (isNaN(numMonto) || numMonto <= 0) {
      setFormError('Por favor ingrese un monto numérico válido mayor a cero.');
      return;
    }

    if (!descripcion.trim()) {
      setFormError('La descripción del gasto es obligatoria.');
      return;
    }

    const effectiveTasa = parseFloat(tasaGasto) > 0 ? parseFloat(tasaGasto) : getExchangeRateForDate(fecha);

    let montoUsd = 0;
    let montoBs = 0;

    if (moneda === 'USD') {
      montoUsd = numMonto;
      montoBs = numMonto * effectiveTasa;
    } else {
      montoBs = numMonto;
      montoUsd = effectiveTasa > 0 ? numMonto / effectiveTasa : 0;
    }

    addExpense({
      fecha,
      categoria,
      descripcion: descripcion.trim(),
      beneficiario: beneficiario.trim() || undefined,
      beneficiario_rif: beneficiarioRif.trim() || undefined,
      cuenta_origen: cuentaOrigen,
      moneda,
      monto: numMonto,
      tasa_cambio: effectiveTasa,
      monto_usd: Number(montoUsd.toFixed(2)),
      monto_bs: Number(montoBs.toFixed(2)),
      comprobante_ref: comprobanteRef.trim() || undefined,
      registrado_por: 'Admin / Gerencia',
      notas: notas.trim() || undefined,
    });

    // Guarda el proveedor por RIF o nombre para reutilizarlo en próximos gastos.
    if (beneficiario.trim()) {
      void fetch('/api/contacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'proveedor', documento: beneficiarioRif.trim(), nombre: beneficiario.trim() }),
      }).catch((error) => console.warn('No se pudo guardar el proveedor:', error));
    }

    setExchangeRateForDate(fecha, effectiveTasa);

    // Reset Form
    setDescripcion('');
    setBeneficiario('');
    setBeneficiarioRif('');
    setMontoInput('');
    setComprobanteRef('');
    setNotas('');
    setIsModalOpen(false);
  };

  // Export CSV
  const handleExportCsv = () => {
    const headers = ['Fecha', 'Categoría', 'Descripción', 'Beneficiario', 'Cuenta', 'Moneda', 'Monto Original', 'Monto USD', 'Monto Bs', 'Comprobante', 'Notas'];
    const rows = displayedExpenses.map((e) => [
      e.fecha,
      `"${e.categoria}"`,
      `"${e.descripcion.replace(/"/g, '""')}"`,
      `"${(e.beneficiario || '').replace(/"/g, '""')}"`,
      `"${e.cuenta_origen}"`,
      e.moneda,
      e.monto,
      e.monto_usd,
      e.monto_bs,
      `"${e.comprobante_ref || ''}"`,
      `"${(e.notas || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `gastos_nexoss_${selectedPeriod}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const periodLabel = selectedPeriod === 'este_mes' 
    ? 'Mes Actual (Septiembre 2026)' 
    : selectedPeriod === 'mes_anterior' 
      ? 'Mes Anterior (Agosto 2026)' 
      : 'Histórico Total';

  if (showCosting) return <div className="space-y-4 pb-12"><button onClick={() => setShowCosting(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">← Volver a Gastos</button><ManufacturingCosting /></div>;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex justify-end"><button onClick={() => setShowCosting(true)} className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"><Calculator className="h-4 w-4"/> Centro de costos y nómina</button></div>
      {/* Header Bar */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-600">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Control de Gastos & Fin de Mes
              </h1>
              <p className="text-xs text-slate-500">
                Registra los costos operativos, nóminas, alquiler y calcula con exactitud cuánto se hizo y cuánto va quedando.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Period Selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-medium shrink-0">
            <button
              onClick={() => setSelectedPeriod('este_mes')}
              className={`px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                selectedPeriod === 'este_mes'
                  ? 'bg-white text-slate-900 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Este Mes
            </button>
            <button
              onClick={() => setSelectedPeriod('mes_anterior')}
              className={`px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                selectedPeriod === 'mes_anterior'
                  ? 'bg-white text-slate-900 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mes Anterior
            </button>
            <button
              onClick={() => setSelectedPeriod('todo')}
              className={`px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                selectedPeriod === 'todo'
                  ? 'bg-white text-slate-900 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todo
            </button>
          </div>

          <button
            id="btn-nuevo-gasto"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer shrink-0 whitespace-nowrap"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Registrar Gasto</span>
          </button>

          <button
            onClick={() => setIsCurrencyModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            title="Registrar compra de Binance USDT, Zelle o Dólares Efectivo con Bolívares"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Comprar Divisas</span>
          </button>

          <button
            onClick={() => setIsScannerModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer shrink-0 whitespace-nowrap border border-slate-700"
            title="Extraer datos de factura con IA"
          >
            <Camera className="w-4 h-4 text-cyan-400" />
            <span>Escanear Factura</span>
            <span className="text-[9px] px-1 py-0.2 bg-white/20 rounded font-mono font-bold">IA</span>
          </button>

          <button
            onClick={() => setIsSheetsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            title="Exportar reporte de fin de mes a Google Sheets"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Sheets</span>
          </button>
        </div>
      </div>

      {/* Financial Summary Cards: ¿Cuánto se hizo, cuánto se gastó, cuánto va quedando? */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Ingresos (Ventas) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              1. Cuánto se Hizo (Ventas)
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900">
              ${totalIngresosUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-500 font-medium ml-1">USD</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>{totalIngresosBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs</span>
            <span className="text-slate-400">({periodSales.length} ventas)</span>
          </div>
        </div>

        {/* Costo de Calzado Vendido */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              2. Costo Mercancía (COGS)
            </span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900">
              ${costoMercanciaUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-500 font-medium ml-1">USD</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>Margen Bruto: ${(totalIngresosUsd - costoMercanciaUsd).toFixed(2)} USD</span>
            <span className="text-amber-600 font-medium">Costo de compra</span>
          </div>
        </div>

        {/* Gastos Operativos Totales */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              3. Cuánto se Gastó
            </span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-rose-600">
              ${totalGastosUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-rose-500 font-medium ml-1">USD</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>{totalGastosBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs</span>
            <span className="text-rose-600 font-medium">{periodExpenses.length} egresos</span>
          </div>
        </div>

        {/* Utilidad Neta: Cuánto va quedando en fin de mes */}
        <div className={`p-5 rounded-xl border shadow-xs ${
          utilidadNetaUsd >= 0
            ? 'bg-gradient-to-br from-emerald-50 to-teal-50/40 border-emerald-200'
            : 'bg-gradient-to-br from-rose-50 to-orange-50/40 border-rose-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              4. Cuánto va Quedando (Neto)
            </span>
            <div className={`p-2 rounded-lg ${utilidadNetaUsd >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className={`text-2xl font-black ${utilidadNetaUsd >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {utilidadNetaUsd >= 0 ? '+' : ''}${utilidadNetaUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-semibold text-slate-600 ml-1">USD</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs font-medium">
            <span className="text-slate-600">
              {utilidadNetaBs >= 0 ? '+' : ''}{utilidadNetaBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              utilidadNetaUsd >= 0 ? 'bg-emerald-200/60 text-emerald-800' : 'bg-rose-200/60 text-rose-800'
            }`}>
              {utilidadNetaUsd >= 0 ? `Ganancia ${margenNeto.toFixed(1)}%` : 'Déficit temporal'}
            </span>
          </div>
        </div>
      </div>

      {/* End of Month Currency Conversion & "Positivo en Solo Dólares" Module */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-indigo-900/50 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-indigo-800/40 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-blue-500/20 border border-blue-400/30 rounded-xl text-blue-400">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold tracking-tight text-white">
                  Reporte de Fin de Mes: Conversión de Bs Positivos y Saldo en Solo Dólares
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  {periodLabel}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Descuenta automáticamente los Bolívares invertidos en Binance, Zelle o Efectivo para consolidar un balance positivo neto en solo dólares.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsCurrencyModalOpen(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center space-x-1.5"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>+ Registrar Compra P2P</span>
            </button>
            <button
              onClick={() => setIsSheetsModalOpen(true)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center space-x-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Exportar a Google Sheets</span>
            </button>
          </div>
        </div>

        {/* 4-Step Accounting Equation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Entradas en Bs */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 space-y-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              1. Entradas en Bolívares (Ventas)
            </span>
            <div className="text-xl font-extrabold text-white">
              {totalIngresosBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
            </div>
            <p className="text-[11px] text-slate-400">
              Ventas cobradas en Pago Móvil / Efectivo Bs
            </p>
          </div>

          {/* Card 2: Descuento por compra de Divisas */}
          <div className="bg-amber-950/40 border border-amber-800/50 rounded-xl p-4 space-y-1.5">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
              2. Bs Gastados en Divisas
            </span>
            <div className="text-xl font-extrabold text-amber-300">
              -{totalBsGastadosDivisas.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
            </div>
            <p className="text-[11px] text-amber-200/80">
              Descontado de la entrada de bolívares ({periodCurrencyPurchases.length} compras)
            </p>
          </div>

          {/* Card 3: Saldo Restante en Bolívares */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 space-y-1.5">
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
              3. Saldo Restante en Bs
            </span>
            <div className="text-xl font-extrabold text-emerald-400">
              {saldoRestanteBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
            </div>
            <p className="text-[11px] text-slate-400">
              Disponible en cuentas después de compras y gastos
            </p>
          </div>

          {/* Card 4: Positivo en Solo Dólares */}
          <div className="bg-gradient-to-br from-blue-600/30 to-emerald-600/30 border-2 border-emerald-400/60 rounded-xl p-4 space-y-1.5 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-emerald-300 uppercase tracking-wider block">
                4. Positivo en Solo Dólares
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-200 text-[10px] font-bold">
                Neto USD
              </span>
            </div>
            <div className="text-2xl font-black text-white">
              ${positivoEnSoloDolaresUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-emerald-200">
              Incluye +${totalUsdRecibidosDivisas.toFixed(2)} USD comprados con los Bs positivos
            </p>
          </div>
        </div>

        {/* Currency Purchases History Table */}
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Detalle de Divisas Compradas con Bolívares ({periodCurrencyPurchases.length})
            </h3>
            <span className="text-[11px] text-slate-400">
              Total Divisas Acreditadas: <strong className="text-emerald-400">+${totalUsdRecibidosDivisas.toFixed(2)} USD</strong>
            </span>
          </div>

          {periodCurrencyPurchases.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-lg">
              No hay compras de divisas registradas en este período. Haz clic en <strong>"+ Registrar Compra P2P"</strong> para convertir tus bolívares a Binance USDT, Zelle o Efectivo.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3">Fecha</th>
                    <th className="py-2 px-3">Destino</th>
                    <th className="py-2 px-3 text-right">Bs. Gastados (Descontados)</th>
                    <th className="py-2 px-3 text-center">Tasa Compra</th>
                    <th className="py-2 px-3 text-right">Dólares Recibidos</th>
                    <th className="py-2 px-3">Referencia / Comprobante</th>
                    <th className="py-2 px-2 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
                  {periodCurrencyPurchases.map((cp) => (
                    <tr key={cp.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">{cp.fecha}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/20">
                          {cp.metodo}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-400">
                        -{cp.monto_bs_gastado.toLocaleString('es-VE')} Bs
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-400">
                        {cp.tasa_compra.toFixed(2)} Bs/$
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-400">
                        +${cp.monto_usd_recibido.toFixed(2)} USD
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 truncate max-w-[150px]">
                        {cp.referencia || '—'}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <button
                          onClick={() => {
                            if (window.confirm(`¿Seguro que desea anular la compra de divisas de $${cp.monto_usd_recibido.toFixed(2)} (${cp.metodo})? Se restituirán los bolívares al saldo.`)) {
                              deleteCurrencyPurchase(cp.id);
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                          title="Anular compra de divisas"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Breakdown by Category & Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category distribution bar */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <PieChart className="w-4 h-4 text-indigo-500" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Desglose de Gastos por Rubro
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              {periodLabel}
            </span>
          </div>

          {categoryBreakdown.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              No hay gastos registrados en este período.
            </div>
          ) : (
            <div className="space-y-3">
              {categoryBreakdown.map((item) => (
                <div key={item.categoria} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 truncate max-w-[170px]" title={item.categoria}>
                      {item.categoria}
                    </span>
                    <div className="text-right">
                      <span className="font-bold text-slate-900">${item.monto_usd.toFixed(2)}</span>
                      <span className="text-[10px] text-slate-400 ml-1">({item.porcentaje.toFixed(1)}%)</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, item.porcentaje)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
            <div className="flex items-center justify-between font-semibold text-slate-700">
              <span>Total Gastos ({periodLabel}):</span>
              <span className="text-rose-600 font-bold">${totalGastosUsd.toFixed(2)} USD</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Tasa oficial aplicada: <span className="font-medium text-slate-800">{exchangeRate.toFixed(2)} Bs/USD</span>
            </p>
          </div>
        </div>

        {/* Expenses Table with Filters */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4 text-slate-500" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Listado de Egresos y Gastos ({displayedExpenses.length})
              </h3>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleExportCsv}
                className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-medium transition-colors"
                title="Descargar lista en CSV / Excel"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar CSV</span>
              </button>
            </div>
          </div>

          {/* Search and Category Filter */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por descripción, beneficiario o ref..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white"
              />
            </div>

            <div className="relative">
              <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white"
              >
                <option value="todas">Todas las subcuentas</option>
                <optgroup label={`${EXPENSE_PARTIDA} › ${EXPENSE_CUENTA}`}>
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </optgroup>
                {hasUnclassified && <option value={UNCLASSIFIED_EXPENSE}>{UNCLASSIFIED_EXPENSE} (reclasificar)</option>}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Fecha</th>
                  <th className="py-2.5 px-3 font-semibold">Rubro / Categoría</th>
                  <th className="py-2.5 px-3 font-semibold">Concepto & Beneficiario</th>
                  <th className="py-2.5 px-3 font-semibold">Cuenta de Origen</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Monto</th>
                  <th className="py-2.5 px-2 font-semibold text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No se encontraron registros de gastos para los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  displayedExpenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 whitespace-nowrap font-medium text-slate-800">
                        {exp.fecha}
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {exp.categoria}
                        </span>
                      </td>
                      <td className="py-3 px-3 max-w-[200px]">
                        <p className="font-semibold text-slate-900 truncate" title={exp.descripcion}>
                          {exp.descripcion}
                        </p>
                        {exp.beneficiario && (
                          <p className="text-[11px] text-slate-500 truncate" title={exp.beneficiario}>
                            Para: {exp.beneficiario}
                          </p>
                        )}
                        {exp.comprobante_ref && (
                          <span className="text-[10px] font-mono text-indigo-600 bg-indigo-50 px-1 rounded inline-block mr-1">
                            Ref: {exp.comprobante_ref}
                          </span>
                        )}
                        {exp.foto_factura && (
                          <div className="mt-1">
                            <button
                              type="button"
                              onClick={() => setViewingPhoto(exp.foto_factura || null)}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-1.5 py-0.5 rounded transition cursor-pointer shadow-2xs"
                              title="Ver comprobante o factura escaneada"
                            >
                              <Camera className="w-3 h-3 text-indigo-600" />
                              <span>Ver Factura</span>
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="text-slate-700 font-medium">{exp.cuenta_origen}</span>
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="font-bold text-slate-900">
                          ${exp.monto_usd.toFixed(2)} USD
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {exp.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                        </div>
                        {exp.tasa_cambio > 0 && (
                          <div className="text-[10px] text-indigo-600 font-mono font-medium" title="Tasa fijada a la fecha de este gasto">
                            Tasa: {exp.tasa_cambio.toFixed(2)} Bs/$
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <button
                          onClick={() => {
                            if (window.confirm(`¿Seguro que desea eliminar el gasto "${exp.descripcion}"?`)) {
                              deleteExpense(exp.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                          title="Eliminar gasto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal: Registrar Nuevo Gasto */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-rose-500/20 text-rose-300 rounded-lg">
                  <TrendingDown className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Registrar Nuevo Gasto Operativo</h3>
                  <p className="text-[11px] text-slate-400">
                    Se deducirá del balance y se guardará en Neon PostgreSQL
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Fast Photo Scan banner */}
              <div className="p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-indigo-950">
                  <Camera className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="text-xs">¿Tienes la factura física o comprobante a mano?</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setIsScannerModalOpen(true);
                  }}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-lg shadow-2xs transition flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-indigo-200" />
                  <span>Tomar Foto con IA</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fecha del Gasto *
                  </label>
                  <input
                    type="date"
                    required
                    value={fecha}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      setFecha(newDate);
                      if (!isCustomTasa) {
                        setTasaGasto(getExchangeRateForDate(newDate).toString());
                      }
                    }}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white font-mono"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Subcuenta de {EXPENSE_CUENTA} *
                    </label>
                    <button
                      type="button"
                      onClick={() => setCategoryOrder((current) => (current === 'norma' ? 'alfabetico' : 'norma'))}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800"
                    >
                      Orden: {categoryOrder === 'norma' ? 'de la norma' : 'alfabético'} (cambiar)
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-1">Partida: {EXPENSE_PARTIDA} · Cuenta: {EXPENSE_CUENTA}</p>
                  <select
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value as ExpenseCategory)}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white"
                  >
                    <optgroup label={`${EXPENSE_PARTIDA} › ${EXPENSE_CUENTA}`}>
                      {categoryOptions.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  {categoria === 'Tributos pagados' && (
                    <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-950">
                      <p className="font-extrabold">Asiento automático para tributos pagados</p>
                      <p className="mt-1">Partida: Egresos · Cuenta: Gastos · Subcuenta: Tributos Pagados</p>
                      <p>Clasificación: ISAE · Subclasificación: {fecha ? `${fecha.slice(5, 7)}-${fecha.slice(0, 4)}` : 'MM-AAAA'}</p>
                      <p className="mt-1 text-indigo-700">Al guardar el gasto, NEXOSS generará el asiento en el Libro Diario y lo reflejará en el Libro Mayor, con equivalencias en Bs y USD según la tasa registrada.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Tasa de Cambio para la fecha del gasto */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span className="flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
                    Tasa de Cambio ({fecha !== todayIso ? `Fecha: ${fecha}` : 'Hoy'})
                  </span>
                  {fecha !== todayIso ? (
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                      📅 Fecha anterior (tasa congelada de ese día)
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                      Tasa de hoy
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={tasaGasto}
                    onChange={(e) => {
                      setTasaGasto(e.target.value);
                      setIsCustomTasa(true);
                    }}
                    className="w-full text-xs font-mono font-bold p-1.5 bg-white border border-slate-300 rounded focus:border-indigo-500"
                    placeholder="Ej: 52.40"
                  />
                  <span className="text-xs text-slate-500 font-mono font-medium">Bs/USD</span>
                  {isCustomTasa && (
                    <button
                      type="button"
                      onClick={() => {
                        setTasaGasto(getExchangeRateForDate(fecha).toString());
                        setIsCustomTasa(false);
                      }}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 underline whitespace-nowrap cursor-pointer"
                    >
                      Restaurar
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Descripción o Concepto del Gasto *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Pago de alquiler sabana grande / Quincena cajera / Factura luz"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Beneficiario / Proveedor
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Corpoelec / María Pérez / Tealca"
                    value={beneficiario}
                    onChange={(e) => setBeneficiario(e.target.value)}
                    onBlur={async () => { await lookupSupplier(false); await saveSupplierContact(); }}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                  <input
                    type="text"
                    placeholder="RIF / Cédula del proveedor (opcional)"
                    value={beneficiarioRif}
                    onChange={(e) => setBeneficiarioRif(e.target.value)}
                    onBlur={async () => { const found = await lookupSupplier(true); if (!found) await saveSupplierContact(); }}
                    className="w-full mt-2 text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta de Pago (Salida) *
                  </label>
                  <select
                    value={cuentaOrigen}
                    onChange={(e) => setCuentaOrigen(e.target.value)}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.nombre}>
                        {acc.nombre} ({acc.moneda})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Monto y Moneda */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Monto a Pagar *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <select
                      value={moneda}
                      onChange={(e) => setMoneda(e.target.value as Currency)}
                      className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-800"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="Bs">Bs (Bolívares)</option>
                    </select>
                  </div>
                  <div className="col-span-2 relative">
                    <input
                      type="number"
                      step="0.01"
                      required
                      min="0.01"
                      placeholder="0.00"
                      value={montoInput}
                      onChange={(e) => setMontoInput(e.target.value)}
                      className="w-full text-sm font-bold p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 pl-7"
                    />
                    <span className="absolute left-2.5 top-2.5 text-xs text-slate-400 font-bold">
                      {moneda === 'USD' ? '$' : 'Bs'}
                    </span>
                  </div>
                </div>

                {/* Equivalencia en tiempo real con tasa de la fecha */}
                {parseFloat(montoInput) > 0 && parseFloat(tasaGasto) > 0 && (
                  <div className="text-[11px] text-slate-600 bg-white p-2 rounded border border-slate-200 flex items-center justify-between">
                    <span>Equivalente cambio de esa fecha ({parseFloat(tasaGasto).toFixed(2)} Bs/USD):</span>
                    <span className="font-bold text-indigo-700 font-mono">
                      {moneda === 'USD'
                        ? `${(parseFloat(montoInput) * parseFloat(tasaGasto)).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs`
                        : `$${(parseFloat(montoInput) / parseFloat(tasaGasto)).toFixed(2)} USD`}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    N° Comprobante / Factura / Ref
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: FAC-9901 / 481920"
                    value={comprobanteRef}
                    onChange={(e) => setComprobanteRef(e.target.value)}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Notas adicionales
                  </label>
                  <input
                    type="text"
                    placeholder="Observaciones..."
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  Guardar Gasto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Comprar Divisas (Bs a USD/Binance/Zelle) */}
      <CurrencyPurchaseModal
        isOpen={isCurrencyModalOpen}
        onClose={() => setIsCurrencyModalOpen(false)}
      />

      {/* Modal: Exportar a Google Sheets */}
      <GoogleSheetsSyncModal
        isOpen={isSheetsModalOpen}
        onClose={() => setIsSheetsModalOpen(false)}
        periodLabel={periodLabel}
      />

      {/* Modal: Escáner de Facturas con IA y Cámara */}
      <ReceiptScannerModal
        isOpen={isScannerModalOpen}
        onClose={() => setIsScannerModalOpen(false)}
      />

      {/* Modal: Visor de Foto de Factura en Alta Resolución */}
      {viewingPhoto && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-5 animate-in fade-in">
          <div className="bg-white rounded-2xl overflow-hidden max-w-lg w-full shadow-2xl border border-slate-700 flex flex-col max-h-[90vh]">
            <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-indigo-400" />
                <h3 className="font-bold text-xs sm:text-sm">Comprobante / Factura Adjunta</h3>
              </div>
              <button
                onClick={() => setViewingPhoto(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-slate-950 flex items-center justify-center overflow-auto flex-1">
              <img
                src={viewingPhoto}
                alt="Factura completa"
                className="max-h-[65vh] w-auto object-contain rounded-lg shadow-lg border border-slate-800"
              />
            </div>
            <div className="p-3 bg-slate-100 flex items-center justify-between text-xs text-slate-600 shrink-0">
              <span className="text-[11px] text-slate-500">Documento guardado con el registro de gasto</span>
              <button
                type="button"
                onClick={() => setViewingPhoto(null)}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-lg text-xs transition"
              >
                Cerrar Visor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
