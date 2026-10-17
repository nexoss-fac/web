import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Boxes,
  Search,
  Plus,
  Minus,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Filter,
  Layers,
  Edit2,
  Trash2,
  RotateCcw,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldAlert,
  PackageCheck,
  Tag,
  Printer,
  FileSpreadsheet,
  Sparkles,
  UploadCloud,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { ShoeProduct, ShoeType, MovementType, ProductCategory } from '../../types';
import { ProductFormModal } from './ProductFormModal';
import { StockMovementModal } from './StockMovementModal';
import { ShoeLabelModal } from './ShoeLabelModal';
import { ExcelImportModal } from './ExcelImportModal';
import { ShoeAiScannerModal } from './ShoeAiScannerModal';
import { BatchWhiteBackgroundModal } from './BatchWhiteBackgroundModal';
import { ShoeAiResult } from '../../services/aiShoeService';

export const InventoryManager: React.FC = () => {
  const {
    products,
    movements,
    exchangeRate,
    addProduct,
    addProductsBulk,
    updateProduct,
    adjustStock,
    deleteProduct,
    userRole,
    restoreFromBackup,
  } = useStore();

  const [activeSubTab, setActiveSubTab] = useState<'catalog' | 'kardex' | 'alerts'>('catalog');

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [selectedBrand, setSelectedBrand] = useState('Todas');
  const [selectedType, setSelectedType] = useState('Todos');
  const [selectedSize, setSelectedSize] = useState('Todas');
  const [selectedStockStatus, setSelectedStockStatus] = useState<'todos' | 'critico' | 'agotado' | 'optimo'>('todos');

  // Modals state
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ShoeProduct | null>(null);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isAiScannerOpen, setIsAiScannerOpen] = useState(false);
  const [initialAiData, setInitialAiData] = useState<ShoeAiResult | null>(null);
  const [initialAiImage, setInitialAiImage] = useState<string | null>(null);

  const exportInventoryExcel = () => {
    const productById = new Map(products.map((p) => [p.id, p]));
    const headers = ['Nº','Fecha Creado','año','Mes','Fecha','Tipo De Movimiento','Tipo Documento','Numero Doc','Nombre','Clasificación de inventario','Codigo','Precio','Cantidad','Impuesto','Total','Descripcion'];
    const rows = movements.map((m, i) => {
      const p = productById.get(m.producto_id);
      const d = new Date(m.fecha);
      const precio = Number(p?.precio || 0);
      const cantidad = Number(m.cantidad || 0);
      return [i + 1, p?.created_at ? new Date(p.created_at).toLocaleString('es-VE') : '', d.getFullYear() || '', d.toLocaleDateString('es-VE',{month:'long'}), d.toLocaleDateString('es-VE'), m.tipo, m.tipo === 'venta' ? 'FACTURA' : 'MOVIMIENTO', m.id, m.producto_nombre, p?.clasificacion_inventario || 'Mercancía', m.sku, precio, cantidad, 0, precio * cantidad, m.motivo || ''];
    });
    const ws = XLSX.utils.aoa_to_sheet([
      ['PatentaDoc'],
      ['Libro de Inventario (Entrada - Salida)'],
      ['Contribuyente:','EMPRESA DE DEMOSTRACIÓN'],
      ['Fecha de Exportacion:',new Date().toLocaleString('es-VE')],
      ['Exportado Por:','EMPRESA DE DEMOSTRACIÓN'],
      [], headers, ...rows
    ]);
    ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:15}},{s:{r:1,c:0},e:{r:1,c:15}}];
    ws['!cols']=headers.map((_,i)=>({wch:[6,20,8,14,14,22,16,20,32,26,20,14,12,12,16,35][i]}));
    ws['!autofilter']={ref:`A7:P${7+rows.length}`}; ws['!freeze']={xSplit:0,ySplit:7};
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Hoja1');
    XLSX.writeFile(wb,`NEXOSS_Libro_Inventario_Entrada_Salida_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [movementTargetProduct, setMovementTargetProduct] = useState<ShoeProduct | null>(null);

  // Shoe Label Printing Modal state
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const [labelProduct, setLabelProduct] = useState<ShoeProduct | null>(null);

  // Batch White Studio Background Modal state
  const [isBatchWhiteBgOpen, setIsBatchWhiteBgOpen] = useState(false);

  const handleOpenLabelModal = (p: ShoeProduct) => {
    setLabelProduct(p);
    setIsLabelModalOpen(true);
  };

  // Quick kardex filter
  const [kardexFilterType, setKardexFilterType] = useState<string>('todos');

  // Metrics calculations
  const totalPairs = useMemo(() => {
    return products.filter((p) => p.activo).reduce((sum, p) => sum + p.stock, 0);
  }, [products]);

  const inventoryValueCost = useMemo(() => {
    return products.filter((p) => p.activo).reduce((sum, p) => sum + p.costo * p.stock, 0);
  }, [products]);

  const inventoryValueRetail = useMemo(() => {
    return products.filter((p) => p.activo).reduce((sum, p) => sum + p.precio * p.stock, 0);
  }, [products]);

  const potentialProfit = inventoryValueRetail - inventoryValueCost;

  const criticalItems = useMemo(() => {
    return products.filter((p) => p.activo && p.stock <= p.stock_minimo);
  }, [products]);

  // Unique brands & types
  const brands = useMemo(() => {
    const list = Array.from(new Set(products.map((p) => p.marca).filter(Boolean))).sort();
    return ['Todas', ...list];
  }, [products]);

  const shoeTypes = useMemo(() => {
    const requestedTypes = [
      'Botines Fútbol Campo',
      'Fútbol Campo',
      'Micro Tacos',
      'Futsala',
      'Running',
      'Béisbol',
      'Béisbol Gancho',
      'Casual',
      'Deportivo',
      'Botas',
      'Tacones',
      'Sandalias',
      'Mocasines',
      'Infantil',
      'Otros',
    ];
    const existing = products.map((p) => p.tipo).filter(Boolean);
    return ['Todos', ...Array.from(new Set([...requestedTypes, ...existing]))];
  }, [products]);
  const shoeSizes = ['Todas', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45'];

  // Filtered Products
  const filteredProducts = useMemo(() => {
    const query = (searchQuery || '').toLowerCase().trim();
    return products.filter((p) => {
      if (!p || !p.activo) return false;

      const matchCategory =
        selectedCategory === 'Todas' || (p.categoria || 'Calzado') === selectedCategory;

      const nombre = (p.nombre || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      const color = (p.color || '').toLowerCase();
      const marca = (p.marca || '').toLowerCase();
      const clasificacionInventario = (p.clasificacion_inventario || 'Mercancía').toLowerCase();
      const talla = String(p.talla || '');

      const matchSearch =
        !query ||
        nombre.includes(query) ||
        sku.includes(query) ||
        color.includes(query) ||
        marca.includes(query) ||
        clasificacionInventario.includes(query) ||
        talla.toLowerCase().includes(query);

      const matchBrand = selectedBrand === 'Todas' || (p.marca || '') === selectedBrand;
      const matchType =
        selectedType === 'Todos' ||
        (p.tipo || '').toLowerCase() === selectedType.toLowerCase() ||
        (p.tipo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') ===
          selectedType.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const matchSize = selectedSize === 'Todas' || talla === selectedSize;

      let matchStock = true;
      if (selectedStockStatus === 'critico') {
        matchStock = p.stock <= p.stock_minimo && p.stock > 0;
      } else if (selectedStockStatus === 'agotado') {
        matchStock = p.stock === 0;
      } else if (selectedStockStatus === 'optimo') {
        matchStock = p.stock > p.stock_minimo;
      }

      return matchCategory && matchSearch && matchBrand && matchType && matchSize && matchStock;
    });
  }, [products, searchQuery, selectedCategory, selectedBrand, selectedType, selectedSize, selectedStockStatus]);

  // Filtered movements for Kardex
  const filteredMovements = useMemo(() => {
    if (kardexFilterType === 'todos') return movements;
    return movements.filter((m) => m.tipo === kardexFilterType);
  }, [movements, kardexFilterType]);

  const handleOpenEdit = (p: ShoeProduct) => {
    setEditingProduct(p);
    setIsProductModalOpen(true);
  };

  const handleOpenMovement = (p: ShoeProduct) => {
    setMovementTargetProduct(p);
    setIsMovementModalOpen(true);
  };

  const handleQuickRestock = (p: ShoeProduct, qty: number = 10) => {
    adjustStock(p.id, qty, `Reabastecimiento rápido de ${qty} pares`, 'entrada');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      
      {/* Header & Main Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Boxes className="w-5 h-5 text-indigo-600" />
            <span>Compras / Inventario / Entradas</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitoreo continuo de pares físicos, entradas de lotes, mermas y alertas de reposición.
          </p>
        </div>

        {/* Action Buttons: Primary + Clean Toolbar */}
        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
          <button
            id="new-product-btn"
            type="button"
            onClick={() => {
              setEditingProduct(null);
              setInitialAiData(null);
              setInitialAiImage(null);
              setIsProductModalOpen(true);
            }}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer shrink-0 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Producto nuevo</span>
          </button>

          <button
            id="open-ai-scanner-btn"
            type="button"
            onClick={() => setIsAiScannerOpen(true)}
            className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-cyan-300 font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer shrink-0 whitespace-nowrap border border-slate-700"
            title="Escanear calzado con IA Gemini"
          >
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>Cámara IA</span>
          </button>

          <button
            id="export-inventory-excel-btn"
            type="button"
            onClick={exportInventoryExcel}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer shrink-0 whitespace-nowrap border border-slate-200"
            title="Exportar libro de inventario con el formato de PatentaDoc"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Exportar Inventario</span>
          </button>

          <button
            id="import-excel-btn"
            type="button"
            onClick={() => setIsExcelModalOpen(true)}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            title="Importar inventario masivo desde Excel (.xlsx / .csv)"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Excel / CSV</span>
          </button>

          <button
            id="batch-white-bg-btn"
            type="button"
            onClick={() => setIsBatchWhiteBgOpen(true)}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer border border-slate-200 shrink-0 whitespace-nowrap"
            title="Poner fondo blanco puro de estudio a todos los calzados registrados"
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Fondo Blanco</span>
          </button>
        </div>
      </div>

      {/* Alerta de Recuperación si el inventario está vacío */}
      {products.length === 0 && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-amber-900">
                ¿Tenías calzados guardados que no aparecen?
              </h3>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Cuentas con copias de seguridad locales automáticas y sincronización web en tiempo real.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              id="quick-restore-inventory-btn"
              type="button"
              onClick={() => restoreFromBackup()}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar Copia Local</span>
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards Grid (High Density 4-Card Pattern) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Pairs */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total en Almacén</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono">
            {totalPairs} <span className="text-xs font-normal text-slate-500">pares</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1 font-medium">
            En {products.filter((p) => p.activo).length} modelos y tallas
          </div>
        </div>

        {/* Valuation at Cost */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Valor a Costo</span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono">
            ${inventoryValueCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 font-medium">
            Inversión inmovilizada en stock
          </div>
        </div>

        {/* Valuation at Retail (Revenue Potential) */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Valor Venta (PVP)</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <PackageCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 font-mono">
            ${inventoryValueRetail.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-emerald-600 font-semibold mt-1">
            Ganancia bruta proyectada: +${potentialProfit.toFixed(2)}
          </div>
        </div>

        {/* Critical Stock Alerts */}
        <div
          onClick={() => setActiveSubTab('alerts')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs cursor-pointer hover:border-rose-400 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Stock Crítico</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-600 font-mono flex items-center gap-2">
            <span>{criticalItems.length}</span>
            {criticalItems.length > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-sans font-bold">
                Requiere compra
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 font-medium">
            {criticalItems.filter((i) => i.stock === 0).length} agotados totalmente
          </div>
        </div>

      </div>

      {/* Subtabs Navigation */}
      <div className="flex items-center border-b border-slate-200 gap-6 text-xs font-semibold">
        <button
          onClick={() => setActiveSubTab('catalog')}
          className={`pb-3 border-b-2 transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'catalog'
              ? 'border-indigo-600 text-indigo-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>Catálogo y Existencias Físicas ({products.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('kardex')}
          className={`pb-3 border-b-2 transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'kardex'
              ? 'border-indigo-600 text-indigo-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Bitácora de Movimientos ({movements.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('alerts')}
          className={`pb-3 border-b-2 transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'alerts'
              ? 'border-indigo-600 text-indigo-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Alertas de Reposición ({criticalItems.length})</span>
        </button>
      </div>

      {/* SUBTAB 1: CATALOG & INVENTORY TABLE */}
      {activeSubTab === 'catalog' && (
        <div className="space-y-4">
          
          {/* Filters Bar */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-3">
            {/* Category Quick Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 pb-1 border-b border-slate-100 text-xs">
              <span className="text-slate-400 font-semibold mr-1 text-[11px]">Categoría:</span>
              {[
                { id: 'Todas', label: 'Todas' },
                { id: 'Calzado', label: '👟 Calzado' },
                { id: 'Gorras', label: '🧢 Gorras' },
                { id: 'Medias', label: '🧦 Medias' },
                { id: 'Accesorios', label: '🎒 Accesorios' },
                { id: 'Ropa', label: '👕 Ropa' },
                { id: 'Otros', label: '📦 Otros' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-indigo-600 text-white font-bold shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              
              {/* Search input */}
              <div className="sm:col-span-2 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar modelo, código SKU, color..."
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              {/* Brand Filter */}
              <div>
                <select
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                >
                  <option value="Todas">Todas las Marcas</option>
                  {brands.filter((b) => b !== 'Todas').map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              {/* Type Filter */}
              <div>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                >
                  {shoeTypes.map((t) => (
                    <option key={t} value={t}>{t === 'Todos' ? 'Todos los Tipos' : t}</option>
                  ))}
                </select>
              </div>

              {/* Stock Status Filter */}
              <div>
                <select
                  value={selectedStockStatus}
                  onChange={(e) => setSelectedStockStatus(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                >
                  <option value="todos">Todos los Estados</option>
                  <option value="critico">⚠️ Stock Crítico (≤ Mínimo)</option>
                  <option value="agotado">⛔ Agotados (0 pares)</option>
                  <option value="optimo">✅ Stock Óptimo</option>
                </select>
              </div>

            </div>

            {/* Quick Size filter pills */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
              <span className="text-slate-400 font-semibold mr-1 text-[11px]">Tallas:</span>
              {shoeSizes.map((sz) => (
                <button
                  key={sz}
                  onClick={() => setSelectedSize(sz)}
                  className={`px-2 py-0.5 rounded font-mono text-[11px] transition-colors cursor-pointer ${
                    selectedSize === sz
                      ? 'bg-indigo-600 text-white font-bold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>

          {/* Table Container (High Density Design Theme) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[850px]">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 min-w-[220px]">Calzado / Modelo</th>
                    <th className="py-3 px-2.5 text-center min-w-[65px]">Talla</th>
                    <th className="py-3 px-3 min-w-[110px]">Marca / Tipo</th>
                    <th className="py-3 px-3 text-right min-w-[75px]">Costo ($)</th>
                    <th className="py-3 px-3 text-right min-w-[85px]">PVP ($)</th>
                    <th className="py-3 px-3 text-right min-w-[80px]">Margen</th>
                    <th className="py-3 px-3 text-center min-w-[110px]">Stock en Vivo</th>
                    <th className="py-3 px-3 text-center min-w-[190px] whitespace-nowrap">Acciones</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Boxes className="w-8 h-8 text-slate-300" />
                          <p className="text-xs font-semibold text-slate-600">
                            {products.length === 0
                              ? 'No hay modelos registrados en el almacén.'
                              : 'No se encontraron modelos con los filtros seleccionados.'}
                          </p>
                          {products.length === 0 && (
                            <div className="flex items-center gap-2 mt-2">
                              <button
                                type="button"
                                onClick={() => restoreFromBackup()}
                                className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Restaurar Copia Local</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p) => {
                      const isOutOfStock = p.stock === 0;
                      const isLowStock = p.stock > 0 && p.stock <= p.stock_minimo;
                      const marginAmount = p.precio - p.costo;
                      const marginPercent = p.precio > 0 ? (marginAmount / p.precio) * 100 : 0;

                      return (
                        <tr
                          key={p.id}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          {/* Image & Name */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
                                {p.imagen ? (
                                  <img
                                    src={p.imagen}
                                    alt={p.nombre}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs">👟</div>
                                )}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                                  {p.nombre}
                                  {p.es_original === false ? (
                                    <span
                                      className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-bold border border-amber-200"
                                      title="Producto marcado como réplica (no original)"
                                    >
                                      RÉPLICA
                                    </span>
                                  ) : (
                                    <span
                                      className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-bold border border-emerald-200"
                                      title="Producto original / auténtico"
                                    >
                                      ORIGINAL
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 flex items-center gap-2">
                                  <span>{p.color}</span>
                                  <span>•</span>
                                  <span className="font-mono text-slate-500">{p.sku}</span>
                                </div>
                                <div className="text-[10px] text-indigo-600">{p.clasificacion_inventario || 'Mercancía'}</div>
                              </div>
                            </div>
                          </td>

                          {/* Size */}
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800 font-mono font-bold text-xs">
                              {p.talla}
                            </span>
                          </td>

                          {/* Brand & Type */}
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-800">{p.marca}</div>
                            <div className="text-[10px] text-slate-400">{p.tipo}</div>
                          </td>

                          {/* Cost */}
                          <td className="py-3 px-3 text-right font-mono text-slate-500">
                            ${(p.costo ?? 0).toFixed(2)}
                          </td>

                          {/* Sale Price */}
                          <td className="py-3 px-3 text-right font-mono">
                            <div className="font-bold text-slate-900">${(p.precio ?? 0).toFixed(2)}</div>
                            <div className="text-[10px] text-slate-400">{((p.precio ?? 0) * exchangeRate).toFixed(0)} Bs</div>
                          </td>

                          {/* Margin */}
                          <td className="py-3 px-3 text-right font-mono">
                            <span className="text-emerald-600 font-semibold">
                              +${marginAmount.toFixed(2)}
                            </span>
                            <div className="text-[10px] text-slate-400">{marginPercent.toFixed(0)}%</div>
                          </td>

                          {/* Real-time Stock Badge (High Density Tag Pattern) */}
                          <td className="py-3 px-3 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  isOutOfStock
                                    ? 'bg-rose-100 text-rose-700'
                                    : isLowStock
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-emerald-100 text-emerald-700'
                                }`}
                              >
                                {isOutOfStock ? 'Agotado' : isLowStock ? `${p.stock} pares (Bajo)` : `${p.stock} pares`}
                              </span>
                              <span className="text-[9px] text-slate-400 mt-0.5">
                                Mínimo: {p.stock_minimo}
                              </span>
                            </div>
                          </td>

                          {/* Action Buttons */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <div className="inline-flex items-center justify-center gap-1 shrink-0">
                              {/* Quick -1 */}
                              <button
                                onClick={() => adjustStock(p.id, -1, 'Ajuste rápido manual (-1 par)', 'salida_ajuste')}
                                disabled={p.stock <= 0}
                                title="Restar 1 par"
                                className="w-6 h-6 flex items-center justify-center rounded bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 cursor-pointer shrink-0"
                              >
                                <Minus className="w-3 h-3" />
                              </button>

                              {/* Quick +1 */}
                              <button
                                onClick={() => adjustStock(p.id, 1, 'Ingreso rápido manual (+1 par)', 'entrada')}
                                title="Sumar 1 par"
                                className="w-6 h-6 flex items-center justify-center rounded bg-slate-50 border border-slate-200 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 cursor-pointer shrink-0"
                              >
                                <Plus className="w-3 h-3" />
                              </button>

                              {/* Imprimir Etiqueta (SKU, Descripción y Costo) */}
                              <button
                                onClick={() => handleOpenLabelModal(p)}
                                title="Imprimir Etiqueta para Zapato (SKU, Descripción y Costo)"
                                className="px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-semibold border border-indigo-200 cursor-pointer transition-colors flex items-center gap-1 shrink-0"
                              >
                                <Tag className="w-3 h-3 text-indigo-600" />
                                <span className="hidden xl:inline">Etiqueta</span>
                              </button>

                              {/* Open Movement Modal */}
                              <button
                                onClick={() => handleOpenMovement(p)}
                                title="Movimiento de Lote / Kardex"
                                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium border border-slate-200 cursor-pointer transition-colors shrink-0"
                              >
                                Lote
                              </button>

                              {userRole === 'admin' && (
                                <>
                                  {/* Edit */}
                                  <button
                                    onClick={() => handleOpenEdit(p)}
                                    title="Editar calzado"
                                    className="w-6 h-6 flex items-center justify-center rounded bg-slate-50 border border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 cursor-pointer shrink-0"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>

                                  {/* Delete */}
                                  <button
                                    onClick={() => {
                                      if (confirm(`¿Retirar ${p.nombre} (Talla ${p.talla}) del catálogo?`)) {
                                        deleteProduct(p.id);
                                      }
                                    }}
                                    title="Eliminar del catálogo"
                                    className="w-6 h-6 flex items-center justify-center rounded bg-slate-50 border border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-slate-100 cursor-pointer shrink-0"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>

                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* SUBTAB 2: REAL-TIME KARDEX / STOCK MOVEMENTS */}
      {activeSubTab === 'kardex' && (
        <div className="space-y-4">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-slate-800">Historial de Operaciones y Movimientos en Vivo</span>
            </div>

            {/* Filter by type */}
            <div className="flex items-center gap-1 text-xs">
              <span className="text-slate-400 mr-1">Filtrar por:</span>
              <button
                onClick={() => setKardexFilterType('todos')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  kardexFilterType === 'todos' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setKardexFilterType('entrada')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  kardexFilterType === 'entrada' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Entradas
              </button>
              <button
                onClick={() => setKardexFilterType('venta')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  kardexFilterType === 'venta' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Ventas
              </button>
              <button
                onClick={() => setKardexFilterType('salida_ajuste')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  kardexFilterType === 'salida_ajuste' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Mermas / Ajustes
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Fecha / Hora</th>
                    <th className="py-3 px-4">Calzado & Talla</th>
                    <th className="py-3 px-3">Tipo de Operación</th>
                    <th className="py-3 px-3 text-center">Variación</th>
                    <th className="py-3 px-3 text-center">Stock (Previo ➔ Nuevo)</th>
                    <th className="py-3 px-4">Motivo / Factura</th>
                    <th className="py-3 px-3">Usuario</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400">
                        No hay registros de movimientos en esta categoría.
                      </td>
                    </tr>
                  ) : (
                    filteredMovements.map((mov) => {
                      const isPositive = mov.cantidad > 0;
                      return (
                        <tr key={mov.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                            {new Date(mov.fecha).toLocaleString('es-VE')}
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{mov.producto_nombre}</div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                              <span className="font-semibold text-indigo-600">Talla: {mov.talla}</span>
                              <span>•</span>
                              <span>SKU: {mov.sku}</span>
                            </div>
                          </td>

                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                                mov.tipo === 'entrada'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : mov.tipo === 'venta'
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : mov.tipo === 'devolucion'
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-rose-100 text-rose-700'
                              }`}
                            >
                              {mov.tipo === 'entrada' && <ArrowUpRight className="w-3 h-3" />}
                              {mov.tipo === 'venta' && <ArrowDownRight className="w-3 h-3" />}
                              {mov.tipo === 'salida_ajuste' && <Minus className="w-3 h-3" />}
                              {mov.tipo === 'devolucion' && <RotateCcw className="w-3 h-3" />}
                              {mov.tipo.replace('_', ' ')}
                            </span>
                          </td>

                          <td className="py-3 px-3 text-center font-mono font-bold">
                            <span className={isPositive ? 'text-emerald-600' : 'text-rose-600'}>
                              {isPositive ? `+${mov.cantidad}` : mov.cantidad} pares
                            </span>
                          </td>

                          <td className="py-3 px-3 text-center font-mono text-slate-600">
                            <span>{mov.stock_anterior}</span>
                            <span className="text-slate-400 mx-1">➔</span>
                            <span className="font-bold text-slate-900">{mov.stock_nuevo}</span>
                          </td>

                          <td className="py-3 px-4 text-slate-700">
                            {mov.motivo}
                          </td>

                          <td className="py-3 px-3 text-slate-500 text-[11px]">
                            {mov.usuario}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* SUBTAB 3: CRITICAL REPLENISHMENT ALERTS */}
      {activeSubTab === 'alerts' && (
        <div className="space-y-4">
          <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-sm text-rose-800">
                Calzados que alcanzaron o cayeron bajo el Stock Mínimo ({criticalItems.length})
              </h3>
              <p className="text-xs text-rose-600 mt-0.5">
                Para evitar pérdidas de ventas en la zapatería, reabastece estos modelos y tallas con prioridad. Puedes pulsar "Reabastecer +10" para registrar la entrada inmediata del lote.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {criticalItems.length === 0 ? (
              <div className="col-span-3 py-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-900">¡Excelente! Todos los modelos tienen stock óptimo.</p>
                <p className="text-xs text-slate-400 mt-1">Ningún calzado se encuentra por debajo de su umbral de seguridad.</p>
              </div>
            ) : (
              criticalItems.map((p) => {
                const isOutOfStock = p.stock === 0;
                return (
                  <div
                    key={p.id}
                    className={`p-4 rounded-xl border bg-white shadow-xs flex flex-col justify-between ${
                      isOutOfStock ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                          Talla {p.talla}
                        </span>
                        <span
                          className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                            isOutOfStock
                              ? 'bg-rose-100 text-rose-700 font-bold'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {isOutOfStock ? 'AGOTADO' : `Quedan ${p.stock} pares`}
                        </span>
                      </div>

                      <h4 className="font-bold text-slate-900 text-sm">{p.nombre}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {p.marca} • {p.color} • SKU: {p.sku}
                      </p>

                      <div className="mt-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs font-mono flex justify-between">
                        <span className="text-slate-500">Umbral mínimo fijado:</span>
                        <span className="text-slate-900 font-bold">{p.stock_minimo} pares</span>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                      <button
                        onClick={() => handleOpenLabelModal(p)}
                        title="Imprimir etiqueta para zapato"
                        className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg text-xs cursor-pointer border border-indigo-200 transition-colors flex items-center gap-1"
                      >
                        <Tag className="w-3.5 h-3.5" />
                        <span>Etiqueta</span>
                      </button>

                      <button
                        onClick={() => handleQuickRestock(p, 10)}
                        className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Reabastecer +10</span>
                      </button>

                      <button
                        onClick={() => handleOpenMovement(p)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-xs cursor-pointer border border-slate-200 transition-colors"
                      >
                        Lote
                      </button>
                    </div>

                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Modal: New / Edit Product */}
      <ProductFormModal
        isOpen={isProductModalOpen}
        onClose={() => {
          setIsProductModalOpen(false);
          setInitialAiData(null);
          setInitialAiImage(null);
        }}
        editingProduct={editingProduct}
        initialAiData={initialAiData}
        initialAiImage={initialAiImage}
        onSave={(data) => {
          if (editingProduct) {
            updateProduct(editingProduct.id, data);
          } else {
            addProduct(data);
          }
        }}
        onSaveBulk={(bulk) => {
          addProductsBulk(bulk, false);
        }}
      />

      {/* Modal: Shoe AI Scanner */}
      <ShoeAiScannerModal
        isOpen={isAiScannerOpen}
        onClose={() => setIsAiScannerOpen(false)}
        onSelectForProduct={(aiData, img) => {
          setInitialAiData(aiData);
          setInitialAiImage(img);
          setEditingProduct(null);
          setIsAiScannerOpen(false);
          setIsProductModalOpen(true);
        }}
      />

      {/* Modal: Excel Bulk Inventory Import */}
      <ExcelImportModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        onImport={(newProducts, replaceAll) => {
          addProductsBulk(newProducts, replaceAll);
        }}
        onImportSuccess={(newProducts, replaceAll) => {
          addProductsBulk(newProducts, replaceAll);
        }}
      />

      {/* Modal: Stock Movement */}
      <StockMovementModal
        isOpen={isMovementModalOpen}
        onClose={() => setIsMovementModalOpen(false)}
        product={movementTargetProduct}
        onConfirm={(prodId, delta, motivo, type) => {
          adjustStock(prodId, delta, motivo, type);
        }}
      />

      {/* Modal: Shoe Label Print (SKU, Description, Cost, Talla Predominante & Tallas Disp.) */}
      <ShoeLabelModal
        isOpen={isLabelModalOpen}
        onClose={() => setIsLabelModalOpen(false)}
        product={labelProduct}
        exchangeRate={exchangeRate}
        allProducts={products}
      />

      {/* Modal: Batch White Studio Background Processing */}
      <BatchWhiteBackgroundModal
        isOpen={isBatchWhiteBgOpen}
        onClose={() => setIsBatchWhiteBgOpen(false)}
      />

    </div>
  );
};
