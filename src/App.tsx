/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, lazy, Suspense } from 'react';
import { Camera } from 'lucide-react';
import { StoreProvider, useStore } from './context/StoreContext';
import { Sidebar, Header, NavigationTab } from './components/Navbar';
import { CompanyWorkspaceGate } from './components/companies/CompanyWorkspaceGate';
import { CompanyProfileId } from './components/companies/CompanyProfileSelector';
import { FiscalFolder } from './components/fiscal/FiscalFolder';
import { PublicFiscalBoard } from './components/fiscal/PublicFiscalBoard';
import { PushNotificationSettings } from './components/common/PushNotificationSettings';
import { HealthWorkspace } from './components/health/HealthWorkspace';

// Lazy load view components for maximum initial load performance and lightweight bundle
const PointOfSale = lazy(() => import('./components/pos/PointOfSale').then((m) => ({ default: m.PointOfSale })));
const InventoryManager = lazy(() => import('./components/inventory/InventoryManager').then((m) => ({ default: m.InventoryManager })));
const ProductionManager = lazy(() => import('./components/production/ProductionManager').then((m) => ({ default: m.ProductionManager })));
const InventoryMovementReport = lazy(() => import('./components/reports/InventoryMovementReport').then((m) => ({ default: m.InventoryMovementReport })));
import { SalesReports } from './components/reports/SalesReports';
const CashClosure = lazy(() => import('./components/cash/CashClosure').then((m) => ({ default: m.CashClosure })));
const ExpensesManager = lazy(() => import('./components/expenses/ExpensesManager').then((m) => ({ default: m.ExpensesManager })));
const BankReconciliationView = lazy(() => import('./components/banking/BankReconciliationView').then((m) => ({ default: m.BankReconciliationView })));
import { LayawaysManager } from './components/layaways/LayawaysManager';
const AccountingManager = lazy(() => import('./components/accounting/AccountingManager').then((m) => ({ default: m.AccountingManager })));
const ReceiptScannerModal = lazy(() => import('./components/expenses/ReceiptScannerModal').then((m) => ({ default: m.ReceiptScannerModal })));
const CompanyAdminPanel = lazy(() => import('./components/admin/CompanyAdminPanel').then((m) => ({ default: m.CompanyAdminPanel })));

function ViewFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] w-full py-12">
      <div className="w-9 h-9 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4" />
      <p className="text-xs font-semibold text-slate-500 tracking-wide uppercase">Cargando módulo...</p>
    </div>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<NavigationTab>(() => localStorage.getItem('nexoss_active_company_industry') === 'health' ? 'health' : 'pos');
  // Escáner de gastos con cámara: se abre desde la barra inferior del teléfono.
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [activeCompanyId, setActiveCompanyId] = useState<CompanyProfileId>(() => localStorage.getItem('nexoss_active_company_id') || '');
  const [selectedCompanyName, setSelectedCompanyName] = useState(() => localStorage.getItem('nexoss_active_company_name') || 'Empresa');
  const [companyRole, setCompanyRole] = useState(() => localStorage.getItem('nexoss_active_company_role') || '');
  const [companyIndustry, setCompanyIndustry] = useState(() => localStorage.getItem('nexoss_active_company_industry') || 'other');
  const [mobileOpen, setMobileOpen] = useState(false);
  const { userRole, currentUser, isAuthLoading, products, criticalStockProducts, logoutUserAction } = useStore();
  const isCompanyAdmin = companyRole === 'owner' || companyRole === 'admin';
  useEffect(() => {
    const syncRole = () => {
      setCompanyRole(localStorage.getItem('nexoss_active_company_role') || '');
      const industry = localStorage.getItem('nexoss_active_company_industry') || 'other';
      setCompanyIndustry(industry);
      setActiveTab(industry === 'health' ? 'health' : 'pos');
    };
    window.addEventListener('nexoss:company-selected', syncRole);
    return () => window.removeEventListener('nexoss:company-selected', syncRole);
  }, []);
  useEffect(() => {
    const syncCompanyName = () => {
      setSelectedCompanyName(localStorage.getItem('nexoss_active_company_name') || 'Empresa');
      const industry = localStorage.getItem('nexoss_active_company_industry') || 'other';
      setCompanyIndustry(industry);
      setActiveTab(industry === 'health' ? 'health' : 'pos');
    };
    window.addEventListener('nexoss:company-profile-updated', syncCompanyName);
    return () => window.removeEventListener('nexoss:company-profile-updated', syncCompanyName);
  }, []);
  useEffect(() => {
    if ((userRole === 'cajera' || !isCompanyAdmin) && activeTab === 'admin') setActiveTab('pos');
    if (userRole === 'cajera') setActiveTab('pos');
  }, [userRole, isCompanyAdmin, activeTab]);
  const handleCompanySelect = (companyId: string) => {
    setActiveCompanyId(companyId);
    setSelectedCompanyName(localStorage.getItem('nexoss_active_company_name') || 'Empresa');
    setCompanyRole(localStorage.getItem('nexoss_active_company_role') || '');
    setCompanyIndustry(localStorage.getItem('nexoss_active_company_industry') || 'other');
    setActiveTab(localStorage.getItem('nexoss_active_company_industry') === 'health' ? 'health' : 'pos');
  };

  return (
    <CompanyWorkspaceGate user={currentUser} loading={isAuthLoading} onTenantSelected={(companyId, role) => {
      localStorage.setItem('nexoss_active_company_role', role);
      setActiveCompanyId(companyId);
      setCompanyRole(role);
      setSelectedCompanyName(localStorage.getItem('nexoss_active_company_name') || 'Empresa');
      setCompanyIndustry(localStorage.getItem('nexoss_active_company_industry') || 'other');
    }} onLogout={logoutUserAction}>
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-500 selection:text-white">
      
      {/* High Density Slate-900 Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        isCompanyAdmin={isCompanyAdmin}
        isHealthIndustry={companyIndustry === 'health'}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 text-slate-900 min-h-screen">
        
        {/* High Density White Top Header with Live Revenue */}
        {isCompanyAdmin && <PushNotificationSettings key={activeCompanyId} mode="prompt" />}

        <Header
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onToggleMobile={() => setMobileOpen(!mobileOpen)}
          activeCompanyId={activeCompanyId}
          onSelectCompany={handleCompanySelect}
          isCompanyAdmin={isCompanyAdmin}
        />

        {/* Dynamic Page Views with Suspense */}
        <main className={`flex-1 overflow-y-auto pb-24 lg:pb-6 ${activeTab === 'pos' || activeTab === 'reports' ? 'p-0' : 'p-3 sm:p-6'}`}>
          <Suspense fallback={<ViewFallback />}>
            {activeTab === 'pos' && <PointOfSale key={activeCompanyId} industryTemplate={companyIndustry} onNavigateToLayaways={userRole === 'admin' ? () => setActiveTab('layaways') : undefined} />}
            {activeTab === 'inventory' && <InventoryManager />}
            {activeTab === 'production' && isCompanyAdmin && <ProductionManager key={activeCompanyId} />}
            {activeTab === 'inventoryReport' && <InventoryMovementReport />}
            {activeTab === 'layaways' && <LayawaysManager />}
                    {activeTab === 'reports' && <SalesReports />}
            {activeTab === 'cash' && <CashClosure />}
            {activeTab === 'expenses' && <ExpensesManager />}
            {activeTab === 'conciliacion' && <BankReconciliationView />}
            {activeTab === 'contabilidad' && <AccountingManager />}
            {activeTab === 'admin' && isCompanyAdmin && <CompanyAdminPanel companyId={activeCompanyId} />}
            {activeTab === 'fiscal' && <FiscalFolder key={activeCompanyId} companyId={activeCompanyId} companyName={selectedCompanyName} />}
            {activeTab === 'health' && companyIndustry === 'health' && isCompanyAdmin && <HealthWorkspace key={activeCompanyId} />}
          </Suspense>
        </main>

        {/* Mobile Bottom Navigation Bar (Phone Adaptability) */}
        <nav aria-label="Navegación Móvil" className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 z-40 flex items-center justify-around px-2 py-1.5 shadow-lg shadow-slate-900/10">
          <button
            onClick={() => setActiveTab('pos')}
            className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition cursor-pointer min-w-0 flex-1 ${
              activeTab === 'pos' ? 'text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className={`p-1 rounded-lg ${activeTab === 'pos' ? 'bg-indigo-50' : ''}`}>
              <span className="text-lg">🛒</span>
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 font-bold">Ventas</span>
          </button>

          {isCompanyAdmin && <button
            onClick={() => setActiveTab('admin')}
            className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition cursor-pointer min-w-0 flex-1 ${
              activeTab === 'admin' ? 'text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className={`p-1 rounded-lg ${activeTab === 'admin' ? 'bg-indigo-50' : ''}`}>
              <span className="text-lg">⚙️</span>
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 font-bold">Admin</span>
          </button>}

          {userRole === 'admin' && <button
            onClick={() => setActiveTab('inventory')}
            className={`relative flex flex-col items-center justify-center py-1 px-1 rounded-xl transition cursor-pointer min-w-0 flex-1 ${
              activeTab === 'inventory' ? 'text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className={`p-1 rounded-lg ${activeTab === 'inventory' ? 'bg-indigo-50' : ''}`}>
              <span className="text-lg">📦</span>
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 font-bold">Inventario</span>
            {criticalStockProducts.length > 0 && (
              <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
            )}
          </button>}

          {userRole === 'admin' && <button
            onClick={() => setActiveTab('layaways')}
            className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition cursor-pointer min-w-0 flex-1 ${
              activeTab === 'layaways' ? 'text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className={`p-1 rounded-lg ${activeTab === 'layaways' ? 'bg-indigo-50' : ''}`}>
              <span className="text-lg">🔖</span>
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 font-bold">Crédito</span>
          </button>}

          {userRole !== 'cajera' && <button
            onClick={() => setIsScannerOpen(true)}
            aria-label="Registrar gasto con la cámara"
            className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-1 py-1 text-slate-500 transition cursor-pointer"
          >
            <span className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-300 ring-4 ring-white">
              <Camera className="h-6 w-6" />
            </span>
            <span className="mt-0.5 text-[10px] font-bold tracking-tight text-indigo-700">Gastos</span>
          </button>}

          {userRole === 'admin' && <button
            onClick={() => setActiveTab('reports')}
            className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition cursor-pointer min-w-0 flex-1 ${
              activeTab === 'reports' ? 'text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className={`p-1 rounded-lg ${activeTab === 'reports' ? 'bg-indigo-50' : ''}`}>
              <span className="text-lg">📊</span>
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 font-bold">Reportes</span>
          </button>}

          {userRole === 'admin' && <button
            onClick={() => setMobileOpen(true)}
            className="flex flex-col items-center justify-center py-1 px-1 rounded-xl text-slate-500 hover:text-slate-800 transition cursor-pointer min-w-0 flex-1"
          >
            <div className="p-1 rounded-lg">
              <span className="text-lg">☰</span>
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 font-bold">Menú</span>
          </button>}
        </nav>

        {isScannerOpen && <Suspense fallback={null}><ReceiptScannerModal isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} /></Suspense>}

        {/* High Density Sub-Footer (matching Design HTML) */}
        <footer className="hidden lg:flex h-10 bg-slate-50 border-t border-slate-200 items-center justify-between px-4 sm:px-6 text-[10px] text-slate-400 shrink-0">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <span className="font-semibold text-slate-600">NEXOSS</span>
            {userRole === 'admin' && <>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline">Entorno local de demostración</span>
              <span className="hidden md:inline">•</span>
              <span>Solo este equipo</span>
              <span className="hidden sm:inline">•</span>
              <span>Stock Crítico: <strong className={criticalStockProducts.length > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>{criticalStockProducts.length}</strong></span>
            </>}
          </div>

          <div className="flex items-center space-x-3 text-slate-500">
            {userRole === 'admin' && <span>Catálogo: <strong className="text-slate-700">{products.length}</strong> modelos</span>}
            <span>•</span>
            <span className="uppercase font-bold text-indigo-600">Modo {userRole}</span>
          </div>
        </footer>

      </div>

    </div>
    </CompanyWorkspaceGate>
  );
}

function PrivateApp() {
  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  );
}

export default function App() {
  const publicBoardPath = /^\/cartelera\/([0-9a-f-]{36})\/([0-9a-f]{64})\/?$/i.exec(window.location.pathname);
  if (publicBoardPath) return <PublicFiscalBoard companyId={publicBoardPath[1]} token={publicBoardPath[2]} />;
  return <PrivateApp />;
}
