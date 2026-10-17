import React, { useState, useMemo } from 'react';
import {
  BookmarkCheck,
  Plus,
  Search,
  DollarSign,
  Calendar,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Printer,
  Share2,
  Package,
  Phone,
  Trash2,
  CreditCard,
  User,
  ShoppingBag,
  Percent,
  Settings2
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { Layaway, ShoeProduct, LayawayItem, LayawayPayment } from '../../types';
import { LayawayReceiptModal } from './LayawayReceiptModal';

export const LayawaysManager: React.FC = () => {
  const {
    layaways,
    products,
    exchangeRate,
    createLayaway,
    addLayawayPayment,
    cancelLayaway,
    deliverLayaway,
    accounts,
    paymentAccounts,
    userRole,
  } = useStore();

  const availableAccounts = useMemo(() => {
    const list = (paymentAccounts && paymentAccounts.length > 0)
      ? paymentAccounts
      : (accounts && accounts.length > 0)
      ? accounts
      : [
          { id: 'acc-1', nombre: 'Efectivo $', moneda: 'USD' as const, saldo: 0 },
          { id: 'acc-2', nombre: 'Efectivo Bs', moneda: 'Bs' as const, saldo: 0 },
          { id: 'acc-3', nombre: 'Pago Móvil (BDV)', moneda: 'Bs' as const, saldo: 0 },
          { id: 'acc-pos', nombre: 'Punto de Venta', moneda: 'Bs' as const, saldo: 0 },
          { id: 'acc-4', nombre: 'Zelle', moneda: 'USD' as const, saldo: 0 },
        ];
    return list;
  }, [paymentAccounts, accounts]);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'activo' | 'completado' | 'cancelado'>('activo');
  
  // Modal states
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [selectedLayawayForPayment, setSelectedLayawayForPayment] = useState<Layaway | null>(null);
  const [selectedLayawayForReceipt, setSelectedLayawayForReceipt] = useState<Layaway | null>(null);
  const [cancellingLayawayId, setCancellingLayawayId] = useState<string | null>(null);

  // New Layaway Form State
  const [clientNombre, setClientNombre] = useState('');
  const [clientApellido, setClientApellido] = useState('');
  const [clientCedula, setClientCedula] = useState('');
  const [clientTelefono, setClientTelefono] = useState('');
  const [fechaApartado, setFechaApartado] = useState(new Date().toISOString().split('T')[0]);
  
  // Expiration default: 15 days from now
  const defaultDueDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().split('T')[0];
  }, []);
  const [fechaVencimiento, setFechaVencimiento] = useState(defaultDueDate);
  const [notas, setNotas] = useState('');

  // Selected shoes for new layaway
  const [selectedProductId, setSelectedProductId] = useState('');
  const [itemQuantity, setItemQuantity] = useState(1);
  const [cartItems, setCartItems] = useState<LayawayItem[]>([]);
  const [shoeSearchQuery, setShoeSearchQuery] = useState('');
  const [includeOutOfStock, setIncludeOutOfStock] = useState(false);

  // Filtered products list for layaways: handles products with undefined activo, safe stock and search
  const selectableProducts = useMemo(() => {
    return products.filter((p) => {
      const isActivo = p.activo !== false;
      const currentStock = Number(p.stock) || 0;
      if (!isActivo) return false;
      if (!includeOutOfStock && currentStock <= 0) return false;

      if (!shoeSearchQuery.trim()) return true;
      const q = (shoeSearchQuery || '').toLowerCase();
      return (
        (p.nombre || '').toLowerCase().includes(q) ||
        (p.marca || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.color || '').toLowerCase().includes(q) ||
        String(p.talla || '').includes(q)
      );
    });
  }, [products, includeOutOfStock, shoeSearchQuery]);

  // Initial payment for new layaway
  const [abonoInicialMonto, setAbonoInicialMonto] = useState<number>(0);
  const [abonoMoneda, setAbonoMoneda] = useState<'USD' | 'Bs'>('USD');
  const [abonoMetodo, setAbonoMetodo] = useState('Efectivo $');
  const [abonoReferencia, setAbonoReferencia] = useState('');

  // Cashea plan for layaways
  const [casheaEnabled, setCasheaEnabled] = useState(false);
  const [casheaInitialPercent, setCasheaInitialPercent] = useState(40);
  const [casheaInstallments, setCasheaInstallments] = useState(3);
  const [casheaInstallmentPercent, setCasheaInstallmentPercent] = useState<number[]>([20, 20, 20]);
  const [casheaInitialAccount, setCasheaInitialAccount] = useState('Punto de Venta');
  const [casheaFinanceAccount, setCasheaFinanceAccount] = useState('Cashea');


  // Payment Modal State
  const [nuevoAbonoMonto, setNuevoAbonoMonto] = useState<number>(0);
  const [nuevoAbonoMoneda, setNuevoAbonoMoneda] = useState<'USD' | 'Bs'>('USD');
  const [nuevoAbonoMetodo, setNuevoAbonoMetodo] = useState('Efectivo $');
  const [nuevoAbonoRef, setNuevoAbonoRef] = useState('');

  // Calculations for new layaway
  const subtotalNuevoApartado = useMemo(() => {
    return cartItems.reduce((acc, it) => acc + it.subtotal, 0);
  }, [cartItems]);

  const abonoInicialUsd = useMemo(() => {
    if (abonoMoneda === 'Bs') {
      return exchangeRate > 0 ? abonoInicialMonto / exchangeRate : 0;
    }
    return abonoInicialMonto || 0;
  }, [abonoInicialMonto, abonoMoneda, exchangeRate]);

  const saldoRestanteNuevo = Math.max(0, subtotalNuevoApartado - abonoInicialUsd);

  const casheaPendingPercent = Math.max(0, 100 - casheaInitialPercent);
  const casheaInstallmentAmounts = useMemo(() => {
    const saldo = subtotalNuevoApartado * casheaPendingPercent / 100;
    const perc = casheaInstallmentPercent.slice(0, casheaInstallments);
    const totalPct = perc.reduce((a,b) => a+b, 0);
    return perc.map((pct) => saldo * (totalPct > 0 ? pct / totalPct : 0));
  }, [subtotalNuevoApartado, casheaPendingPercent, casheaInstallmentPercent, casheaInstallments]);

  const normalizeCasheaPercentages = (count: number, initial: number) => {
    const remaining = Math.max(0, 100 - initial);
    const base = Math.floor((remaining / count) * 100) / 100;
    const arr = Array.from({ length: count }, (_, i) => i === count - 1 ? Number((remaining - base * (count - 1)).toFixed(2)) : Number(base.toFixed(2)));
    setCasheaInstallmentPercent(arr);
  };

  // Selected Product helper
  const activeProduct = useMemo(() => {
    return products.find((p) => p.id === selectedProductId);
  }, [products, selectedProductId]);

  // Handle adding an item to the new layaway cart
  const handleAddItem = () => {
    if (!activeProduct || itemQuantity <= 0) return;
    const availableStock = activeProduct.stock || 0;

    // Check existing in cart
    const existingInCart = cartItems.find((it) => it.producto_id === activeProduct.id);
    const totalDesired = (existingInCart ? existingInCart.cantidad : 0) + itemQuantity;

    if (totalDesired > availableStock) {
      alert(`Stock insuficiente. Solo quedan ${availableStock} pares disponibles para ${activeProduct.nombre} (Talla ${activeProduct.talla}).`);
      return;
    }

    if (existingInCart) {
      setCartItems((prev) =>
        prev.map((it) =>
          it.producto_id === activeProduct.id
            ? {
                ...it,
                cantidad: totalDesired,
                subtotal: totalDesired * it.precio_unitario,
              }
            : it
        )
      );
    } else {
      setCartItems((prev) => [
        ...prev,
        {
          producto_id: activeProduct.id,
          nombre_producto: activeProduct.nombre,
          sku: activeProduct.sku,
          marca: activeProduct.marca,
          talla: activeProduct.talla,
          color: activeProduct.color,
          cantidad: itemQuantity,
          precio_unitario: activeProduct.precio,
          subtotal: itemQuantity * activeProduct.precio,
        },
      ]);
    }

    setSelectedProductId('');
    setItemQuantity(1);
  };

  const handleRemoveItem = (index: number) => {
    setCartItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit New Layaway
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientNombre.trim()) {
      alert('Por favor introduce el nombre del cliente.');
      return;
    }
    if (cartItems.length === 0) {
      alert('Debes agregar al menos un par de calzado al apartado.');
      return;
    }

    const totalUsd = subtotalNuevoApartado;
    const totalBs = totalUsd * exchangeRate;
    const abonoUsd = abonoInicialUsd;
    const abonoBs = abonoMoneda === 'Bs' ? abonoInicialMonto : abonoInicialUsd * exchangeRate;

    const initialPayments: LayawayPayment[] = [];
    if (abonoInicialMonto > 0) {
      initialPayments.push({
        id: `pay-${Date.now()}`,
        fecha: new Date().toISOString(),
        monto: abonoInicialMonto,
        moneda: abonoMoneda,
        tasa_cambio: exchangeRate,
        monto_equivalente_usd: abonoUsd,
        cuenta: abonoMetodo,
        referencia: abonoReferencia.trim(),
        notas: 'Abono Inicial de Reserva',
      });
    }

    createLayaway({
      cliente_nombre: clientNombre.trim(),
      cliente_apellido: clientApellido.trim(),
      cliente_cedula: clientCedula.trim(),
      cliente_telefono: clientTelefono.trim(),
      items: cartItems,
      total_usd: totalUsd,
      total_bs: totalBs,
      tasa_cambio: exchangeRate,
      total_abonado_usd: abonoUsd,
      total_abonado_bs: abonoBs,
      abonos: initialPayments,
      fecha_apartado: new Date(fechaApartado).toISOString(),
      fecha_vencimiento: fechaVencimiento,
      estado: 'activo',
      usuario: userRole === 'admin' ? 'Administrador' : 'Cajera',
      notas: notas.trim(),
      cashea: {
        habilitado: casheaEnabled,
        porcentaje_inicial: casheaEnabled ? casheaInitialPercent : 0,
        numero_cuotas: casheaEnabled ? casheaInstallments : 0,
        porcentajes_cuotas: casheaEnabled ? casheaInstallmentPercent.slice(0, casheaInstallments) : [],
        cuenta_inicial: casheaEnabled ? casheaInitialAccount : undefined,
        cuenta_financiamiento: casheaEnabled ? casheaFinanceAccount : undefined,
        referencia: abonoReferencia.trim() || undefined,
      },
    });

    // Reset Form
    setIsNewModalOpen(false);
    setClientNombre('');
    setClientApellido('');
    setClientCedula('');
    setClientTelefono('');
    setCartItems([]);
    setAbonoInicialMonto(0);
    setAbonoReferencia('');
    setNotas('');
    setCasheaEnabled(false);
    setCasheaInitialPercent(40);
    setCasheaInstallments(3);
    normalizeCasheaPercentages(3, 40);
  };

  // Submit Additional Payment
  const handleAddPaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLayawayForPayment || nuevoAbonoMonto <= 0) return;

    const montoUsd = nuevoAbonoMoneda === 'Bs'
      ? nuevoAbonoMonto / exchangeRate
      : nuevoAbonoMonto;

    addLayawayPayment(selectedLayawayForPayment.id, {
      fecha: new Date().toISOString(),
      monto: nuevoAbonoMonto,
      moneda: nuevoAbonoMoneda,
      tasa_cambio: exchangeRate,
      monto_equivalente_usd: montoUsd,
      cuenta: nuevoAbonoMetodo,
      referencia: nuevoAbonoRef.trim(),
      notas: 'Abono a saldo restante',
    });

    setSelectedLayawayForPayment(null);
    setNuevoAbonoMonto(0);
    setNuevoAbonoRef('');
  };

  // WhatsApp Reminder
  const handleSendWhatsAppReminder = (layaway: Layaway) => {
    const text = `*Recordatorio de Apartado - NEXOSS*%0A%0A` +
      `Estimado(a) *${layaway.cliente_nombre}*, le saludamos de NEXOSS para recordarle que su apartado *#${layaway.codigo_apartado}* tiene fecha límite el *${new Date(layaway.fecha_vencimiento).toLocaleDateString('es-VE')}*.%0A%0A` +
      `*Calzados Apartados:*%0A` +
      layaway.items.map((it) => `- ${it.nombre_producto} (Talla: ${it.talla})`).join('%0A') +
      `%0A%0A*Total:* $${Number(layaway.total_usd ?? 0).toFixed(2)}%0A` +
      `*Abonado:* $${Number(layaway.total_abonado_usd ?? 0).toFixed(2)}%0A` +
      `*SALDO PENDIENTE:* $${Number(layaway.saldo_pendiente_usd ?? 0).toFixed(2)} (${Number(layaway.saldo_pendiente_bs ?? 0).toFixed(0)} Bs)%0A%0A` +
      `¡Le esperamos en nuestra tienda en Sede no configurada para completar su entrega!`;

    const cleanPhone = (layaway.cliente_telefono || '').replace(/\D/g, '');
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone.startsWith('58') ? cleanPhone : '58' + cleanPhone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
  };

  // Aggregated Stats
  const activeLayaways = useMemo(() => {
    return layaways.filter((l) => l.estado === 'activo');
  }, [layaways]);

  const totalActivosCount = activeLayaways.length;
  const totalActivosUsd = useMemo(() => {
    return activeLayaways.reduce((sum, l) => sum + l.total_usd, 0);
  }, [activeLayaways]);

  const totalSaldoPendienteUsd = useMemo(() => {
    return activeLayaways.reduce((sum, l) => sum + l.saldo_pendiente_usd, 0);
  }, [activeLayaways]);

  const totalParesReservados = useMemo(() => {
    return activeLayaways.reduce(
      (sum, l) => sum + l.items.reduce((acc, it) => acc + it.cantidad, 0),
      0
    );
  }, [activeLayaways]);

  const totalCompletadosCount = useMemo(() => {
    return layaways.filter((l) => l.estado === 'completado').length;
  }, [layaways]);

  // Filtered List
  const filteredLayaways = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return layaways.filter((l) => {
      const matchesStatus = statusFilter === 'todos' ? true : l.estado === statusFilter;
      const matchesSearch =
        !q ||
        (l.codigo_apartado || '').toLowerCase().includes(q) ||
        (l.cliente_nombre || '').toLowerCase().includes(q) ||
        (l.cliente_apellido && (l.cliente_apellido || '').toLowerCase().includes(q)) ||
        (l.cliente_cedula && (l.cliente_cedula || '').toLowerCase().includes(q)) ||
        (l.cliente_telefono && l.cliente_telefono.includes(q)) ||
        l.items.some((it) => (it.nombre_producto || '').toLowerCase().includes(q));

      return matchesStatus && matchesSearch;
    });
  }, [layaways, statusFilter, searchTerm]);

  // Check if nearing due date or expired
  const getDueStatus = (dueDateStr: string, status: string) => {
    if (status !== 'activo') return null;
    const now = new Date().setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr).setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: `Vencido (${Math.abs(diffDays)}d)`, color: 'bg-rose-100 text-rose-700 border-rose-200' };
    }
    if (diffDays <= 3) {
      return { label: `Vence en ${diffDays}d`, color: 'bg-amber-100 text-amber-700 border-amber-200 animate-pulse' };
    }
    return { label: `${diffDays} días restantes`, color: 'bg-slate-100 text-slate-600 border-slate-200' };
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Top Banner / Metrics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
            <BookmarkCheck className="w-5 h-5 text-indigo-600" />
            Sistema de Apartados y Reservas
          </h2>
          <p className="text-xs text-slate-500">
            Control de calzado apartado, abonos fraccionados y fechas de entrega para NEXOSS.
          </p>
        </div>

        <button
          id="new-layaway-btn"
          onClick={() => { setIsNewModalOpen(true); setCasheaEnabled(false); setCasheaInitialPercent(40); setCasheaInstallments(3); normalizeCasheaPercentages(3, 40); }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Apartado</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="font-semibold">Apartados Activos</span>
            <BookmarkCheck className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {totalActivosCount}
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
            Valor total: ${totalActivosUsd.toFixed(2)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="font-semibold">Saldo por Cobrar</span>
            <DollarSign className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-600">
            ${totalSaldoPendienteUsd.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
            ≈ {(totalSaldoPendienteUsd * exchangeRate).toFixed(0)} Bs
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="font-semibold">Pares Reservados</span>
            <Package className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {totalParesReservados}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Zapatos apartados en bodega
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="font-semibold">Completados / Entregados</span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600">
            {totalCompletadosCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Calzados retirados con éxito
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Status Filters */}
        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {(['todos', 'activo', 'completado', 'cancelado'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize whitespace-nowrap cursor-pointer transition-colors ${
                statusFilter === status
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {status === 'todos' ? 'Todos los Estados' : status === 'activo' ? 'En Curso (Activos)' : status === 'completado' ? 'Completados / Retirados' : 'Cancelados'}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative w-full md:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por cliente, código, teléfono..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Layaways List / Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[950px]">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3 px-3 font-semibold min-w-[90px]">Código</th>
                <th className="py-3 px-3 font-semibold min-w-[150px]">Cliente</th>
                <th className="py-3 px-3 font-semibold min-w-[180px]">Calzado Reservado</th>
                <th className="py-3 px-3 font-semibold min-w-[120px]">Fechas</th>
                <th className="py-3 px-3 text-right font-semibold min-w-[85px]">Total ($)</th>
                <th className="py-3 px-3 text-right font-semibold min-w-[85px]">Abonado ($)</th>
                <th className="py-3 px-3 text-right font-semibold min-w-[95px]">Saldo Pendiente</th>
                <th className="py-3 px-3 text-center font-semibold min-w-[110px]">Estado</th>
                <th className="py-3 px-3 text-center font-semibold min-w-[170px] whitespace-nowrap">Acciones</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredLayaways.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No se encontraron apartados con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredLayaways.map((layaway) => {
                  const percentPaid = layaway.total_usd > 0
                    ? Math.min(100, (layaway.total_abonado_usd / layaway.total_usd) * 100)
                    : 100;
                  const isFullyPaid = layaway.saldo_pendiente_usd <= 0.05;
                  const dueStatus = getDueStatus(layaway.fecha_vencimiento, layaway.estado);

                  return (
                    <tr key={layaway.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Code */}
                      <td className="py-3 px-4 font-mono font-bold text-indigo-600">
                        #{layaway.codigo_apartado}
                      </td>

                      {/* Client */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {layaway.cliente_nombre} {layaway.cliente_apellido || ''}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          {layaway.cliente_cedula && <span>{layaway.cliente_cedula}</span>}
                          {layaway.cliente_telefono && (
                            <span className="flex items-center gap-0.5">
                              <Phone className="w-2.5 h-2.5" />
                              {layaway.cliente_telefono}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Reserved Shoes */}
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          {layaway.items.map((it, idx) => (
                            <div key={idx} className="text-[11px] text-slate-700">
                              <span className="font-medium">{it.cantidad}x {it.nombre_producto}</span>{' '}
                              <span className="text-slate-400 font-semibold">(Talla: {it.talla})</span>
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* Dates */}
                      <td className="py-3 px-3 text-[11px]">
                        <div className="text-slate-600">
                          Ini: {new Date(layaway.fecha_apartado).toLocaleDateString('es-VE')}
                        </div>
                        <div className="text-slate-500 font-medium">
                          Vence: {new Date(layaway.fecha_vencimiento).toLocaleDateString('es-VE')}
                        </div>
                        {dueStatus && (
                          <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold border ${dueStatus.color}`}>
                            {dueStatus.label}
                          </span>
                        )}
                      </td>

                      {/* Total USD */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                        ${Number(layaway.total_usd ?? 0).toFixed(2)}
                      </td>

                      {/* Abonado */}
                      <td className="py-3 px-3 text-right">
                        <div className="font-mono font-semibold text-emerald-600">
                          ${Number(layaway.total_abonado_usd ?? 0).toFixed(2)}
                        </div>
                        {/* Mini progress bar */}
                        <div className="w-16 ml-auto bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              percentPaid >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'
                            }`}
                            style={{ width: `${percentPaid}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-slate-400 font-mono">
                          {percentPaid.toFixed(0)}%
                        </span>
                      </td>

                      {/* Saldo Pendiente */}
                      <td className="py-3 px-3 text-right">
                        <div className={`font-mono font-bold text-xs ${
                          isFullyPaid ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          ${Number(layaway.saldo_pendiente_usd ?? 0).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {Number(layaway.saldo_pendiente_bs ?? 0).toFixed(0)} Bs
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          layaway.estado === 'completado'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : layaway.estado === 'cancelado'
                            ? 'bg-rose-50 border-rose-200 text-rose-700'
                            : isFullyPaid
                            ? 'bg-amber-50 border-amber-200 text-amber-700 animate-pulse'
                            : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                        }`}>
                          {layaway.estado === 'activo' && isFullyPaid ? 'Listo para entrega' : layaway.estado}
                        </span>
                      </td>

                      {/* Action buttons */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center justify-center gap-1 shrink-0">
                          {/* Add Payment button */}
                          {layaway.estado === 'activo' && !isFullyPaid && (
                            <button
                              onClick={() => {
                                setSelectedLayawayForPayment(layaway);
                                setNuevoAbonoMonto(0);
                              }}
                              className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-[11px] font-bold border border-indigo-200 cursor-pointer shrink-0 whitespace-nowrap"
                              title="Registrar Abono"
                            >
                              + Abono
                            </button>
                          )}

                          {/* Deliver button if fully paid or manager decision */}
                          {layaway.estado === 'activo' && isFullyPaid && (
                            <button
                              onClick={() => deliverLayaway(layaway.id)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold shadow-2xs cursor-pointer flex items-center gap-1 shrink-0 whitespace-nowrap"
                              title="Entregar Calzado al Cliente"
                            >
                              <CheckCircle className="w-3 h-3" />
                              <span>Entregar</span>
                            </button>
                          )}

                          {/* WhatsApp Reminder */}
                          {layaway.cliente_telefono && layaway.estado === 'activo' && (
                            <button
                              onClick={() => handleSendWhatsAppReminder(layaway)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer shrink-0"
                              title="Enviar recordatorio por WhatsApp"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Print Receipt */}
                          <button
                            onClick={() => setSelectedLayawayForReceipt(layaway)}
                            className="p-1 text-slate-500 hover:bg-slate-100 rounded cursor-pointer shrink-0"
                            title="Ver / Imprimir Comprobante"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {/* Cancel Layaway */}
                          {layaway.estado === 'activo' && (
                            <button
                              onClick={() => setCancellingLayawayId(layaway.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer shrink-0"
                              title="Anular Apartado (reintegra stock)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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

      {/* MODAL: NUEVO APARTADO */}
      {isNewModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50 overflow-y-auto backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-5 sm:p-6 shadow-xl space-y-4 my-6 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <BookmarkCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-base text-slate-900">
                  Crear Nuevo Apartado de Calzado
                </h3>
              </div>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              {/* Client Information */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2.5">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-indigo-600" />
                  Datos del Cliente
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-slate-600 font-medium block mb-1">Nombre *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Carlos"
                      value={clientNombre}
                      onChange={(e) => setClientNombre(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-slate-600 font-medium block mb-1">Apellido</label>
                    <input
                      type="text"
                      placeholder="Ej: Mendoza"
                      value={clientApellido}
                      onChange={(e) => setClientApellido(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-slate-600 font-medium block mb-1">Cédula / RIF</label>
                    <input
                      type="text"
                      placeholder="Ej: V-24123456"
                      value={clientCedula}
                      onChange={(e) => setClientCedula(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-slate-600 font-medium block mb-1">Teléfono (WhatsApp)</label>
                    <input
                      type="text"
                      placeholder="Ej: 0414-1234567"
                      value={clientTelefono}
                      onChange={(e) => setClientTelefono(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Shoes Selection */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5 text-xs sm:text-sm">
                    <ShoppingBag className="w-4 h-4 text-indigo-600" />
                    Seleccionar Calzado a Apartar ({selectableProducts.length} disponibles)
                  </span>
                  
                  <div className="flex items-center gap-3 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 select-none">
                      <input
                        type="checkbox"
                        checked={includeOutOfStock}
                        onChange={(e) => setIncludeOutOfStock(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                      />
                      <span>Mostrar sin stock / Por encargo</span>
                    </label>
                  </div>
                </div>

                {/* Search query input */}
                <div>
                  <input
                    type="text"
                    placeholder="Buscar calzado por modelo, marca (Nike, Adidas...), talla o SKU..."
                    value={shoeSearchQuery}
                    onChange={(e) => setShoeSearchQuery(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-8">
                    <label className="text-slate-500 font-medium block mb-1 text-xs">Calzado y Talla</label>
                    <select
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="">-- Seleccionar Calzado ({selectableProducts.length}) --</option>
                      {selectableProducts.map((p) => {
                        const pr = Number(p.precio) || 0;
                        const prBs = exchangeRate > 0 ? (pr * exchangeRate).toFixed(2) : '0.00';
                        const stk = Number(p.stock) || 0;
                        return (
                          <option key={p.id} value={p.id}>
                            {p.nombre} ({p.marca || 'Genérica'}) - Talla {p.talla} | ${pr.toFixed(2)} (Bs. {prBs}) [{stk} en stock]
                          </option>
                        );
                      })}
                    </select>

                    {selectableProducts.length === 0 && (
                      <p className="text-amber-600 text-xs mt-1.5 font-medium">
                        ⚠️ No se encontraron calzados {shoeSearchQuery ? 'con esa búsqueda' : 'con stock disponible'}. 
                        {!includeOutOfStock && ' Puedes marcar la casilla "Mostrar sin stock / Por encargo" arriba.'}
                      </p>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-slate-500 font-medium block mb-1 text-xs">Cantidad</label>
                    <input
                      type="number"
                      min="1"
                      max={activeProduct && Number(activeProduct.stock) > 0 ? Number(activeProduct.stock) : 99}
                      value={itemQuantity}
                      onChange={(e) => setItemQuantity(parseInt(e.target.value) || 1)}
                      className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 text-center font-bold text-xs sm:text-sm"
                    />
                  </div>

                  <div className="sm:col-span-2 flex items-end">
                    <button
                      type="button"
                      onClick={handleAddItem}
                      disabled={!selectedProductId}
                      className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-40 text-white rounded-lg font-bold shadow-2xs cursor-pointer transition-colors text-xs flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Agregar</span>
                    </button>
                  </div>
                </div>

                {/* Selected shoe preview banner */}
                {activeProduct && (
                  <div className="p-2 bg-indigo-50/70 border border-indigo-100 rounded-lg flex items-center justify-between text-xs text-indigo-900">
                    <div className="flex items-center gap-2">
                      {activeProduct.imagen ? (
                        <img
                          src={activeProduct.imagen}
                          alt={activeProduct.nombre}
                          className="w-8 h-8 rounded-md object-cover border border-indigo-200"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-md bg-indigo-200 text-indigo-700 flex items-center justify-center font-bold text-[10px]">
                          👟
                        </div>
                      )}
                      <div>
                        <div className="font-bold">{activeProduct.nombre}</div>
                        <div className="text-[11px] text-indigo-700">
                          Marca: {activeProduct.marca} • Talla: {activeProduct.talla} • Stock: {Number(activeProduct.stock) || 0}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm text-indigo-950">${(Number(activeProduct.precio) || 0).toFixed(2)}</div>
                      <div className="text-[10px] text-indigo-600">Bs. {((Number(activeProduct.precio) || 0) * exchangeRate).toFixed(2)}</div>
                    </div>
                  </div>
                )}

                {/* Items Cart */}
                {cartItems.length > 0 && (
                  <div className="mt-2 border border-slate-200 rounded-lg bg-white overflow-hidden">
                    <div className="p-2 bg-slate-100 font-semibold text-[11px] text-slate-700 border-b border-slate-200 flex justify-between">
                      <span>Calzados a Apartar ({cartItems.length})</span>
                      <span>Subtotal: ${subtotalNuevoApartado.toFixed(2)}</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {cartItems.map((item, idx) => (
                        <div key={idx} className="p-2 flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-slate-900">{item.nombre_producto}</div>
                            <div className="text-[10px] text-slate-500">
                              {item.marca} • Talla: <span className="font-bold text-slate-800">{item.talla}</span> • Cant: {item.cantidad}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold text-slate-900">
                              ${Number(item.subtotal ?? 0).toFixed(2)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="text-slate-400 hover:text-rose-600 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Dates & Deadlines */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <label className="font-bold text-slate-700 flex items-center gap-1 mb-1">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                    Fecha del Apartado
                  </label>
                  <input
                    type="date"
                    value={fechaApartado}
                    onChange={(e) => setFechaApartado(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                  />
                  <span className="text-[10px] text-slate-400">Puedes modificar si fue en días previos</span>
                </div>

                <div>
                  <label className="font-bold text-slate-700 flex items-center gap-1 mb-1">
                    <Clock className="w-3.5 h-3.5 text-rose-600" />
                    Fecha Límite (Vencimiento)
                  </label>
                  <input
                    type="date"
                    value={fechaVencimiento}
                    onChange={(e) => setFechaVencimiento(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                  />
                  <div className="flex gap-1.5 mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 15);
                        setFechaVencimiento(d.toISOString().split('T')[0]);
                      }}
                      className="text-[10px] px-2 py-0.5 bg-slate-200 rounded text-slate-700 hover:bg-slate-300"
                    >
                      +15 días
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 30);
                        setFechaVencimiento(d.toISOString().split('T')[0]);
                      }}
                      className="text-[10px] px-2 py-0.5 bg-slate-200 rounded text-slate-700 hover:bg-slate-300"
                    >
                      +30 días
                    </button>
                  </div>
                </div>
              </div>

              {/* Initial Payment (Abono Inicial) */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2.5">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                  Abono Inicial Recibido
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-slate-500 font-medium block mb-1">Monto Abonado</label>
                    <div className="flex">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={abonoInicialMonto || ''}
                        onChange={(e) => setAbonoInicialMonto(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-l-lg text-slate-900 font-mono font-bold"
                      />
                      <select
                        value={abonoMoneda}
                        onChange={(e) => setAbonoMoneda(e.target.value as 'USD' | 'Bs')}
                        className="px-2 bg-slate-100 border-y border-r border-slate-200 rounded-r-lg font-bold text-slate-700"
                      >
                        <option value="USD">USD ($)</option>
                        <option value="Bs">Bs</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-500 font-medium block mb-1">Método de Pago</label>
                    <select
                      value={abonoMetodo}
                      onChange={(e) => setAbonoMetodo(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                    >
                      {availableAccounts.map((acc) => (
                        <option key={acc.id} value={acc.nombre}>
                          {acc.nombre} ({acc.moneda})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-500 font-medium block mb-1">Referencia Bancaria</label>
                    <input
                      type="text"
                      placeholder="Últimos 4 dígitos o ref"
                      value={abonoReferencia}
                      onChange={(e) => setAbonoReferencia(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>
                </div>

                {/* Balance summary */}
                <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">Abono Inicial: </span>
                    <span className="font-mono font-bold text-emerald-600">
                      ${abonoInicialUsd.toFixed(2)} ({(abonoInicialUsd * exchangeRate).toFixed(0)} Bs)
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Saldo Restante: </span>
                    <span className="font-mono font-bold text-rose-600 text-sm">
                      ${saldoRestanteNuevo.toFixed(2)} ({(saldoRestanteNuevo * exchangeRate).toFixed(0)} Bs)
                    </span>
                  </div>
                </div>
              </div>

              {/* Cashea Plan for Layaway */}
              <div className="bg-amber-50/70 p-3 rounded-lg border border-amber-200 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900">
                    <Settings2 className="w-3.5 h-3.5" /> Plan Cashea para Apartado
                  </div>
                  <button type="button" onClick={() => setCasheaEnabled(!casheaEnabled)} className={`px-3 py-1 rounded-full text-[11px] font-black ${casheaEnabled ? 'bg-amber-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
                    {casheaEnabled ? 'ACTIVO' : 'ACTIVAR'}
                  </button>
                </div>
                {casheaEnabled && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Inicial (%)</label>
                        <input type="number" min="0" max="100" step="1" value={casheaInitialPercent} onChange={(e) => { const v=Math.min(100,Math.max(0,Number(e.target.value)||0)); setCasheaInitialPercent(v); normalizeCasheaPercentages(casheaInstallments,v); }} className="w-full px-2.5 py-1.5 bg-white border border-amber-200 rounded-lg font-mono font-bold" />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Número de cuotas</label>
                        <select value={casheaInstallments} onChange={(e) => { const v=Math.min(12,Math.max(1,Number(e.target.value)||1)); setCasheaInstallments(v); normalizeCasheaPercentages(v,casheaInitialPercent); }} className="w-full px-2.5 py-1.5 bg-white border border-amber-200 rounded-lg font-bold">
                          {Array.from({length:12},(_,i)=>i+1).map(n=><option key={n} value={n}>{n} cuota{n>1?'s':''}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Cuenta inicial</label>
                        <select value={casheaInitialAccount} onChange={(e)=>setCasheaInitialAccount(e.target.value)} className="w-full px-2.5 py-1.5 bg-white border border-amber-200 rounded-lg">
                          {availableAccounts.map(a=><option key={a.id} value={a.nombre}>{a.nombre} ({a.moneda})</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {casheaInstallmentPercent.slice(0, casheaInstallments).map((pct, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-white rounded-lg border border-amber-100 p-2">
                          <span className="text-[11px] font-bold text-slate-600 flex-1">Cuota {idx+1}</span>
                          <input type="number" min="0" max="100" step="0.01" value={pct} onChange={(e)=>{ const arr=[...casheaInstallmentPercent]; arr[idx]=Math.max(0,Number(e.target.value)||0); setCasheaInstallmentPercent(arr); }} className="w-20 px-2 py-1 text-right font-mono font-bold border border-slate-200 rounded" />
                          <span className="text-[10px] text-slate-500">%</span>
                          <span className="text-[10px] font-mono text-amber-700">${(casheaInstallmentAmounts[idx]||0).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold">
                      <span className="bg-white px-2 py-1 rounded border border-amber-100">Inicial: {casheaInitialPercent}%</span>
                      <span className="bg-white px-2 py-1 rounded border border-amber-100">Financiado: {casheaPendingPercent}%</span>
                      <span className="text-amber-800">Las cuotas se calculan sobre el saldo financiado.</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="text-slate-600 font-medium block mb-1">Notas / Observaciones</label>
                <input
                  type="text"
                  placeholder="Ej: Cliente retirará sábado en la tarde..."
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={cartItems.length === 0}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-lg shadow-xs cursor-pointer transition-colors"
                >
                  Crear y Reservar Calzado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REGISTRAR ABONO ADICIONAL */}
      {selectedLayawayForPayment && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Registrar Abono a Apartado #{selectedLayawayForPayment.codigo_apartado}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Cliente: {selectedLayawayForPayment.cliente_nombre} {selectedLayawayForPayment.cliente_apellido || ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLayawayForPayment(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddPaymentSubmit} className="space-y-3.5 text-xs">
              {/* Balance Summary Box */}
              <div className="bg-slate-900 text-white p-3.5 rounded-xl space-y-1">
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Total Apartado:</span>
                  <span className="font-mono">${selectedLayawayForPayment.total_usd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-400 text-[11px]">
                  <span>Ya Abonado:</span>
                  <span className="font-mono">-${selectedLayawayForPayment.total_abonado_usd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t border-slate-800 pt-1 text-white">
                  <span>SALDO PENDIENTE:</span>
                  <span className="font-mono text-rose-400">
                    ${selectedLayawayForPayment.saldo_pendiente_usd.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>En Bolívares (Tasa BCV {exchangeRate.toFixed(2)}):</span>
                  <span>{selectedLayawayForPayment.saldo_pendiente_bs.toFixed(0)} Bs</span>
                </div>
              </div>

              {selectedLayawayForPayment?.cashea?.habilitado && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-amber-900 font-black text-xs"><Percent className="w-3.5 h-3.5" /> Plan Cashea programado</div>
                  <div className="text-[10px] text-slate-600">Inicial: {selectedLayawayForPayment.cashea.porcentaje_inicial}% • {selectedLayawayForPayment.cashea.numero_cuotas} cuotas • saldo financiado: {Math.max(0,100-selectedLayawayForPayment.cashea.porcentaje_inicial)}%</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(selectedLayawayForPayment.cashea.porcentajes_cuotas || []).map((pct, idx) => {
                      const amount = selectedLayawayForPayment.saldo_pendiente_usd * pct / Math.max(0.01, (selectedLayawayForPayment.cashea?.porcentajes_cuotas || []).reduce((a,b)=>a+b,0));
                      return <button type="button" key={idx} onClick={()=>{ setNuevoAbonoMoneda('USD'); setNuevoAbonoMonto(Number(amount.toFixed(2))); setNuevoAbonoMetodo(selectedLayawayForPayment.cashea?.cuenta_financiamiento || 'Cashea'); }} className="px-2 py-1.5 bg-white border border-amber-200 rounded-lg text-[10px] font-black text-amber-800 hover:bg-amber-100">Cuota {idx+1}: ${(amount).toFixed(2)}</button>;
                    })}
                  </div>
                </div>
              )}

              {/* Payment Input */}
              <div>
                <label className="text-slate-600 font-medium block mb-1">Monto a Abonar</label>
                <div className="flex">
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    value={nuevoAbonoMonto || ''}
                    onChange={(e) => setNuevoAbonoMonto(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-l-lg text-slate-900 font-mono font-bold text-sm"
                  />
                  <select
                    value={nuevoAbonoMoneda}
                    onChange={(e) => setNuevoAbonoMoneda(e.target.value as 'USD' | 'Bs')}
                    className="px-3 bg-slate-100 border-y border-r border-slate-200 rounded-r-lg font-bold text-slate-700"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="Bs">Bs</option>
                  </select>
                </div>
                {/* Quick full-pay button */}
                <div className="mt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (nuevoAbonoMoneda === 'USD') {
                        setNuevoAbonoMonto(selectedLayawayForPayment.saldo_pendiente_usd);
                      } else {
                        setNuevoAbonoMonto(selectedLayawayForPayment.saldo_pendiente_bs);
                      }
                    }}
                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                  >
                    Saldar Total Restante
                  </button>
                </div>
              </div>

              {/* Method */}
              <div>
                <label className="text-slate-600 font-medium block mb-1">Método / Cuenta</label>
                <select
                  value={nuevoAbonoMetodo}
                  onChange={(e) => setNuevoAbonoMetodo(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                >
                  {availableAccounts.map((acc) => (
                    <option key={acc.id} value={acc.nombre}>
                      {acc.nombre} ({acc.moneda})
                    </option>
                  ))}
                </select>
              </div>

              {/* Reference */}
              <div>
                <label className="text-slate-600 font-medium block mb-1">Referencia Bancaria</label>
                <input
                  type="text"
                  placeholder="Número de referencia o confirmación"
                  value={nuevoAbonoRef}
                  onChange={(e) => setNuevoAbonoRef(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                />
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedLayawayForPayment(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={nuevoAbonoMonto <= 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg shadow-xs cursor-pointer transition-colors"
                >
                  Registrar Abono
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION: CANCEL LAYAWAY */}
      {cancellingLayawayId && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-xl max-w-sm w-full p-5 shadow-xl space-y-3">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-sm text-slate-900">¿Anular este apartado?</h3>
            </div>
            <p className="text-xs text-slate-500">
              Los calzados reservados se reincorporarán inmediatamente al inventario disponible de la tienda.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setCancellingLayawayId(null)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                No, mantener
              </button>
              <button
                onClick={() => {
                  cancelLayaway(cancellingLayawayId);
                  setCancellingLayawayId(null);
                }}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-xs"
              >
                Sí, anular y liberar stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PRINT / VIEW LAYAWAY RECEIPT */}
      <LayawayReceiptModal
        layaway={selectedLayawayForReceipt}
        onClose={() => setSelectedLayawayForReceipt(null)}
      />
    </div>
  );
};
