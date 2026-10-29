import React, { useState, useMemo } from 'react';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Check,
  AlertCircle,
  CreditCard,
  Banknote,
  Smartphone,
  Coins,
  Percent,
  User,
  Phone,
  FileText,
  DollarSign,
  Layers,
  Sparkles,
  RotateCcw,
  Landmark,
  ShieldCheck,
  Edit3,
  Tag,
  Calendar,
  BookmarkCheck,
  Maximize2,
  Minimize2,
  Columns,
  Receipt,
  LayoutGrid,
  ShoppingBag,
  Clock,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useStore } from '../../context/StoreContext';
import { ShoeProduct, SaleItem, SalePayment, Sale, ProductCategory } from '../../types';
import { ReceiptModal } from '../common/ReceiptModal';
import { BdvVerificationModal } from '../common/BdvVerificationModal';
import { getTodayVenezuela, createSaleTimestamp } from '../../utils/dateUtils';
import { COMPANY_INDUSTRIES, resolveIndustryTemplate } from '../../domain/companyIndustries';

export interface CartItem {
  product: ShoeProduct;
  quantity: number;
  customPrice?: number; // Precio de venta modificado en facturación
  customCost?: number;  // Costo de producto modificado en facturación
}

export const PointOfSale: React.FC<{ onNavigateToLayaways?: () => void; industryTemplate?: string }> = ({ onNavigateToLayaways, industryTemplate = 'other' }) => {
  const {
    products,
    sales,
    exchangeRate,
    accounts,
    recordSale,
    userRole,
    getExchangeRateForDate,
    setExchangeRateForDate,
  } = useStore();
  const industryKey = resolveIndustryTemplate(industryTemplate);
  const industry = COMPANY_INDUSTRIES[industryKey];
  const isFootwear = industryKey === 'footwear';

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [selectedBrand, setSelectedBrand] = useState('Todas');
  const [selectedType, setSelectedType] = useState('Todos');
  const [selectedSize, setSelectedSize] = useState('Todas');

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [editingPricingId, setEditingPricingId] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'fixed'>('none');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [applyIva, setApplyIva] = useState(false);
  const [ivaIncluded, setIvaIncluded] = useState(true);
  const ivaPercent = 16;

  // Invoice & Customer Data
  const todayIso = getTodayVenezuela();
  const [invoiceDate, setInvoiceDate] = useState<string>(() => getTodayVenezuela());
  const getNextInvoiceNumber = React.useCallback(() => {
    const max = sales.reduce((highest, sale) => {
      const m = String(sale.numero_factura || '').match(/(?:MK[- ]?)?(\d+)$/i);
      return m ? Math.max(highest, Number(m[1]) || 0) : highest;
    }, 0);
    return `MK-${String(max + 1).padStart(6, '0')}`;
  }, [sales]);
  const [invoiceNumber, setInvoiceNumber] = useState<string>(() => 'MK-000001');
  const [reservedInvoiceNumber, setReservedInvoiceNumber] = useState<string>('');
  const [customSaleRate, setCustomSaleRate] = useState<string>('');
  const [isCustomSaleRate, setIsCustomSaleRate] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerLastName, setCustomerLastName] = useState('');
  const [customerRif, setCustomerRif] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerContactStatus, setCustomerContactStatus] = useState('');

  // Effective exchange rate for this sale (matches invoice date or custom rate)
  const effectiveExchangeRate = useMemo(() => {
    if (isCustomSaleRate && parseFloat(customSaleRate) > 0) {
      return parseFloat(customSaleRate);
    }
    // Si la fecha de la factura es hoy, usar directamente la tasa oficial BCV activa
    if (invoiceDate === todayIso && exchangeRate > 0) {
      return exchangeRate;
    }
    return getExchangeRateForDate(invoiceDate);
  }, [invoiceDate, todayIso, exchangeRate, isCustomSaleRate, customSaleRate, getExchangeRateForDate]);

  // Payment State (Mixed payments)
  const [isMixedPaymentOpen, setIsMixedPaymentOpen] = useState(false);
  const [singlePaymentAccount, setSinglePaymentAccount] = useState('Efectivo USD');
  const [mixedPayments, setMixedPayments] = useState<SalePayment[]>([]);

  // Cashea Special Split State
  const [isCasheaSplitOpen, setIsCasheaSplitOpen] = useState(false);
  const [casheaDownPercent, setCasheaDownPercent] = useState<number>(40);
  const [casheaInstallments, setCasheaInstallments] = useState<3 | 6>(3);
  const [casheaDownAccount, setCasheaDownAccount] = useState<string>('Punto de Venta');

  // BDV Verification State
  const [showBdvModal, setShowBdvModal] = useState(false);
  const [bdvVerifiedData, setBdvVerifiedData] = useState<{
    referencia: string;
    codigo_aprobacion: string;
    monto_bs: number;
    fecha: string;
  } | null>(null);

  // Post-sale Receipt Modal
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/invoices/next', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      .then((r) => r.ok ? r.json() : null)
      .then((j) => {
        if (!cancelled && j?.numero_factura) {
          setInvoiceNumber(j.numero_factura);
          setReservedInvoiceNumber(j.numero_factura);
        } else if (!cancelled) {
          setInvoiceNumber(getNextInvoiceNumber());
        }
      })
      .catch(() => { if (!cancelled) setInvoiceNumber(getNextInvoiceNumber()); });
    return () => { cancelled = true; };
  }, [getNextInvoiceNumber]);

  // Billing View Mode when cart has items: 'expanded' (wide principal workbench) | 'split' | 'fullscreen'
  const [billingViewMode, setBillingViewMode] = useState<'expanded' | 'split' | 'fullscreen'>('expanded');

  // Mobile Active View: 'catalog' | 'billing' (optimizes phone screens)
  const [mobileActiveView, setMobileActiveView] = useState<'catalog' | 'billing'>('catalog');

  // Extract unique brands and types
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
    return ['Todos', ...Array.from(new Set([...(isFootwear ? requestedTypes : []), ...existing]))];
  }, [products, isFootwear]);
  const variantOptions = useMemo(() => {
    if (isFootwear) return ['Todas', '36', '37', '38', '39', '40', '41', '42', '43', '44'];
    const variants = Array.from(new Set(products.map((product) => String(product.talla || '').trim()).filter(Boolean))).sort();
    return ['Todas', ...variants];
  }, [products, isFootwear]);
  const productCategories = useMemo(
    () => Array.from(new Set(products.map((product) => String(product.categoria || '').trim()).filter(Boolean))).sort(),
    [products],
  );

  // Filtered Products
  const filteredProducts = useMemo(() => {
    const query = (searchQuery || '').toLowerCase().trim();
    return products.filter((p) => {
      if (!p || !p.activo) return false;

      const nombre = (p.nombre || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      const color = (p.color || '').toLowerCase();
      const marca = (p.marca || '').toLowerCase();
      const talla = String(p.talla || '');

      const matchSearch =
        !query ||
        nombre.includes(query) ||
        sku.includes(query) ||
        color.includes(query) ||
        marca.includes(query) ||
        talla.toLowerCase().includes(query);

      const matchCategory =
        selectedCategory === 'Todas' || (p.categoria || 'Calzado') === selectedCategory;

      const matchBrand = selectedBrand === 'Todas' || (p.marca || '') === selectedBrand;
      const matchType =
        selectedType === 'Todos' ||
        (p.tipo || '').toLowerCase() === selectedType.toLowerCase() ||
        (p.tipo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') ===
          selectedType.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const matchSize = selectedSize === 'Todas' || talla === selectedSize;

      return matchCategory && matchSearch && matchBrand && matchType && matchSize;
    });
  }, [products, searchQuery, selectedCategory, selectedBrand, selectedType, selectedSize]);

  // Cart Calculations
  const subtotalUsd = useMemo(() => {
    return cart.reduce((sum, item) => {
      const unitPrice = item.customPrice !== undefined ? item.customPrice : item.product.precio;
      return sum + unitPrice * item.quantity;
    }, 0);
  }, [cart]);

  const discountUsd = useMemo(() => {
    if (discountType === 'percent') {
      return (subtotalUsd * (discountValue || 0)) / 100;
    }
    if (discountType === 'fixed') {
      return Math.min(subtotalUsd, discountValue || 0);
    }
    return 0;
  }, [subtotalUsd, discountType, discountValue]);

  const taxableOrGrossAfterDiscount = useMemo(() => Math.max(0, subtotalUsd - discountUsd), [subtotalUsd, discountUsd]);

  // Cuando el precio ya contiene IVA, el impuesto se extrae del precio final:
  // base = total / 1.16 e IVA = total - base. Nunca se suma otro 16%.
  const ivaUsd = useMemo(() => {
    if (!applyIva) return 0;
    if (ivaIncluded) return taxableOrGrossAfterDiscount * (ivaPercent / (100 + ivaPercent));
    return taxableOrGrossAfterDiscount * (ivaPercent / 100);
  }, [taxableOrGrossAfterDiscount, applyIva, ivaIncluded, ivaPercent]);

  const totalUsd = Math.max(
    0,
    ivaIncluded && applyIva
      ? taxableOrGrossAfterDiscount
      : taxableOrGrossAfterDiscount + ivaUsd
  );
  const totalBs = totalUsd * effectiveExchangeRate;
  const totalCartQuantity = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  // Add to Cart
  const handleAddToCart = (product: ShoeProduct) => {
    if (product.stock <= 0) return;

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          return prev; // cannot exceed available stock
        }
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          product,
          quantity: 1,
          customPrice: product.precio,
          customCost: product.costo,
        },
      ];
    });
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            if (newQty > item.product.stock) return item;
            return { ...item, quantity: newQty };
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const handleUpdateItemPrice = (productId: string, newPrice: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId
          ? { ...item, customPrice: Math.max(0, newPrice) }
          : item
      )
    );
  };

  const handleUpdateItemCost = (productId: string, newCost: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId
          ? { ...item, customCost: Math.max(0, newCost) }
          : item
      )
    );
  };

  const handleResetItemPricing = (productId: string) => {
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId
          ? { ...item, customPrice: item.product.precio, customCost: item.product.costo }
          : item
      )
    );
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleClearCart = () => {
    setCart([]);
    setCustomerName('');
    setCustomerLastName('');
    setCustomerRif('');
    setCustomerPhone('');
    setDiscountType('none');
    setDiscountValue(0);
    setApplyIva(false);
    setIvaIncluded(true);
    setMixedPayments([]);
    setBdvVerifiedData(null);
    setEditingPricingId(null);
    setMobileActiveView('catalog');
  };

  // Mixed Payment Helper
  const totalPaidUsd = useMemo(() => {
    return mixedPayments.reduce((acc, p) => acc + p.monto_equivalente_usd, 0);
  }, [mixedPayments]);

  const remainingToPayUsd = Math.max(0, totalUsd - totalPaidUsd);

  const handleAddMixedPayment = (accountName: string, amountInput: number, ref?: string) => {
    const acc = accounts.find((a) => a.nombre === accountName);
    if (!acc || amountInput <= 0) return;

    let eqUsd = 0;
    if (acc.moneda === 'Bs') {
      eqUsd = effectiveExchangeRate > 0 ? amountInput / effectiveExchangeRate : 0;
    } else {
      eqUsd = amountInput;
    }

    const newPayment: SalePayment = {
      id: `pay-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      cuenta: acc.nombre,
      moneda: acc.moneda,
      monto: amountInput,
      tasa: acc.moneda === 'Bs' ? effectiveExchangeRate : 1,
      monto_equivalente_usd: eqUsd,
      referencia: ref || undefined,
    };

    setMixedPayments((prev) => [...prev, newPayment]);
  };

  const handleRemoveMixedPayment = (id: string) => {
    setMixedPayments((prev) => prev.filter((p) => p.id !== id));
  };

  // Cashea Automated Plan (Down payment in positive today + Cashea remaining pending in bank)
  const handleApplyCasheaPlan = () => {
    if (totalUsd <= 0) return;
    const downUsd = Number(((totalUsd * casheaDownPercent) / 100).toFixed(2));
    const casheaPendingUsd = Number((totalUsd - downUsd).toFixed(2));

    const downAcc = accounts.find((a) => a.nombre === casheaDownAccount) || accounts.find((a) => a.nombre === 'Punto de Venta') || accounts[0];
    const isDownBs = downAcc.moneda === 'Bs';
    const downAmount = isDownBs ? Number((downUsd * effectiveExchangeRate).toFixed(2)) : downUsd;

    const initialPay: SalePayment = {
      id: `pay-inicial-${Date.now()}`,
      cuenta: downAcc.nombre,
      moneda: downAcc.moneda,
      monto: downAmount,
      tasa: isDownBs ? effectiveExchangeRate : 1,
      monto_equivalente_usd: downUsd,
      referencia: `Inicial ${casheaDownPercent}% Cashea`,
      estado_liquidacion: 'conciliado_en_banco',
    };

    const casheaPay: SalePayment = {
      id: `pay-cashea-${Date.now() + 1}`,
      cuenta: 'Cashea',
      moneda: 'USD',
      monto: casheaPendingUsd,
      tasa: 1,
      monto_equivalente_usd: casheaPendingUsd,
      referencia: `Financiamiento ${casheaInstallments} Cuotas`,
      estado_liquidacion: 'pendiente_banco',
      numero_cuotas: casheaInstallments,
      monto_cuota_usd: Number((casheaPendingUsd / casheaInstallments).toFixed(2)),
      porcentaje_inicial: casheaDownPercent,
    };

    setMixedPayments([initialPay, casheaPay]);
    setIsMixedPaymentOpen(true);
    setIsCasheaSplitOpen(false);
  };

  const lookupCustomerByDocument = async (): Promise<boolean> => {
    const document = customerRif.trim();
    if (!document) return false;
    try {
      const response = await fetch(`/api/contacts?tipo=cliente&documento=${encodeURIComponent(document)}`);
      if (!response.ok) return false;
      const data = await response.json();
      const contact = data?.contact;
      if (contact) {
        setCustomerName(contact.nombre || '');
        setCustomerLastName(contact.apellido || '');
        setCustomerPhone(contact.telefono || '');
        return true;
      }
    } catch (error) {
      console.warn('No se pudo consultar el directorio de clientes:', error);
    }
    return false;
  };

  // Guarda el cliente automáticamente al completar documento y nombre.
  const saveCustomerContact = async () => {
    const document = customerRif.trim();
    const name = customerName.trim();
    if (!document || !name || name.toLowerCase() === 'consumidor final') return;
    setCustomerContactStatus('Guardando cliente…');
    try {
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'cliente', documento: document, nombre, apellido: customerLastName.trim(), telefono: customerPhone.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success !== true) {
        const message = typeof result?.error === 'string' ? result.error : 'No se pudo guardar el cliente.';
        setCustomerContactStatus(message);
        console.warn('[Clientes] Registro rechazado:', response.status, message);
        return;
      }
      setCustomerContactStatus('Cliente guardado automáticamente.');
    } catch (error) {
      setCustomerContactStatus('No se pudo conectar con el directorio de clientes.');
      console.warn('No se pudo guardar el cliente en el directorio:', error);
    }
  };

  // Finalize Sale
  const handleFinalizeSale = async () => {
    if (cart.length === 0) return;

    // Check payments
    let finalPayments: SalePayment[] = [];
    if (isMixedPaymentOpen) {
      if (Math.abs(totalPaidUsd - totalUsd) > 0.1 && totalPaidUsd < totalUsd) {
        alert(`Falta por cubrir $${(totalUsd - totalPaidUsd).toFixed(2)} para completar el pago.`);
        return;
      }
      finalPayments = mixedPayments;
    } else {
      // Single payment method
      const acc = accounts.find((a) => a.nombre === singlePaymentAccount);
      const isBs = acc?.moneda === 'Bs';
      finalPayments = [
        {
          id: `pay-${Date.now()}`,
          cuenta: singlePaymentAccount,
          moneda: isBs ? 'Bs' : 'USD',
          monto: isBs ? totalBs : totalUsd,
          tasa: isBs ? effectiveExchangeRate : 1,
          monto_equivalente_usd: totalUsd,
          referencia: (singlePaymentAccount || '').includes('Pago Móvil') && bdvVerifiedData ? bdvVerifiedData.referencia : undefined,
        },
      ];
    }

    const saleItems: SaleItem[] = cart.map((item) => {
      const unitPrice = item.customPrice !== undefined ? item.customPrice : item.product.precio;
      const unitCost = item.customCost !== undefined ? item.customCost : item.product.costo;
      return {
        producto_id: item.product.id,
        nombre_producto: item.product.nombre,
        sku: item.product.sku,
        talla: item.product.talla,
        marca: item.product.marca,
        cantidad: item.quantity,
        precio_unitario: unitPrice,
        costo_unitario: unitCost,
        subtotal: unitPrice * item.quantity,
      };
    });

    let finalInvoiceNumber = invoiceNumber.trim() || getNextInvoiceNumber();
    // Si el número visible sigue siendo el reservado por Neon, es el correlativo
    // oficial. Si la cajera lo cambió manualmente, respetamos su número.
    if (!finalInvoiceNumber) finalInvoiceNumber = reservedInvoiceNumber || getNextInvoiceNumber();

    const finalSaleDate = createSaleTimestamp(invoiceDate);

    let newSale: Sale;
    try {
      newSale = await recordSale({
      numero_factura: finalInvoiceNumber,
      cliente_nombre: customerName.trim() || 'Consumidor Final',
      cliente_apellido: customerLastName.trim() || '',
      cliente_rif: customerRif.trim() || undefined,
      cliente_telefono: customerPhone.trim() || undefined,
      items: saleItems,
      subtotal_usd: subtotalUsd,
      descuento_usd: discountUsd,
      aplica_iva: applyIva,
      iva_incluido: applyIva ? ivaIncluded : false,
      porcentaje_iva: applyIva ? ivaPercent : 0,
      iva_monto_usd: ivaUsd,
      total_usd: totalUsd,
      total_bs: totalBs,
      tasa_cambio: effectiveExchangeRate,
      pagos: finalPayments,
      fecha: finalSaleDate,
      usuario: userRole === 'admin' ? 'Admin' : 'Cajera',
      });
    } catch (error) {
      console.error('Venta rechazada por el servidor:', error);
      alert(error instanceof Error ? error.message : 'No se pudo registrar la venta. Verifica Neon e intenta nuevamente.');
      return;
    }

    // Guarda/actualiza el cliente por cédula o RIF para autocompletarlo en próximas facturas y equipos.
    if (customerRif.trim() && customerName.trim() && customerName.trim() !== 'Consumidor Final') {
      try {
        await fetch('/api/contacts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo: 'cliente', documento: customerRif.trim(), nombre: customerName.trim(), apellido: customerLastName.trim(), telefono: customerPhone.trim() }),
        });
      } catch (error) { console.warn('No se pudo guardar el cliente en el directorio:', error); }
    }

    setExchangeRateForDate(invoiceDate, effectiveExchangeRate);

    // Confetti celebration
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {
      // fallback safe
    }

    // Reset Form & open receipt
    handleClearCart();
    setInvoiceDate(getTodayVenezuela());
    setIsMixedPaymentOpen(false);
    setLastSale(newSale);
    setInvoiceNumber(`MK-${String(Number((finalInvoiceNumber.match(/(\d+)$/) || [0, 0])[1]) + 1).padStart(6, '0')}`);
  };

  return (
    <div className="w-full min-w-0 max-w-none mx-0 space-y-4 px-2 sm:px-4 lg:px-5">
      
      {/* Top Banner / Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
            <span>Terminal de Ventas & Facturación</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold uppercase tracking-wider">
              En Vivo
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {industry.posDescription}
          </p>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
          <div className="text-left sm:text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Tasa BCV del Día</span>
            <span className="text-sm sm:text-base font-mono font-black text-indigo-600">1 USD = {exchangeRate.toFixed(2)} Bs</span>
          </div>
        </div>
      </div>

      {/* Mobile Segmented View Switcher (Optimizado para Teléfonos) */}
      <div className="lg:hidden flex items-center bg-slate-200/80 p-1 rounded-2xl text-xs font-bold w-full shadow-2xs">
        <button
          type="button"
          onClick={() => setMobileActiveView('catalog')}
          className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer ${
            mobileActiveView === 'catalog'
              ? 'bg-white text-indigo-700 shadow-sm font-black'
              : 'text-slate-600 hover:text-slate-900 font-semibold'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Catálogo ({filteredProducts.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileActiveView('billing')}
          className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer relative ${
            mobileActiveView === 'billing'
              ? 'bg-white text-indigo-700 shadow-sm font-black'
              : 'text-slate-600 hover:text-slate-900 font-semibold'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Factura {cart.length > 0 ? `(${totalCartQuantity} ${industry.unitLabel} • $${totalUsd.toFixed(2)})` : '(0)'}</span>
          {cart.length > 0 && (
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 ring-2 ring-white"></span>
          )}
        </button>
      </div>

      {/* Main Grid: Catalog + Cart & Facturación */}
      <div className="grid min-w-0 grid-cols-1 lg:grid-cols-12 gap-4 xl:gap-5 items-start">
        
        {/* Shoe Catalog Column */}
        <div
          className={`space-y-4 transition-all duration-200 ${
            mobileActiveView === 'billing' ? 'hidden lg:block' : 'block'
          } ${
            cart.length === 0
              ? 'lg:col-span-8'
              : billingViewMode === 'fullscreen'
              ? 'hidden'
              : billingViewMode === 'split'
              ? 'lg:col-span-7 order-2 lg:order-1'
              : 'lg:col-span-7 order-2 lg:order-1'
          }`}
        >
          
          {/* Search & Filter Bar */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            {/* Category Quick Filter Pills - Horizontally scrollable on mobile */}
            <div className="flex items-center gap-1.5 pb-2.5 border-b border-slate-100 text-xs overflow-x-auto no-scrollbar scroll-smooth py-0.5">
              <span className="text-slate-400 font-bold mr-1 text-[11px] shrink-0 uppercase tracking-wider">Categoría:</span>
              {[{ id: 'Todas', label: 'Todas' }, ...productCategories.map((category) => ({ id: category, label: category }))].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                    selectedCategory === cat.id
                      ? 'bg-indigo-600 text-white font-black shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                id="pos-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Buscar por ${industry.productLabel.toLowerCase()}, marca, código o ${industry.variantLabel.toLowerCase()}...`}
                className="w-full pl-9 pr-16 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 px-2 py-0.5 text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-200/80 rounded-lg cursor-pointer"
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* Quick Filters */}
            {(isFootwear || variantOptions.length > 1) && <div className="flex items-center gap-1.5 text-xs overflow-x-auto no-scrollbar py-0.5">
              <span className="text-slate-500 font-bold flex items-center gap-1 mr-1 text-[11px] shrink-0 uppercase tracking-wider">
                <Layers className="w-3.5 h-3.5 text-indigo-600" /> {industry.variantLabel}:
              </span>
              {variantOptions.map((sz) => (
                <button
                  key={sz}
                  onClick={() => setSelectedSize(sz)}
                  className={`px-2.5 py-1 rounded-lg font-mono text-xs transition-colors cursor-pointer shrink-0 ${
                    selectedSize === sz
                      ? 'bg-indigo-600 text-white font-black shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>}

            {/* Filter by Brand & Type */}
            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1 tracking-wider">
                  {isFootwear ? 'Marca de Calzado' : 'Marca'}
                </label>
                <select
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                >
                  {brands.map((b, idx) => (
                    <option key={`pos-brand-${b}-${idx}`} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1 tracking-wider">
                  {isFootwear ? 'Tipo de Calzado' : 'Tipo de producto'}
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                >
                  {shoeTypes.map((t, idx) => (
                    <option key={`pos-type-${t}-${idx}`} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Product Cards Grid */}
          <div className={`grid min-w-0 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 max-h-[min(72vh,900px)] overflow-y-auto overscroll-contain pr-1 pb-1`}>
            {filteredProducts.length === 0 ? (
              <div className="col-span-2 py-12 text-center bg-white rounded-xl border border-dashed border-slate-200 text-slate-500">
                <p className="text-sm font-semibold text-slate-700">No se encontraron {industry.productLabel.toLowerCase()}s con esos criterios.</p>
                <p className="text-xs text-slate-400 mt-1">Prueba cambiando los filtros o limpiando la búsqueda.</p>
              </div>
            ) : (
              filteredProducts.map((prod, idx) => {
                const inCart = cart.find((i) => i.product.id === prod.id);
                const isOutOfStock = prod.stock <= 0;
                const isLowStock = prod.stock > 0 && prod.stock <= prod.stock_minimo;

                return (
                  <div
                    key={prod.id ? `pos-prod-${prod.id}-${idx}` : `pos-idx-${idx}`}
                    id={`pos-card-${prod.id || idx}`}
                    className={`group min-w-0 p-3.5 sm:p-4 rounded-2xl border bg-white transition-all shadow-sm hover:shadow-md flex flex-col justify-between ${
                      isOutOfStock
                        ? 'border-slate-200 opacity-60'
                        : 'border-slate-200 hover:border-indigo-400 hover:shadow-sm'
                    }`}
                  >
                    <div>
                      {/* Card Image and Badges */}
                      <div className="relative mb-3 rounded-xl overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 h-36 sm:h-40 flex items-center justify-center border border-slate-200/70">
                        {prod.imagen ? (
                          <img
                            src={prod.imagen}
                            alt={prod.nombre}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="text-3xl">{isFootwear ? '👟' : '📦'}</span>
                        )}

                        {/* Size Badge */}
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-slate-900/90 backdrop-blur-xs text-white text-[10px] font-mono font-bold">
                          {industry.variantLabel}: {prod.talla}
                        </div>

                        {/* Stock Status Badge */}
                        <div className="absolute top-2 right-2">
                          {isOutOfStock ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold uppercase">
                              Agotado
                            </span>
                          ) : isLowStock ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                              Últimos {prod.stock}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                              {prod.stock} {industry.unitLabel}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Brand & Name */}
                      <div className="text-[10px] uppercase tracking-wider font-bold text-indigo-600">
                        {prod.marca} • {prod.tipo}
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 line-clamp-1 mt-0.5">
                        {prod.nombre}
                      </h3>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center justify-between">
                        <span>{prod.color}</span>
                        <span className="font-mono text-[10px] text-slate-400">{prod.sku}</span>
                      </div>
                    </div>

                    {/* Price & Add to Cart Button */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <div className="text-base font-bold text-slate-900 font-mono">
                          ${prod.precio.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {(prod.precio * exchangeRate).toFixed(0)} Bs
                        </div>
                      </div>

                      <button
                        onClick={() => handleAddToCart(prod)}
                        disabled={isOutOfStock || (inCart && inCart.quantity >= prod.stock)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                          isOutOfStock
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : inCart && inCart.quantity >= prod.stock
                            ? 'bg-slate-200 text-slate-600'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{inCart ? `(${inCart.quantity}) +` : 'Agregar'}</span>
                      </button>
                    </div>

                  </div>
                );
              })
            )}
          </div>

        </div>

        {/* Facturación & Checkout Panel */}
        <div
          className={`${billingViewMode === 'fullscreen' && cart.length > 0
            ? 'fixed inset-0 z-[100] h-[100dvh] w-screen overflow-y-auto overscroll-contain bg-slate-50 p-2 sm:p-4 lg:p-6 rounded-none'
            : 'space-y-4 transition-all duration-200'} ${
            mobileActiveView === 'catalog' && !(billingViewMode === 'fullscreen' && cart.length > 0) ? 'hidden lg:block' : 'block'
          } ${
            cart.length === 0
              ? 'lg:col-span-4'
              : billingViewMode === 'fullscreen'
              ? 'col-span-12'
              : billingViewMode === 'split'
              ? 'lg:col-span-5 order-1 lg:order-2'
              : 'lg:col-span-5 order-1 lg:order-2'
          }`}
        >
          {cart.length === 0 ? (
            /* Empty State Prompt */
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-xs text-center flex flex-col items-center justify-center min-h-[380px]">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-3 shadow-xs">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Facturación en Espera</h3>
              <p className="text-xs text-slate-500 max-w-xs mt-1">
                Selecciona cualquier producto del catálogo para abrir la mesa de facturación ampliada y procesar el cobro.
              </p>
              {onNavigateToLayaways && (
                <button
                  type="button"
                  onClick={onNavigateToLayaways}
                  className="mt-4 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <BookmarkCheck className="w-4 h-4 text-amber-600" />
                  <span>Revisar Apartados de Clientes</span>
                </button>
              )}
            </div>
          ) : (
            /* Active Billing Workbench */
            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-5 shadow-sm space-y-5 min-w-0">
              
              {/* Top Toolbar: Title, View Switcher & Action buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-base sm:text-lg text-slate-900 tracking-tight truncate">
                        Mesa de Facturación & Cobro
                      </h2>
                      <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 border border-indigo-200 text-indigo-800 font-bold text-xs whitespace-nowrap shrink-0">
                        {cart.reduce((s, i) => s + i.quantity, 0)} {industry.unitLabel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      NEXOSS • Sede no configurada • Tasa Oficial BCV: <span className="font-mono font-bold text-slate-900">{exchangeRate.toFixed(2)} Bs/USD</span>
                    </p>
                  </div>
                </div>

                {/* View Switchers & Action buttons */}
                <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2 flex-wrap">
                  {/* Mobile Back to Catalog Button */}
                  <button
                    type="button"
                    onClick={() => setMobileActiveView('catalog')}
                    className="lg:hidden text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1 transition cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>+ Calzados</span>
                  </button>

                  {/* View Mode Switcher Pills on Desktop */}
                  <div className="hidden sm:flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs shrink-0">
                    <button
                      type="button"
                      onClick={() => setBillingViewMode('expanded')}
                      title="Vista Principal Ampliada"
                      className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap ${
                        billingViewMode === 'expanded'
                          ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Columns className="w-3 h-3" />
                      <span>Ampliada</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillingViewMode('split')}
                      title="Vista Dividida (50/50)"
                      className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap ${
                        billingViewMode === 'split'
                          ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <LayoutGrid className="w-3 h-3" />
                      <span>Dividida</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillingViewMode('fullscreen')}
                      title="Abrir facturación en toda la pantalla"
                      className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap ${
                        billingViewMode === 'fullscreen'
                          ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Maximize2 className="w-3 h-3" />
                      <span>Todo pantalla</span>
                    </button>
                  </div>

                  {billingViewMode !== 'fullscreen' && (
                    <button
                      type="button"
                      onClick={() => { setBillingViewMode('fullscreen'); setMobileActiveView('billing'); }}
                      className="text-xs sm:text-sm text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-2 rounded-xl font-black flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shadow-sm"
                      title="Continuar al paso de pago y facturación"
                    >
                      <ArrowRight className="w-4 h-4" />
                      <span>Proceder al pago</span>
                    </button>
                  )}

                  {billingViewMode === 'fullscreen' && (
                    <button
                      type="button"
                      onClick={() => setBillingViewMode('expanded')}
                      className="text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1 transition cursor-pointer whitespace-nowrap shrink-0"
                      title="Volver al catálogo para agregar más productos"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Volver a productos</span>
                    </button>
                  )}

                  {onNavigateToLayaways && (
                    <button
                      type="button"
                      onClick={onNavigateToLayaways}
                      className="text-xs text-amber-800 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1 transition cursor-pointer whitespace-nowrap shrink-0"
                      title="Ver o gestionar apartados de clientes"
                    >
                      <BookmarkCheck className="w-3.5 h-3.5 text-amber-600" />
                      <span className="hidden sm:inline">Apartados</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleClearCart}
                    className="text-xs text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1 font-bold transition cursor-pointer whitespace-nowrap shrink-0"
                    title="Vaciar carrito actual"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Vaciar</span>
                  </button>
                </div>
              </div>

              {/* Multi-Column Billing Workbench Layout */}
              <div className={`grid gap-6 ${
                billingViewMode === 'split'
                  ? 'grid-cols-1'
                  : 'grid-cols-1 2xl:grid-cols-12 items-start'
              }`}>
                
                {/* Left Section: Calzados a Facturar & Descuentos */}
                <div className={`${billingViewMode === 'split' ? 'space-y-4' : '2xl:col-span-7 space-y-4'}`}>
                  
                  <div className="flex items-center justify-between text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wider pb-1.5 border-b border-slate-200">
                    <span className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-indigo-600" />
                      <span>Calzados a Facturar ({cart.length})</span>
                    </span>
                    <span className="text-slate-500 font-semibold lowercase">precios en USD y Bs</span>
                  </div>

                  {/* Cart Items List */}
                  <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-100 pr-1">
                    {cart.map((item, idx) => {
                      const unitPrice = item.customPrice !== undefined ? item.customPrice : item.product.precio;
                      const unitCost = item.customCost !== undefined ? item.customCost : item.product.costo;
                      const isPriceModified = item.customPrice !== undefined && Math.abs(item.customPrice - item.product.precio) > 0.001;
                      const isCostModified = item.customCost !== undefined && Math.abs(item.customCost - item.product.costo) > 0.001;
                      const isEditing = editingPricingId === item.product.id;
                      const marginPercent = unitPrice > 0 ? ((unitPrice - unitCost) / unitPrice) * 100 : 0;

                      return (
                        <div key={item.product.id ? `cart-item-${item.product.id}-${idx}` : `cart-item-${idx}`} className="py-4 space-y-3">
                          <div className="flex items-start sm:items-center justify-between gap-3">
                            
                            {/* Product Thumbnail & Details */}
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center shadow-2xs">
                                {item.product.imagen ? (
                                  <img
                                    src={item.product.imagen}
                                    alt={item.product.nombre}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <span className="text-2xl">👟</span>
                                )}
                              </div>

                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
                                    {item.product.marca}
                                  </span>
                                  {item.product.es_original !== undefined && (
                                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                                      item.product.es_original
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                        : 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                                    }`}>
                                      {item.product.es_original ? 'Original' : 'Réplica'}
                                    </span>
                                  )}
                                  {(isPriceModified || isCostModified) && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                      Modificado
                                    </span>
                                  )}
                                </div>

                                <h4 className="font-bold text-sm sm:text-base text-slate-900 leading-snug line-clamp-2">
                                  {item.product.nombre}
                                </h4>

                                <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs">
                                  <span className="px-2 py-0.5 rounded-md font-bold bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs shadow-2xs">
                                    {industry.variantLabel}: {item.product.talla}
                                  </span>
                                  <span className="font-mono text-slate-900 font-bold text-xs sm:text-sm">
                                    ${unitPrice.toFixed(2)} c/u
                                  </span>
                                  <span className="text-xs text-slate-500 font-mono">
                                    (~{(unitPrice * effectiveExchangeRate).toFixed(2)} Bs)
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setEditingPricingId(isEditing ? null : item.product.id)}
                                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline flex items-center gap-1 cursor-pointer"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>{isEditing ? 'Cerrar' : 'Ajustar'}</span>
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Quantity Controls & Line Total */}
                            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2.5 shrink-0">
                              {/* Quantity Stepper */}
                              <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-xl border border-slate-200 shadow-2xs">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQuantity(item.product.id, -1)}
                                  className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-white hover:bg-slate-200 text-slate-800 rounded-lg shadow-2xs cursor-pointer transition font-bold"
                                  title="Disminuir"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="font-mono text-sm sm:text-base font-bold text-slate-900 w-7 text-center">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQuantity(item.product.id, 1)}
                                  disabled={item.quantity >= item.product.stock}
                                  className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-white hover:bg-slate-200 text-slate-800 rounded-lg shadow-2xs disabled:opacity-30 cursor-pointer transition font-bold"
                                  title="Aumentar"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {/* Line Total */}
                              <div className="text-right min-w-[80px]">
                                <div className="text-base sm:text-xl font-bold text-indigo-700 font-mono tracking-tight">
                                  ${(unitPrice * item.quantity).toFixed(2)}
                                </div>
                                <div className="text-[11px] font-semibold text-slate-600 font-mono">
                                  {((unitPrice * item.quantity) * effectiveExchangeRate).toFixed(0)} Bs
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFromCart(item.product.id)}
                                  className="mt-1 px-2 py-0.5 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-600 font-semibold text-xs cursor-pointer transition inline-flex items-center gap-1 ml-auto"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Quitar</span>
                                </button>
                              </div>
                            </div>

                          </div>

                          {/* Expandable Price & Cost Editor */}
                          {isEditing && (
                            <div className="p-3 bg-slate-50 border border-indigo-200 rounded-xl space-y-2.5 text-xs animate-in fade-in duration-150">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                                <span className="flex items-center gap-1.5 text-indigo-700">
                                  <Edit3 className="w-4 h-4" /> Modificar Montos para esta Facturación
                                </span>
                                <span className="text-[10px] font-mono text-slate-500">
                                  BCV: {exchangeRate.toFixed(2)} Bs/$
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {/* Precio de Venta Unitario */}
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                    Precio Venta Unitario ($ USD):
                                  </label>
                                  <div className="relative">
                                    <span className="absolute inset-y-0 left-2.5 flex items-center text-slate-400 text-xs font-bold">
                                      $
                                    </span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={unitPrice}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        handleUpdateItemPrice(item.product.id, isNaN(val) ? 0 : val);
                                      }}
                                      className="w-full pl-6 pr-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                                    />
                                  </div>
                                  <span className="text-[10px] text-slate-500 block mt-1 font-mono">
                                    (~{(unitPrice * exchangeRate).toFixed(2)} Bs) • Catálogo: ${item.product.precio.toFixed(2)}
                                  </span>
                                </div>

                                {/* Costo del Producto Unitario */}
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                    Costo de Producto ($ USD):
                                  </label>
                                  <div className="relative">
                                    <span className="absolute inset-y-0 left-2.5 flex items-center text-slate-400 text-xs font-bold">
                                      $
                                    </span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={unitCost}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        handleUpdateItemCost(item.product.id, isNaN(val) ? 0 : val);
                                      }}
                                      className="w-full pl-6 pr-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                                    />
                                  </div>
                                  <span className="text-[10px] text-slate-500 block mt-1 font-mono">
                                    Margen: {marginPercent >= 0 ? `+${marginPercent.toFixed(1)}%` : `${marginPercent.toFixed(1)}%`} • Catálogo: ${item.product.costo.toFixed(2)}
                                  </span>
                                </div>
                              </div>

                              {unitPrice < unitCost && (
                                <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-center gap-1.5 font-semibold">
                                  <AlertCircle className="w-4 h-4 shrink-0" />
                                  <span>¡Atención! El precio de venta está por debajo del costo de reposición.</span>
                                </div>
                              )}

                              <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-xs">
                                <button
                                  type="button"
                                  onClick={() => handleResetItemPricing(item.product.id)}
                                  className="text-slate-500 hover:text-slate-800 font-semibold flex items-center gap-1 cursor-pointer"
                                >
                                  <RotateCcw className="w-3 h-3" /> Restablecer valores de catálogo
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingPricingId(null)}
                                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer"
                                >
                                  Listo
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Discounts & IVA Box */}
                  <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3.5 shadow-2xs">
                    <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs sm:text-sm">
                      <span className="text-slate-800 font-black flex items-center gap-1.5 uppercase tracking-wide">
                        <Percent className="w-4 h-4 text-indigo-600" /> Descuento Comercial:
                      </span>
                      <div className="flex items-center gap-1.5">
                        {[
                          { label: '0%', val: 0 },
                          { label: '5%', val: 5 },
                          { label: '10%', val: 10 },
                          { label: '15%', val: 15 },
                        ].map((d) => (
                          <button
                            key={d.label}
                            type="button"
                            onClick={() => {
                              if (d.val === 0) {
                                setDiscountType('none');
                                setDiscountValue(0);
                              } else {
                                setDiscountType('percent');
                                setDiscountValue(d.val);
                              }
                            }}
                            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-black cursor-pointer transition ${
                              (d.val === 0 && discountType === 'none') || (discountType === 'percent' && discountValue === d.val)
                                ? 'bg-indigo-600 text-white shadow-2xs'
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* IVA (16% SENIAT) */}
                    <div className="pt-2.5 border-t border-slate-200 text-xs sm:text-sm space-y-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <span className="text-slate-800 font-black block">IVA (16% SENIAT):</span>
                          <span className="text-xs text-slate-500">Puedes incluirlo dentro del precio del zapato.</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setApplyIva(!applyIva)}
                          className={`px-3 py-2 rounded-xl text-xs font-black cursor-pointer transition ${
                            applyIva ? 'bg-indigo-600 text-white shadow-2xs' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {applyIva ? 'IVA 16% activo' : 'Sin IVA'}
                        </button>
                      </div>
                      {applyIva && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button type="button" onClick={() => setIvaIncluded(true)} className={`text-left p-2.5 rounded-xl border font-bold ${ivaIncluded ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-600'}`}>
                            <span className="block">✓ IVA incluido</span>
                            <span className="text-[10px] font-medium">El precio ya contiene el 16%</span>
                          </button>
                          <button type="button" onClick={() => setIvaIncluded(false)} className={`text-left p-2.5 rounded-xl border font-bold ${!ivaIncluded ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-600'}`}>
                            <span className="block">IVA adicional</span>
                            <span className="text-[10px] font-medium">Se suma 16% al precio</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                </div>

                {/* Right Section: Customer Info (Razón Social en una sola línea), Payment & Big Totals */}
                <div className={`${billingViewMode === 'split' ? 'space-y-5 pt-4 border-t border-slate-200' : '2xl:col-span-5 space-y-5 bg-slate-50/70 p-4 sm:p-6 rounded-3xl border border-slate-200 min-w-0'}`}>
                  
                  {/* Customer Information (Razón Social en una sola línea) */}
                  <div className="space-y-3.5">
                    <div className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2 pb-1.5 border-b border-slate-200">
                      <User className="w-4 h-4 text-indigo-600" />
                      <span>Datos del Comprador / Facturación</span>
                    </div>

                    {/* Razón social o nombre completo en un solo campo */}
                    <div className="w-full min-w-0">
                      <label className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wide block mb-1.5">
                        Razón social / Nombre completo
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                        <input
                          type="text"
                          id="pos-customer-razon-social"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          onBlur={() => void saveCustomerContact()}
                          placeholder="Nombre y apellido o razón social"
                          className="w-full min-w-0 pl-10 pr-3.5 py-2.5 sm:py-3 bg-white border border-slate-300 rounded-xl text-sm sm:text-base font-bold text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 shadow-2xs"
                        />
                      </div>
                    </div>

                    {/* Cédula/RIF y WhatsApp/Teléfono en 2 columnas */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-xs font-black text-slate-700 uppercase tracking-wide block mb-1">
                          Cédula / RIF
                        </label>
                        <input
                          type="text"
                          id="pos-customer-rif"
                          value={customerRif}
                          onChange={(e) => setCustomerRif(e.target.value)}
                          onBlur={async () => { const found = await lookupCustomerByDocument(); if (!found) await saveCustomerContact(); }}
                          placeholder="V-12345678 / J-12345678-9"
                          className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 font-mono font-bold shadow-2xs"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-black text-slate-700 uppercase tracking-wide block mb-1">
                          WhatsApp / Teléfono
                        </label>
                        <input
                          type="text"
                          id="pos-customer-phone"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          onBlur={() => void saveCustomerContact()}
                          placeholder="0414-1234567"
                          className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 font-mono font-bold shadow-2xs"
                        />
                      </div>
                    </div>

                    {customerContactStatus && <p role="status" aria-live="polite" className={`text-xs font-semibold ${customerContactStatus.startsWith('Cliente guardado') ? 'text-emerald-700' : customerContactStatus === 'Guardando cliente…' ? 'text-slate-500' : 'text-rose-600'}`}>{customerContactStatus}</p>}

                    {/* Número de Factura */}
                    <div className="pt-2.5 border-t border-slate-200 mb-3">
                      <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1.5">
                        <span className="flex items-center gap-1.5"><Receipt className="w-4 h-4 text-indigo-600" /> Número de Factura</span>
                      </label>
                      <input
                        type="text"
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                        placeholder="MK-000001"
                        className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-slate-900 font-mono font-black focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">Numeración corrida automática. Puedes cambiarla antes de emitir la factura.</p>
                    </div>

                    {/* Fecha de Emisión Factura */}
                    <div className="pt-2.5 border-t border-slate-200">
                      <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-indigo-600" /> Fecha de Emisión Factura
                        </span>
                        {invoiceDate !== new Date().toISOString().split('T')[0] ? (
                          <span className="text-amber-800 bg-amber-50 border border-amber-200 font-black px-2 py-0.5 rounded-md text-[10px] flex items-center gap-1">
                            ⚠️ Fecha anterior
                          </span>
                        ) : (
                          <span className="text-emerald-700 bg-emerald-50 font-black px-2 py-0.5 rounded-md text-[10px]">
                            Hoy
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          id="invoice-date-picker"
                          value={invoiceDate}
                          max={new Date().toISOString().split('T')[0]}
                          onChange={(e) => {
                            const newDate = e.target.value;
                            setInvoiceDate(newDate);
                            if (!isCustomSaleRate) {
                              setCustomSaleRate(getExchangeRateForDate(newDate).toString());
                            }
                          }}
                          className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 font-mono font-bold cursor-pointer shadow-2xs"
                        />
                        {invoiceDate !== new Date().toISOString().split('T')[0] && (
                          <button
                            type="button"
                            onClick={() => {
                              const today = new Date().toISOString().split('T')[0];
                              setInvoiceDate(today);
                              if (!isCustomSaleRate) {
                                setCustomSaleRate(getExchangeRateForDate(today).toString());
                              }
                            }}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-bold whitespace-nowrap underline cursor-pointer"
                          >
                            Hoy
                          </button>
                        )}
                      </div>

                      {/* Tasa aplicada a esta venta */}
                      <div className="mt-2.5 p-3 bg-indigo-50/80 rounded-xl border border-indigo-100 flex items-center justify-between gap-2.5">
                        <div className="text-xs sm:text-sm text-slate-800 min-w-0">
                          <span className="font-black block truncate">
                            Tasa de la Venta ({invoiceDate !== todayIso ? `Día ${invoiceDate}` : 'Hoy'}):
                          </span>
                          <span className="text-xs text-slate-500">
                            {invoiceDate !== todayIso
                              ? 'Bs calculados con la tasa de esa fecha'
                              : 'Tasa oficial del día'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            type="number"
                            step="0.01"
                            value={isCustomSaleRate ? customSaleRate : effectiveExchangeRate.toFixed(2)}
                            onChange={(e) => {
                              setCustomSaleRate(e.target.value);
                              setIsCustomSaleRate(true);
                            }}
                            className="w-24 px-2 py-1.5 text-sm font-mono font-black bg-white border border-slate-300 rounded-lg text-right focus:border-indigo-600 shadow-2xs"
                          />
                          <span className="text-xs font-mono text-slate-600 font-bold">Bs/$</span>
                          {isCustomSaleRate && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsCustomSaleRate(false);
                                setCustomSaleRate('');
                              }}
                              className="text-xs text-indigo-600 hover:text-indigo-800 underline font-bold cursor-pointer"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Payment Method Selector */}
                  <div className="pt-3 border-t border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wide">Método de Pago</span>
                      <button
                        type="button"
                        onClick={() => setIsMixedPaymentOpen(!isMixedPaymentOpen)}
                        className="text-xs sm:text-sm text-indigo-600 hover:text-indigo-700 font-bold underline cursor-pointer"
                      >
                        {isMixedPaymentOpen ? 'Volver a Pago Único' : 'Dividir Pago Mixto'}
                      </button>
                    </div>

                    {!isMixedPaymentOpen ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {accounts.map((acc, idx) => (
                          <button
                            key={acc.id ? `acc-${acc.id}-${idx}` : `acc-${acc.nombre}-${idx}`}
                            type="button"
                            onClick={() => setSinglePaymentAccount(acc.nombre)}
                            className={`p-3 rounded-xl text-left border transition text-xs sm:text-sm flex items-center justify-between cursor-pointer ${
                              singlePaymentAccount === acc.nombre
                                ? 'bg-indigo-50 border-indigo-600 text-indigo-900 font-black ring-2 ring-indigo-500/20 shadow-2xs'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-bold'
                            }`}
                          >
                            <span className="truncate">{acc.nombre}</span>
                            <span className="text-xs text-slate-400 font-mono shrink-0 ml-1.5 font-bold">({acc.moneda})</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-2.5 text-xs sm:text-sm">
                        <div className="text-xs sm:text-sm text-slate-800 font-black">
                          Cobro Multimoneda Combinado:
                        </div>

                        {/* Resumen explícito de Cashea, incluyendo 0% de inicial */}
                        {mixedPayments.some((pay) => (pay.cuenta || '').toLowerCase().includes('cashea')) && (
                          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1.5 text-xs sm:text-sm">
                            <div className="font-black text-amber-900">CASHEA — Resumen de facturación</div>
                            <div className="flex justify-between font-bold text-slate-700">
                              <span>Inicial:</span>
                              <span>{casheaDownPercent}% — ${((totalUsd * casheaDownPercent) / 100).toFixed(2)} USD</span>
                            </div>
                            <div className="flex justify-between font-bold text-slate-700">
                              <span>Financiamiento Cashea:</span>
                              <span>{100 - casheaDownPercent}% — ${(totalUsd * (100 - casheaDownPercent) / 100).toFixed(2)} USD</span>
                            </div>
                            <div className="text-[11px] text-amber-800 font-semibold">
                              {casheaDownPercent === 0
                                ? 'Inicial hoy: $0.00. El 100% queda pendiente de liquidación por Cashea.'
                                : 'La inicial entra como pago inmediato y el saldo queda pendiente de liquidación por Cashea.'}
                            </div>
                          </div>
                        )}

                        {/* Resumen Cashea explícito, incluido cuando la inicial es 0% */}
                        {mixedPayments.some((pay) => (pay.cuenta || '').toLowerCase().includes('cashea')) && (
                          <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-1.5 text-xs sm:text-sm">
                            <div className="flex items-center justify-between font-black text-amber-900">
                              <span>CASHEA</span>
                              <span>{casheaDownPercent}% inicial</span>
                            </div>
                            <div className="flex justify-between text-amber-800">
                              <span>Inicial:</span>
                              <strong>${((totalUsd * casheaDownPercent) / 100).toFixed(2)}</strong>
                            </div>
                            <div className="flex justify-between text-amber-800">
                              <span>Financiamiento Cashea:</span>
                              <strong>${(totalUsd - (totalUsd * casheaDownPercent) / 100).toFixed(2)}</strong>
                            </div>
                            {casheaDownPercent === 0 && (
                              <div className="pt-1 border-t border-amber-200 font-black text-amber-900">
                                Inicial 0% — $0,00 · 100% pendiente por liquidar
                              </div>
                            )}
                          </div>
                        )}

                        {/* List of current mixed payments */}
                        {mixedPayments.map((pay, idx) => (

                          <div
                            key={pay.id ? `mixed-pay-${pay.id}-${idx}` : `mixed-pay-${idx}`}
                            className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs sm:text-sm"
                          >
                            <div>
                              <span className="font-bold text-slate-900">{pay.cuenta}:</span>{' '}
                              <span className="font-mono text-indigo-700 font-black">
                                {pay.moneda === 'Bs' ? `${pay.monto.toFixed(2)} Bs` : `$${pay.monto.toFixed(2)}`}
                              </span>
                              <span className="text-xs text-slate-500 ml-1.5">
                                (~${pay.monto_equivalente_usd.toFixed(2)})
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveMixedPayment(pay.id)}
                              className="text-rose-600 hover:text-rose-700 text-xs font-black cursor-pointer px-2 py-0.5"
                            >
                              Quitar
                            </button>
                          </div>
                        ))}

                        {/* Add payment line */}
                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                          <select
                            id="mixed-pay-account"
                            className="flex-1 min-w-[130px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 font-semibold"
                          >
                            {accounts.map((a, idx) => (
                              <option key={a.id ? `opt-acc-${a.id}-${idx}` : `opt-acc-${a.nombre}-${idx}`} value={a.nombre}>
                                {a.nombre} ({a.moneda})
                              </option>
                            ))}
                          </select>
                          <input
                            id="mixed-pay-amount"
                            type="number"
                            step="0.01"
                            placeholder="Monto"
                            className="w-full sm:w-28 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 font-mono font-bold"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const selAcc = (document.getElementById('mixed-pay-account') as HTMLSelectElement).value;
                              const amt = parseFloat((document.getElementById('mixed-pay-amount') as HTMLInputElement).value);
                              if (amt > 0) {
                                handleAddMixedPayment(selAcc, amt);
                                (document.getElementById('mixed-pay-amount') as HTMLInputElement).value = '';
                              }
                            }}
                            className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs sm:text-sm cursor-pointer shadow-xs shrink-0 flex items-center justify-center gap-1"
                          >
                            <span>+ Cobrar</span>
                          </button>
                        </div>

                        <div className="pt-2 flex justify-between text-xs sm:text-sm font-mono border-t border-slate-200">
                          <span className="text-slate-600 font-bold">Cubierto: ${totalPaidUsd.toFixed(2)}</span>
                          <span className={remainingToPayUsd > 0.05 ? 'text-amber-600 font-black' : 'text-emerald-600 font-black'}>
                            Restante: ${remainingToPayUsd.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Single Payment Cashea Warning */}
                    {!isMixedPaymentOpen && singlePaymentAccount === 'Cashea' && (
                      <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl space-y-1.5 text-xs text-amber-900">
                        <div className="flex items-center gap-2 font-black text-sm">
                          <Clock className="w-4 h-4 text-amber-600" />
                          <span>Venta 100% Financiada con Cashea</span>
                        </div>
                        <p className="text-xs text-amber-800 leading-relaxed">
                          El monto de <strong>${totalUsd.toFixed(2)} USD</strong> ({totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs) no sumará en positivo a tu caja hoy; quedará como <strong>pendiente por conciliar en banco</strong> hasta que Cashea liquide los fondos.
                        </p>
                      </div>
                    )}

                    {/* Asistente Plan Cashea: Inicial (Punto/Pago Móvil) + Saldo Cashea */}
                    <div className="bg-amber-50/70 border border-amber-200 p-3.5 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-amber-500 text-white font-black text-xs uppercase">
                            Cashea
                          </span>
                          <span className="text-xs sm:text-sm font-black text-slate-800">
                            ¿Cobro con Inicial + Cuotas?
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsCasheaSplitOpen(!isCasheaSplitOpen)}
                          className="text-xs sm:text-sm text-amber-800 hover:text-amber-950 font-black underline cursor-pointer"
                        >
                          {isCasheaSplitOpen ? 'Cerrar' : 'Configurar Inicial'}
                        </button>
                      </div>

                      {isCasheaSplitOpen && (
                        <div className="pt-2.5 border-t border-amber-200/80 space-y-2.5">
                          <p className="text-xs text-slate-600">
                            Divide automáticamente la venta para que la <strong>Inicial entre en positivo a tu caja hoy</strong> y el saldo quede para conciliar en banco.
                          </p>

                          <div>
                            <label className="text-xs font-black text-slate-700 block mb-1">Modalidad de cuotas Cashea:</label>
                            <div className="grid grid-cols-2 gap-2">
                              {([3, 6] as const).map((count) => (
                                <button key={count} type="button" onClick={() => setCasheaInstallments(count)} className={`py-2 rounded-xl text-xs font-black border ${casheaInstallments === count ? 'bg-amber-500 text-white border-amber-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-amber-50'}`}>
                                  {count} cuotas
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Selector Porcentaje Inicial */}
                          <div>
                            <label className="text-xs font-black text-slate-700 block mb-1">
                              Porcentaje de Inicial a cobrar hoy:
                            </label>
                            <div className="grid grid-cols-4 gap-1.5">
                              {[0, 40, 50, 60].map((pct) => (
                                <button
                                  key={pct}
                                  type="button"
                                  onClick={() => setCasheaDownPercent(pct)}
                                  className={`py-2 rounded-xl text-xs sm:text-sm font-black border transition cursor-pointer ${
                                    casheaDownPercent === pct
                                      ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                                      : 'bg-white text-slate-700 border-slate-200 hover:bg-amber-100/50'
                                  }`}
                                >
                                  {pct}%
                                </button>
                              ))}
                              <div className="relative">
                                <input
                                  type="number"
                                  min="0"
                                  max="99"
                                  value={casheaDownPercent}
                                  onChange={(e) => setCasheaDownPercent(Math.min(99, Math.max(0, Number(e.target.value) || 0)))}
                                  className="w-full py-2 px-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-black text-center text-slate-800"
                                  placeholder="%"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Cuenta para recibir la inicial */}
                          <div>
                            <label className="text-xs font-black text-slate-700 block mb-1">
                              Método para cobrar la inicial (entra en POSITIVO hoy):
                            </label>
                            <select
                              value={casheaDownAccount}
                              onChange={(e) => setCasheaDownAccount(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-bold text-slate-800"
                            >
                              {accounts
                                .filter((a) => !(a.nombre || '').toLowerCase().includes('cashea'))
                                .map((a, idx) => (
                                  <option key={idx} value={a.nombre}>
                                    {a.nombre} ({a.moneda})
                                  </option>
                                ))}
                            </select>
                          </div>

                          {/* Previsualización en vivo de la división */}
                          <div className="p-3 bg-white rounded-xl border border-amber-200 text-xs sm:text-sm space-y-1.5 font-mono">
                            <div className="flex justify-between text-emerald-700 font-black">
                              <span>🟢 Inicial hoy ({casheaDownPercent}%):</span>
                              <span>
                                ${((totalUsd * casheaDownPercent) / 100).toFixed(2)} USD
                                <span className="text-xs text-slate-500 ml-1.5">
                                  (~{(((totalUsd * casheaDownPercent) / 100) * effectiveExchangeRate).toFixed(2)} Bs)
                                </span>
                              </span>
                            </div>
                            <div className="flex justify-between text-amber-700 font-black">
                              <span>⏳ Saldo Cashea ({100 - casheaDownPercent}%):</span>
                              <span>
                                ${(totalUsd - (totalUsd * casheaDownPercent) / 100).toFixed(2)} USD (Por conciliar)
                              </span>
                            </div>
                            <div className="flex justify-between text-slate-700 font-bold">
                              <span>Estimado por cuota ({casheaInstallments}):</span>
                              <span>${((totalUsd - (totalUsd * casheaDownPercent) / 100) / casheaInstallments).toFixed(2)} USD</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={handleApplyCasheaPlan}
                            className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl text-xs sm:text-sm shadow-2xs transition cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <Check className="w-4 h-4" />
                            <span>Aplicar División Cashea al Cobro</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* BDV Pago Móvil Live Verification Callout */}
                    {((singlePaymentAccount || '').includes('Pago Móvil') || isMixedPaymentOpen) && (
                      <div className="p-3.5 bg-red-50/70 border border-red-200 rounded-2xl space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-red-700 font-black text-xs sm:text-sm">
                            <Landmark className="w-4 h-4" />
                            <span>Conciliación BDV en Línea</span>
                          </div>
                          <span className="text-xs font-mono font-black px-2 py-0.5 rounded bg-white text-red-600 border border-red-200">
                            API 0102
                          </span>
                        </div>

                        {bdvVerifiedData ? (
                          <div className="bg-white p-3 rounded-xl border border-emerald-300 text-emerald-900 text-xs sm:text-sm space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                                <div>
                                  <span className="font-black block text-sm">Pago BDV Verificado</span>
                                  <span className="text-xs text-slate-500 font-mono">
                                    Ref: {bdvVerifiedData.referencia} • {bdvVerifiedData.codigo_aprobacion}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowBdvModal(true)}
                                className="text-xs text-indigo-600 font-black hover:underline cursor-pointer"
                              >
                                Re-verificar
                              </button>
                            </div>

                            <div className="pt-2 border-t border-emerald-100 flex items-center justify-between text-xs sm:text-sm font-mono">
                              <span className="text-slate-600 font-bold">Monto Comprobado:</span>
                              <span className="font-black text-emerald-700 text-sm sm:text-base">
                                {bdvVerifiedData.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                                <span className="text-slate-500 font-bold ml-1.5">
                                  (~${(bdvVerifiedData.monto_bs / effectiveExchangeRate).toFixed(2)} USD)
                                </span>
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs sm:text-sm text-slate-700 font-bold">
                                Comprueba en segundos que los Bolívares ingresaron a la cuenta BDV.
                              </p>
                              <p className="text-xs text-slate-500 font-mono font-bold mt-0.5">
                                Monto Sugerido: {((isMixedPaymentOpen && remainingToPayUsd > 0.01 ? remainingToPayUsd : totalUsd) * effectiveExchangeRate).toFixed(2)} Bs
                              </p>
                            </div>
                            <button
                              type="button"
                              id="open-bdv-verify-btn"
                              onClick={() => setShowBdvModal(true)}
                              className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-black flex items-center gap-1.5 shrink-0 shadow-2xs cursor-pointer transition"
                            >
                              <ShieldCheck className="w-4 h-4" />
                              <span>Comprobar</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* TOTAL A FACTURAR (NÚMEROS Y LETRAS AJUSTADOS AL CONTENEDOR) */}
                  <div className="bg-gradient-to-br from-white via-indigo-50/30 to-indigo-100/40 p-4 sm:p-5 rounded-2xl border-2 border-indigo-600/40 shadow-sm space-y-3">
                    <div className="flex justify-between items-center text-xs sm:text-sm text-slate-700 font-bold">
                      <span>Subtotal Calzados:</span>
                      <span className="font-mono font-bold text-slate-900 text-sm sm:text-base">${subtotalUsd.toFixed(2)}</span>
                    </div>
                    {discountUsd > 0 && (
                      <div className="flex justify-between items-center text-xs sm:text-sm text-emerald-700 font-bold">
                        <span>Descuento aplicado:</span>
                        <span className="font-mono font-bold text-sm sm:text-base">-${discountUsd.toFixed(2)}</span>
                      </div>
                    )}
                    {applyIva && (
                      <div className="flex justify-between items-center text-xs sm:text-sm text-slate-700 font-bold">
                        <span>{ivaIncluded ? 'IVA 16% incluido:' : 'IVA 16% adicional:'}</span>
                        <span className="font-mono font-bold text-slate-900 text-sm sm:text-base">${ivaUsd.toFixed(2)}</span>
                      </div>
                    )}
                    
                    <div className="pt-3 border-t-2 border-slate-300/80 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                      <div className="min-w-0">
                        <span className="text-sm sm:text-base font-bold text-slate-900 uppercase tracking-tight block">
                          TOTAL A FACTURAR:
                        </span>
                        <span className="text-xs font-mono font-semibold text-slate-500">
                          Tasa Oficial: {effectiveExchangeRate.toFixed(2)} Bs/$
                        </span>
                      </div>
                      <div className="text-left sm:text-right mt-1 sm:mt-0 min-w-0">
                        <div className="text-xl sm:text-2xl lg:text-3xl font-black text-indigo-700 font-mono tracking-tight truncate">
                          ${totalUsd.toFixed(2)}
                        </div>
                        <div className="text-sm sm:text-lg font-bold text-slate-900 font-mono mt-0.5 truncate">
                          {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Botón Principal de Facturación */}
                  <button
                    id="complete-sale-btn"
                    onClick={handleFinalizeSale}
                    disabled={cart.length === 0}
                    className="w-full py-3 sm:py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs sm:text-sm uppercase tracking-wider rounded-xl shadow-md shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed whitespace-nowrap truncate"
                  >
                    <Check className="w-4 h-4 stroke-[3] shrink-0" />
                    <span className="truncate">Confirmar y Facturar Venta (${totalUsd.toFixed(2)})</span>
                  </button>

                </div>

              </div>
            </div>
          )}

        </div>

      </div>

      {/* Sticky Mobile Checkout Bar when in Catalog view on phone with items in cart */}
      {cart.length > 0 && mobileActiveView === 'catalog' && (
        <aside aria-label="Resumen de Facturación Móvil" className="lg:hidden fixed bottom-14 inset-x-0 p-3.5 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-2xl z-30 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2">
          <div className="min-w-0">
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">Total Factura:</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-indigo-700 font-mono tracking-tight">${totalUsd.toFixed(2)}</span>
              <span className="text-xs font-bold text-slate-600 font-mono">({totalBs.toFixed(0)} Bs)</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileActiveView('billing')}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black text-sm rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 cursor-pointer shrink-0 transition"
          >
            <span>Ver Factura ({totalCartQuantity} {industry.unitLabel})</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </aside>
      )}

      {/* Post-Sale Receipt Modal */}
      <ReceiptModal sale={lastSale} onClose={() => setLastSale(null)} />

      {/* BDV Live Payment Verification Modal */}
      <BdvVerificationModal
        isOpen={showBdvModal}
        onClose={() => setShowBdvModal(false)}
        expectedAmountBs={
          isMixedPaymentOpen && remainingToPayUsd > 0.01
            ? remainingToPayUsd * exchangeRate
            : totalBs
        }
        expectedAmountUsd={
          isMixedPaymentOpen && remainingToPayUsd > 0.01
            ? remainingToPayUsd
            : totalUsd
        }
        initialCustomerPhone={customerPhone}
        initialCustomerRif={customerRif}
        onVerificationSuccess={(res) => {
          setBdvVerifiedData({
            referencia: res.referencia,
            codigo_aprobacion: res.codigo_aprobacion,
            monto_bs: res.monto_bs,
            fecha: res.fecha_transaccion,
          });

          // If in mixed payment mode, auto-add payment
          if (isMixedPaymentOpen) {
            handleAddMixedPayment('Pago Móvil BDV', res.monto_bs, res.referencia);
          } else {
            const verifiedUsd = res.monto_bs / exchangeRate;
            // If the verified amount is less than totalUsd, suggest splitting or switch to mixed payments
            if (verifiedUsd < totalUsd - 0.5) {
              setIsMixedPaymentOpen(true);
              handleAddMixedPayment('Pago Móvil BDV', res.monto_bs, res.referencia);
            }
          }
          setShowBdvModal(false);
        }}
      />

    </div>
  );
};
