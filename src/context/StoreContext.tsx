import React, { createContext, useContext, useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import {
  ShoeProduct,
  StockMovement,
  Sale,
  AccountBalance,
  DailyCashClosure,
  UserRole,
  Expense,
  BankMovement,
  CurrencyPurchase,
  Layaway,
  LayawayPayment,
  CasheaAbono,
} from '../types';
import {
  INITIAL_PRODUCTS,
  INITIAL_MOVEMENTS,
  INITIAL_ACCOUNTS,
  INITIAL_SALES,
  INITIAL_EXCHANGE_RATE,
  INITIAL_EXPENSES,
  INITIAL_BANK_MOVEMENTS,
  INITIAL_CURRENCY_PURCHASES,
} from '../data/initialData';
import { BcvRateInfo } from '../services/bcvService';
import {
  getTodayVenezuela,
  getYesterdayVenezuela,
  getSaleDateKey,
  createSaleTimestamp,
} from '../utils/dateUtils';
import { 
  fetchExpensesApi, 
  saveExpenseApi, 
  deleteExpenseApi,
  fetchBankReconciliationsApi,
  saveBankReconciliationApi,
  updateBankReconciliationApi,
  syncDataToNeon
} from '../services/api';
import {
  sendInventoryWebhook,
  WebhookSyncResult,
} from '../services/inventoryWebhookService';
import { auth, onAuthStateChanged, signInWithGoogle, signOutFirebaseUser, type FirebaseUser } from '../lib/firebase';

export interface ToastNotification {
  id: string;
  title: string;
  message: string;
  type: 'warning' | 'success' | 'info' | 'critical';
  time: string;
  read: boolean;
}

interface StoreContextType {
  products: ShoeProduct[];
  movements: StockMovement[];
  sales: Sale[];
  accounts: AccountBalance[];
  paymentAccounts: AccountBalance[];
  exchangeRate: number;
  historicalRates: Record<string, number>;
  getExchangeRateForDate: (dateStr: string) => number;
  setExchangeRateForDate: (dateStr: string, rate: number) => void;
  userRole: UserRole;
  cashClosures: DailyCashClosure[];
  notifications: ToastNotification[];
  criticalStockProducts: ShoeProduct[];
  bcvInfo: BcvRateInfo;
  isBcvSyncing: boolean;
  isAutoSyncEnabled: boolean;
  syncBcvRate: (silent?: boolean) => Promise<void>;
  setIsAutoSyncEnabled: (enabled: boolean) => void;
  setExchangeRate: (rate: number, isManual?: boolean) => void;
  addProduct: (product: Omit<ShoeProduct, 'id' | 'created_at'>) => void;
  addProductsBulk: (newProductsList: Omit<ShoeProduct, 'id' | 'created_at'>[], replaceAll?: boolean) => void;
  updateProduct: (id: string, updates: Partial<ShoeProduct>) => void;
  adjustStock: (
    productId: string,
    quantityChange: number,
    motivo: string,
    movementType?: 'entrada' | 'salida_ajuste' | 'devolucion'
  ) => void;
  deleteProduct: (id: string) => void;
  recordSale: (
    saleData: Omit<Sale, 'id' | 'created_at' | 'costo_total_usd' | 'ganancia_neta_usd'>
  ) => Promise<Sale>;
  updateSaleDate: (saleId: string, newDateIso: string) => boolean;
  updateSaleDetails: (saleId: string, updates: Partial<Pick<Sale, 'numero_factura' | 'cliente_nombre' | 'cliente_apellido' | 'cliente_rif' | 'cliente_telefono' | 'cliente_correo' | 'notas'>>) => Promise<boolean>;
  voidSale: (saleId: string, motivo: string) => Promise<boolean>;
  layaways: Layaway[];
  createLayaway: (
    layawayData: Omit<Layaway, 'id' | 'codigo_apartado' | 'created_at' | 'updated_at' | 'saldo_pendiente_usd' | 'saldo_pendiente_bs'>
  ) => Layaway;
  addLayawayPayment: (
    layawayId: string,
    payment: Omit<LayawayPayment, 'id'> & { id?: string }
  ) => Layaway | null;
  cancelLayaway: (layawayId: string, reason?: string) => boolean;
  deliverLayaway: (layawayId: string) => boolean;
  updateLayaway: (layawayId: string, updates: Partial<Layaway>) => boolean;
  recordCashClosure: (
    notas?: string,
    customDate?: string
  ) => DailyCashClosure;
  expenses: Expense[];
  bankMovements: BankMovement[];
  currencyPurchases: CurrencyPurchase[];
  addExpense: (expense: Omit<Expense, 'id' | 'created_at'>) => void;
  deleteExpense: (id: string) => void;
  updateExpense: (id: string, updates: Partial<Expense>) => void;
  addBankMovement: (movement: Omit<BankMovement, 'id' | 'created_at'>) => void;
  updateBankMovement: (id: string, updates: Partial<BankMovement>) => void;
  importBankMovements: (movements: Omit<BankMovement, 'id' | 'created_at'>[]) => number;
  applyCasheaExcelAbonos: (abonos: Array<{ saleId: string; fecha: string; referencia: string; factura: string; cuota: string; orden: string; montoUsd: number; montoVes: number; tasaCambio: number; metodoPago: string; cuenta: string; sucursal: string }>) => number;
  addCurrencyPurchase: (purchase: Omit<CurrencyPurchase, 'id' | 'created_at'>) => void;
  deleteCurrencyPurchase: (id: string) => void;
  markNotificationsAsRead: () => void;
  clearNotification: (id: string) => void;
  addNotification: (title: string, message: string, type?: 'warning' | 'success' | 'info' | 'critical') => void;
  resetToDemoData: () => void;
  adminPin: string;
  setAdminPin: (pin: string) => void;
  verifyAdminPin: (pin: string) => boolean;
  cajeraPin: string;
  setCajeraPin: (pin: string) => void;
  verifyCajeraPin: (pin: string) => boolean;
  currentSessionUser: UserRole | null;
  isAuthLoading: boolean;
  logoutSession: () => void;
  reconcileCasheaPayment: (
    saleId: string,
    paymentId: string,
    targetAccountName: string,
    bankReference: string,
    fechaConciliacion?: string
  ) => boolean;
  clearAllData: () => void;
  syncStatus: 'synced' | 'syncing' | 'error';
  lastSyncedAt: string;
  forceSync: () => Promise<void>;
  currentUser: any;
  isFirebaseConnected: boolean;
  loginWithGoogleAction: () => Promise<void>;
  logoutUserAction: () => Promise<void>;
  pushAllToCloud: () => Promise<void>;
  restoreFromBackup: () => void;
  exportStoreBackup: () => void;
  importStoreBackup: (file: File) => Promise<void>;
  triggerInventoryWebhook: (customProducts?: ShoeProduct[]) => Promise<WebhookSyncResult>;
}

let autoWebhookTimeout: any = null;
function dispatchAutoWebhook(productsList: ShoeProduct[], delay = 1200) {
  if (autoWebhookTimeout) clearTimeout(autoWebhookTimeout);
  autoWebhookTimeout = setTimeout(() => {
    sendInventoryWebhook(productsList).catch((err) => {
      console.log('Auto webhook sync notice:', err?.message);
    });
  }, delay);
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

// The company ID is only a local cache namespace. The server independently
// verifies the user's membership for every request.
const STORAGE_KEY = {
  toString: () => {
    const id = localStorage.getItem('nexoss_active_company_id') || '';
    return /^[0-9a-f-]{36}$/i.test(id) ? `nexoss_local_store_v1_${id}` : 'nexoss_local_store_unscoped';
  },
};

/**
 * Almacenamiento seguro en localStorage que previene errores de cuota (QuotaExceededError)
 */
function safeLocalStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (err: any) {
    console.warn(`[StoreContext] Error al guardar en localStorage (${key}):`, err);
    if (err?.name === 'QuotaExceededError' || err?.code === 22) {
      try {
        // Limpiar cachés secundarias para liberar espacio inmediato
        const nonEssential = Object.keys(localStorage).filter(
          (k) => k.includes('_closures') || k.includes('_bank_movements') || k.includes('_bcv_info')
        );
        nonEssential.slice(0, 3).forEach((k) => localStorage.removeItem(k));
        localStorage.setItem(key, value);
      } catch (innerErr) {
        console.warn('[StoreContext] No se pudo liberar cuota de localStorage:', innerErr);
      }
    }
  }
}

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeCompanyId, setActiveCompanyId] = useState(() => localStorage.getItem('nexoss_active_company_id') || '');
  const [userRole, setUserRole] = useState<UserRole>(() =>
    localStorage.getItem('nexoss_active_company_role') === 'cashier' ? 'cajera' : 'admin'
  );
  useEffect(() => {
    const updateCompany = () => {
      setActiveCompanyId(localStorage.getItem('nexoss_active_company_id') || '');
      setUserRole(localStorage.getItem('nexoss_active_company_role') === 'cashier' ? 'cajera' : 'admin');
    };
    window.addEventListener('nexoss:company-selected', updateCompany);
    window.addEventListener('storage', updateCompany);
    return () => { window.removeEventListener('nexoss:company-selected', updateCompany); window.removeEventListener('storage', updateCompany); };
  }, []);

  const [products, setProducts] = useState<ShoeProduct[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_products`);
    return saved ? JSON.parse(saved) : [];
  });

  const [movements, setMovements] = useState<StockMovement[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_movements`);
    return saved ? JSON.parse(saved) : [];
  });

  const [sales, setSales] = useState<Sale[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_sales`);
    return saved ? JSON.parse(saved) : [];
  });

  const [layaways, setLayaways] = useState<Layaway[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_layaways`);
    return saved ? JSON.parse(saved) : [];
  });

  const [accounts, setAccounts] = useState<AccountBalance[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_accounts`);
    if (saved) {
      try {
        const parsed: AccountBalance[] = JSON.parse(saved);
        const hasPos = parsed.some((a) => (a.nombre || '').toLowerCase().includes('punto de venta') || a.id === 'acc-pos');
        if (!hasPos) {
          parsed.splice(3, 0, { id: 'acc-pos', nombre: 'Punto de Venta', moneda: 'Bs', saldo: 0.00, icono: 'CreditCard' });
        }
        return parsed;
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [expenses, setExpenses] = useState<Expense[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_expenses`);
    return saved ? JSON.parse(saved) : [];
  });

  const [bankMovements, setBankMovements] = useState<BankMovement[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_bank_movements`);
    return saved ? JSON.parse(saved) : [];
  });

  const [currencyPurchases, setCurrencyPurchases] = useState<CurrencyPurchase[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_currency_purchases`);
    return saved ? JSON.parse(saved) : [];
  });

  const [exchangeRate, setExchangeRateState] = useState<number>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_rate`);
    return saved ? Number(saved) : INITIAL_EXCHANGE_RATE;
  });

  const [historicalRates, setHistoricalRates] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_historical_rates`);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}
    return {};
  });

  const [bcvInfo, setBcvInfo] = useState<BcvRateInfo>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_bcv_info`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return {
      rate: INITIAL_EXCHANGE_RATE,
      officialDate: new Date().toISOString(),
      lastSyncedAt: 'Al inicio',
      source: 'Banco Central de Venezuela (BCV)',
      status: 'synced',
    };
  });

  const [isBcvSyncing, setIsBcvSyncing] = useState<boolean>(false);
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState<boolean>(false);

  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(() => auth?.currentUser ?? null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(Boolean(auth));
  const authenticatedUidRef = useRef<string | null>(currentUser?.uid || null);

  useEffect(() => {
    if (!auth) {
      setIsAuthLoading(false);
      return;
    }
    return onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthLoading(false);
      if (!user) {
        setUserRole('admin');
        localStorage.removeItem('nexoss_active_company_id');
        localStorage.removeItem('nexoss_active_company_name');
        localStorage.removeItem('nexoss_active_company_role');
        window.dispatchEvent(new Event('nexoss:company-selected'));
      }
    });
  }, []);

  useLayoutEffect(() => {
    if (isAuthLoading) return;
    const nextUid = currentUser?.uid || null;
    if (authenticatedUidRef.current === nextUid) return;
    authenticatedUidRef.current = nextUid;
    localStorage.removeItem('nexoss_active_company_id');
    localStorage.removeItem('nexoss_active_company_name');
    localStorage.removeItem('nexoss_active_company_role');
    window.dispatchEvent(new Event('nexoss:company-selected'));
  }, [currentUser?.uid, isAuthLoading]);

  const [cajeraPin, setCajeraPinState] = useState<string>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_cajera_pin`);
    return saved || '0000';
  });

  const [adminPin, setAdminPinState] = useState<string>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_admin_pin`);
    return saved || '1234';
  });

  const [cashClosures, setCashClosures] = useState<DailyCashClosure[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_closures`);
    return saved ? JSON.parse(saved) : [];
  });

  const [notifications, setNotifications] = useState<ToastNotification[]>([]);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('Al iniciar');

  // This role only controls the UI; the server re-checks the company membership on every request.
  const currentSessionUser: UserRole | null = currentUser ? userRole : null;
  const isFirebaseConnected = Boolean(auth);

  // Persist whenever state changes
  useEffect(() => {
    safeLocalStorageSet(`${STORAGE_KEY}_products`, JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    safeLocalStorageSet(`${STORAGE_KEY}_movements`, JSON.stringify(movements));
  }, [movements]);

  useEffect(() => {
    safeLocalStorageSet(`${STORAGE_KEY}_sales`, JSON.stringify(sales));
  }, [sales]);

  useEffect(() => {
    safeLocalStorageSet(`${STORAGE_KEY}_layaways`, JSON.stringify(layaways));
  }, [layaways]);

  useEffect(() => {
    safeLocalStorageSet(`${STORAGE_KEY}_accounts`, JSON.stringify(accounts));
  }, [accounts]);

  useEffect(() => {
    safeLocalStorageSet(`${STORAGE_KEY}_rate`, exchangeRate.toString());
  }, [exchangeRate]);

  useEffect(() => {
    safeLocalStorageSet(`${STORAGE_KEY}_historical_rates`, JSON.stringify(historicalRates));
  }, [historicalRates]);

  useEffect(() => {
    safeLocalStorageSet(`${STORAGE_KEY}_closures`, JSON.stringify(cashClosures));
  }, [cashClosures]);

  useEffect(() => {
    safeLocalStorageSet(`${STORAGE_KEY}_expenses`, JSON.stringify(expenses));
  }, [expenses]);

  useEffect(() => {
    safeLocalStorageSet(`${STORAGE_KEY}_bank_movements`, JSON.stringify(bankMovements));
  }, [bankMovements]);

  useEffect(() => {
    safeLocalStorageSet(`${STORAGE_KEY}_currency_purchases`, JSON.stringify(currencyPurchases));
  }, [currencyPurchases]);

  useEffect(() => {
    safeLocalStorageSet(`${STORAGE_KEY}_bcv_info`, JSON.stringify(bcvInfo));
  }, [bcvInfo]);

  // Guarda la última "versión" conocida de CADA parte del estado del
  // servidor por separado (productos, ventas, gastos, cierres). Antes era
  // un solo valor combinado, y una venta nueva (constante durante el día)
  // hacía que pareciera que "todo" cambió, obligando a re-descargar las
  // fotos de todo el catálogo en cada sincronización. Ahora, si solo
  // cambiaron las ventas, solo se vuelve a pedir /api/sales (liviano, sin
  // fotos) y el catálogo de productos ni se toca.
  const lastKnownVersionRef = useRef<{
    products: string; sales: string; expenses: string;
    bankReconciliations: string; closures: string; layaways: string;
  } | null>(null);
  const previousTenantIdRef = useRef('');

  useLayoutEffect(() => {
    if (previousTenantIdRef.current === activeCompanyId) return;
    previousTenantIdRef.current = activeCompanyId;
    lastKnownVersionRef.current = null;
    setProducts([]);
    setMovements([]);
    setSales([]);
    setLayaways([]);
    setAccounts([]);
    setExpenses([]);
    setBankMovements([]);
    setCurrencyPurchases([]);
    setCashClosures([]);
    setHistoricalRates({});
    setExchangeRateState(INITIAL_EXCHANGE_RATE);
    setAdminPinState('');
    setCajeraPinState('0000');
    setUserRole(localStorage.getItem('nexoss_active_company_role') === 'cashier' ? 'cajera' : 'admin');
    setNotifications([]);
    setSyncStatus(activeCompanyId ? 'syncing' : 'synced');
    setLastSyncedAt('Al iniciar');
  }, [activeCompanyId]);

  const applySalesData = (salesArr: any[]) => {
    const mappedSales = salesArr.map((s: any) => ({
      ...s,
      total_usd: Number(s.total_usd) || 0,
      total_bs: Number(s.total_bs) || 0,
      subtotal_usd: Number(s.subtotal_usd) || 0,
      descuento_usd: Number(s.descuento_usd) || 0,
      costo_total_usd: Number(s.costo_total_usd) || 0,
      ganancia_neta_usd: Number(s.ganancia_neta_usd) || 0,
      tasa_cambio: Number(s.tasa_cambio) || 0,
    }));
    setSales(mappedSales);
    try { localStorage.setItem(`${STORAGE_KEY}_sales`, JSON.stringify(mappedSales)); } catch {}
  };

  const applyExpensesData = (expensesArr: any[]) => {
    setExpenses(expensesArr);
    try { localStorage.setItem(`${STORAGE_KEY}_expenses`, JSON.stringify(expensesArr)); } catch {}
  };

  const applyClosuresData = (closuresArr: any[]) => {
    setCashClosures(closuresArr);
    try { localStorage.setItem(`${STORAGE_KEY}_closures`, JSON.stringify(closuresArr)); } catch {}
  };

  // Master synchronization function from server store
  const syncFromServer = useCallback(async (silent = false) => {
    const requestCompanyId = activeCompanyId;
    const requestUid = currentUser?.uid;
    const isCurrentTenant = () =>
      Boolean(requestCompanyId && requestUid && localStorage.getItem('nexoss_active_company_id') === requestCompanyId && auth?.currentUser?.uid === requestUid);
    if (!isCurrentTenant()) return;
    if (!silent) setSyncStatus('syncing');
    try {
      if (silent && userRole === 'cajera' && lastKnownVersionRef.current) {
        const vRes = await fetch('/api/pos/version');
        if (!vRes.ok) throw new Error(`HTTP ${vRes.status}`);
        const vJson = await vRes.json();
        if (!isCurrentTenant()) return;
        const nextVersion = vJson?.version;
        const previousVersion = lastKnownVersionRef.current;
        if (nextVersion?.products === previousVersion.products && nextVersion?.sales === previousVersion.sales) return;
      }

      // En una revisión silenciosa (el sondeo automático), primero pregunta
      // "¿cambió algo, y qué?" con una consulta chiquita.
      if (silent && userRole !== 'cajera' && lastKnownVersionRef.current) {
        try {
          const vRes = await fetch('/api/store/version');
          if (vRes.ok) {
            const vJson = await vRes.json();
            if (!isCurrentTenant()) return;
            const nv = vJson?.version;
            const ov = lastKnownVersionRef.current;
            if (nv && typeof nv === 'object') {
              const productsChanged = nv.products !== ov.products;
              const salesChanged = nv.sales !== ov.sales;
              const expensesChanged = nv.expenses !== ov.expenses;
              const bankChanged = nv.bankReconciliations !== ov.bankReconciliations;
              const closuresChanged = nv.closures !== ov.closures;
              const layawaysChanged = nv.layaways !== ov.layaways;

              if (!productsChanged && !salesChanged && !expensesChanged && !bankChanged && !closuresChanged && !layawaysChanged) {
                return; // nada cambió, no hace falta descargar nada
              }

              if (!productsChanged) {
                // Nada en el catálogo de productos cambió: pedimos SOLO las
                // partes livianas que sí cambiaron, sin tocar /api/store/state
                // (que es lo que trae las fotos de todos los productos).
                const tasks: Promise<void>[] = [];
                if (salesChanged) {
                  tasks.push(
                    fetch('/api/sales').then((r) => (r.ok ? r.json() : null)).then((j) => {
                      if (isCurrentTenant() && Array.isArray(j?.data)) applySalesData(j.data);
                    })
                  );
                }
                if (expensesChanged) {
                  tasks.push(
                    fetch('/api/expenses').then((r) => (r.ok ? r.json() : null)).then((j) => {
                      if (isCurrentTenant() && Array.isArray(j?.data)) applyExpensesData(j.data);
                    })
                  );
                }
                if (closuresChanged) {
                  tasks.push(
                    fetch('/api/closures').then((r) => (r.ok ? r.json() : null)).then((j) => {
                      if (isCurrentTenant() && Array.isArray(j?.data)) applyClosuresData(j.data);
                    })
                  );
                }
                if (layawaysChanged) {
                  tasks.push(
                    fetch('/api/layaways').then((r) => (r.ok ? r.json() : null)).then((j) => {
                      if (isCurrentTenant() && Array.isArray(j?.data)) {
                        setLayaways(j.data);
                        try { localStorage.setItem(`${STORAGE_KEY}_layaways`, JSON.stringify(j.data)); } catch {}
                      }
                    })
                  );
                }
                await Promise.all(tasks);
                lastKnownVersionRef.current = nv;
                setSyncStatus('synced');
                setLastSyncedAt(new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
                return;
              }
              // Si llegamos aquí, los productos sí cambiaron (una foto, un
              // precio, etc.) — seguimos abajo con la sincronización
              // completa, que es la única forma de traer la foto nueva.
            }
          }
        } catch {
          // Si falla la comprobación de versión, seguimos con la sincronización
          // completa normal (mejor pecar de gastar de más que de quedar desactualizado).
        }
      }

      const res = await fetch(userRole === 'cajera' ? '/api/pos/state' : '/api/store/state');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!isCurrentTenant()) return;
      if (json && json.data) {
        const d = json.data;
        if (Array.isArray(d.products)) {
          const mappedProducts: ShoeProduct[] = d.products.map((p: any) => ({
            id: p.id,
            nombre: p.nombre,
            sku: p.sku || `SKU-${p.id}`,
            categoria: p.categoria || 'Calzado',
            clasificacion_inventario: p.clasificacion_inventario || 'Mercancía',
            marca: p.marca || 'Genérica',
            tipo: p.tipo || 'Botines Fútbol Campo',
            talla: String(p.talla || '38'),
            color: p.color || 'Estándar',
            moneda: p.moneda || 'USD',
            precio: Number(p.precio) || 0,
            costo: Number(p.costo) || 0,
            stock: Number(p.stock) || 0,
            stock_minimo: Number(p.stock_minimo) || 2,
            activo: p.activo !== false,
            imagen: p.imagen_url || p.imagen || '',
            descripcion: p.descripcion || '',
            es_original: p.es_original !== false,
            created_at: p.created_at || new Date().toISOString(),
          }));
          setProducts((prev) => {
            if (userRole === 'cajera') {
              try { localStorage.setItem(`${STORAGE_KEY}_products`, JSON.stringify(mappedProducts)); } catch {}
              return mappedProducts;
            }
            if (mappedProducts.length === 0) {
              try { localStorage.setItem(`${STORAGE_KEY}_products`, '[]'); } catch {}
              return [];
            }
            if (mappedProducts.length >= prev.length) {
              try { localStorage.setItem(`${STORAGE_KEY}_products`, JSON.stringify(mappedProducts)); } catch {}
              return mappedProducts;
            }
            const serverMap = new Map(mappedProducts.map((p) => [p.id, p]));
            const merged = prev.map((localP) => {
              if (serverMap.has(localP.id)) {
                const sp = serverMap.get(localP.id)!;
                serverMap.delete(localP.id);
                return { ...localP, ...sp };
              }
              return localP;
            });
            for (const sp of serverMap.values()) {
              merged.push(sp);
            }
            try { localStorage.setItem(`${STORAGE_KEY}_products`, JSON.stringify(merged)); } catch {}
            return merged;
          });
        }
        if (Array.isArray(d.sales)) {
          applySalesData(d.sales);
        }
        if (Array.isArray(d.layaways)) {
          setLayaways(d.layaways);
          try { localStorage.setItem(`${STORAGE_KEY}_layaways`, JSON.stringify(d.layaways)); } catch {}
        }
        if (Array.isArray(d.movements)) {
          setMovements(d.movements);
          try { localStorage.setItem(`${STORAGE_KEY}_movements`, JSON.stringify(d.movements)); } catch {}
        }
        if (Array.isArray(d.accounts) && d.accounts.length > 0) {
          setAccounts(d.accounts);
          try { localStorage.setItem(`${STORAGE_KEY}_accounts`, JSON.stringify(d.accounts)); } catch {}
        }
        if (Array.isArray(d.cashClosures)) {
          applyClosuresData(d.cashClosures);
        }
        if (Array.isArray(d.expenses)) {
          applyExpensesData(d.expenses);
        }
        if (typeof d.exchangeRate === 'number' && d.exchangeRate > 0) {
          setExchangeRateState(d.exchangeRate);
        }
        if (d.historicalRates && typeof d.historicalRates === 'object') {
          setHistoricalRates((prev) => ({ ...prev, ...d.historicalRates }));
        }
        if (typeof d.adminPin === 'string') setAdminPinState(d.adminPin);
        if (Array.isArray(d.bankMovements)) setBankMovements(d.bankMovements);
        if (Array.isArray(d.currencyPurchases)) setCurrencyPurchases(d.currencyPurchases);
        setSyncStatus('synced');
        setLastSyncedAt(new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

        // Guardamos la versión actual (por partes) para poder saltarnos o
        // acotar la próxima descarga. Se hace después de un sync completo
        // real (no en el atajo de arriba), así que refleja lo que acabamos
        // de recibir.
        fetch(userRole === 'cajera' ? '/api/pos/version' : '/api/store/version')
          .then((r) => (r.ok ? r.json() : null))
          .then((v) => {
            if (v?.version && typeof v.version === 'object') lastKnownVersionRef.current = v.version;
          })
          .catch(() => {});
      }
    } catch (err) {
      console.warn('Sync from server error:', err);
      setSyncStatus('error');
    }
  }, [activeCompanyId, currentUser?.uid, userRole]);

  const forceSync = useCallback(async () => {
    await syncFromServer(false);
  }, [syncFromServer]);

  // Initial load and continuous synchronization
  useEffect(() => {
    if (isAuthLoading || !currentUser || !activeCompanyId) return;
    syncFromServer(false);

    // Also fetch neon expenses & reconciliations if configured
    fetchExpensesApi().then((neonExpenses) => {
      if (neonExpenses && neonExpenses.length > 0) {
        setExpenses((prev) => {
          const existingIds = new Set(prev.map((e) => e.id));
          const toAdd = neonExpenses.filter((e) => !existingIds.has(e.id));
          return [...toAdd, ...prev];
        });
      }
    }).catch(() => {});

    fetchBankReconciliationsApi().then((neonMovements) => {
      if (neonMovements && neonMovements.length > 0) {
        setBankMovements((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const toAdd = neonMovements.filter((m) => !existingIds.has(m.id));
          return [...toAdd, ...prev];
        });
      }
    }).catch(() => {});

    // Sondeo de sincronización. Antes era cada 12 segundos y seguía corriendo
    // incluso con la pestaña en segundo plano, lo que consumía la cuota gratuita
    // de Vercel muy rápido (cada llamada cuenta como invocación + petición edge).
    // Ahora: cada 60 segundos, y SOLO si la pestaña está visible. Combinado con
    // la sincronización inmediata al volver a la pestaña (abajo), la experiencia
    // es prácticamente igual pero con ~5x menos consumo.
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        syncFromServer(true);
      }
    }, 60000);

    // Sync when returning to the tab
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncFromServer(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [syncFromServer, isAuthLoading, currentUser, activeCompanyId]);

  const addNotification = useCallback((
    title: string,
    message: string,
    type: 'warning' | 'success' | 'info' | 'critical'
  ) => {
    const newNotif: ToastNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title,
      message,
      type,
      time: 'Ahora',
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev.slice(0, 19)]);
  }, []);

  const loginWithGoogleAction = useCallback(async () => {
    await signInWithGoogle();
  }, []);

  const logoutUserAction = useCallback(async () => {
    await signOutFirebaseUser();
    localStorage.removeItem('nexoss_active_company_id');
    localStorage.removeItem('nexoss_active_company_name');
    window.dispatchEvent(new Event('nexoss:company-selected'));
  }, []);

  // Sincronización completa directa con Neon PostgreSQL
  const pushAllToCloud = useCallback(async () => {
    setSyncStatus('syncing');
    try {
      const res = await syncDataToNeon(products, sales);
      if (res.success) {
        setSyncStatus('synced');
        setLastSyncedAt(
          new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
        addNotification(
          'Sincronizado con Neon',
          `Se han subido ${res.productsCount || products.length} calzados y ${res.salesCount || sales.length} ventas a Neon PostgreSQL.`,
          'success'
        );
      } else {
        throw new Error(res.message || res.error || 'Error al conectar con Neon');
      }
    } catch (err: any) {
      setSyncStatus('error');
      addNotification(
        'Error de Sincronización',
        err?.message || 'No se pudo sincronizar con la base de datos Neon PostgreSQL.',
        'critical'
      );
    }
  }, [products, sales, addNotification]);

  // exchangeRate en una ref: syncBcvRate necesita leer el valor actual dentro
  // del mensaje de error, pero SIN que eso obligue a recrear la función cada
  // vez que la tasa cambia (eso era la causa del bug de abajo).
  const syncBcvRate = useCallback(async (silent = false) => {
    setIsBcvSyncing(false);
    setBcvInfo((prev) => ({ ...prev, status: 'manual', source: 'Solo local · sin conexión BCV' }));
    if (!silent) addNotification('Tasa de demostración', 'La consulta automática del BCV está desactivada en NEXOSS local. Introduce una tasa de prueba manual si necesitas explorar los cálculos.', 'info');
  }, [addNotification]);

  // Esta copia utiliza únicamente la tasa local de demostración.
  useEffect(() => {
    setBcvInfo((prev) => ({ ...prev, status: 'manual', source: 'Solo local · sin conexión BCV' }));
  }, []);

  // Periodic real-time background sync every 3 minutes (180,000 ms)
  useEffect(() => {
    if (!isAutoSyncEnabled) return;
    const interval = setInterval(() => {
      syncBcvRate(true);
    }, 180000);
    return () => clearInterval(interval);
  }, [isAutoSyncEnabled, syncBcvRate]);

  const setExchangeRate = (rate: number, isManual = true) => {
    setExchangeRateState(rate);
    const todayKey = getTodayVenezuela();
    safeLocalStorageSet(`${STORAGE_KEY}_exchange_rate`, String(rate));
    setHistoricalRates((prev) => {
      const updated = { ...prev, [todayKey]: rate };
      safeLocalStorageSet(`${STORAGE_KEY}_historical_rates`, JSON.stringify(updated));
      return updated;
    });

    if (isManual) {
      setBcvInfo((prev) => ({
        ...prev,
        rate,
        status: 'manual',
        source: 'Ajuste Manual por Administrador',
        lastSyncedAt: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
      }));
    }
    fetch('/api/store/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exchangeRate: rate, historicalRates: { [todayKey]: rate } }),
    }).catch(() => {});



    addNotification(
      'Tasa BCV Actualizada',
      `Nueva tasa establecida en ${rate.toFixed(2)} Bs/USD ${isManual ? '(Ajuste manual)' : '(Oficial)'}`,
      'info'
    );
  };

  // Pre-cargar tasas de ventas y gastos históricos registrados
  useEffect(() => {
    if (sales.length === 0 && expenses.length === 0) return;
    setHistoricalRates((prev) => {
      let changed = false;
      const next = { ...prev };
      sales.forEach((s) => {
        if (s.fecha && s.tasa_cambio > 0) {
          const key = getSaleDateKey(s.fecha);
          if (!next[key]) {
            next[key] = s.tasa_cambio;
            changed = true;
          }
        }
      });
      expenses.forEach((e) => {
        if (e.fecha && e.tasa_cambio > 0) {
          const key = getSaleDateKey(e.fecha);
          if (!next[key]) {
            next[key] = e.tasa_cambio;
            changed = true;
          }
        }
      });
      return changed ? next : prev;
    });
  }, [sales, expenses]);

  const getExchangeRateForDate = useCallback(
    (dateStr: string): number => {
      if (!dateStr) return exchangeRate;
      const todayKey = getTodayVenezuela();
      const key = getSaleDateKey(dateStr);

      // Si es la fecha de hoy, priorizar la tasa oficial activa (en vivo o manual)
      if (key === todayKey && exchangeRate > 0) {
        return exchangeRate;
      }

      // 1. Tasa en histórico registrado
      if (historicalRates[key] && historicalRates[key] > 0) {
        return historicalRates[key];
      }

      // 2. Tasa registrada en ventas de ese día
      const saleOnDate = sales.find(
        (s) => s.fecha && getSaleDateKey(s.fecha) === key && s.tasa_cambio > 0
      );
      if (saleOnDate) return saleOnDate.tasa_cambio;

      // 3. Tasa registrada en gastos de ese día
      const expOnDate = expenses.find(
        (e) => e.fecha && getSaleDateKey(e.fecha) === key && e.tasa_cambio > 0
      );
      if (expOnDate) return expOnDate.tasa_cambio;

      // 4. Buscar fecha anterior más cercana en el histórico
      const sortedKeys = Object.keys(historicalRates).sort();
      const priorKeys = sortedKeys.filter((k) => k <= key);
      if (priorKeys.length > 0) {
        const closestKey = priorKeys[priorKeys.length - 1];
        if (historicalRates[closestKey] > 0) {
          return historicalRates[closestKey];
        }
      }

      return exchangeRate;
    },
    [historicalRates, sales, expenses, exchangeRate]
  );

  const setExchangeRateForDate = useCallback(
    (dateStr: string, rate: number) => {
      if (!dateStr || !rate || rate <= 0) return;
      const key = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.trim();
      const numRate = Number(rate.toFixed(4));

      setHistoricalRates((prev) => {
        if (prev[key] === numRate) return prev;
        const updated = { ...prev, [key]: numRate };
        safeLocalStorageSet(`${STORAGE_KEY}_historical_rates`, JSON.stringify(updated));
        return updated;
      });

      fetch('/api/store/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historicalRates: { [key]: numRate } }),
      }).catch(() => {});


    },
    [currentUser]
  );

  const criticalStockProducts = useMemo(() => {
    return products.filter((p) => p.activo && p.stock <= p.stock_minimo);
  }, [products]);

  // Registra automáticamente en el Libro Diario la compra asociada al ingreso de mercancía.
  // El costo del inventario se carga a Inventario de Mercancía y se acredita a Proveedores
  // hasta que exista un pago/documento de compra que indique la forma de cancelación.
  const registerInventoryPurchaseAccounting = (items: ShoeProduct[], sourceId: string, document?: string) => {
    const valid = items.filter((p) => Number(p.stock || 0) > 0 && Number(p.costo || 0) > 0);
    if (!valid.length) return;
    const totalCost = Number(valid.reduce((sum, p) => sum + Number(p.costo || 0) * Number(p.stock || 0), 0).toFixed(2));
    if (totalCost <= 0) return;
    const fecha = new Date().toISOString();
    const detail = valid.map((p) => `${p.nombre} | SKU ${p.sku || ''} | Talla ${p.talla || ''} | Color ${p.color || ''} | Cant. ${Number(p.stock || 0)} | Costo ${Number(p.costo || 0).toFixed(2)}`).join('\n');
    fetch('/api/accounting/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `compra-inv-${sourceId}`,
        fecha,
        tipo: 'compra',
        origen: 'compra_inventario',
        origen_id: sourceId,
        documento: document || `ENT-${sourceId}`,
        tipo_documento: 'ENTRADA INVENTARIO',
        sujeto: 'Proveedor / Compra de mercancía',
        metodo_pago: 'Pendiente a proveedor',
        tasa_dolar: Number(exchangeRate || 0),
        total_compras: totalCost,
        compras_no_gravadas: totalCost,
        compras_gravadas: 0,
        porcentaje_impuesto: 0,
        observaciones: `Entrada de inventario valorizada al costo.\n${detail}`,
        lineas: [
          { partida: '01', cuenta: 'Inventario de Mercancía', subcuenta: 'Calzado', clasificacion: 'Activo', subclasificacion: 'Inventario', moneda: 'USD', debe: totalCost, haber: 0, venta_compra: 'Compra' },
          { partida: '01', cuenta: 'Proveedores', subcuenta: 'Mercancía', clasificacion: 'Pasivo', subclasificacion: 'Cuentas por pagar', moneda: 'USD', debe: 0, haber: totalCost, venta_compra: 'Compra' },
        ],
      }),
    }).then(async (r) => {
      if (!r.ok) { const body = await r.json().catch(() => ({})); console.error('No se pudo registrar la compra de inventario en contabilidad:', body?.error || r.status); }
    }).catch((e) => console.error('Error registrando compra de inventario en contabilidad:', e));
  };

  // Add Product
  const addProduct = (productData: Omit<ShoeProduct, 'id' | 'created_at'>) => {
    const newId = `prod-${Date.now()}`;
    const newProduct: ShoeProduct = {
      ...productData,
      talla: String(productData.talla || 'Única'),
      sku: String(productData.sku || `SKU-${newId}`),
      precio: Number(productData.precio) || 0,
      costo: Number(productData.costo) || 0,
      stock: Number(productData.stock) || 0,
      id: newId,
      created_at: new Date().toISOString(),
    };

    setProducts((prev) => {
      const updated = [newProduct, ...prev];
      try {
        localStorage.setItem(`${STORAGE_KEY}_products`, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    // Save to server
    fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProduct),
    })
      .then((r) => {
        if (!r.ok) {
          return r.json().catch(() => ({})).then((body: any) => {
            addNotification(
              'No se pudo guardar en el servidor',
              `${newProduct.nombre} solo quedó guardado en este navegador. Error: ${body.error || r.status}. Revisa que DATABASE_URL esté configurada en Vercel.`,
              'critical'
            );
          });
        }
      })
      .catch((e) => {
        addNotification(
          'Sin conexión con el servidor',
          `${newProduct.nombre} solo quedó guardado en este navegador (no se sincronizó).`,
          'warning'
        );
        console.log('Backend sync info:', e);
      });



    // If it has initial stock > 0, record movement
    if (newProduct.stock > 0) {
      const initialMovement: StockMovement = {
        id: `mov-${Date.now()}`,
        producto_id: newId,
        producto_nombre: newProduct.nombre,
        sku: newProduct.sku,
        talla: newProduct.talla,
        marca: newProduct.marca,
        tipo: 'entrada',
        cantidad: newProduct.stock,
        stock_anterior: 0,
        stock_nuevo: newProduct.stock,
        motivo: 'Inventario inicial al crear calzado',
        fecha: new Date().toISOString(),
        usuario: userRole === 'admin' ? 'Administrador' : 'Cajera',
        costo_unitario_usd: Number(newProduct.costo) || 0,
        costo_unitario_bs: (Number(newProduct.costo) || 0) * (Number(exchangeRate) || 0),
        tasa_cambio: Number(exchangeRate) || 0,
        documento: `ENT-${newProduct.id}`,
      };
      setMovements((prev) => [initialMovement, ...prev]);
      fetch('/api/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(initialMovement),
      }).catch(() => {});


    }

    registerInventoryPurchaseAccounting([newProduct], newProduct.id, `ENT-${newProduct.id}`);

    addNotification(
      'Producto Creado',
      `${newProduct.nombre} (Talla ${newProduct.talla}) agregado con éxito.`,
      'success'
    );

    dispatchAutoWebhook([newProduct, ...products]);
  };

  // Add Products Bulk (Excel import or Multi-size model creation)
  const addProductsBulk = (newProductsList: Omit<ShoeProduct, 'id' | 'created_at'>[], replaceAll: boolean = false) => {
    if (!newProductsList || newProductsList.length === 0) return;

    const timestamp = Date.now();
    const createdDate = new Date().toISOString();

    const formattedProducts: ShoeProduct[] = newProductsList.map((p, idx) => ({
      ...p,
      id: `prod-${timestamp}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      created_at: createdDate,
    }));

    registerInventoryPurchaseAccounting(formattedProducts, `BULK-${timestamp}`, `ENT-${timestamp}`);

    // Generate initial movements for those with stock > 0
    const newMovements: StockMovement[] = formattedProducts
      .filter((p) => p.stock > 0)
      .map((p, idx) => ({
        id: `mov-${timestamp}-${idx}`,
        producto_id: p.id,
        producto_nombre: p.nombre,
        sku: p.sku,
        talla: p.talla,
        marca: p.marca,
        tipo: 'entrada',
        cantidad: p.stock,
        stock_anterior: 0,
        stock_nuevo: p.stock,
        motivo: replaceAll ? 'Carga masiva de inventario' : 'Entrada modelo / importación',
        fecha: createdDate,
        usuario: userRole === 'admin' ? 'Administrador' : 'Cajera',
        costo_unitario_usd: Number(p.costo) || 0,
        costo_unitario_bs: (Number(p.costo) || 0) * (Number(exchangeRate) || 0),
        tasa_cambio: Number(exchangeRate) || 0,
        documento: `ENT-${timestamp}`,
      }));

    if (replaceAll) {
      setProducts(formattedProducts);
      setMovements((prev) => [...newMovements, ...prev]);
      try {
        localStorage.setItem(`${STORAGE_KEY}_products`, JSON.stringify(formattedProducts));
      } catch (e) {}
    } else {
      setProducts((prev) => {
        const merged = [...formattedProducts, ...prev];
        try {
          localStorage.setItem(`${STORAGE_KEY}_products`, JSON.stringify(merged));
        } catch (e) {}
        return merged;
      });
      if (newMovements.length > 0) {
        setMovements((prev) => [...newMovements, ...prev]);
      }
    }

    // Persist to server in bulk
    fetch('/api/products/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products: formattedProducts, replaceExisting: replaceAll }),
    }).catch((e) => console.log('Backend bulk sync info:', e));



    addNotification(
      'Inventario Actualizado',
      `Se han registrado ${formattedProducts.length} artículos/tallas exitosamente.`,
      'success'
    );

    dispatchAutoWebhook(replaceAll ? formattedProducts : [...formattedProducts, ...products]);
  };

  // Update Product
  const updateProduct = (id: string, updates: Partial<ShoeProduct>) => {
    const current = products.find((p) => p.id === id);
    if (!current) return;

    const updatedItem: ShoeProduct = { ...current, ...updates };
    const nextProductsList = products.map((p) => (p.id === id ? updatedItem : p));

    setProducts(nextProductsList);
    safeLocalStorageSet(`${STORAGE_KEY}_products`, JSON.stringify(nextProductsList));

    // Persist the exact edited object. Do not rely on a setState updater callback,
    // because React may execute that callback later and Neon sync could otherwise
    // reload the old value (notably the shoe type).
    fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedItem),
    })
      .then(async (res) => {
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          addNotification(
            'No se guardó en el servidor',
            `El cambio quedó solo en esta pantalla. ${errJson.error || 'Verifica tu conexión e inténtalo de nuevo.'}`,
            'critical'
          );
          return;
        }
        // Keep the catalog authoritative after a successful edit.
        try { await syncFromServer(false); } catch {}
      })
      .catch(() => {
        addNotification(
          'Sin conexión con el servidor',
          'El cambio quedó localmente. Verifica Vercel/Neon y vuelve a guardar.',
          'critical'
        );
      });

    dispatchAutoWebhook(nextProductsList);
  };

  // Adjust stock in real time (Manual Batch entry, Scrap adjustment, Return)
  const adjustStock = (
    productId: string,
    quantityChange: number,
    motivo: string,
    movementType: 'entrada' | 'salida_ajuste' | 'devolucion' = quantityChange >= 0 ? 'entrada' : 'salida_ajuste'
  ) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const previousStock = product.stock;
    const newStock = Math.max(0, previousStock + quantityChange);
    const actualChange = newStock - previousStock;

    if (actualChange === 0) return;

    // Update product stock
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, stock: newStock } : p))
    );

    // Record movement
    const movement: StockMovement = {
      id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      producto_id: product.id,
      producto_nombre: product.nombre,
      sku: product.sku,
      talla: product.talla,
      marca: product.marca,
      tipo: movementType,
      cantidad: actualChange,
      stock_anterior: previousStock,
      stock_nuevo: newStock,
      motivo: motivo || (actualChange > 0 ? 'Entrada de mercancía' : 'Ajuste de inventario'),
      fecha: new Date().toISOString(),
      usuario: userRole === 'admin' ? 'Administrador' : 'Cajera',
      costo_unitario_usd: Number(product.costo) || 0,
      costo_unitario_bs: (Number(product.costo) || 0) * (Number(exchangeRate) || 0),
      tasa_cambio: Number(exchangeRate) || 0,
    };

    setMovements((prev) => [movement, ...prev]);

    // Persist to server
    fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...product, stock: newStock }),
    }).catch(() => {});

    fetch('/api/movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(movement),
    }).catch(() => {});



    // Real-time alerts
    if (newStock === 0) {
      addNotification(
        '¡Calzado Agotado!',
        `${product.nombre} (Talla ${product.talla}) quedó sin existencias.`,
        'critical'
      );
    } else if (newStock <= product.stock_minimo) {
      addNotification(
        'Alerta de Reposición',
        `${product.nombre} (Talla ${product.talla}) llegó a ${newStock} pares (Mín: ${product.stock_minimo}).`,
        'warning'
      );
    } else {
      addNotification(
        'Stock Actualizado',
        `${product.nombre} (Talla ${product.talla}): ${previousStock} ➔ ${newStock} pares.`,
        'success'
      );
    }

    dispatchAutoWebhook(
      products.map((p) => (p.id === productId ? { ...p, stock: newStock } : p))
    );
  };

  // Delete product
  const deleteProduct = (id: string) => {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    setProducts((prev) => prev.filter((p) => p.id !== id));
    fetch(`/api/products/${id}`, { method: 'DELETE' }).catch(() => {});



    addNotification('Producto Eliminado', `${product.nombre} retirado del catálogo.`, 'info');
    dispatchAutoWebhook(products.filter((p) => p.id !== id));
  };

  // Record Sale (Instant real-time stock deduction, movement logging, financial balance update)
  const recordSale = async (
    saleData: Omit<Sale, 'id' | 'created_at' | 'costo_total_usd' | 'ganancia_neta_usd'>
  ): Promise<Sale> => {
    const saleId = `sale-${Date.now()}`;
    const timestamp = saleData.fecha || createSaleTimestamp();

    // 1. Calculate total cost, movements, and updated products atomically
    let totalCosto = 0;
    const saleMovements: StockMovement[] = [];

    const updatedProducts = products.map((prod) => {
      // Find all items sold that match this product (by ID, SKU, or Name + Talla)
      const matchingItems = saleData.items.filter((item) => {
        if (item.producto_id && prod.id && String(item.producto_id).trim() === String(prod.id).trim()) {
          return true;
        }
        if (item.sku && prod.sku && String(item.sku || '').trim().toLowerCase() === String(prod.sku || '').trim().toLowerCase()) {
          return true;
        }
        if (
          item.nombre_producto && prod.nombre &&
          String(item.nombre_producto || '').trim().toLowerCase() === String(prod.nombre || '').trim().toLowerCase() &&
          item.talla && prod.talla &&
          String(item.talla).trim() === String(prod.talla).trim()
        ) {
          return true;
        }
        return false;
      });

      const totalSold = matchingItems.reduce((acc, it) => acc + (Number(it.cantidad) || 0), 0);
      if (totalSold === 0) return prod;

      const stockAnterior = Number(prod.stock) || 0;
      const stockNuevo = Math.max(0, stockAnterior - totalSold);
      const itemCosto = typeof prod.costo === 'number' ? prod.costo : 0;
      totalCosto += itemCosto * totalSold;

      const cleanMovementId = `mov-${Date.now()}-${prod.id.replace(/[^a-zA-Z0-9_-]/g, '_')}-${Math.random().toString(36).substring(2, 6)}`;
      saleMovements.push({
        id: cleanMovementId,
        producto_id: prod.id,
        producto_nombre: prod.nombre,
        sku: prod.sku,
        talla: prod.talla,
        marca: prod.marca,
        tipo: 'venta',
        cantidad: -totalSold,
        stock_anterior: stockAnterior,
        stock_nuevo: stockNuevo,
        motivo: `Venta Factura #${saleData.numero_factura}`,
        fecha: timestamp,
        usuario: userRole === 'admin' ? 'Administrador' : 'Cajera',
        costo_unitario_usd: Number(prod.costo) || 0,
        costo_unitario_bs: (Number(prod.costo) || 0) * (Number(exchangeRate) || 0),
        tasa_cambio: Number(exchangeRate) || 0,
        documento: `Factura ${saleData.numero_factura}`,
      });

      if (stockNuevo === 0) {
        addNotification(
          '¡Producto Agotado en Venta!',
          `${prod.nombre} (Talla ${prod.talla}) quedó sin existencias.`,
          'critical'
        );
      } else if (stockNuevo <= prod.stock_minimo) {
        addNotification(
          'Alerta de Reposición Post-Venta',
          `${prod.nombre} (Talla ${prod.talla}) bajo umbral mínimo (${stockNuevo} pares restantes).`,
          'warning'
        );
      }

      return {
        ...prod,
        stock: stockNuevo,
      };
    });

    // Also account for any items whose product wasn't found in current memory list
    saleData.items.forEach((item) => {
      const exists = updatedProducts.some(
        (p) =>
          p.id === item.producto_id ||
          (p.sku && item.sku && String(p.sku || '').trim().toLowerCase() === String(item.sku || '').trim().toLowerCase())
      );
      if (!exists) {
        totalCosto += (item.costo_unitario || 0) * item.cantidad;
      }
    });

    // 2. Classify payments: Cashea stays pending reconciliation, while positive liquid payments enter balances immediately.
    // Nothing is committed locally until Neon confirms the sale + stock deduction.
    let totalPositivoInmediatoUsd = 0;
    let totalCasheaPendienteUsd = 0;

    const enrichedPagos = saleData.pagos.map((pago) => {
      const isCashea = (pago.cuenta || '').toLowerCase().includes('cashea');
      if (isCashea) {
        totalCasheaPendienteUsd += pago.monto_equivalente_usd;
        return {
          ...pago,
          estado_liquidacion: 'pendiente_banco' as const,
        };
      } else {
        totalPositivoInmediatoUsd += pago.monto_equivalente_usd;
        return {
          ...pago,
          estado_liquidacion: 'liquidado_inmediato' as const,
        };
      }
    });

    // 5. Finalize Sale Record
    const ingresoNetoSinIva = Math.max(0, Number(saleData.total_usd || 0) - Number(saleData.iva_monto_usd || 0));
    const gananciaNeta = ingresoNetoSinIva - totalCosto;
    const estadoCashea = totalCasheaPendienteUsd > 0 ? ('pendiente_banco' as const) : ('sin_cashea' as const);

    const completedSale: Sale = {
      ...saleData,
      id: saleId,
      fecha: timestamp,
      pagos: enrichedPagos,
      costo_total_usd: totalCosto,
      ganancia_neta_usd: gananciaNeta,
      total_positivo_inmediato_usd: totalPositivoInmediatoUsd,
      total_cashea_pendiente_usd: totalCasheaPendienteUsd,
      estado_cashea: estadoCashea,
      created_at: timestamp,
    };

    // Track historical rate for this date
    if (completedSale.tasa_cambio > 0) {
      const saleDateKey = getSaleDateKey(completedSale.fecha);
      setExchangeRateForDate(saleDateKey, completedSale.tasa_cambio);
    }

    // Persist sale + stock atomically in Neon BEFORE treating the sale as completed locally.
    // This prevents a Cashea sale from looking successful while Neon rejected the inventory update.
    let lastError = '';
    let serverSaved = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch('/api/sales', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(completedSale),
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.saved === true) {
          serverSaved = true;
          console.log('Venta guardada correctamente en Neon:', completedSale.id, result);
          break;
        }
        lastError = result.error || `HTTP ${response.status}`;
        console.error(`Error guardando venta en servidor (intento ${attempt}/3):`, result);
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.error(`Error de conexión guardando venta (intento ${attempt}/3):`, error);
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
      }
    }

    if (!serverSaved) {
      addNotification(
        'VENTA NO REGISTRADA',
        `La venta NO fue confirmada por Neon y no se descontó el inventario. ${lastError}`,
        'critical'
      );
      throw new Error(`No se pudo registrar la venta en Neon: ${lastError}`);
    }

    // Neon confirmed the atomic transaction: now commit the same state locally.
    setProducts(updatedProducts);
    safeLocalStorageSet(`${STORAGE_KEY}_products`, JSON.stringify(updatedProducts));

    if (saleMovements.length > 0) {
      setMovements((prev) => [...saleMovements, ...prev]);
    }

    setAccounts((prevAccounts) => {
      const nextAccounts = [...prevAccounts];
      enrichedPagos.forEach((pago) => {
        if (pago.estado_liquidacion === 'pendiente_banco') return;
        const accIndex = nextAccounts.findIndex((acc) => acc.nombre === pago.cuenta);
        if (accIndex !== -1) {
          nextAccounts[accIndex] = {
            ...nextAccounts[accIndex],
            saldo: nextAccounts[accIndex].saldo + pago.monto,
          };
        }
      });
      return nextAccounts;
    });

    setSales((prev) => {
      const updated = [completedSale, ...prev];
      safeLocalStorageSet(`${STORAGE_KEY}_sales`, JSON.stringify(updated));
      return updated;
    });

    try { await syncFromServer(false); } catch (syncError) {
      console.error('Error sincronizando después de venta confirmada:', syncError);
    }

    addNotification(
      'Venta Exitosa',
      `Factura #${completedSale.numero_factura} por $${completedSale.total_usd.toFixed(2)} (${completedSale.items.reduce((s, i) => s + i.cantidad, 0)} pares)`,
      'success'
    );

    dispatchAutoWebhook(updatedProducts, 600);

    return completedSale;
  };

  // Update Sale Date (e.g., historical sales backdating or retroactive invoice date change)
  const updateSaleDate = (saleId: string, newDateIso: string): boolean => {
    const saleIndex = sales.findIndex((s) => s.id === saleId);
    if (saleIndex === -1) return false;

    const currentSale = sales[saleIndex];
    const newDateKey = newDateIso.split('T')[0];
    const targetRate = currentSale.tasa_cambio > 0 ? currentSale.tasa_cambio : getExchangeRateForDate(newDateKey);

    const updatedSale: Sale = {
      ...currentSale,
      fecha: newDateIso,
      tasa_cambio: targetRate,
      total_bs: currentSale.total_bs > 0 ? currentSale.total_bs : currentSale.total_usd * targetRate,
    };

    setSales((prev) => {
      const updated = [...prev];
      updated[saleIndex] = updatedSale;
      try {
        localStorage.setItem(`${STORAGE_KEY}_sales`, JSON.stringify(updated));
      } catch {}
      return updated;
    });

    // Sync to backend
    fetch(`/api/sales/${saleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha: newDateIso }),
    }).catch(() => {});



    addNotification(
      'Fecha Actualizada',
      `La fecha de la factura #${updatedSale.numero_factura} fue modificada a ${new Date(newDateIso).toLocaleDateString('es-VE')}.`,
      'success'
    );
    return true;
  };

  // Actualizar datos administrativos de una factura sin tocar inventario ni totales.
  const updateSaleDetails = async (saleId: string, updates: Partial<Pick<Sale, 'numero_factura' | 'cliente_nombre' | 'cliente_apellido' | 'cliente_rif' | 'cliente_telefono' | 'cliente_correo' | 'notas'>>): Promise<boolean> => {
    const sale = sales.find((s) => s.id === saleId);
    if (!sale) return false;
    try {
      const res = await fetch(`/api/sales/${saleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updates, estado: 'modificada' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.updated !== true) {
        addNotification('No se pudo actualizar la factura', json.error || 'El servidor no confirmó el cambio.', 'critical');
        return false;
      }
      setSales((prev) => {
        const updated = prev.map((s) => s.id === saleId ? ({ ...s, ...updates, estado: 'modificada' } as Sale) : s);
        try { localStorage.setItem(`${STORAGE_KEY}_sales`, JSON.stringify(updated)); } catch {}
        return updated;
      });
      addNotification('Factura actualizada', `Factura #${updates.numero_factura || sale.numero_factura} actualizada correctamente.`, 'success');
      return true;
    } catch (err) {
      addNotification('No se pudo actualizar la factura', 'Sin conexión con el servidor.', 'critical');
      return false;
    }
  };

  // Anular una venta registrada por error: se conserva en el historial
  // (marcada como anulada, no se borra) y se devuelve el stock vendido.
  const voidSale = async (saleId: string, motivo: string): Promise<boolean> => {
    const sale = sales.find((s) => s.id === saleId);
    if (!sale) return false;

    try {
      const res = await fetch(`/api/sales/${saleId}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || result.success !== true) {
        addNotification('No se pudo anular', result.error || 'El servidor no confirmó la anulación.', 'critical');
        return false;
      }

      // El backend hace la anulación + devolución de stock en una sola operación.
      // No volvemos a sumar stock localmente para evitar duplicarlo.
      setSales((prev) => {
        const updated = prev.map((s) =>
          s.id === saleId ? ({ ...s, estado: 'anulada', motivo_anulacion: motivo } as any) : s
        );
        safeLocalStorageSet(`${STORAGE_KEY}_sales`, JSON.stringify(updated));
        return updated;
      });

      try { await syncFromServer(false); } catch {}
      addNotification(
        'Venta Anulada',
        `Factura #${sale.numero_factura} fue anulada. El stock vendido fue devuelto al inventario.`,
        'info'
      );
      return true;
    } catch {
      addNotification('No se pudo anular', 'Sin conexión con el servidor. Inténtalo de nuevo.', 'critical');
      return false;
    }
  };

  // Sistema de Apartados (Layaway)
  const createLayaway = (
    layawayData: Omit<Layaway, 'id' | 'codigo_apartado' | 'created_at' | 'updated_at' | 'saldo_pendiente_usd' | 'saldo_pendiente_bs'>
  ): Layaway => {
    const id = `layaway-${Date.now()}`;
    const randCode = Math.floor(1000 + Math.random() * 9000);
    const codigo_apartado = `AP-${randCode}`;
    const timestamp = new Date().toISOString();

    const saldo_pendiente_usd = Math.max(0, layawayData.total_usd - layawayData.total_abonado_usd);
    const saldo_pendiente_bs = saldo_pendiente_usd * layawayData.tasa_cambio;

    // 1. Deduct stock for reserved shoes so they aren't sold to other walk-ins
    setProducts((prevProducts) => {
      const updated = [...prevProducts];
      layawayData.items.forEach((item) => {
        const prodIndex = updated.findIndex((p) => p.id === item.producto_id);
        if (prodIndex !== -1) {
          const currentProd = updated[prodIndex];
          const newStock = Math.max(0, currentProd.stock - item.cantidad);
          updated[prodIndex] = { ...currentProd, stock: newStock };
        }
      });
      try {
        localStorage.setItem(`${STORAGE_KEY}_products`, JSON.stringify(updated));
      } catch {}
      return updated;
    });

    // 2. Stock movements for reservation
    const movementsToSave: StockMovement[] = layawayData.items.map((it, idx) => ({
      id: `mov-${Date.now()}-${idx}`,
      producto_id: it.producto_id,
      producto_nombre: it.nombre_producto,
      sku: it.sku,
      talla: it.talla,
      marca: it.marca,
      tipo: 'salida_ajuste' as const,
      cantidad: -Math.abs(Number(it.cantidad) || 0),
      stock_anterior: 0,
      stock_nuevo: 0,
      motivo: `Apartado reservado (${codigo_apartado}) - Cliente: ${layawayData.cliente_nombre}`,
      fecha: layawayData.fecha_apartado || timestamp,
      usuario: layawayData.usuario || 'Cajera',
      costo_unitario_usd: Number(products.find((p) => p.id === it.producto_id)?.costo) || 0,
      costo_unitario_bs: (Number(products.find((p) => p.id === it.producto_id)?.costo) || 0) * (Number(exchangeRate) || 0),
      tasa_cambio: Number(exchangeRate) || 0,
      documento: codigo_apartado,
    }));
    setMovements((prev) => [...movementsToSave, ...prev]);

    // 3. Update accounts if initial deposit is made
    if (layawayData.abonos && layawayData.abonos.length > 0) {
      setAccounts((prevAccounts) => {
        const updated = [...prevAccounts];
        layawayData.abonos.forEach((abono) => {
          const accIndex = updated.findIndex((acc) => acc.nombre === abono.cuenta);
          if (accIndex !== -1) {
            updated[accIndex] = {
              ...updated[accIndex],
              saldo: updated[accIndex].saldo + abono.monto,
            };
          }
        });
        return updated;
      });
    }

    const newLayaway: Layaway = {
      ...layawayData,
      id,
      codigo_apartado,
      saldo_pendiente_usd,
      saldo_pendiente_bs,
      estado: saldo_pendiente_usd <= 0.05 ? 'completado' : 'activo',
      created_at: timestamp,
      updated_at: timestamp,
    };

    setLayaways((prev) => [newLayaway, ...prev]);

    // Backend sync
    void (async () => {
      try {
        const response = await fetch('/api/layaways', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newLayaway),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.saved !== true) {
          addNotification('Error de sincronización', result.error || 'El apartado no pudo guardarse en Neon.', 'critical');
          return;
        }
        await syncFromServer(false);
      } catch (error) {
        console.error('Error guardando apartado en servidor:', error);
        addNotification('Sin conexión con el servidor', 'El apartado quedó localmente pendiente. Verifica Neon/Vercel.', 'critical');
      }
    })();



    addNotification(
      'Apartado Registrado',
      `Apartado ${codigo_apartado} para ${newLayaway.cliente_nombre}. Saldo pendiente: $${saldo_pendiente_usd.toFixed(2)}.`,
      'success'
    );

    return newLayaway;
  };

  const addLayawayPayment = (
    layawayId: string,
    paymentData: Omit<LayawayPayment, 'id'> & { id?: string }
  ): Layaway | null => {
    const layawayIndex = layaways.findIndex((l) => l.id === layawayId);
    if (layawayIndex === -1) return null;

    const current = layaways[layawayIndex];
    const paymentId = paymentData.id || `pay-${Date.now()}`;
    const newPayment: LayawayPayment = {
      ...paymentData,
      id: paymentId,
      fecha: paymentData.fecha || new Date().toISOString(),
    };

    const newAbonos = [...current.abonos, newPayment];
    const newTotalAbonadoUsd = current.total_abonado_usd + newPayment.monto_equivalente_usd;
    const newTotalAbonadoBs = current.total_abonado_bs + (newPayment.moneda === 'Bs' ? newPayment.monto : newPayment.monto * current.tasa_cambio);
    const newSaldoUsd = Math.max(0, current.total_usd - newTotalAbonadoUsd);
    const newSaldoBs = newSaldoUsd * current.tasa_cambio;

    const isFullyPaid = newSaldoUsd <= 0.05;

    const updated: Layaway = {
      ...current,
      abonos: newAbonos,
      total_abonado_usd: newTotalAbonadoUsd,
      total_abonado_bs: newTotalAbonadoBs,
      saldo_pendiente_usd: newSaldoUsd,
      saldo_pendiente_bs: newSaldoBs,
      estado: isFullyPaid ? 'completado' : current.estado,
      updated_at: new Date().toISOString(),
    };

    // Update accounts with new deposit
    setAccounts((prevAccounts) => {
      const updatedAcc = [...prevAccounts];
      const accIndex = updatedAcc.findIndex((acc) => acc.nombre === newPayment.cuenta);
      if (accIndex !== -1) {
        updatedAcc[accIndex] = {
          ...updatedAcc[accIndex],
          saldo: updatedAcc[accIndex].saldo + newPayment.monto,
        };
      }
      return updatedAcc;
    });

    setLayaways((prev) => {
      const next = [...prev];
      next[layawayIndex] = updated;
      try {
        localStorage.setItem(`${STORAGE_KEY}_layaways`, JSON.stringify(next));
      } catch {}
      return next;
    });

    fetch(`/api/layaways/${layawayId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {});

    addNotification(
      'Abono Registrado',
      `Se abonaron ${newPayment.moneda === 'USD' ? '$' : 'Bs '}${newPayment.monto.toFixed(2)} al apartado ${updated.codigo_apartado}. Restante: $${newSaldoUsd.toFixed(2)}.`,
      'success'
    );

    return updated;
  };

  const cancelLayaway = (layawayId: string, reason?: string): boolean => {
    const layawayIndex = layaways.findIndex((l) => l.id === layawayId);
    if (layawayIndex === -1) return false;

    const current = layaways[layawayIndex];
    if (current.estado === 'cancelado') return false;

    // Restore stock of reserved products
    setProducts((prevProducts) => {
      const updated = [...prevProducts];
      current.items.forEach((item) => {
        const prodIndex = updated.findIndex((p) => p.id === item.producto_id);
        if (prodIndex !== -1) {
          const prod = updated[prodIndex];
          updated[prodIndex] = { ...prod, stock: prod.stock + item.cantidad };
        }
      });
      try {
        localStorage.setItem(`${STORAGE_KEY}_products`, JSON.stringify(updated));
      } catch {}
      return updated;
    });

    // Record stock return movement
    const restoreMovements: StockMovement[] = current.items.map((it, idx) => ({
      id: `mov-${Date.now()}-${idx}`,
      producto_id: it.producto_id,
      producto_nombre: it.nombre_producto,
      sku: it.sku,
      talla: it.talla,
      marca: it.marca,
      tipo: 'devolucion' as const,
      cantidad: Math.abs(Number(it.cantidad) || 0),
      stock_anterior: 0,
      stock_nuevo: 0,
      motivo: `Apartado ${current.codigo_apartado} cancelado${reason ? ` - ${reason}` : ''}`,
      fecha: new Date().toISOString(),
      usuario: 'Administrador',
      costo_unitario_usd: Number(products.find((p) => p.id === it.producto_id)?.costo) || 0,
      costo_unitario_bs: (Number(products.find((p) => p.id === it.producto_id)?.costo) || 0) * (Number(exchangeRate) || 0),
      tasa_cambio: Number(exchangeRate) || 0,
      documento: current.codigo_apartado,
    }));
    setMovements((prev) => [...restoreMovements, ...prev]);

    const updated: Layaway = {
      ...current,
      estado: 'cancelado',
      notas: current.notas ? `${current.notas} | Cancelado: ${reason || 'Anulado'}` : `Cancelado: ${reason || 'Anulado'}`,
      updated_at: new Date().toISOString(),
    };

    setLayaways((prev) => {
      const next = [...prev];
      next[layawayIndex] = updated;
      try {
        localStorage.setItem(`${STORAGE_KEY}_layaways`, JSON.stringify(next));
      } catch {}
      return next;
    });

    fetch(`/api/layaways/${layawayId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {});

    addNotification(
      'Apartado Cancelado',
      `Apartado ${current.codigo_apartado} cancelado. Los calzados regresaron al inventario activo.`,
      'info'
    );
    return true;
  };

  const deliverLayaway = (layawayId: string): boolean => {
    const layawayIndex = layaways.findIndex((l) => l.id === layawayId);
    if (layawayIndex === -1) return false;

    const current = layaways[layawayIndex];
    const updated: Layaway = {
      ...current,
      estado: 'completado',
      updated_at: new Date().toISOString(),
    };

    setLayaways((prev) => {
      const next = [...prev];
      next[layawayIndex] = updated;
      try {
        localStorage.setItem(`${STORAGE_KEY}_layaways`, JSON.stringify(next));
      } catch {}
      return next;
    });

    fetch(`/api/layaways/${layawayId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {});

    addNotification(
      'Apartado Entregado',
      `Apartado ${current.codigo_apartado} entregado al cliente y completado.`,
      'success'
    );
    return true;
  };

  const updateLayaway = (layawayId: string, updates: Partial<Layaway>): boolean => {
    const layawayIndex = layaways.findIndex((l) => l.id === layawayId);
    if (layawayIndex === -1) return false;

    const current = layaways[layawayIndex];
    const updated: Layaway = {
      ...current,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    setLayaways((prev) => {
      const next = [...prev];
      next[layawayIndex] = updated;
      try {
        localStorage.setItem(`${STORAGE_KEY}_layaways`, JSON.stringify(next));
      } catch {}
      return next;
    });

    fetch(`/api/layaways/${layawayId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {});

    addNotification('Apartado Actualizado', `Información de apartado ${updated.codigo_apartado} actualizada.`, 'info');
    return true;
  };

  // Record Cash Register Closure (Arqueo de caja diario)
  const recordCashClosure = (notas?: string, customDate?: string): DailyCashClosure => {
    const targetDate = customDate || getTodayVenezuela();
    const todaySales = sales.filter((s) => s.estado !== 'anulada' && getSaleDateKey(s.fecha) === targetDate);

    const totalUsd = todaySales.reduce((sum, s) => sum + s.total_usd, 0);
    const totalBs = todaySales.reduce((sum, s) => sum + s.total_bs, 0);
    const paresVendidos = todaySales.reduce(
      (sum, s) => sum + s.items.reduce((acc, it) => acc + it.cantidad, 0),
      0
    );

    // Sum breakdown by account for today
    const accountsMap: Record<string, { moneda: 'USD' | 'Bs'; monto: number; monto_usd: number }> = {};

    todaySales.forEach((s) => {
      s.pagos.forEach((p) => {
        if (!accountsMap[p.cuenta]) {
          accountsMap[p.cuenta] = {
            moneda: p.moneda,
            monto: 0,
            monto_usd: 0,
          };
        }
        accountsMap[p.cuenta].monto += p.monto;
        accountsMap[p.cuenta].monto_usd += p.monto_equivalente_usd;
      });
    });

    const desglose = Object.entries(accountsMap).map(([cuenta, data]) => ({
      cuenta,
      moneda: data.moneda,
      monto: data.monto,
      monto_usd: data.monto_usd,
    }));

    const closure: DailyCashClosure = {
      id: `close-${Date.now()}`,
      fecha: targetDate,
      usuario: userRole === 'admin' ? 'Administrador' : 'Cajera',
      total_ventas_usd: totalUsd,
      total_ventas_bs: totalBs,
      cantidad_transacciones: todaySales.length,
      pares_vendidos: paresVendidos,
      desglose_cuentas: desglose,
      cerrado_at: new Date().toISOString(),
      notas,
    };

    setCashClosures((prev) => [closure, ...prev]);

    fetch('/api/closures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(closure),
    }).catch(() => {});

    addNotification(
      'Cierre de Caja Guardado',
      `Arqueo de ${targetDate} registrado con $${totalUsd.toFixed(2)} en ${todaySales.length} ventas.`,
      'success'
    );

    return closure;
  };

  // Add Expense
  const addExpense = (expenseData: Omit<Expense, 'id' | 'created_at'>) => {
    const newExpense: Expense = {
      ...expenseData,
      id: `exp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString(),
    };

    // Update expenses list
    setExpenses((prev) => [newExpense, ...prev]);

    // Deduct from account balance if account matches
    setAccounts((prevAccounts) =>
      prevAccounts.map((acc) => {
        if ((acc.nombre || '').toLowerCase().includes(String(expenseData.cuenta_origen || '').toLowerCase()) ||
            String(expenseData.cuenta_origen || '').toLowerCase().includes((acc.nombre || '').toLowerCase())) {
          const deduct = acc.moneda === 'USD' ? expenseData.monto_usd : expenseData.monto_bs;
          return {
            ...acc,
            saldo: Math.max(0, acc.saldo - deduct),
          };
        }
        return acc;
      })
    );

    // Save to Neon API in background
    saveExpenseApi(newExpense).catch((e) => console.warn('Could not sync expense to Neon:', e));

    addNotification(
      'Gasto Registrado',
      `${expenseData.categoria}: $${expenseData.monto_usd.toFixed(2)} (${expenseData.descripcion})`,
      'info'
    );
  };

  const deleteExpense = (id: string) => {
    const target = expenses.find((e) => e.id === id);
    if (!target) return;

    setExpenses((prev) => prev.filter((e) => e.id !== id));

    // Revert account balance
    setAccounts((prevAccounts) =>
      prevAccounts.map((acc) => {
        if ((acc.nombre || '').toLowerCase().includes(String(target.cuenta_origen || '').toLowerCase()) ||
            String(target.cuenta_origen || '').toLowerCase().includes((acc.nombre || '').toLowerCase())) {
          const refund = acc.moneda === 'USD' ? target.monto_usd : target.monto_bs;
          return {
            ...acc,
            saldo: acc.saldo + refund,
          };
        }
        return acc;
      })
    );

    deleteExpenseApi(id).catch((e) => console.warn('Could not delete expense on Neon:', e));

    addNotification('Gasto Eliminado', `Se eliminó el gasto "${target.descripcion}".`, 'info');
  };

  const updateExpense = (id: string, updates: Partial<Expense>) => {
    setExpenses((prev) =>
      prev.map((e) => {
        if (e.id === id) {
          const updated = { ...e, ...updates };
          saveExpenseApi(updated).catch((err) => console.warn('Could not update expense on Neon:', err));
          return updated;
        }
        return e;
      })
    );
  };

  // Bank Movements & Conciliation
  const addBankMovement = (movData: Omit<BankMovement, 'id' | 'created_at'>) => {
    const newMovement: BankMovement = {
      ...movData,
      id: `bm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString(),
    };

    setBankMovements((prev) => [newMovement, ...prev]);
    saveBankReconciliationApi(newMovement).catch((e) => console.warn('Could not save bank movement:', e));

    addNotification(
      'Movimiento Bancario Agregado',
      `${newMovement.banco} - Ref: ${newMovement.referencia} (${newMovement.tipo === 'credito_ingreso' ? '+' : '-'}${newMovement.monto_bs.toLocaleString('es-VE')} Bs)`,
      'info'
    );
  };

  const updateBankMovement = (id: string, updates: Partial<BankMovement>) => {
    setBankMovements((prev) =>
      prev.map((m) => {
        if (m.id === id) {
          const updated = { ...m, ...updates };
          updateBankReconciliationApi(id, updates).catch((e) => console.warn('Could not update bank movement:', e));
          return updated;
        }
        return m;
      })
    );
  };

  // Batch import bank movements (e.g. from BDV statement)
  const importBankMovements = (movements: Omit<BankMovement, 'id' | 'created_at'>[]): number => {
    const newItems: BankMovement[] = movements.map((mov, idx) => ({
      ...mov,
      id: `bm-bdv-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      created_at: new Date().toISOString(),
    }));

    setBankMovements((prev) => [...newItems, ...prev]);

    // Save asynchronously to Neon if table exists
    newItems.forEach((item) => {
      saveBankReconciliationApi(item).catch(() => {});
    });

    addNotification(
      'Movimientos BDV Importados',
      `Se incorporaron con éxito ${newItems.length} movimientos de la cuenta Banco de Venezuela a la conciliación.`,
      'success'
    );

    return newItems.length;
  };

  // Aplicar cada fila del Excel Cashea como abono individual a su factura.
  // Se conserva el historial por fila y se reduce solo el saldo pendiente.
  const applyCasheaExcelAbonos: StoreContextType['applyCasheaExcelAbonos'] = (abonos) => {
    if (!abonos.length) return 0;
    let nextSales = [...sales];
    let appliedCount = 0;
    const changed = new Map<string, Sale>();
    for (const row of abonos) {
      const index = nextSales.findIndex((item) => item.id === row.saleId);
      if (index < 0) continue;
      const sale = nextSales[index];
      const history = [...(sale.cashea_abonos || [])];
      const ref = (row.referencia || `CASHEA-${row.factura}-${row.cuota}`).trim();
      if (history.some((item) => item.referencia === ref && item.factura === row.factura && item.cuota === row.cuota)) continue;
      const pending = Math.max(0, Number(sale.total_cashea_pendiente_usd ?? sale.pagos.filter((p) => (p.cuenta || '').toLowerCase().includes('cashea')).reduce((sum, p) => sum + Number(p.monto_equivalente_usd || 0), 0)) || 0);
      const amount = Math.max(0, Number(row.montoUsd) || 0);
      if (!amount) continue;
      const applied = Math.min(pending, amount);
      const entry: CasheaAbono = {
        id: `cashea-abono-${Date.now()}-${appliedCount}-${Math.random().toString(36).slice(2, 7)}`,
        fecha: row.fecha, referencia: ref, factura: row.factura, cuota: row.cuota, orden: row.orden,
        monto_usd: amount, monto_aplicado_usd: applied, monto_ves: Number(row.montoVes) || 0,
        tasa_cambio: Number(row.tasaCambio) || 0, metodo_pago: row.metodoPago, cuenta: row.cuenta, sucursal: row.sucursal,
      };
      const remaining = Number(Math.max(0, pending - applied).toFixed(2));
      const isFullyPaid = remaining <= 0.009;
      const updatedPagos = isFullyPaid
        ? sale.pagos.map((payment) => (payment.cuenta || '').toLowerCase().includes('cashea')
            ? { ...payment, estado_liquidacion: 'conciliado_en_banco' as const, fecha_conciliacion: row.fecha, referencia_bancaria: ref }
            : payment)
        : sale.pagos;
      const updated: Sale = {
        ...sale, pagos: updatedPagos, cashea_abonos: [...history, entry], total_cashea_pendiente_usd: remaining,
        estado_cashea: isFullyPaid ? 'conciliado_total' : 'conciliado_parcial',
      };
      nextSales[index] = updated;
      changed.set(updated.id, updated);
      appliedCount += 1;
    }
    if (changed.size) {
      setSales(nextSales);
      safeLocalStorageSet(`${STORAGE_KEY}_sales`, JSON.stringify(nextSales));
      changed.forEach((sale) => {
        fetch(`/api/sales/${sale.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pagos: sale.pagos, total_cashea_pendiente_usd: sale.total_cashea_pendiente_usd, estado_cashea: sale.estado_cashea, cashea_abonos: sale.cashea_abonos }),
        }).then((response) => {
          if (!response.ok) {
            addNotification('Abono guardado solo en este equipo', `El abono de la factura #${sale.numero_factura} no pudo guardarse en Neon. Revisa la conexión y vuelve a intentarlo.`, 'warning');
          }
        }).catch((err) => {
          console.warn('No se pudo sincronizar el abono Cashea:', err);
          addNotification('Abono guardado solo en este equipo', `No se pudo contactar al servidor para guardar el abono de la factura #${sale.numero_factura}.`, 'warning');
        });
      });
      addNotification('Abonos Cashea aplicados', `${appliedCount} abono(s) individual(es) fueron aplicados a las facturas correspondientes.`, 'success');
    }
    return appliedCount;
  };

  // Currency Purchases (Conversión de Bs a Divisas / Binance / Zelle)
  const addCurrencyPurchase = (purchaseData: Omit<CurrencyPurchase, 'id' | 'created_at'>) => {
    const newPurchase: CurrencyPurchase = {
      ...purchaseData,
      id: `cp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      created_at: new Date().toISOString(),
    };

    setCurrencyPurchases((prev) => [newPurchase, ...prev]);

    // 1. Descontar los Bolívares del saldo en Bs (Pago Móvil / Efectivo Bs)
    setAccounts((prevAccounts) =>
      prevAccounts.map((acc) => {
        if (acc.moneda === 'Bs' && (acc.nombre || '').toLowerCase().includes('pago móvil')) {
          return {
            ...acc,
            saldo: Math.max(0, acc.saldo - purchaseData.monto_bs_gastado),
          };
        }
        return acc;
      })
    );

    // 2. Acreditar los Dólares al saldo positivo en USD (Binance / Zelle / Efectivo)
    setAccounts((prevAccounts) =>
      prevAccounts.map((acc) => {
        const methodLower = String(purchaseData.metodo || '').toLowerCase();
        if (
          (methodLower.includes('binance') && (acc.nombre || '').toLowerCase().includes('binance')) ||
          (methodLower.includes('zelle') && (acc.nombre || '').toLowerCase().includes('zelle')) ||
          (methodLower.includes('efectivo') && (acc.nombre || '').toLowerCase().includes('efectivo usd'))
        ) {
          return {
            ...acc,
            saldo: acc.saldo + purchaseData.monto_usd_recibido,
          };
        }
        return acc;
      })
    );

    addNotification(
      'Compra de Divisas Registrada',
      `Conversión: -${purchaseData.monto_bs_gastado.toLocaleString('es-VE')} Bs ➔ +$${purchaseData.monto_usd_recibido.toFixed(2)} (${purchaseData.metodo})`,
      'success'
    );
  };

  const deleteCurrencyPurchase = (id: string) => {
    const target = currencyPurchases.find((c) => c.id === id);
    if (!target) return;

    setCurrencyPurchases((prev) => prev.filter((c) => c.id !== id));

    // Revertir balances
    setAccounts((prevAccounts) =>
      prevAccounts.map((acc) => {
        if (acc.moneda === 'Bs' && (acc.nombre || '').toLowerCase().includes('pago móvil')) {
          return {
            ...acc,
            saldo: acc.saldo + target.monto_bs_gastado,
          };
        }
        const methodLower = String(target.metodo || '').toLowerCase();
        if (
          (methodLower.includes('binance') && (acc.nombre || '').toLowerCase().includes('binance')) ||
          (methodLower.includes('zelle') && (acc.nombre || '').toLowerCase().includes('zelle')) ||
          (methodLower.includes('efectivo') && (acc.nombre || '').toLowerCase().includes('efectivo usd'))
        ) {
          return {
            ...acc,
            saldo: Math.max(0, acc.saldo - target.monto_usd_recibido),
          };
        }
        return acc;
      })
    );

    addNotification('Registro Eliminado', 'Se anuló la compra de divisas seleccionada.', 'info');
  };

  const markNotificationsAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const setAdminPin = (newPin: string) => {
    if (/^\d{4}$/.test(newPin)) {
      setAdminPinState(newPin);
      localStorage.setItem(`${STORAGE_KEY}_admin_pin`, newPin);
      addNotification('Seguridad Actualizada', 'El PIN de 4 dígitos para Administrador ha sido modificado.', 'info');
    }
  };

  const verifyAdminPin = (enteredPin: string): boolean => {
    return enteredPin === adminPin;
  };

  const setCajeraPin = (newPin: string) => {
    if (/^\d{4}$/.test(newPin)) {
      setCajeraPinState(newPin);
      localStorage.setItem(`${STORAGE_KEY}_cajera_pin`, newPin);
      addNotification('Seguridad Actualizada', 'El PIN de 4 dígitos para Cajera ha sido modificado.', 'info');
    }
  };

  const verifyCajeraPin = (enteredPin: string): boolean => {
    return enteredPin === cajeraPin;
  };

  const logoutSession = () => {
    logoutUserAction().catch(() => addNotification('Error al cerrar sesión', 'No se pudo cerrar la sesión de Firebase.', 'critical'));
  };

  // Conciliar pago de Cashea cuando el depósito cae en el banco (ingreso positivo diferido)
  const reconcileCasheaPayment = (
    saleId: string,
    paymentId: string,
    targetAccountName: string,
    bankReference: string,
    fechaConciliacion?: string
  ): boolean => {
    const saleIndex = sales.findIndex((s) => s.id === saleId);
    if (saleIndex === -1) return false;

    const targetSale = sales[saleIndex];
    const paymentIndex = targetSale.pagos.findIndex((p) => p.id === paymentId);
    if (paymentIndex === -1) return false;

    const payment = targetSale.pagos[paymentIndex];
    if (payment.estado_liquidacion === 'conciliado_en_banco') {
      addNotification('Ya Conciliado', 'Este pago de Cashea ya fue conciliado previamente en el banco.', 'info');
      return false;
    }

    const targetAcc =
      accounts.find((a) => (a.nombre || '').toLowerCase() === String(targetAccountName || '').toLowerCase()) ||
      accounts.find((a) => (a.nombre || '').toLowerCase().includes('pago móvil')) ||
      accounts.find((a) => (a.nombre || '').toLowerCase().includes('punto de venta')) ||
      accounts[0];

    const acreditadoDate = fechaConciliacion || new Date().toISOString();

    // Monto a acreditar en la cuenta destino
    const amountToCredit =
      targetAcc.moneda === payment.moneda
        ? payment.monto
        : targetAcc.moneda === 'Bs'
        ? payment.monto_equivalente_usd * exchangeRate
        : payment.monto_equivalente_usd;

    // 1. Ingresar en POSITIVO en el saldo de la cuenta bancaria seleccionada
    setAccounts((prev) =>
      prev.map((acc) =>
        acc.nombre === targetAcc.nombre
          ? { ...acc, saldo: acc.saldo + amountToCredit }
          : acc
      )
    );

    // 2. Actualizar el pago en la venta como conciliado en banco
    const updatedPagos = [...targetSale.pagos];
    updatedPagos[paymentIndex] = {
      ...payment,
      estado_liquidacion: 'conciliado_en_banco',
      banco_acreditado: targetAcc.nombre,
      referencia_bancaria: bankReference,
      fecha_conciliacion: acreditadoDate,
    };

    const remainingPendingCashea = updatedPagos
      .filter((p) => (p.cuenta || '').toLowerCase().includes('cashea') && p.estado_liquidacion !== 'conciliado_en_banco')
      .reduce((sum, p) => sum + p.monto_equivalente_usd, 0);

    const updatedSale: Sale = {
      ...targetSale,
      pagos: updatedPagos,
      total_positivo_inmediato_usd: (targetSale.total_positivo_inmediato_usd || 0) + payment.monto_equivalente_usd,
      total_cashea_pendiente_usd: remainingPendingCashea,
      estado_cashea: remainingPendingCashea === 0 ? 'conciliado_total' : 'conciliado_parcial',
    };

    setSales((prev) => {
      const updated = [...prev];
      updated[saleIndex] = updatedSale;
      safeLocalStorageSet(`${STORAGE_KEY}_sales`, JSON.stringify(updated));
      return updated;
    });

    // 3. Generar movimiento bancario oficial de ingreso
    const newMovement: BankMovement = {
      id: `mov-cashea-${Date.now()}`,
      fecha: acreditadoDate.split('T')[0],
      banco: targetAcc.nombre,
      tipo: 'credito_ingreso',
      referencia: bankReference || `LIQ-CASHEA-${targetSale.numero_factura}`,
      descripcion: `Liquidación Cashea Factura #${targetSale.numero_factura} (${targetSale.cliente_nombre})`,
      monto_bs: targetAcc.moneda === 'Bs' ? amountToCredit : amountToCredit * exchangeRate,
      monto_usd: payment.monto_equivalente_usd,
      estado_conciliacion: 'conciliado',
      vinculado_tipo: 'venta',
      vinculado_id: targetSale.id,
      notas: `Conciliado para cuenta ${targetAcc.nombre}`,
      created_at: new Date().toISOString(),
    };

    setBankMovements((prev) => [newMovement, ...prev]);

    // Sincronizar actualización de la venta con backend y Neon PostgreSQL
    fetch(`/api/sales/${targetSale.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pagos: updatedPagos,
        total_positivo_inmediato_usd: updatedSale.total_positivo_inmediato_usd,
        total_cashea_pendiente_usd: updatedSale.total_cashea_pendiente_usd,
        estado_cashea: updatedSale.estado_cashea,
      }),
    }).catch((err) => console.warn('No se pudo sincronizar actualización de venta Cashea con el servidor/Neon:', err));

    // Sincronizar movimiento bancario en Neon PostgreSQL
    saveBankReconciliationApi(newMovement).catch((err) =>
      console.warn('No se pudo guardar movimiento de conciliación Cashea en Neon:', err)
    );

    addNotification(
      'Pago Cashea Conciliado',
      `Factura #${targetSale.numero_factura}: Se acreditaron ${targetAcc.moneda === 'Bs' ? `${amountToCredit.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs` : `$${amountToCredit.toFixed(2)}`} en ${targetAcc.nombre} (Ref: ${bankReference}).`,
      'success'
    );

    return true;
  };

  const clearAllData = () => {
    setProducts([]);
    setMovements([]);
    setSales([]);
    setExpenses([]);
    setBankMovements([]);
    setCurrencyPurchases([]);
    setCashClosures([]);
    setAccounts(INITIAL_ACCOUNTS.map((a) => ({ ...a, saldo: 0 })));
    setNotifications([]);
    localStorage.removeItem(`${STORAGE_KEY}_products`);
    localStorage.removeItem(`${STORAGE_KEY}_movements`);
    localStorage.removeItem(`${STORAGE_KEY}_sales`);
    localStorage.removeItem(`${STORAGE_KEY}_accounts`);
    localStorage.removeItem(`${STORAGE_KEY}_closures`);
    localStorage.removeItem(`${STORAGE_KEY}_expenses`);
    localStorage.removeItem(`${STORAGE_KEY}_bank_movements`);
    localStorage.removeItem(`${STORAGE_KEY}_currency_purchases`);

    fetch('/api/store/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        products: [],
        sales: [],
        movements: [],
        expenses: [],
        cashClosures: [],
        accounts: INITIAL_ACCOUNTS.map((a) => ({ ...a, saldo: 0 })),
      }),
    }).catch(() => {});

    addNotification('Datos Limpios', 'Se han vaciado los datos de prueba para iniciar la operación real.', 'info');
  };

  const resetToDemoData = () => {
    clearAllData();
  };

  const exportStoreBackup = useCallback(() => {
    const data = {
      products,
      sales,
      movements,
      layaways,
      accounts,
      cashClosures,
      expenses,
      bankMovements,
      currencyPurchases,
      exchangeRate,
      exportDate: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_nexoss_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [products, sales, movements, layaways, accounts, cashClosures, expenses, bankMovements, currencyPurchases, exchangeRate]);

  const importStoreBackup = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (Array.isArray(data.products)) setProducts(data.products);
      if (Array.isArray(data.sales)) setSales(data.sales);
      if (Array.isArray(data.movements)) setMovements(data.movements);
      if (Array.isArray(data.layaways)) setLayaways(data.layaways);
      if (Array.isArray(data.accounts)) setAccounts(data.accounts);
      if (Array.isArray(data.cashClosures)) setCashClosures(data.cashClosures);
      if (Array.isArray(data.expenses)) setExpenses(data.expenses);
      addNotification('Respaldo Restaurado', 'Se han importado los datos del archivo correctamente.', 'success');
    } catch {
      addNotification('Error al importar', 'El archivo no tiene el formato JSON válido.', 'critical');
    }
  }, [addNotification]);

  const restoreFromBackup = useCallback(() => {
    syncFromServer(false);
  }, [syncFromServer]);

  const triggerInventoryWebhook = useCallback(async (customProducts?: ShoeProduct[]) => {
    return await sendInventoryWebhook(customProducts || products, { force: true });
  }, [products]);

  return (
    <StoreContext.Provider
      value={{
        products,
        movements,
        sales,
        accounts,
        paymentAccounts: accounts,
        exchangeRate,
        historicalRates,
        getExchangeRateForDate,
        setExchangeRateForDate,
        userRole,
        cashClosures,
        notifications,
        criticalStockProducts,
        bcvInfo,
        isBcvSyncing,
        isAutoSyncEnabled,
        syncBcvRate,
        setIsAutoSyncEnabled,
        setExchangeRate,
        addProduct,
        addProductsBulk,
        updateProduct,
        adjustStock,
        deleteProduct,
        recordSale,
        updateSaleDate,
        updateSaleDetails,
        voidSale,
        layaways,
        createLayaway,
        addLayawayPayment,
        cancelLayaway,
        deliverLayaway,
        updateLayaway,
        recordCashClosure,
        expenses,
        bankMovements,
        currencyPurchases,
        addExpense,
        deleteExpense,
        updateExpense,
        addBankMovement,
        updateBankMovement,
        importBankMovements,
        applyCasheaExcelAbonos,
        addCurrencyPurchase,
        deleteCurrencyPurchase,
        markNotificationsAsRead,
        clearNotification,
        addNotification,
        resetToDemoData,
        adminPin,
        setAdminPin,
        verifyAdminPin,
        cajeraPin,
        setCajeraPin,
        verifyCajeraPin,
        currentSessionUser,
        isAuthLoading,
        logoutSession,
        reconcileCasheaPayment,
        clearAllData,
        syncStatus,
        lastSyncedAt,
        forceSync,
        currentUser,
        isFirebaseConnected,
        loginWithGoogleAction,
        logoutUserAction,
        pushAllToCloud,
        restoreFromBackup,
        exportStoreBackup,
        importStoreBackup,
        triggerInventoryWebhook,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
};
