import React, { useState, useMemo } from 'react';
import {
  Store,
  DollarSign,
  Bell,
  RefreshCw,
  TrendingUp,
  Boxes,
  ShoppingCart,
  Wallet,
  CheckCircle2,
  AlertTriangle,
  X,
  RotateCcw,
  Check,
  UserCheck,
  Menu,
  Landmark,
  TrendingDown,
  Receipt,
  User,
  BookmarkCheck,
  Calendar,
  LogOut,
  ShieldCheck,
  Lock,
  BookOpen,
  ClipboardList,
  FolderOpen,
  Settings,
  ChevronDown,
  ChevronRight,
  HeartPulse,
  Factory,
  Building2
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { MakdLogo } from './common/MakdLogo';
import { UserWindowModal } from './common/UserWindowModal';
import { CompanyProfileId, CompanyProfileSelector } from './companies/CompanyProfileSelector';

export type NavigationTab = 'pos' | 'health' | 'inventory' | 'layaways' | 'reports' | 'cash' | 'expenses' | 'conciliacion' | 'contabilidad' | 'inventoryReport' | 'fiscal' | 'production' | 'admin' | 'firmaContable';

interface NavbarProps {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<{
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  isCompanyAdmin?: boolean;
  isHealthIndustry?: boolean;
  isManufacturingIndustry?: boolean;
}> = ({ activeTab, setActiveTab, mobileOpen, setMobileOpen, isCompanyAdmin = false, isHealthIndustry = false, isManufacturingIndustry = false }) => {
  const { criticalStockProducts, userRole, layaways, logoutSession } = useStore();
  const activeLayawaysCount = layaways ? layaways.filter((l) => l.estado === 'activo').length : 0;
  const navGroups = [
    {
      id: 'sales',
      label: 'Ventas',
      icon: ShoppingCart,
      items: [
        { id: 'pos' as const, label: 'Ventas', subtitle: 'Inventario / Salida', icon: ShoppingCart, count: null },
        { id: 'layaways' as const, label: 'Crédito', icon: BookmarkCheck, count: activeLayawaysCount || null },
        { id: 'cash' as const, label: 'Caja & Arqueo', icon: Wallet, count: null },
      ],
    },
    {
      id: 'purchases',
      label: 'Compras',
      icon: Boxes,
      items: [
        { id: 'inventory' as const, label: 'Compras', subtitle: 'Inventario Entradas', icon: Boxes, count: criticalStockProducts.length || null },
        { id: 'inventoryReport' as const, label: 'Movimiento mensual de inventario', icon: ClipboardList, count: null },
      ],
    },
    {
      id: 'reports',
      label: 'Reportes',
      icon: Receipt,
      items: [
        { id: 'reports' as const, label: 'Reportes', icon: Receipt, count: null },
        { id: 'expenses' as const, label: 'Gastos & Fin de Mes', icon: TrendingDown, count: null },
        { id: 'conciliacion' as const, label: 'Conciliación Bancaria', icon: Landmark, count: null },
        { id: 'fiscal' as const, label: 'Carpeta Fiscal', icon: FolderOpen, count: null },
      ],
    },
  ];
  const healthNavGroups = [{ id: 'health', label: 'Clínica', icon: HeartPulse, items: [{ id: 'health' as const, label: 'Salud', subtitle: 'Pacientes y atención', icon: HeartPulse, count: null }] }];
  const visibleNavGroups = isHealthIndustry ? healthNavGroups : userRole === 'cajera'
    ? navGroups.slice(0, 1).map((group) => ({ ...group, items: group.items.filter((item) => item.id === 'pos') }))
    : navGroups;
  const activeGroup = visibleNavGroups.find((group) => group.items.some((item) => item.id === activeTab))?.id;
  const [expandedGroup, setExpandedGroup] = useState(activeGroup || 'sales');

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-950/50 z-40 backdrop-blur-[2px]"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 shadow-2xl transition-transform duration-200 ease-in-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 flex items-center justify-between border-b border-slate-800/80">
          <div
            className="flex items-center space-x-3 cursor-pointer group"
            onClick={() => {
              setActiveTab('pos');
              setMobileOpen(false);
            }}
          >
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center p-1 shadow-md shadow-black/30 overflow-hidden shrink-0 border border-slate-700">
              <MakdLogo size={36} showSlogan={false} />
            </div>
            <div>
              <span className="text-white font-black tracking-tight uppercase text-sm block leading-none">
                NEXOSS
              </span>
              <span className="text-[10px] text-slate-400 font-medium block mt-1">
                Gestión empresarial
              </span>
            </div>
          </div>

          <button
            onClick={() => setMobileOpen(false)}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="px-2 pb-2 text-[10px] uppercase font-bold tracking-wider text-slate-500">
            Navegación Principal
          </div>
          {visibleNavGroups.map((group) => {
            const GroupIcon = group.icon;
            const isExpanded = expandedGroup === group.id;
            return (
              <div key={group.id}>
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedGroup(isExpanded ? '' : group.id)}
                  className={`w-full px-2.5 py-2 rounded-md flex items-center justify-between text-xs font-bold uppercase tracking-wide transition-colors ${
                    activeGroup === group.id ? 'text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <GroupIcon className="w-4 h-4 text-indigo-400" />
                    {group.label}
                  </span>
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                {isExpanded && (
                  <div className="ml-3 pl-2 border-l border-slate-700/80 space-y-1 pb-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          id={`sidebar-nav-${item.id}`}
                          onClick={() => {
                            setActiveTab(item.id);
                            setExpandedGroup(group.id);
                            setMobileOpen(false);
                          }}
                          className={`w-full p-2 rounded-md flex items-center justify-between text-xs font-medium cursor-pointer transition-colors ${
                            isActive
                              ? 'bg-slate-800 text-white font-semibold shadow-xs'
                              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          <span className="flex items-center gap-2.5 min-w-0">
                            <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                            <span className="min-w-0 text-left">
                              <span className="block">{item.label}</span>
                              {'subtitle' in item && item.subtitle && (
                                <span className="block text-[10px] font-normal text-slate-500">{item.subtitle}</span>
                              )}
                            </span>
                          </span>
                          {item.count !== null && item.count > 0 && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              {item.count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {isCompanyAdmin && isManufacturingIndustry && !isHealthIndustry && (
            <button
              id="sidebar-nav-production"
              onClick={() => { setActiveTab('production'); setMobileOpen(false); }}
              className={`w-full p-2.5 rounded-md flex items-center gap-3 text-xs font-medium cursor-pointer transition-colors ${activeTab === 'production' ? 'bg-slate-800 text-white font-semibold shadow-xs' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
              <Factory className={`w-4 h-4 ${activeTab === 'production' ? 'text-indigo-400' : 'text-slate-400'}`} />
              <span>Manufactura y trazabilidad</span>
            </button>
          )}
          {isCompanyAdmin && <button
            id="sidebar-nav-firma-contable"
            onClick={() => { setActiveTab('firmaContable'); setMobileOpen(false); }}
            className={`w-full p-2.5 rounded-md flex items-center gap-3 text-xs font-medium cursor-pointer transition-colors ${activeTab === 'firmaContable' ? 'bg-slate-800 text-white font-semibold shadow-xs' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            <Building2 className={`w-4 h-4 ${activeTab === 'firmaContable' ? 'text-indigo-400' : 'text-slate-400'}`} />
            <span>Firma contable</span>
          </button>}
          {userRole === 'admin' && <button
            id="sidebar-nav-contabilidad"
            onClick={() => {
              setActiveTab('contabilidad');
              setMobileOpen(false);
            }}
            className={`w-full p-2.5 rounded-md flex items-center gap-3 text-xs font-medium cursor-pointer transition-colors ${
              activeTab === 'contabilidad'
                ? 'bg-slate-800 text-white font-semibold shadow-xs'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <BookOpen className={`w-4 h-4 ${activeTab === 'contabilidad' ? 'text-indigo-400' : 'text-slate-400'}`} />
            <span>Contabilidad</span>
          </button>}
          {isCompanyAdmin && (
            <button
              id="sidebar-nav-admin"
              onClick={() => {
                setActiveTab('admin');
                setMobileOpen(false);
              }}
              className={`w-full p-2.5 rounded-md flex items-center gap-3 text-xs font-medium cursor-pointer transition-colors ${
                activeTab === 'admin'
                  ? 'bg-slate-800 text-white font-semibold shadow-xs'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Settings className={`w-4 h-4 ${activeTab === 'admin' ? 'text-indigo-400' : 'text-slate-400'}`} />
              <span>Administrar empresa</span>
            </button>
          )}
        </nav>

        {/* Active Session & Quick Logout */}
        <div className="p-3 mx-3 mt-auto mb-2 bg-slate-800/90 rounded-xl border border-slate-700/80 flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              userRole === 'admin' ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/30' : 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/30'
            }`}>
              {userRole === 'admin' ? <ShieldCheck className="w-4 h-4" /> : <User className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white block truncate">
                {userRole === 'admin' ? 'Administrador' : 'Cajera Turno'}
              </span>
              <span className="text-[10px] text-slate-400 block truncate">
                {userRole === 'admin' ? 'Control Total' : 'Terminal POS'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={logoutSession}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-700 transition cursor-pointer"
            title="Cerrar Turno / Salir al Portal"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </>
  );
};

export const Header: React.FC<{
  activeTab: NavigationTab;
  setActiveTab?: (tab: NavigationTab) => void;
  onToggleMobile: () => void;
  activeCompanyId: CompanyProfileId;
  onSelectCompany: (companyId: CompanyProfileId) => void;
  isCompanyAdmin?: boolean;
}> = ({ activeTab, setActiveTab, onToggleMobile, activeCompanyId, onSelectCompany, isCompanyAdmin = false }) => {
  const {
    exchangeRate,
    setExchangeRate,
    criticalStockProducts,
    notifications,
    markNotificationsAsRead,
    clearNotification,
    userRole,
    sales,
    layaways,
    bcvInfo,
    isBcvSyncing,
    isAutoSyncEnabled,
    syncBcvRate,
    setIsAutoSyncEnabled,
    syncStatus,
    lastSyncedAt,
    forceSync,
    currentUser,
    logoutSession,
  } = useStore();

  const [showRateModal, setShowRateModal] = useState(false);
  const [newRate, setNewRate] = useState(exchangeRate.toString());
  const [showNotifications, setShowNotifications] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const activeLayawaysCount = layaways ? layaways.filter((l) => l.estado === 'activo').length : 0;

  // Live Revenue Calculation (Today's Sales)
  const todayStr = new Date().toISOString().split('T')[0];
  const liveRevenue = useMemo(() => {
    return sales
      .filter((s) => s.fecha.startsWith(todayStr))
      .reduce((sum, s) => sum + (Number(s.total_usd) || 0), 0);
  }, [sales, todayStr]);

  const handleUpdateRate = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(newRate);
    if (!isNaN(parsed) && parsed > 0) {
      setExchangeRate(parsed, true);
      setShowRateModal(false);
    }
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case 'pos':
        return 'Ventas';
      case 'inventory':
        return 'Compras';
      case 'layaways':
        return 'Crédito';
      case 'reports':
        return 'Reportes';
      case 'inventoryReport':
        return 'Movimiento mensual de inventario';
      case 'fiscal':
        return 'Carpeta Fiscal';
      case 'cash':
        return 'Arqueo y Cierre Diario de Caja';
      case 'expenses':
        return 'Control de Gastos & Balance de Fin de Mes';
      case 'conciliacion':
        return 'Conciliación Bancaria';
      case 'contabilidad':
        return 'Contabilidad';
      case 'admin':
        return 'Administrar empresa';
      case 'firmaContable':
        return 'Firma contable';
      default:
        return 'Gestion empresarial';
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-3 sm:px-6 shrink-0 z-30">
      {/* Left Title & Breadcrumb */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-2">
        <button
          onClick={onToggleMobile}
          className="p-1.5 sm:p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 shrink-0"
          title="Menú"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="text-sm sm:text-base lg:text-lg font-bold text-slate-800 tracking-tight truncate">
            {getTabTitle()}
          </h1>
          <p className="text-[11px] text-slate-500 hidden sm:block truncate">
            {new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} • Entorno local
          </p>
        </div>
      </div>

      {/* Right Actions: Company Profile, Credit, Live Revenue, BCV Rate, Bell, User Profile & Exit */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <CompanyProfileSelector activeCompanyId={activeCompanyId} onSelect={onSelectCompany} />
        
        {/* Quick Credit Access Button */}
        {userRole === 'admin' && setActiveTab && (
          <button
            id="header-quick-layaways-btn"
            onClick={() => setActiveTab('layaways')}
            className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border shrink-0 ${
              activeTab === 'layaways'
                ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                : 'bg-amber-50 text-amber-900 border-amber-200/80 hover:bg-amber-100 hover:border-amber-300'
            }`}
            title="Crédito"
          >
            <BookmarkCheck className={`w-3.5 h-3.5 ${activeTab === 'layaways' ? 'text-white' : 'text-amber-600'}`} />
            <span className="hidden sm:inline">Crédito</span>
            {activeLayawaysCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                activeTab === 'layaways' ? 'bg-white text-amber-700' : 'bg-amber-600 text-white'
              }`}>
                {activeLayawaysCount}
              </span>
            )}
          </button>
        )}

        {/* Live Revenue Metric */}
        <div className="text-right hidden xl:block px-1">
          <p className="text-[10px] text-slate-400 uppercase font-bold leading-none">Hoy</p>
          <p className="text-xs font-bold text-indigo-600 font-mono leading-tight mt-0.5">
            ${liveRevenue.toFixed(2)}
          </p>
        </div>

        <div className="h-6 w-px bg-slate-200 hidden lg:block"></div>

        {/* BCV Tasa Badge with Live Status */}
        <button
          id="bcv-rate-badge"
          disabled={userRole === 'cajera'}
          onClick={() => {
            if (userRole !== 'admin') return;
            setNewRate(exchangeRate.toString());
            setShowRateModal(true);
          }}
          title={bcvInfo.cycleRuleDescription || 'Tasa oficial BCV'}
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 transition-colors shrink-0 shadow-2xs ${
            userRole === 'admin' ? 'hover:bg-slate-100 cursor-pointer' : 'cursor-default'
          }`}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isBcvSyncing
                  ? 'bg-amber-400'
                  : bcvInfo.status === 'synced'
                  ? 'bg-emerald-400'
                  : 'bg-slate-400'
              }`}
            ></span>
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isBcvSyncing
                  ? 'bg-amber-500'
                  : bcvInfo.status === 'synced'
                  ? 'bg-emerald-500'
                  : 'bg-slate-500'
              }`}
            ></span>
          </span>
          <span className="font-bold text-slate-600 text-[11px]">BCV:</span>
          <span className="font-mono font-bold text-slate-900 text-xs">{exchangeRate.toFixed(2)}</span>
          <span className="text-slate-400 text-[10px] font-semibold hidden xs:inline">Bs</span>
          <RefreshCw
            className={`w-3 h-3 text-slate-400 shrink-0 ${
              isBcvSyncing ? 'animate-spin text-indigo-600' : ''
            }`}
          />
        </button>

        {/* Notification Bell */}
        <div className="relative shrink-0">
          <button
            id="notif-bell-btn"
            onClick={() => {
              setShowNotifications(!showNotifications);
              if (!showNotifications) markNotificationsAsRead();
            }}
            className="relative p-1.5 sm:p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
            title="Alertas del sistema"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center animate-bounce">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Popover */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Alertas en Tiempo Real
                  </span>
                </div>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No hay alertas pendientes en este momento.
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`p-3 text-xs flex items-start gap-2.5 transition-colors ${
                        notif.type === 'critical'
                          ? 'bg-rose-50/50'
                          : notif.type === 'warning'
                          ? 'bg-amber-50/50'
                          : 'bg-white'
                      }`}
                    >
                      {notif.type === 'critical' ? (
                        <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      ) : notif.type === 'warning' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800 truncate">{notif.title}</span>
                          <span className="text-[10px] text-slate-400 ml-1 shrink-0">{notif.time}</span>
                        </div>
                        <p className="text-slate-600 mt-0.5 break-words">{notif.message}</p>
                      </div>
                      <button
                        onClick={() => clearNotification(notif.id)}
                        className="text-slate-400 hover:text-slate-600 shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile & Role Combined (Sleek, Compact, No Overflows) */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            id="user-window-btn"
            onClick={() => setShowUserModal(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition cursor-pointer shadow-2xs group"
            title="Perfil de Usuario y Configuración"
          >
            <div className="w-6 h-6 bg-white rounded border border-slate-300 flex items-center justify-center p-0.5 overflow-hidden shrink-0">
              <MakdLogo size={20} showSlogan={false} />
            </div>
            <div className="text-left hidden lg:block">
              <span className="text-[11px] font-bold text-slate-800 leading-none block truncate max-w-[90px]">
                {currentUser?.displayName || currentUser?.email || 'Usuario'}
              </span>
              <span className="text-[9px] text-indigo-600 font-bold uppercase leading-none block mt-0.5">
                {userRole === 'admin' ? 'Admin' : 'Ventas'}
              </span>
            </div>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                userRole === 'admin'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              }`}
            >
              {userRole === 'admin' ? 'Admin' : 'POS'}
            </span>
          </button>

          {/* Quick Exit */}
          <button
            type="button"
            id="role-logout-btn"
            onClick={logoutSession}
            className="p-1.5 sm:px-2 sm:py-1 rounded-lg bg-white border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-500 hover:text-rose-600 text-xs font-semibold flex items-center gap-1 transition cursor-pointer shadow-2xs shrink-0"
            title="Cerrar Sesión / Salir"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-500" />
            <span className="hidden xl:inline text-[11px]">Salir</span>
          </button>
        </div>

      </div>

      {/* BCV Exchange Rate Modal */}
      {showRateModal && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 sm:p-6 shadow-xl space-y-4">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <DollarSign className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    Sincronización Oficial BCV
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Banco Central de Venezuela en Tiempo Real
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowRateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Live Rate Card */}
            <div className="bg-slate-900 text-white p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Tasa Oficial Vigente</span>
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  {bcvInfo.status === 'synced' ? 'API En Línea' : bcvInfo.status === 'manual' ? 'Modo Manual' : 'Verificando'}
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold font-mono text-white tracking-tight">
                  {exchangeRate.toFixed(2)}
                </span>
                <span className="text-slate-300 font-semibold text-sm">Bs por 1.00 USD</span>
              </div>

              {bcvInfo.isWeekendRate && (
                <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-500/40 text-xs text-amber-200 leading-relaxed space-y-2">
                  <div className="flex items-center gap-2 text-amber-300 font-bold">
                    <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Regla Oficial BCV: Tasa del Lunes para Fin de Semana</span>
                  </div>
                  <p className="text-amber-100">
                    La tasa oficial fijada por el Banco Central de Venezuela para el día{' '}
                    <strong className="text-white font-bold uppercase underline decoration-amber-400">
                      Lunes ({bcvInfo.effectiveMondayDate || 'hábil'})
                    </strong>{' '}
                    es la tasa oficial <strong className="text-white">válida y aplicable para el día Viernes, Sábado y Domingo</strong>.
                  </p>
                  {bcvInfo.currentDayName && (
                    <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-amber-500/30 text-amber-200 font-mono">
                      <span>Operación de hoy: <strong className="text-white">{bcvInfo.currentDayName}</strong></span>
                      <span className="bg-amber-900/80 text-amber-200 px-2 py-0.5 rounded text-[10px] font-bold">
                        Rige Tasa del Lunes
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="text-[10px] text-slate-400 space-y-0.5 border-t border-slate-800 pt-2 font-mono">
                <div className="flex justify-between">
                  <span>Fuente:</span>
                  <span className="text-slate-200">{bcvInfo.source}</span>
                </div>
                <div className="flex justify-between">
                  <span>Última Sincronización:</span>
                  <span className="text-slate-200">{bcvInfo.lastSyncedAt}</span>
                </div>
                {bcvInfo.officialDate && (
                  <div className="flex justify-between">
                    <span>Emisión BCV:</span>
                    <span className="text-indigo-300 truncate max-w-[180px]">
                      {bcvInfo.officialDate.replace('T', ' ').slice(0, 19)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Live Sync Button */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="sync-bcv-now-btn"
                disabled={isBcvSyncing}
                onClick={async () => {
                  await syncBcvRate(false);
                }}
                className="flex-1 py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold flex items-center justify-center gap-2 transition shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isBcvSyncing ? 'animate-spin' : ''}`} />
                <span>{isBcvSyncing ? 'Consultando API BCV...' : 'Sincronizar API en Tiempo Real'}</span>
              </button>

              <button
                type="button"
                onClick={() => setManualMode(!manualMode)}
                className={`py-2.5 px-3 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                  manualMode
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
                title="Ajustar tasa manualmente si se requiere"
              >
                {manualMode ? 'Ocultar Manual' : 'Ajuste Manual'}
              </button>
            </div>

            {/* Auto-sync Toggle */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-slate-800 block">
                  Auto-sincronización en vivo
                </span>
                <span className="text-[11px] text-slate-500">
                  Actualiza automáticamente con la última tasa oficial
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAutoSyncEnabled(!isAutoSyncEnabled)}
                className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                  isAutoSyncEnabled ? 'bg-indigo-600 justify-end' : 'bg-slate-300 justify-start'
                }`}
              >
                <span className="bg-white w-4 h-4 rounded-full shadow-xs"></span>
              </button>
            </div>

            {/* Optional Manual Input Form */}
            {manualMode && (
              <form onSubmit={handleUpdateRate} className="pt-2 border-t border-slate-200 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fijar Tasa Manual de Emergencia (Bs / USD)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={newRate}
                      onChange={(e) => setNewRate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono text-sm focus:outline-none focus:border-indigo-500 focus:bg-white"
                      placeholder="Ej. 68.50"
                    />
                    <span className="absolute right-3 top-2 text-xs text-slate-400 font-semibold">
                      Bs
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Guardar Tasa Manual</span>
                  </button>
                </div>
              </form>
            )}

            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={() => setShowRateModal(false)}
                className="px-4 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cerrar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Ventana de usuario de la empresa de demostración */}
      <UserWindowModal
        isOpen={showUserModal}
        onClose={() => setShowUserModal(false)}
      />
    </header>
  );
};
