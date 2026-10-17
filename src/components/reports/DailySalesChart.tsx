import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  BarChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  Calendar,
  DollarSign,
  TrendingUp,
  ShoppingBag,
  Layers,
  ArrowUpRight,
  Sparkles,
  BarChart3,
  CalendarDays,
} from 'lucide-react';
import { Sale } from '../../types';
import { getSaleDateKey } from '../../utils/dateUtils';

interface DailySalesChartProps {
  sales: Sale[];
  exchangeRate: number;
}

type MetricView = 'usd' | 'pairs' | 'combined';
type TimeframeOption = 'last_30_days' | 'current_month' | 'previous_month';

interface DayDataPoint {
  dateKey: string;
  dayNumber: number;
  label: string;
  fullDate: string;
  ventasUsd: number;
  ventasBs: number;
  pares: number;
  transacciones: number;
  gananciaUsd: number;
}

export const DailySalesChart: React.FC<DailySalesChartProps> = ({ sales, exchangeRate }) => {
  const [metricView, setMetricView] = useState<MetricView>('combined');
  const [timeframe, setTimeframe] = useState<TimeframeOption>('last_30_days');

  // Compute date range based on selected timeframe
  const { startDate, endDate, rangeTitle } = useMemo(() => {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    let title = '';

    if (timeframe === 'last_30_days') {
      start = new Date(now);
      start.setDate(now.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      title = 'Últimos 30 Días';
    } else if (timeframe === 'current_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      title = `${now.toLocaleString('es-VE', { month: 'long' })} ${now.getFullYear()}`;
    } else if (timeframe === 'previous_month') {
      const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      start = new Date(prevYear, prevMonth, 1);
      // Last day of previous month
      end = new Date(prevYear, prevMonth + 1, 0, 23, 59, 59, 999);
      title = `${start.toLocaleString('es-VE', { month: 'long' })} ${prevYear}`;
    }

    return { startDate: start, endDate: end, rangeTitle: title };
  }, [timeframe]);

  // Aggregate daily data points across the selected timeline
  const chartData = useMemo(() => {
    // Map sales by YYYY-MM-DD
    const salesByDay: Record<string, { totalUsd: number; totalBs: number; pairs: number; count: number; profitUsd: number }> = {};

    sales.forEach((sale) => {
      const saleDate = new Date(sale.fecha);
      if (saleDate >= startDate && saleDate <= endDate) {
        const key = getSaleDateKey(sale.fecha);
        if (!salesByDay[key]) {
          salesByDay[key] = { totalUsd: 0, totalBs: 0, pairs: 0, count: 0, profitUsd: 0 };
        }
        const pairsCount = sale.items.reduce((sum, it) => sum + (Number(it.cantidad) || 0), 0);
        salesByDay[key].totalUsd += Number(sale.total_usd) || 0;
        salesByDay[key].totalBs += Number(sale.total_bs) || 0;
        salesByDay[key].pairs += pairsCount;
        salesByDay[key].count += 1;
        salesByDay[key].profitUsd += Number(sale.ganancia_neta_usd) || 0;
      }
    });

    // Generate continuous sequence of days
    const result: DayDataPoint[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      const yyyy = current.getFullYear();
      const mm = String(current.getMonth() + 1).padStart(2, '0');
      const dd = String(current.getDate()).padStart(2, '0');
      const dateKey = `${yyyy}-${mm}-${dd}`;

      const dayData = salesByDay[dateKey] || {
        totalUsd: 0,
        totalBs: 0,
        pairs: 0,
        count: 0,
        profitUsd: 0,
      };

      const label = current.toLocaleDateString('es-VE', {
        day: '2-digit',
        month: 'short',
      });

      const fullDate = current.toLocaleDateString('es-VE', {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
      });

      result.push({
        dateKey,
        dayNumber: current.getDate(),
        label,
        fullDate,
        ventasUsd: Number(dayData.totalUsd.toFixed(2)),
        ventasBs: Number(dayData.totalBs.toFixed(0)),
        pares: dayData.pairs,
        transacciones: dayData.count,
        gananciaUsd: Number(dayData.profitUsd.toFixed(2)),
      });

      current.setDate(current.getDate() + 1);
    }

    return result;
  }, [sales, startDate, endDate]);

  // Aggregate Summary Stats
  const stats = useMemo(() => {
    let totalUsd = 0;
    let totalPairs = 0;
    let totalTransactions = 0;
    let peakDay: DayDataPoint | null = null;
    let activeDaysCount = 0;

    chartData.forEach((day) => {
      totalUsd += day.ventasUsd;
      totalPairs += day.pares;
      totalTransactions += day.transacciones;
      if (day.transacciones > 0) {
        activeDaysCount += 1;
      }
      if (!peakDay || day.ventasUsd > peakDay.ventasUsd) {
        peakDay = day;
      }
    });

    const averagePerDay = chartData.length > 0 ? totalUsd / chartData.length : 0;
    const averagePairsPerDay = chartData.length > 0 ? totalPairs / chartData.length : 0;

    return {
      totalUsd,
      totalPairs,
      totalTransactions,
      activeDaysCount,
      peakDay,
      averagePerDay,
      averagePairsPerDay,
    };
  }, [chartData]);

  // Custom High Density Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data: DayDataPoint = payload[0].payload;
      return (
        <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-slate-700 text-xs min-w-[200px] z-50">
          <div className="flex items-center justify-between border-b border-slate-700 pb-1.5 mb-2">
            <span className="font-semibold text-slate-200 capitalize">{data.fullDate}</span>
            <span className="text-[10px] text-indigo-400 font-mono font-bold">
              {data.transacciones} {data.transacciones === 1 ? 'venta' : 'ventas'}
            </span>
          </div>

          <div className="space-y-1.5 font-mono">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Ingresos USD:</span>
              <span className="font-bold text-emerald-400">${data.ventasUsd.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400">Equivalente Bs:</span>
              <span className="text-slate-300">
                {(data.ventasUsd * exchangeRate).toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Pares Vendidos:</span>
              <span className="font-bold text-indigo-300">{data.pares} pares</span>
            </div>
            {data.gananciaUsd > 0 && (
              <div className="flex justify-between items-center pt-1 border-t border-slate-800 text-[11px]">
                <span className="text-slate-400">Margen Ganancia:</span>
                <span className="text-emerald-300 font-semibold">+${data.gananciaUsd.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
      
      {/* Chart Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Volumen Diario de Ventas</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
                  Recharts
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Historial cronológico día a día del último mes ({rangeTitle})
              </p>
            </div>
          </div>
        </div>

        {/* View Mode & Timeframe Controls */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Timeframe selector */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            <button
              onClick={() => setTimeframe('last_30_days')}
              className={`px-2.5 py-1 rounded font-medium transition cursor-pointer ${
                timeframe === 'last_30_days'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Últimos 30 Días
            </button>
            <button
              onClick={() => setTimeframe('current_month')}
              className={`px-2.5 py-1 rounded font-medium transition cursor-pointer ${
                timeframe === 'current_month'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mes en Curso
            </button>
            <button
              onClick={() => setTimeframe('previous_month')}
              className={`px-2.5 py-1 rounded font-medium transition cursor-pointer ${
                timeframe === 'previous_month'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mes Anterior
            </button>
          </div>

          {/* Metric View Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            <button
              onClick={() => setMetricView('combined')}
              className={`px-2 py-1 rounded font-medium transition cursor-pointer ${
                metricView === 'combined'
                  ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Mostrar Facturación y Pares en gráfico dual"
            >
              Dual ($ + Pares)
            </button>
            <button
              onClick={() => setMetricView('usd')}
              className={`px-2 py-1 rounded font-medium transition cursor-pointer ${
                metricView === 'usd'
                  ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Mostrar solo ingresos en USD"
            >
              Facturación ($)
            </button>
            <button
              onClick={() => setMetricView('pairs')}
              className={`px-2 py-1 rounded font-medium transition cursor-pointer ${
                metricView === 'pairs'
                  ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Mostrar solo pares de zapatos vendidos"
            >
              Pares Vendidos
            </button>
          </div>

        </div>
      </div>

      {/* KPI Stats Banner for the Chart Range */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Total Período
          </span>
          <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
            ${stats.totalUsd.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            {stats.totalPairs} pares despachados
          </div>
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Promedio Diario
          </span>
          <div className="text-lg font-bold font-mono text-indigo-600 mt-0.5">
            ${stats.averagePerDay.toFixed(2)}/día
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            ~{stats.averagePairsPerDay.toFixed(1)} pares por día
          </div>
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Días con Ventas
          </span>
          <div className="text-lg font-bold font-mono text-slate-800 mt-0.5">
            {stats.activeDaysCount} <span className="text-xs font-normal text-slate-500">/ {chartData.length} días</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            {stats.totalTransactions} transacciones
          </div>
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center justify-between">
            <span>Día Récord</span>
            <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-mono font-bold">
              Pico
            </span>
          </span>
          <div className="text-lg font-bold font-mono text-emerald-600 mt-0.5">
            ${stats.peakDay ? stats.peakDay.ventasUsd.toFixed(2) : '0.00'}
          </div>
          <div className="text-[10px] text-slate-500 truncate">
            {stats.peakDay && stats.peakDay.ventasUsd > 0
              ? `${stats.peakDay.label} (${stats.peakDay.pares} pares)`
              : 'Sin ventas registradas'}
          </div>
        </div>
      </div>

      {/* Recharts Canvas */}
      <div className="h-72 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          {metricView === 'combined' ? (
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorVentasUsd" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                interval={Math.ceil(chartData.length / 10)}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${value}`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: '#8b5cf6' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}p`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: '10px', fontSize: '11px' }}
                formatter={(value) => (value === 'ventasUsd' ? 'Facturación ($ USD)' : 'Pares Vendidos')}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="ventasUsd"
                stroke="#4f46e5"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorVentasUsd)"
                name="ventasUsd"
              />
              <Bar
                yAxisId="right"
                dataKey="pares"
                fill="#8b5cf6"
                radius={[4, 4, 0, 0]}
                maxBarSize={18}
                name="pares"
              />
            </ComposedChart>
          ) : metricView === 'usd' ? (
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorOnlyUsd" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                interval={Math.ceil(chartData.length / 10)}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="ventasUsd"
                stroke="#059669"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorOnlyUsd)"
                name="ventasUsd"
              />
            </AreaChart>
          ) : (
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                interval={Math.ceil(chartData.length / 10)}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value} pares`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="pares"
                fill="#4f46e5"
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
                name="pares"
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Chart Footer Indicator */}
      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block"></span>
            <span>Facturación USD</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block"></span>
            <span>Pares despachados</span>
          </span>
        </div>
        <span className="font-mono text-slate-400">
          Tasa BCV de cálculo: <strong className="text-slate-600">{exchangeRate.toFixed(2)} Bs/USD</strong>
        </span>
      </div>

    </div>
  );
};
