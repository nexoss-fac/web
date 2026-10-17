import { ShoeProduct, StockMovement, Sale, AccountBalance, Expense, BankMovement, CurrencyPurchase } from '../types';

export const INITIAL_EXCHANGE_RATE = 68.50; // Tasa oficial BCV Bs/USD referencial

// Catálogo inicial con el calzado de referencia de estudio Adidas Adizero PureHustle
export const INITIAL_PRODUCTS: ShoeProduct[] = [
  {
    id: 'prod-adizero-purehustle-39',
    nombre: 'Adidas Adizero PureHustle Cleats White & Silver',
    sku: 'ADI-ADZ-WHTSLV-39',
    categoria: 'Calzado',
    marca: 'Adidas',
    tipo: 'Béisbol Gancho',
    talla: '39',
    color: 'Blanco y Plata Metálica',
    moneda: 'USD',
    precio: 75.0,
    costo: 42.0,
    stock: 4,
    stock_minimo: 2,
    activo: true,
    imagen: '/adizero-purehustle-studio.jpg',
    descripcion: 'Calzado deportivo de alto rendimiento Adidas Adizero PureHustle con placa de tracción de tacos metálicos, acabado en plata reflectante, capellada ultraligera transpirable y amortiguación receptiva para campo y entrenamiento.',
    genero: 'Unisex',
    created_at: new Date().toISOString(),
  },
  {
    id: 'prod-adizero-purehustle-40',
    nombre: 'Adidas Adizero PureHustle Cleats White & Silver',
    sku: 'ADI-ADZ-WHTSLV-40',
    categoria: 'Calzado',
    marca: 'Adidas',
    tipo: 'Béisbol Gancho',
    talla: '40',
    color: 'Blanco y Plata Metálica',
    moneda: 'USD',
    precio: 75.0,
    costo: 42.0,
    stock: 6,
    stock_minimo: 2,
    activo: true,
    imagen: '/adizero-purehustle-studio.jpg',
    descripcion: 'Calzado deportivo de alto rendimiento Adidas Adizero PureHustle con placa de tracción de tacos metálicos, acabado en plata reflectante, capellada ultraligera transpirable y amortiguación receptiva para campo y entrenamiento.',
    genero: 'Unisex',
    created_at: new Date().toISOString(),
  },
  {
    id: 'prod-adizero-purehustle-41',
    nombre: 'Adidas Adizero PureHustle Cleats White & Silver',
    sku: 'ADI-ADZ-WHTSLV-41',
    categoria: 'Calzado',
    marca: 'Adidas',
    tipo: 'Béisbol Gancho',
    talla: '41',
    color: 'Blanco y Plata Metálica',
    moneda: 'USD',
    precio: 75.0,
    costo: 42.0,
    stock: 8,
    stock_minimo: 2,
    activo: true,
    imagen: '/adizero-purehustle-studio.jpg',
    descripcion: 'Calzado deportivo de alto rendimiento Adidas Adizero PureHustle con placa de tracción de tacos metálicos, acabado en plata reflectante, capellada ultraligera transpirable y amortiguación receptiva para campo y entrenamiento.',
    genero: 'Unisex',
    created_at: new Date().toISOString(),
  },
  {
    id: 'prod-adizero-purehustle-42',
    nombre: 'Adidas Adizero PureHustle Cleats White & Silver',
    sku: 'ADI-ADZ-WHTSLV-42',
    categoria: 'Calzado',
    marca: 'Adidas',
    tipo: 'Béisbol Gancho',
    talla: '42',
    color: 'Blanco y Plata Metálica',
    moneda: 'USD',
    precio: 75.0,
    costo: 42.0,
    stock: 5,
    stock_minimo: 2,
    activo: true,
    imagen: '/adizero-purehustle-studio.jpg',
    descripcion: 'Calzado deportivo de alto rendimiento Adidas Adizero PureHustle con placa de tracción de tacos metálicos, acabado en plata reflectante, capellada ultraligera transpirable y amortiguación receptiva para campo y entrenamiento.',
    genero: 'Unisex',
    created_at: new Date().toISOString(),
  },
];

// Historial de movimientos de inventario limpio
export const INITIAL_MOVEMENTS: StockMovement[] = [];

// Cuentas del negocio listas para operar con saldo inicial en cero
export const INITIAL_ACCOUNTS: AccountBalance[] = [
  { id: 'acc-1', nombre: 'Efectivo USD', moneda: 'USD', saldo: 0.00, icono: 'Banknote' },
  { id: 'acc-2', nombre: 'Efectivo Bs', moneda: 'Bs', saldo: 0.00, icono: 'Banknote' },
  { id: 'acc-3', nombre: 'Pago Móvil (BDV)', moneda: 'Bs', saldo: 0.00, icono: 'Smartphone' },
  { id: 'acc-pos', nombre: 'Punto de Venta', moneda: 'Bs', saldo: 0.00, icono: 'CreditCard' },
  { id: 'acc-4', nombre: 'Zelle', moneda: 'USD', saldo: 0.00, icono: 'CreditCard' },
  { id: 'acc-5', nombre: 'Binance USDT', moneda: 'USD', saldo: 0.00, icono: 'Coins' },
  { id: 'acc-6', nombre: 'Cashea', moneda: 'USD', saldo: 0.00, icono: 'CircleDollarSign' },
];

// Ventas registradas limpias
export const INITIAL_SALES: Sale[] = [];

// Gastos operativos limpios
export const INITIAL_EXPENSES: Expense[] = [];

// Movimientos bancarios para conciliación limpios
export const INITIAL_BANK_MOVEMENTS: BankMovement[] = [];

// Compras de divisas (Binance, Zelle, Efectivo) limpias
export const INITIAL_CURRENCY_PURCHASES: CurrencyPurchase[] = [];
