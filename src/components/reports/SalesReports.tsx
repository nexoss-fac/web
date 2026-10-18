import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  Calendar,
  Download,
  Printer,
  FileSpreadsheet,
  FileText,
  Package,
  Layers,
  Sparkles,
  PieChart,
  BarChart2,
  CheckCircle,
  Eye,
  RefreshCw,
  ShoppingBag,
  Percent,
  ArrowUpRight,
  Edit2,
  Check,
  X,
  Ban,
  CreditCard,
  Smartphone,
  Banknote,
  Clock,
  ShieldCheck,
  Wallet,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  BarChart3,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import * as XLSX from 'xlsx';
import { useStore } from '../../context/StoreContext';
import { COMPANY_INDUSTRIES, resolveIndustryTemplate } from '../../domain/companyIndustries';
import { Sale, ReportPeriod } from '../../types';
import { ReceiptModal } from '../common/ReceiptModal';
import { DailySalesChart } from './DailySalesChart';
import { GoogleSheetsSyncModal } from '../common/GoogleSheetsSyncModal';
import { getTodayVenezuela, getYesterdayVenezuela, getSaleDateKey } from '../../utils/dateUtils';

export const SalesReports: React.FC = () => {
  const industry = COMPANY_INDUSTRIES[resolveIndustryTemplate(localStorage.getItem('nexoss_active_company_industry'))];
  const isFootwear = resolveIndustryTemplate(localStorage.getItem('nexoss_active_company_industry')) === 'footwear';
  const { sales, exchangeRate, products, bcvInfo, isBcvSyncing, syncBcvRate, updateSaleDate, updateSaleDetails, voidSale } = useStore();

  const [period, setPeriod] = useState<ReportPeriod>('este_mes');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedSaleForReceipt, setSelectedSaleForReceipt] = useState<Sale | null>(null);
  const [lastGeneratedTime, setLastGeneratedTime] = useState<string>(new Date().toLocaleTimeString());
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [editingSaleDateId, setEditingSaleDateId] = useState<string | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [tempInvoiceNumber, setTempInvoiceNumber] = useState('');
  const [tempDateValue, setTempDateValue] = useState<string>('');
  const [saleToVoid, setSaleToVoid] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<'all' | 'cashea' | 'direct'>('all');

  // Estados para el gráfico semanal de métodos de pago (Recharts)
  const [weeklyChartType, setWeeklyChartType] = useState<'stacked' | 'grouped'>('stacked');
  const [weeklyCurrency, setWeeklyCurrency] = useState<'USD' | 'Bs'>('USD');
  const [weeklyRangeType, setWeeklyRangeType] = useState<'last_7_days' | 'current_week'>('last_7_days');
  const [isWeeklyTableExpanded, setIsWeeklyTableExpanded] = useState<boolean>(false);

  // Procesamiento de datos de la última semana por día diferenciando Efectivo, Punto, Móvil y Cashea
  const { weeklyPaymentData, weeklyTotals, hasOtrosPayments } = useMemo(() => {
    const dates: Date[] = [];
    const now = new Date();

    if (weeklyRangeType === 'last_7_days') {
      // 7 días móviles hasta hoy
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        dates.push(d);
      }
    } else {
      // Semana en curso (de Lunes a Domingo)
      const currentDay = now.getDay();
      const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);

      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dates.push(d);
      }
    }

    const formatLocalDateKey = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const daysList = dates.map((d) => {
      const dateKey = formatLocalDateKey(d);
      const weekday = d.toLocaleDateString('es-VE', { weekday: 'short' });
      const dayLabel = `${weekday.charAt(0).toUpperCase() + weekday.slice(1).replace('.', '')} ${d.getDate()}`;
      const fullDate = d.toLocaleDateString('es-VE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });

      return {
        dateKey,
        dayLabel,
        fullDate,
        efectivo: 0,
        punto: 0,
        movil: 0,
        cashea: 0,
        otros: 0,
        total: 0,
        transacciones: 0,
      };
    });

    const dayMap = new Map(daysList.map((d) => [d.dateKey, d]));

    sales.forEach((s) => {
      if (s.estado === 'anulada') return;
      const sDate = new Date(s.fecha);
      const sKey = formatLocalDateKey(sDate);
      const targetDay = dayMap.get(sKey);
      if (!targetDay) return;

      targetDay.transacciones += 1;

      if (Array.isArray(s.pagos)) {
        s.pagos.forEach((p) => {
          const cuentaLower = (p.cuenta || '').toLowerCase().trim();
          const baseUsd = Number(p.monto_equivalente_usd) || 0;
          const saleHistoricalRate = s.tasa_cambio > 0 ? s.tasa_cambio : exchangeRate;
          const val =
            weeklyCurrency === 'USD'
              ? baseUsd
              : p.moneda === 'Bs'
              ? Number(p.monto) || 0
              : baseUsd * saleHistoricalRate;

          if (cuentaLower.includes('cashea')) {
            targetDay.cashea += val;
          } else if (cuentaLower.includes('punto') || cuentaLower.includes('pos')) {
            targetDay.punto += val;
          } else if (
            cuentaLower.includes('pago móvil') ||
            cuentaLower.includes('pago movil') ||
            cuentaLower.includes('movil') ||
            cuentaLower.includes('móvil')
          ) {
            targetDay.movil += val;
          } else if (cuentaLower.includes('efectivo') || cuentaLower.includes('caja')) {
            targetDay.efectivo += val;
          } else {
            targetDay.otros += val;
          }

          targetDay.total += val;
        });
      }
    });

    const roundedDays = daysList.map((d) => ({
      ...d,
      efectivo: Number(Number(d.efectivo ?? 0).toFixed(2)),
      punto: Number(Number(d.punto ?? 0).toFixed(2)),
      movil: Number(Number(d.movil ?? 0).toFixed(2)),
      cashea: Number(Number(d.cashea ?? 0).toFixed(2)),
      otros: Number(Number(d.otros ?? 0).toFixed(2)),
      total: Number(Number(d.total ?? 0).toFixed(2)),
    }));

    let sumEfectivo = 0;
    let sumPunto = 0;
    let sumMovil = 0;
    let sumCashea = 0;
    let sumOtros = 0;
    let sumTotal = 0;
    let sumTx = 0;
    let peak: (typeof roundedDays)[0] | null = null;

    roundedDays.forEach((d) => {
      sumEfectivo += d.efectivo;
      sumPunto += d.punto;
      sumMovil += d.movil;
      sumCashea += d.cashea;
      sumOtros += d.otros;
      sumTotal += d.total;
      sumTx += d.transacciones;

      if (!peak || d.total > peak.total) {
        peak = d;
      }
    });

    return {
      weeklyPaymentData: roundedDays,
      hasOtrosPayments: sumOtros > 0,
      weeklyTotals: {
        efectivo: sumEfectivo,
        punto: sumPunto,
        movil: sumMovil,
        cashea: sumCashea,
        otros: sumOtros,
        total: sumTotal,
        transacciones: sumTx,
        peakDay: peak,
      },
    };
  }, [sales, weeklyRangeType, weeklyCurrency, exchangeRate]);

  // Filter sales by selected period
  const filteredSales = useMemo(() => {
    const now = new Date();
    const todayStr = getTodayVenezuela();
    const yestStr = getYesterdayVenezuela();

    return sales.filter((sale) => {
      const saleDate = new Date(sale.fecha);
      const saleDateStr = getSaleDateKey(sale.fecha);

      if (period === 'hoy') {
        return saleDateStr === todayStr;
      }

      if (period === 'ayer') {
        return saleDateStr === yestStr;
      }

      if (period === 'ultimos_7_dias') {
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);
        return saleDate >= sevenDaysAgo;
      }

      if (period === 'este_mes') {
        return (
          saleDate.getMonth() === now.getMonth() &&
          saleDate.getFullYear() === now.getFullYear()
        );
      }

      if (period === 'mes_anterior') {
        const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        return (
          saleDate.getMonth() === prevMonth &&
          saleDate.getFullYear() === prevYear
        );
      }

      if (period === 'personalizado') {
        if (customStartDate && customEndDate) {
          return saleDateStr >= customStartDate && saleDateStr <= customEndDate;
        }
      }

      return true;
    });
  }, [sales, period, customStartDate, customEndDate]);

  // Aggregate Metrics
  const totalRevenueUsd = useMemo(() => {
    return filteredSales.reduce((acc, s) => acc + s.total_usd, 0);
  }, [filteredSales]);

  const totalRevenueBs = useMemo(() => {
    return filteredSales.reduce((acc, s) => acc + s.total_bs, 0);
  }, [filteredSales]);

  const totalCostUsd = useMemo(() => {
    return filteredSales.reduce((acc, s) => acc + s.costo_total_usd, 0);
  }, [filteredSales]);

  const netProfitUsd = totalRevenueUsd - totalCostUsd;
  const profitMarginPercent = totalRevenueUsd > 0 ? (netProfitUsd / totalRevenueUsd) * 100 : 0;

  const netProfitBs = useMemo(() => {
    return filteredSales.reduce((acc, s) => {
      const saleRate = s.tasa_cambio > 0 ? s.tasa_cambio : exchangeRate;
      return acc + (s.ganancia_neta_usd * saleRate);
    }, 0);
  }, [filteredSales, exchangeRate]);

  const totalPairsSold = useMemo(() => {
    return filteredSales.reduce(
      (acc, s) => acc + s.items.reduce((sum, item) => sum + item.cantidad, 0),
      0
    );
  }, [filteredSales]);

  const averageTicketUsd = filteredSales.length > 0 ? totalRevenueUsd / filteredSales.length : 0;

  // Immediate positive cash/bank collection vs pending Cashea in bank
  const totalImmediateCollectedUsd = useMemo(() => {
    return filteredSales.reduce((acc, s) => {
      if (s.estado === 'anulada') return acc;
      if (typeof s.total_positivo_inmediato_usd === 'number') {
        return acc + s.total_positivo_inmediato_usd;
      }
      const nonCashea = s.pagos.filter((p) => !(p.cuenta || '').toLowerCase().includes('cashea'));
      return acc + nonCashea.reduce((sum, p) => sum + p.monto_equivalente_usd, 0);
    }, 0);
  }, [filteredSales]);

  const totalCasheaPendingUsd = useMemo(() => {
    return filteredSales.reduce((acc, s) => {
      if (s.estado === 'anulada') return acc;
      if (typeof s.total_cashea_pendiente_usd === 'number') {
        return acc + s.total_cashea_pendiente_usd;
      }
      const casheaPays = s.pagos.filter(
        (p) => (p.cuenta || '').toLowerCase().includes('cashea') && p.estado_liquidacion !== 'conciliado_en_banco'
      );
      return acc + casheaPays.reduce((sum, p) => sum + p.monto_equivalente_usd, 0);
    }, 0);
  }, [filteredSales]);

  const totalCasheaReconciledUsd = useMemo(() => {
    return filteredSales.reduce((acc, s) => {
      if (s.estado === 'anulada') return acc;
      const reconciledCashea = s.pagos.filter(
        (p) => (p.cuenta || '').toLowerCase().includes('cashea') && p.estado_liquidacion === 'conciliado_en_banco'
      );
      return acc + reconciledCashea.reduce((sum, p) => sum + p.monto_equivalente_usd, 0);
    }, 0);
  }, [filteredSales]);

  const casheaSalesCount = useMemo(() => {
    return filteredSales.filter(
      (s) => s.estado !== 'anulada' && s.pagos.some((p) => (p.cuenta || '').toLowerCase().includes('cashea'))
    ).length;
  }, [filteredSales]);

  const directSalesCount = useMemo(() => {
    return filteredSales.filter(
      (s) => s.estado !== 'anulada' && !s.pagos.some((p) => (p.cuenta || '').toLowerCase().includes('cashea'))
    ).length;
  }, [filteredSales]);

  const displayedSales = useMemo(() => {
    if (paymentTypeFilter === 'cashea') {
      return filteredSales.filter((s) =>
        s.pagos.some((p) => (p.cuenta || '').toLowerCase().includes('cashea'))
      );
    }
    if (paymentTypeFilter === 'direct') {
      return filteredSales.filter(
        (s) => !s.pagos.some((p) => (p.cuenta || '').toLowerCase().includes('cashea'))
      );
    }
    return filteredSales;
  }, [filteredSales, paymentTypeFilter]);

  // Breakdown by Size (Curva de Tallas)
  const sizeDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    filteredSales.forEach((s) => {
      s.items.forEach((it) => {
        map[it.talla] = (map[it.talla] || 0) + it.cantidad;
      });
    });

    return Object.entries(map)
      .map(([talla, pares]) => ({ talla, pares }))
      .sort((a, b) => a.talla.localeCompare(b.talla));
  }, [filteredSales]);

  // Top Selling Shoes
  const topSellingShoes = useMemo(() => {
    const map: Record<string, { nombre: string; marca: string; pares: number; totalUsd: number }> = {};
    filteredSales.forEach((s) => {
      s.items.forEach((it) => {
        if (!map[it.nombre_producto]) {
          map[it.nombre_producto] = {
            nombre: it.nombre_producto,
            marca: it.marca,
            pares: 0,
            totalUsd: 0,
          };
        }
        map[it.nombre_producto].pares += it.cantidad;
        map[it.nombre_producto].totalUsd += it.subtotal;
      });
    });

    return Object.values(map).sort((a, b) => b.totalUsd - a.totalUsd);
  }, [filteredSales]);

  // Breakdown by Payment Method
  const paymentMethodBreakdown = useMemo(() => {
    const map: Record<string, { count: number; montoUsd: number }> = {};
    filteredSales.forEach((s) => {
      s.pagos.forEach((p) => {
        if (!map[p.cuenta]) {
          map[p.cuenta] = { count: 0, montoUsd: 0 };
        }
        map[p.cuenta].count += 1;
        map[p.cuenta].montoUsd += p.monto_equivalente_usd;
      });
    });

    return Object.entries(map).map(([cuenta, data]) => ({
      cuenta,
      montoUsd: data.montoUsd,
      porcentaje: totalRevenueUsd > 0 ? (data.montoUsd / totalRevenueUsd) * 100 : 0,
    }));
  }, [filteredSales, totalRevenueUsd]);

  // Automatic Executive Summary Text
  const executiveSummary = useMemo(() => {
    if (filteredSales.length === 0) {
      return 'No hay registros de ventas para el período seleccionado.';
    }

    const topProduct = topSellingShoes[0];
    const topSize = sizeDistribution.slice().sort((a, b) => b.pares - a.pares)[0];
    const topPayment = paymentMethodBreakdown.slice().sort((a, b) => b.montoUsd - a.montoUsd)[0];

    return isFootwear ? `Se registraron ${filteredSales.length} ventas por $${totalRevenueUsd.toFixed(2)} y se vendieron ${totalPairsSold} pares. El producto con mayor venta fue ${topProduct?.nombre || "N/A"}; la talla con mayor demanda fue ${topSize?.talla || "N/A"}.` : `Se registraron ${filteredSales.length} ventas por $${totalRevenueUsd.toFixed(2)} y ${totalPairsSold} ${industry.unitLabel}. El producto con mayor venta fue ${topProduct?.nombre || "N/A"}.`;
  }, [filteredSales, totalRevenueUsd, totalRevenueBs, totalPairsSold, profitMarginPercent, netProfitUsd, topSellingShoes, sizeDistribution, paymentMethodBreakdown, isFootwear, industry.unitLabel]);

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Sales Detail
    const salesData = filteredSales.map((s) => ({
      Factura: s.numero_factura,
      Fecha: new Date(s.fecha).toLocaleString('es-VE'),
      Cliente: `${s.cliente_nombre} ${s.cliente_apellido || ''}`,
      RIF: s.cliente_rif || 'N/A',
      Pares: s.items.reduce((acc, it) => acc + it.cantidad, 0),
      Subtotal_USD: s.subtotal_usd,
      Descuento_USD: s.descuento_usd,
      IVA_USD: s.iva_monto_usd,
      Total_USD: s.total_usd,
      Total_Bs: s.total_bs,
      Costo_Total_USD: s.costo_total_usd,
      Ganancia_Neta_USD: s.ganancia_neta_usd,
      Pagos: s.pagos.map((p) => `${p.cuenta}: ${p.monto} ${p.moneda}`).join(' | '),
      Cajero: s.usuario,
    }));
    const wsSales = XLSX.utils.json_to_sheet(salesData);
    XLSX.utils.book_append_sheet(wb, wsSales, 'Ventas');

    // Sheet 2: KPI Summary
    const summaryData = [
      { Métrica: 'Período', Valor: period.toUpperCase() },
      { Métrica: 'Ventas Totales USD', Valor: totalRevenueUsd },
      { Métrica: 'Ventas Totales Bs', Valor: totalRevenueBs },
      { Métrica: 'Costo Total de Compra (CMV)', Valor: totalCostUsd },
      { Métrica: 'Ganancia Neta USD', Valor: netProfitUsd },
      { Métrica: 'Margen de Ganancia %', Valor: `${profitMarginPercent.toFixed(2)}%` },
      { Metrica: isFootwear ? 'Total pares vendidos' : 'Total unidades vendidas', Valor: totalPairsSold },
      { Métrica: 'Ticket Promedio USD', Valor: averageTicketUsd },
      { Métrica: 'Cantidad de Ventas', Valor: filteredSales.length },
      { Métrica: 'Tasa BCV Aplicada', Valor: exchangeRate },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen_Financiero');

    // Sheet 3: Top Products
    const topData = topSellingShoes.map((p) => ({
      Modelo: p.nombre,
      Marca: p.marca,
      [isFootwear ? "Pares_Vendidos" : "Unidades_Vendidas"]: p.pares,
      Ingresos_USD: p.totalUsd,
    }));
    const wsTop = XLSX.utils.json_to_sheet(topData);
    XLSX.utils.book_append_sheet(wb, wsTop, isFootwear ? "Top_Calzados" : "Top_Productos");

    XLSX.writeFile(wb, `Reporte_Ventas_NEXOSS_SHOP_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handlePrintReport = () => {
    window.print();
  };

  const handleDownloadSalesPdf = () => {
    const w = window.open('', '_blank', 'width=1200,height=850');
    if (!w) { alert('Permite las ventanas emergentes para generar el PDF.'); return; }
    const escPdf = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const moneyPdf = (value: unknown) => Number(value || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const salesRows = filteredSales.map(s => `<tr><td>${escPdf(s.numero_factura)}</td><td>${escPdf(new Date(s.fecha).toLocaleDateString('es-VE'))}</td><td>${escPdf(`${s.cliente_nombre || ''} ${s.cliente_apellido || ''}`.trim() || 'Consumidor final')}</td><td>${escPdf(s.cliente_rif || 'N/A')}</td><td class="num">${s.items.reduce((acc, it) => acc + Number(it.cantidad || 0), 0)}</td><td class="num">${moneyPdf(s.subtotal_usd)}</td><td class="num">${moneyPdf(s.iva_monto_usd)}</td><td class="num">${moneyPdf(s.total_usd)}</td><td class="num">${moneyPdf(s.total_bs)}</td><td>${escPdf((s.pagos || []).map(p => `${p.cuenta}: ${p.monto} ${p.moneda}`).join(' · '))}</td></tr>`).join('');
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Libro de Ventas NEXOSS</title><style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;font-size:9px}.letterhead{display:flex;align-items:center;gap:15px;border-bottom:3px solid #111;padding-bottom:9px;margin-bottom:12px}.letterhead img{width:100px;height:68px;object-fit:contain}.brand h1{font-size:18px;margin:0 0 3px}.brand p{margin:2px 0}.title{text-align:center;font-size:15px;font-weight:800;margin:10px 0 3px;text-transform:uppercase}.subtitle{text-align:center;margin:0 0 12px;color:#444}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}.kpi{border:1px solid #555;padding:8px}.kpi b{display:block;margin-bottom:4px}.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}table{width:100%;border-collapse:collapse}th,td{border:1px solid #555;padding:4px;vertical-align:top}th{background:#e9edf3;text-align:left;font-size:8px}.foot{border-top:1px solid #777;margin-top:12px;padding-top:6px;display:flex;justify-content:space-between;font-size:8px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><header class="letterhead"><img src="${window.location.origin}/logo-nexoss.svg" alt="Logo NEXOSS"><div class="brand"><h1>NEXOSS</h1><p><b>EMPRESA DE DEMOSTRACIÓN</b></p><p>Libro de Ventas · Reporte administrativo</p><p>Fecha de emisión: ${escPdf(new Date().toLocaleString('es-VE'))}</p></div></header><h2 class="title">Libro de Ventas</h2><p class="subtitle">Período: ${escPdf(period.replace(/_/g, ' ').toUpperCase())}${period === 'personalizado' ? ` · ${escPdf(customStartDate || 'inicio')} al ${escPdf(customEndDate || 'actual')}` : ''}</p><section class="kpis"><div class="kpi"><b>Ventas totales USD</b>$${moneyPdf(totalRevenueUsd)}</div><div class="kpi"><b>Ventas totales Bs</b>${moneyPdf(totalRevenueBs)} Bs</div><div class="kpi"><b>Ganancia neta USD</b>$${moneyPdf(netProfitUsd)}</div><div class="kpi"><b>Operaciones registradas</b>${filteredSales.length}</div></section><table><thead><tr><th>Factura</th><th>Fecha</th><th>Cliente</th><th>RIF</th><th class="num">Pares</th><th class="num">Subtotal USD</th><th class="num">IVA USD</th><th class="num">Total USD</th><th class="num">Total Bs</th><th>Método(s) de pago</th></tr></thead><tbody>${salesRows || '<tr><td colspan="10">No hay ventas para el período seleccionado.</td></tr>'}</tbody><tfoot><tr><th colspan="4">TOTALES DEL REPORTE</th><th class="num">${totalPairsSold}</th><th class="num">—</th><th class="num">—</th><th class="num">$${moneyPdf(totalRevenueUsd)}</th><th class="num">${moneyPdf(totalRevenueBs)} Bs</th><th></th></tr></tfoot></table><footer class="foot"><span>NEXOSS · EMPRESA DE DEMOSTRACIÓN</span><span>Reporte generado desde el sistema administrativo</span></footer><script>window.onload=()=>setTimeout(()=>window.print(),350)</script></body></html>`);
    w.document.close();
  };

  return (
    <div className="w-full max-w-none mx-0 space-y-4 px-2 sm:px-4 lg:px-5">
      
      {/* Top Banner with Automatic Refresh & Period Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">Reportes Automáticos de Ventas</h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Auto-Calculado en Vivo
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {isFootwear ? "Metricas de ventas, margen, modelos y tallas." : "Metricas de ventas, ingresos, margen y productos."}
          </p>
        </div>

        {/* Action Buttons: Export to Excel & Print */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Real-time BCV Status Pill */}
          <button
            onClick={() => syncBcvRate(false)}
            disabled={isBcvSyncing}
            title="Sincronizar métricas con la última tasa oficial del BCV en tiempo real"
            className="px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[11px] font-mono font-bold">BCV: {exchangeRate.toFixed(2)} Bs</span>
            <RefreshCw className={`w-3 h-3 text-emerald-600 ${isBcvSyncing ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setLastGeneratedTime(new Date().toLocaleTimeString())}
            title="Recalcular métricas"
            className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="text-[11px] text-slate-500 hidden sm:inline">{lastGeneratedTime}</span>
          </button>

          <button
            id="export-excel-btn"
            onClick={handleExportExcel}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>Excel (.xlsx)</span>
          </button>

          <button
            id="export-pdf-btn"
            onClick={handleDownloadSalesPdf}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="Descargar Libro de Ventas en PDF con membrete NEXOSS"
          >
            <FileText className="w-4 h-4" />
            <span>Descargar PDF</span>
          </button>

          <button
            id="export-sheets-btn"
            onClick={() => setIsSheetsModalOpen(true)}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="Sincronizar y exportar a Google Sheets"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Google Sheets</span>
          </button>

          <button
            id="print-report-btn"
            onClick={handlePrintReport}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* Period Filter Selector Pills */}
      <div className="flex flex-wrap items-center gap-1.5 bg-white p-2 rounded-xl border border-slate-200 shadow-xs">
        <span className="text-xs font-medium text-slate-500 px-2 flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5 text-indigo-600" /> Período:
        </span>
        
        {(
          [
            { key: 'hoy', label: 'Hoy' },
            { key: 'ayer', label: 'Ayer' },
            { key: 'ultimos_7_dias', label: 'Últimos 7 Días' },
            { key: 'este_mes', label: 'Este Mes' },
            { key: 'mes_anterior', label: 'Mes Anterior' },
            { key: 'personalizado', label: 'Rango Personalizado' },
          ] as { key: ReportPeriod; label: string }[]
        ).map((item) => (
          <button
            key={item.key}
            onClick={() => setPeriod(item.key)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              period === item.key
                ? 'bg-indigo-600 text-white font-semibold'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {item.label}
          </button>
        ))}

        {period === 'personalizado' && (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-900"
            />
            <span className="text-slate-400 text-xs">a</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-900"
            />
          </div>
        )}
      </div>

      {/* KPI Highlight Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        {/* Total Revenue */}
        <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-xs col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Ingresos Totales
          </span>
          <div className="text-2xl font-bold text-indigo-600 font-mono mt-1">
            ${totalRevenueUsd.toFixed(2)}
          </div>
          <div className="text-xs text-slate-400 font-mono mt-0.5">
            {totalRevenueBs.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Bs
          </div>
        </div>

        {/* Cost of Goods Sold (CMV) */}
        <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Costo Mercancía (CMV)
          </span>
          <div className="text-2xl font-bold text-slate-800 font-mono mt-1">
            ${totalCostUsd.toFixed(2)}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            Costo de compra al mayor
          </div>
        </div>

        {/* Net Profit & Margin % */}
        <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-xs">
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block flex items-center justify-between">
            <span>Ganancia Neta</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 font-bold border border-emerald-200">
              {profitMarginPercent.toFixed(1)}% margen
            </span>
          </span>
          <div className="text-2xl font-bold text-emerald-600 font-mono mt-1">
            +${netProfitUsd.toFixed(2)}
          </div>
          <div className="text-xs text-slate-400 font-mono mt-0.5">
            {netProfitBs.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Bs de utilidad
          </div>
        </div>

        {/* Pairs Sold */}
        <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            {isFootwear ? 'Pares Vendidos' : 'Unidades Vendidas'}
          </span>
          <div className="text-2xl font-bold text-slate-900 font-mono mt-1">
            {totalPairsSold} <span className="text-xs font-normal text-slate-500">{industry.unitLabel}</span>
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            En {filteredSales.length} ventas confirmadas
          </div>
        </div>

        {/* Average Ticket */}
        <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Ticket Promedio
          </span>
          <div className="text-2xl font-bold text-slate-900 font-mono mt-1">
            ${averageTicketUsd.toFixed(2)}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            Gasto promedio por cliente
          </div>
        </div>

      </div>

      {/* Liquidity Breakdown: Cobro Inmediato (Caja y Bancos) vs Cashea Financiado */}
      <div className="bg-slate-900 rounded-2xl p-4 sm:p-5 text-white shadow-md border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Cobranza Real vs Financiamiento Cashea</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Conciliación Multimoneda
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Las iniciales cobradas en Punto de Venta o Pago Móvil ingresan a tu caja/banco hoy; el saldo Cashea se refleja por separado hasta su liquidación bancaria.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-3.5">
          {/* Immediate Positive Income */}
          <div className="bg-slate-800/80 border border-slate-700/80 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-400">
              <span className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Cobrado en Positivo (Caja y Bancos)</span>
              </span>
              <span className="text-[10px] text-emerald-300 font-bold bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800/40">Disponible</span>
            </div>
            <div className="text-2xl font-bold font-mono text-white mt-1">
              ${totalImmediateCollectedUsd.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              {(totalImmediateCollectedUsd * exchangeRate).toFixed(0)} Bs (Punto de Venta, Pago Móvil, Efectivo, etc.)
            </div>
          </div>

          {/* Pending Cashea */}
          <div className="bg-slate-800/80 border border-slate-700/80 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-[11px] font-semibold text-amber-400">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Por Cobrar Cashea (En Banco)</span>
              </span>
              <span className="text-[10px] text-amber-300 font-bold bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-800/40 font-mono">{casheaSalesCount} ventas</span>
            </div>
            <div className="text-2xl font-bold font-mono text-amber-300 mt-1">
              ${totalCasheaPendingUsd.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              Saldo financiado pendiente de acreditación por Cashea
            </div>
          </div>

          {/* Reconciled Cashea */}
          <div className="bg-slate-800/80 border border-slate-700/80 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-[11px] font-semibold text-indigo-300">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Cashea Liquidado en Banco</span>
              </span>
              <span className="text-[10px] text-indigo-300 font-bold bg-indigo-950/60 px-1.5 py-0.2 rounded border border-indigo-800/40">Acreditado</span>
            </div>
            <div className="text-2xl font-bold font-mono text-indigo-200 mt-1">
              ${totalCasheaReconciledUsd.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              Fondos ya transferidos y conciliados en cuenta
            </div>
          </div>
        </div>
      </div>

      {/* Automatic Executive Summary (Diagnóstico Inteligente) */}
      <div className="bg-indigo-50/70 border border-indigo-200/80 p-4 rounded-xl shadow-xs">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="w-4 h-4 text-indigo-600" />
          <h3 className="font-bold text-xs uppercase tracking-wider text-indigo-900">
            Diagnóstico y Resumen Ejecutivo Automático
          </h3>
        </div>
        <p className="text-xs text-slate-700 leading-relaxed">
          {executiveSummary}
        </p>
      </div>

      {/* Visualización de Datos con Recharts: Volumen de Ventas Semanal por Método de Pago */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-5">
        {/* Header & Controls Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900">
                  Volumen de Ventas de la Última Semana por Método de Pago
                </h3>
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Recharts • 7 Días
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Seguimiento diario diferenciando <span className="font-semibold text-emerald-600">Efectivo</span>, <span className="font-semibold text-blue-600">Punto de Venta</span>, <span className="font-semibold text-purple-600">Pago Móvil</span> y <span className="font-semibold text-amber-600">Cashea</span>.
              </p>
            </div>
          </div>

          {/* Interactive Controls */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Range Toggle */}
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
              <button
                type="button"
                onClick={() => setWeeklyRangeType('last_7_days')}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  weeklyRangeType === 'last_7_days'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Últimos 7 Días
              </button>
              <button
                type="button"
                onClick={() => setWeeklyRangeType('current_week')}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  weeklyRangeType === 'current_week'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Esta Semana (Lun-Dom)
              </button>
            </div>

            {/* Presentation Mode Toggle */}
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
              <button
                type="button"
                onClick={() => setWeeklyChartType('stacked')}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  weeklyChartType === 'stacked'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Apiladas (Total)
              </button>
              <button
                type="button"
                onClick={() => setWeeklyChartType('grouped')}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  weeklyChartType === 'grouped'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Agrupadas (Comparar)
              </button>
            </div>

            {/* Currency Toggle */}
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
              <button
                type="button"
                onClick={() => setWeeklyCurrency('USD')}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  weeklyCurrency === 'USD'
                    ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                $ USD
              </button>
              <button
                type="button"
                onClick={() => setWeeklyCurrency('Bs')}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  weeklyCurrency === 'Bs'
                    ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bs (BCV)
              </button>
            </div>
          </div>
        </div>

        {/* 4 Payment Types KPI Highlight Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Efectivo Card */}
          <div className="p-3.5 rounded-xl border border-emerald-200/80 bg-emerald-50/40 space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
              <span className="flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                <span>Efectivo (USD / Bs)</span>
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                {weeklyTotals.total > 0
                  ? `${((weeklyTotals.efectivo / weeklyTotals.total) * 100).toFixed(0)}%`
                  : '0%'}
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-slate-900">
              {weeklyCurrency === 'USD'
                ? `$${Number(weeklyTotals.efectivo ?? 0).toFixed(2)}`
                : `${weeklyTotals.efectivo.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
            </div>
            <p className="text-[10px] text-slate-500">
              Caja física disponible de inmediato
            </p>
          </div>

          {/* Punto de Venta Card */}
          <div className="p-3.5 rounded-xl border border-blue-200/80 bg-blue-50/40 space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold text-blue-800">
              <span className="flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                <span>Punto de Venta (POS)</span>
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-800">
                {weeklyTotals.total > 0
                  ? `${((weeklyTotals.punto / weeklyTotals.total) * 100).toFixed(0)}%`
                  : '0%'}
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-slate-900">
              {weeklyCurrency === 'USD'
                ? `$${Number(weeklyTotals.punto ?? 0).toFixed(2)}`
                : `${weeklyTotals.punto.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
            </div>
            <p className="text-[10px] text-slate-500">
              Tarjetas de débito/crédito en tienda
            </p>
          </div>

          {/* Pago Móvil Card */}
          <div className="p-3.5 rounded-xl border border-purple-200/80 bg-purple-50/40 space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold text-purple-800">
              <span className="flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-purple-600" />
                <span>Pago Móvil</span>
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-800">
                {weeklyTotals.total > 0
                  ? `${((weeklyTotals.movil / weeklyTotals.total) * 100).toFixed(0)}%`
                  : '0%'}
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-slate-900">
              {weeklyCurrency === 'USD'
                ? `$${Number(weeklyTotals.movil ?? 0).toFixed(2)}`
                : `${weeklyTotals.movil.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
            </div>
            <p className="text-[10px] text-slate-500">
              Acreditación directa BDV y banca nacional
            </p>
          </div>

          {/* Cashea Card */}
          <div className="p-3.5 rounded-xl border border-amber-200/80 bg-amber-50/40 space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold text-amber-800">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Cashea</span>
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                {weeklyTotals.total > 0
                  ? `${((weeklyTotals.cashea / weeklyTotals.total) * 100).toFixed(0)}%`
                  : '0%'}
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-slate-900">
              {weeklyCurrency === 'USD'
                ? `$${Number(weeklyTotals.cashea ?? 0).toFixed(2)}`
                : `${weeklyTotals.cashea.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
            </div>
            <p className="text-[10px] text-slate-500">
              Cuotas y crédito financiado en app
            </p>
          </div>
        </div>

        {/* Weekly Summary Banner (Peak Day & Total) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-slate-600">
              Total facturado en la semana:{' '}
              <strong className="text-slate-900 font-mono">
                {weeklyCurrency === 'USD'
                  ? `$${Number(weeklyTotals.total ?? 0).toFixed(2)}`
                  : `${weeklyTotals.total.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
              </strong>{' '}
              ({weeklyTotals.transacciones} {weeklyTotals.transacciones === 1 ? 'venta' : 'ventas'})
            </span>
          </div>

          {weeklyTotals.peakDay && weeklyTotals.peakDay.total > 0 && (
            <div className="flex items-center gap-1.5 text-slate-600">
              <span className="text-slate-500">Día con mayor recaudación:</span>
              <span className="font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded font-mono text-[11px]">
                {weeklyTotals.peakDay.dayLabel} (
                {weeklyCurrency === 'USD'
                  ? `$${Number(weeklyTotals.peakDay?.total ?? 0).toFixed(2)}`
                  : `${weeklyTotals.peakDay.total.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
                )
              </span>
            </div>
          )}
        </div>

        {/* Recharts Chart Canvas */}
        <div className="w-full h-80 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={weeklyPaymentData}
              margin={{ top: 15, right: 10, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="dayLabel"
                tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) =>
                  weeklyCurrency === 'USD'
                    ? `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`
                    : `${(v / 1000).toFixed(0)}k`
                }
              />
              <Tooltip
                cursor={{ fill: 'rgba(241, 245, 249, 0.6)' }}
                content={(props: any) => {
                  const { active, payload } = props;
                  if (!active || !payload || !payload.length) return null;
                  const day = payload[0]?.payload;
                  if (!day) return null;

                  const total = day.total || 0;
                  const isUsd = weeklyCurrency === 'USD';

                  return (
                    <div className="bg-slate-900/95 text-white p-3.5 rounded-xl border border-slate-700 shadow-2xl text-xs space-y-2.5 min-w-[250px] pointer-events-none">
                      <div className="border-b border-slate-800 pb-2 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-white text-[13px] capitalize block">
                            {day.fullDate}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {day.transacciones}{' '}
                            {day.transacciones === 1 ? 'venta registrada' : 'ventas registradas'}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-emerald-400 font-mono block">
                            {isUsd
                              ? `$${total.toFixed(2)}`
                              : `${total.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
                          </span>
                          <span className="text-[9px] text-slate-400 font-mono">Total Día</span>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] inline-block"></span>
                            <span>Efectivo:</span>
                          </span>
                          <span className="font-mono font-bold text-white">
                            {isUsd
                              ? `$${day.efectivo.toFixed(2)}`
                              : `${day.efectivo.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
                            <span className="text-[10px] text-emerald-300 font-normal ml-1.5 font-sans">
                              ({total > 0 ? ((day.efectivo / total) * 100).toFixed(0) : 0}%)
                            </span>
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6] inline-block"></span>
                            <span>Punto de Venta:</span>
                          </span>
                          <span className="font-mono font-bold text-white">
                            {isUsd
                              ? `$${day.punto.toFixed(2)}`
                              : `${day.punto.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
                            <span className="text-[10px] text-blue-300 font-normal ml-1.5 font-sans">
                              ({total > 0 ? ((day.punto / total) * 100).toFixed(0) : 0}%)
                            </span>
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6] inline-block"></span>
                            <span>Pago Móvil:</span>
                          </span>
                          <span className="font-mono font-bold text-white">
                            {isUsd
                              ? `$${day.movil.toFixed(2)}`
                              : `${day.movil.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
                            <span className="text-[10px] text-purple-300 font-normal ml-1.5 font-sans">
                              ({total > 0 ? ((day.movil / total) * 100).toFixed(0) : 0}%)
                            </span>
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] inline-block"></span>
                            <span>Cashea:</span>
                          </span>
                          <span className="font-mono font-bold text-white">
                            {isUsd
                              ? `$${day.cashea.toFixed(2)}`
                              : `${day.cashea.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
                            <span className="text-[10px] text-amber-300 font-normal ml-1.5 font-sans">
                              ({total > 0 ? ((day.cashea / total) * 100).toFixed(0) : 0}%)
                            </span>
                          </span>
                        </div>

                        {day.otros > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-slate-300">
                              <span className="w-2.5 h-2.5 rounded-full bg-[#94a3b8] inline-block"></span>
                              <span>Otros:</span>
                            </span>
                            <span className="font-mono font-bold text-white">
                              {isUsd
                                ? `$${day.otros.toFixed(2)}`
                                : `${day.otros.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
                              <span className="text-[10px] text-slate-400 font-normal ml-1.5 font-sans">
                                ({total > 0 ? ((day.otros / total) * 100).toFixed(0) : 0}%)
                              </span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }}
              />
              <Legend
                wrapperStyle={{ paddingTop: 14 }}
                formatter={(value: string) => (
                  <span className="text-xs font-semibold text-slate-700 px-1">{value}</span>
                )}
              />
              <Bar
                dataKey="efectivo"
                name="Efectivo"
                stackId={weeklyChartType === 'stacked' ? 'pagos' : undefined}
                fill="#10b981"
                radius={weeklyChartType === 'stacked' ? [0, 0, 0, 0] : [4, 4, 0, 0]}
              />
              <Bar
                dataKey="punto"
                name="Punto de Venta"
                stackId={weeklyChartType === 'stacked' ? 'pagos' : undefined}
                fill="#3b82f6"
                radius={weeklyChartType === 'stacked' ? [0, 0, 0, 0] : [4, 4, 0, 0]}
              />
              <Bar
                dataKey="movil"
                name="Pago Móvil"
                stackId={weeklyChartType === 'stacked' ? 'pagos' : undefined}
                fill="#8b5cf6"
                radius={weeklyChartType === 'stacked' ? [0, 0, 0, 0] : [4, 4, 0, 0]}
              />
              <Bar
                dataKey="cashea"
                name="Cashea"
                stackId={weeklyChartType === 'stacked' ? 'pagos' : undefined}
                fill="#f59e0b"
                radius={weeklyChartType === 'stacked' ? [4, 4, 0, 0] : [4, 4, 0, 0]}
              />
              {hasOtrosPayments && (
                <Bar
                  dataKey="otros"
                  name="Otros"
                  stackId={weeklyChartType === 'stacked' ? 'pagos' : undefined}
                  fill="#94a3b8"
                  radius={weeklyChartType === 'stacked' ? [4, 4, 0, 0] : [4, 4, 0, 0]}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Toggle Expandable 7-Day Table */}
        <div className="pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setIsWeeklyTableExpanded(!isWeeklyTableExpanded)}
            className="flex items-center justify-between w-full text-xs font-semibold text-slate-700 hover:text-indigo-600 transition py-1"
          >
            <span className="flex items-center gap-1.5">
              <span>Desglose detallado día a día de la semana ({weeklyPaymentData.length} días)</span>
            </span>
            <span className="flex items-center gap-1 text-slate-500">
              <span>{isWeeklyTableExpanded ? 'Ocultar tabla' : 'Ver tabla de datos'}</span>
              {isWeeklyTableExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
          </button>

          {isWeeklyTableExpanded && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Día / Fecha</th>
                    <th className="py-2.5 px-3 text-center">Ventas</th>
                    <th className="py-2.5 px-3 text-right text-emerald-700">Efectivo</th>
                    <th className="py-2.5 px-3 text-right text-blue-700">Punto de Venta</th>
                    <th className="py-2.5 px-3 text-right text-purple-700">Pago Móvil</th>
                    <th className="py-2.5 px-3 text-right text-amber-700">Cashea</th>
                    {hasOtrosPayments && (
                      <th className="py-2.5 px-3 text-right text-slate-600">Otros</th>
                    )}
                    <th className="py-2.5 px-3 text-right font-bold text-slate-900">Total Día</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {weeklyPaymentData.map((d) => (
                    <tr key={d.dateKey} className="hover:bg-slate-50/70 transition">
                      <td className="py-2.5 px-3 font-medium text-slate-800 capitalize">
                        {d.dayLabel}{' '}
                        <span className="text-[10px] text-slate-400 font-mono block">
                          {d.fullDate}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                        {d.transacciones}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-600">
                        {weeklyCurrency === 'USD'
                          ? `$${Number(d.efectivo ?? 0).toFixed(2)}`
                          : `${d.efectivo.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-blue-600">
                        {weeklyCurrency === 'USD'
                          ? `$${Number(d.punto ?? 0).toFixed(2)}`
                          : `${d.punto.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-purple-600">
                        {weeklyCurrency === 'USD'
                          ? `$${Number(d.movil ?? 0).toFixed(2)}`
                          : `${d.movil.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-amber-600">
                        {weeklyCurrency === 'USD'
                          ? `$${Number(d.cashea ?? 0).toFixed(2)}`
                          : `${d.cashea.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
                      </td>
                      {hasOtrosPayments && (
                        <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                          {weeklyCurrency === 'USD'
                            ? `$${Number(d.otros ?? 0).toFixed(2)}`
                            : `${d.otros.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
                        </td>
                      )}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50/50">
                        {weeklyCurrency === 'USD'
                          ? `$${Number(d.total ?? 0).toFixed(2)}`
                          : `${d.total.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-bold border-t border-slate-300 text-slate-900">
                    <td className="py-2.5 px-3">Total Semana</td>
                    <td className="py-2.5 px-3 text-center font-mono">{weeklyTotals.transacciones}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                      {weeklyCurrency === 'USD'
                        ? `$${Number(weeklyTotals.efectivo ?? 0).toFixed(2)}`
                        : `${weeklyTotals.efectivo.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-blue-700">
                      {weeklyCurrency === 'USD'
                        ? `$${Number(weeklyTotals.punto ?? 0).toFixed(2)}`
                        : `${weeklyTotals.punto.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-purple-700">
                      {weeklyCurrency === 'USD'
                        ? `$${Number(weeklyTotals.movil ?? 0).toFixed(2)}`
                        : `${weeklyTotals.movil.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-amber-700">
                      {weeklyCurrency === 'USD'
                        ? `$${Number(weeklyTotals.cashea ?? 0).toFixed(2)}`
                        : `${weeklyTotals.cashea.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
                    </td>
                    {hasOtrosPayments && (
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        {weeklyCurrency === 'USD'
                          ? `$${Number(weeklyTotals.otros ?? 0).toFixed(2)}`
                          : `${weeklyTotals.otros.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
                      </td>
                    )}
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-600 bg-slate-200/60">
                      {weeklyCurrency === 'USD'
                        ? `$${Number(weeklyTotals.total ?? 0).toFixed(2)}`
                        : `${weeklyTotals.total.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Visualización de Datos con Recharts: Volumen Diario de Ventas */}
      <DailySalesChart sales={sales} exchangeRate={exchangeRate} />

      {/* Visual Analytics Grid: Curves & Top Sellers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Curva de Tallas (Size Curve Distribution) - 6 cols */}
        <div className={isFootwear ? "lg:col-span-6 bg-white border border-slate-200 p-4 rounded-xl shadow-xs" : "hidden"}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <h3 className="font-bold text-sm text-slate-900">Curva de Tallas Vendidas</h3>
            </div>
            <span className="text-[11px] text-slate-500 font-semibold">
              Total: {totalPairsSold} {industry.unitLabel}
            </span>
          </div>

          <p className="text-xs text-slate-500 mb-3">
            Indica la demanda exacta por número de pie para orientar las compras de reposición en la zapatería.
          </p>

          {sizeDistribution.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No hay suficientes datos de tallas en este período.
            </div>
          ) : (
            <div className="space-y-2">
              {sizeDistribution.map((item) => {
                const maxPairs = Math.max(...sizeDistribution.map((s) => s.pares), 1);
                const percent = (item.pares / maxPairs) * 100;
                return (
                  <div key={item.talla} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-mono font-bold text-slate-800">{industry.variantLabel} {item.talla}</span>
                      <span className="font-mono text-indigo-600 font-semibold">
                        {item.pares} {industry.unitLabel}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
                      <div
                        className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top 5 Best Selling Shoes - 6 cols */}
        <div className="lg:col-span-12 bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-indigo-600" />
              <h3 className="font-bold text-sm text-slate-900">{isFootwear ? 'Top Modelos de Calzado' : 'Productos con mas ventas'}</h3>
            </div>
            <span className="text-[11px] text-slate-500 font-semibold">Por facturación</span>
          </div>

          <p className="text-xs text-slate-500 mb-3">
            <p className="text-xs text-slate-500 mb-3">{isFootwear ? 'Zapatos con mayor volumen de ventas e ingresos.' : 'Productos con mayor volumen de ventas e ingresos.'}</p>
          </p>

          {topSellingShoes.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No hay ventas registradas en este período.
            </div>
          ) : (
            <div className="space-y-2.5">
              {topSellingShoes.slice(0, 5).map((item, idx) => {
                const sharePercent = totalRevenueUsd > 0 ? (item.totalUsd / totalRevenueUsd) * 100 : 0;
                return (
                  <div
                    key={item.nombre}
                    className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 truncate">{item.nombre}</div>
                        <div className="text-[10px] text-slate-500">
                          {item.marca} • {item.pares} {item.pares === 1 ? industry.unitLabel : industry.unitLabel}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-xs text-emerald-600">
                        ${Number(item.totalUsd ?? 0).toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {sharePercent.toFixed(1)}% del total
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Payment Methods Breakdown */}
      <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-sm text-slate-900">Cobranza por Métodos de Pago</h3>
          </div>
          <span className="text-[11px] text-slate-500">Desglose de recaudación inmediata vs créditos Cashea</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {paymentMethodBreakdown.map((pm) => {
            const isCashea = (pm.cuenta || '').toLowerCase().includes('cashea');
            const isPos = (pm.cuenta || '').toLowerCase().includes('punto') || (pm.cuenta || '').toLowerCase().includes('pos');
            const isPagoMovil = (pm.cuenta || '').toLowerCase().includes('pago móvil') || (pm.cuenta || '').toLowerCase().includes('pago movil');
            return (
              <div
                key={pm.cuenta}
                className={`p-2.5 rounded-lg border text-center transition-all ${
                  isCashea
                    ? 'bg-amber-50/50 border-amber-200 shadow-2xs'
                    : isPos || isPagoMovil
                    ? 'bg-indigo-50/40 border-indigo-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <span className="text-[10px] font-bold uppercase text-slate-600 block truncate">
                  {pm.cuenta}
                </span>
                <div className="text-base font-bold font-mono text-slate-900 mt-1">
                  ${Number(pm.montoUsd ?? 0).toFixed(2)}
                </div>
                <div className="flex items-center justify-center gap-1.5 mt-1">
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      isCashea
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {isCashea ? 'Por Liquidar' : 'En Cuenta'}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500 font-mono">
                    {Number(pm.porcentaje ?? 0).toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed Sales History Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-sm text-slate-900">
              Historial de Ventas del Período ({displayedSales.length})
            </h3>
          </div>

          {/* Quick Payment Type Filter Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-200/70 p-1 rounded-lg">
            <button
              onClick={() => setPaymentTypeFilter('all')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                paymentTypeFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todas ({filteredSales.length})
            </button>
            <button
              onClick={() => setPaymentTypeFilter('cashea')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                paymentTypeFilter === 'cashea'
                  ? 'bg-amber-500 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-amber-800'
              }`}
            >
              <span>Ventas con Cashea</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/25 font-mono">
                {casheaSalesCount}
              </span>
            </button>
            <button
              onClick={() => setPaymentTypeFilter('direct')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                paymentTypeFilter === 'direct'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Contado Directo ({directSalesCount})
            </button>
          </div>

          <span className="text-xs text-slate-500">
            Total recaudado: <span className="font-bold text-indigo-600 font-mono">${totalRevenueUsd.toFixed(2)}</span>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[950px]">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 font-semibold min-w-[95px]">Factura #</th>
                <th className="py-2.5 px-3 font-semibold min-w-[130px]">Fecha</th>
                <th className="py-2.5 px-3 font-semibold min-w-[140px]">Cliente</th>
                <th className="py-2.5 px-3 font-semibold min-w-[170px]">{isFootwear ? 'Calzado comprado' : 'Producto comprado'}</th>
                <th className="py-2.5 px-3 text-right font-semibold min-w-[80px]">Total ($)</th>
                <th className="py-2.5 px-3 text-right font-semibold min-w-[85px]">Total (Bs)</th>
                <th className="py-2.5 px-3 text-right font-semibold min-w-[80px]">Ganancia ($)</th>
                <th className="py-2.5 px-3 font-semibold min-w-[190px]">Forma de Pago</th>
                <th className="py-2.5 px-2 text-center font-semibold min-w-[60px]">Recibo</th>
                <th className="py-2.5 px-2 text-center font-semibold min-w-[60px]">Acciones</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {displayedSales.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    No hay ventas registradas para el filtro seleccionado.
                  </td>
                </tr>
              ) : (
                displayedSales.map((sale) => (
                  <tr key={sale.id} className={`hover:bg-slate-50/80 transition-colors ${sale.estado === 'anulada' ? 'opacity-50' : ''}`}>
                    <td className="py-2.5 px-4 font-mono font-bold text-indigo-600">
                      {editingInvoiceId === sale.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            value={tempInvoiceNumber}
                            onChange={(e) => setTempInvoiceNumber(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                            className="w-28 px-1.5 py-1 border border-indigo-300 rounded bg-white text-slate-800 font-mono text-[11px]"
                          />
                          <button
                            onClick={async () => {
                              if (tempInvoiceNumber.trim()) {
                                const ok = await updateSaleDetails(sale.id, { numero_factura: tempInvoiceNumber.trim() });
                                if (ok) setEditingInvoiceId(null);
                              }
                            }}
                            className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer"
                            title="Guardar número de factura"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button onClick={() => setEditingInvoiceId(null)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group">
                          <span>#{sale.numero_factura}</span>
                          {sale.estado === 'anulada' && (
                            <span className="inline-block px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[9px] font-bold align-middle">ANULADA</span>
                          )}
                          {sale.estado !== 'anulada' && (
                            <button
                              onClick={() => { setEditingInvoiceId(sale.id); setTempInvoiceNumber(sale.numero_factura || ''); }}
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded transition cursor-pointer"
                              title="Editar número de factura"
                            ><Edit2 className="w-2.5 h-2.5" /></button>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">
                      {editingSaleDateId === sale.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="datetime-local"
                            value={tempDateValue}
                            onChange={(e) => setTempDateValue(e.target.value)}
                            className="px-1.5 py-0.5 text-[10px] border border-indigo-300 rounded bg-white text-slate-800 shadow-2xs font-mono"
                          />
                          <button
                            onClick={() => {
                              if (tempDateValue) {
                                const newIso = new Date(tempDateValue).toISOString();
                                updateSaleDate(sale.id, newIso);
                              }
                              setEditingSaleDateId(null);
                            }}
                            className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer"
                            title="Confirmar cambio de fecha"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setEditingSaleDateId(null)}
                            className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                            title="Cancelar"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group">
                          <span>
                            {new Date(sale.fecha).toLocaleString('es-VE', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <button
                            onClick={() => {
                              setEditingSaleDateId(sale.id);
                              setTempDateValue(sale.fecha ? sale.fecha.slice(0, 16) : '');
                            }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded transition cursor-pointer"
                            title="Cambiar fecha de venta (días anteriores)"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">
                        {sale.cliente_nombre} {sale.cliente_apellido || ''}
                      </div>
                      {sale.cliente_rif && (
                        <div className="text-[10px] text-slate-400">{sale.cliente_rif}</div>
                      )}
                    </td>

                    <td className="py-2.5 px-4">
                      <div className="space-y-0.5">
                        {sale.items.map((it, i) => (
                          <div key={i} className="text-[11px] text-slate-700">
                            {it.cantidad}x {it.nombre_producto} <span className="text-slate-400">({industry.variantLabel}: {it.talla})</span>
                          </div>
                        ))}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      ${Number(sale.total_usd ?? 0).toFixed(2)}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono text-slate-500 text-[11px]">
                      {Number(sale.total_bs ?? 0).toFixed(0)} Bs
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-600">
                      +${Number(sale.ganancia_neta_usd ?? 0).toFixed(2)}
                    </td>

                    <td className="py-2.5 px-3 text-[11px]">
                      <div className="space-y-1 min-w-[190px]">
                        {sale.pagos.map((p, idx) => {
                          const isCashea = (p.cuenta || '').toLowerCase().includes('cashea');
                          const isPos = (p.cuenta || '').toLowerCase().includes('punto') || (p.cuenta || '').toLowerCase().includes('pos');
                          const isPagoMovil = (p.cuenta || '').toLowerCase().includes('pago móvil') || (p.cuenta || '').toLowerCase().includes('pago movil');
                          const isReconciled = p.estado_liquidacion === 'conciliado_en_banco';
                          return (
                            <div
                              key={idx}
                              className={`flex items-center justify-between gap-1.5 px-2 py-1 rounded text-[10px] font-mono border ${
                                isCashea
                                  ? isReconciled
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold'
                                    : 'bg-amber-50 border-amber-200 text-amber-800 font-semibold'
                                  : isPos || isPagoMovil
                                  ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-semibold'
                                  : 'bg-slate-100 border-slate-200 text-slate-700'
                              }`}
                            >
                              <span className="truncate">
                                {isCashea ? '⏳ Cashea' : isPos ? '💳 POS' : isPagoMovil ? '📱 Pago Móvil' : p.cuenta}
                                {p.referencia ? ` (${p.referencia})` : ''}
                              </span>
                              <span className="font-bold shrink-0 ml-1">
                                ${Number(p.monto_equivalente_usd ?? 0).toFixed(2)}
                              </span>
                            </div>
                          );
                        })}

                        {/* If sale includes Cashea and is a split payment */}
                        {sale.pagos.some((p) => (p.cuenta || '').toLowerCase().includes('cashea')) && sale.pagos.length > 1 && (
                          <div className="px-1.5 py-0.5 rounded bg-amber-100/70 border border-amber-300/80 text-[9px] font-bold text-amber-900 flex items-center justify-between">
                            <span>Inicial: ${(sale.total_positivo_inmediato_usd || 0).toFixed(2)}</span>
                            <span>Cashea: ${(sale.total_cashea_pendiente_usd || 0).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-4 text-center">
                      <button
                        onClick={() => setSelectedSaleForReceipt(sale)}
                        className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                        title="Ver Comprobante / Imprimir"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>

                    <td className="py-2.5 px-4 text-center">
                      {sale.estado !== 'anulada' && (
                        <button
                          onClick={() => { setSaleToVoid(sale); setVoidReason(''); }}
                          className="p-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors cursor-pointer"
                          title="Anular venta (se cometió un error)"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Printable Receipt Modal */}
      <ReceiptModal
        sale={selectedSaleForReceipt}
        onClose={() => setSelectedSaleForReceipt(null)}
      />

      {/* Void Sale Confirmation Modal */}
      {saleToVoid && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Anular factura #{saleToVoid.numero_factura}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Esta venta quedará marcada como anulada (no se borra del historial)
                  y el stock vendido se devolverá al inventario. Todas las PCs verán este cambio.
                </p>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">
                Motivo de la anulación
              </label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Ej: se cobró un producto equivocado, talla incorrecta, cliente se arrepintió..."
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-rose-300 focus:outline-none resize-none"
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSaleToVoid(null)}
                disabled={isVoiding}
                className="flex-1 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  setIsVoiding(true);
                  const ok = await voidSale(saleToVoid.id, voidReason);
                  setIsVoiding(false);
                  if (ok) setSaleToVoid(null);
                }}
                disabled={isVoiding}
                className="flex-1 px-3 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition cursor-pointer disabled:opacity-50"
              >
                {isVoiding ? 'Anulando...' : 'Confirmar Anulación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Sheets Sync Modal */}
      <GoogleSheetsSyncModal
        isOpen={isSheetsModalOpen}
        onClose={() => setIsSheetsModalOpen(false)}
        periodLabel={`Ventas ${period.toUpperCase()}`}
      />
    </div>
  );
};
