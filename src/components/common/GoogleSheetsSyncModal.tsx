import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  X,
  RefreshCw,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  LogOut,
  User,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import {
  signInWithGoogle,
  signOutFromGoogle,
  getAccessToken,
  onGoogleAuthStateChanged,
  GoogleAuthState,
} from '../../services/googleAuth';
import { exportToGoogleSheets, GoogleSheetsExportResult } from '../../services/googleSheets';

interface GoogleSheetsSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  periodLabel?: string;
}

export const GoogleSheetsSyncModal: React.FC<GoogleSheetsSyncModalProps> = ({
  isOpen,
  onClose,
  periodLabel = 'Septiembre 2026',
}) => {
  const { sales, expenses, bankMovements, currencyPurchases, exchangeRate } = useStore();

  const [authState, setAuthState] = useState<GoogleAuthState>({
    isAuthenticated: !!getAccessToken(),
    user: null,
    accessToken: getAccessToken(),
  });
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<GoogleSheetsExportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onGoogleAuthStateChanged((state) => {
      setAuthState(state);
    });
    return () => unsubscribe();
  }, []);

  if (!isOpen) return null;

  // Compute month totals
  const totalVentasUsd = sales.reduce((sum, s) => sum + s.total_usd, 0);
  const totalVentasBs = sales.reduce((sum, s) => sum + s.total_bs, 0);
  const costoMercanciaUsd = sales.reduce((sum, s) => sum + (s.costo_total_usd || 0), 0);
  const gananciaVentasUsd = totalVentasUsd - costoMercanciaUsd;
  const totalGastosUsd = expenses.reduce((sum, e) => sum + e.monto_usd, 0);
  const totalGastosBs = expenses.reduce((sum, e) => sum + e.monto_bs, 0);

  // Divisas totals
  const totalBsGastadosDivisas = currencyPurchases.reduce((sum, c) => sum + c.monto_bs_gastado, 0);
  const totalUsdRecibidosDivisas = currencyPurchases.reduce((sum, c) => sum + c.monto_usd_recibido, 0);

  // Saldo restante en Bs (descontando compra de divisas y gastos en Bs)
  const saldoRestanteBs = Math.max(0, totalVentasBs - totalBsGastadosDivisas - totalGastosBs);

  // Positivo en solo dólares (ventas en USD + compras de divisas - gastos en USD)
  const positivoSoloDolaresUsd = totalVentasUsd + totalUsdRecibidosDivisas - totalGastosUsd;

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setErrorMessage(null);
    try {
      const res = await signInWithGoogle();
      setAuthState({
        isAuthenticated: true,
        user: {
          displayName: res.user.displayName,
          email: res.user.email,
          photoURL: res.user.photoURL,
        },
        accessToken: res.accessToken,
      });
    } catch (err: any) {
      console.error('Google Sign-In Error:', err);
      setErrorMessage(
        err.message || 'No se pudo iniciar sesión con Google. Verifique los permisos o ventanas emergentes.'
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOutFromGoogle();
    setAuthState({
      isAuthenticated: false,
      user: null,
      accessToken: null,
    });
    setExportResult(null);
  };

  const handleExport = async () => {
    const token = authState.accessToken || getAccessToken();
    if (!token) {
      setErrorMessage('Por favor inicie sesión con Google primero.');
      return;
    }

    setIsExporting(true);
    setErrorMessage(null);

    try {
      const now = new Date();
      const result = await exportToGoogleSheets(
        {
          title: `NEXOSS - Reporte Fin de Mes & Conciliación (${periodLabel})`,
          periodLabel,
          generatedDate: now.toLocaleString('es-VE'),
          exchangeRate,
          totalVentasUsd,
          totalVentasBs,
          costoMercanciaUsd,
          gananciaVentasUsd,
          totalGastosUsd,
          totalGastosBs,
          comprasDivisas: currencyPurchases,
          totalBsGastadosDivisas,
          totalUsdRecibidosDivisas,
          saldoRestanteBs,
          positivoSoloDolaresUsd,
          sales,
          expenses,
          bankMovements,
        },
        token
      );

      setExportResult(result);
    } catch (err: any) {
      console.error('Error al exportar a Google Sheets:', err);
      setErrorMessage(
        err.message || 'Ocurrió un error al enviar los datos a Google Sheets. Verifique su conexión.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/15 rounded-xl backdrop-blur-xs">
              <FileSpreadsheet className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Sincronización con Google Sheets</h2>
              <p className="text-xs text-emerald-100">
                Exporta tu reporte mensual, ventas, compras de divisas y conciliación BDV directamente a Google Drive.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Error al conectar con Google Sheets</p>
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Account Status Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {authState.user?.photoURL ? (
                  <img
                    src={authState.user.photoURL}
                    alt="Avatar"
                    className="w-10 h-10 rounded-full border border-slate-300 object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-700 flex items-center justify-center font-bold">
                    <User className="w-5 h-5" />
                  </div>
                )}
                <div>
                  {authState.isAuthenticated ? (
                    <>
                      <div className="flex items-center space-x-1.5">
                        <span className="text-sm font-bold text-slate-800">
                          {authState.user?.displayName || 'Cuenta Google Conectada'}
                        </span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Conectado
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {authState.user?.email || 'cuenta no conectada'}
                      </p>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-bold text-slate-800">Google Workspace no vinculado</span>
                      <p className="text-xs text-slate-500">
                        Inicia sesión con tu cuenta de Google para exportar a tus hojas de cálculo.
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div>
                {authState.isAuthenticated ? (
                  <button
                    onClick={handleSignOut}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-rose-600 border border-slate-200 rounded-lg hover:bg-white transition-colors flex items-center space-x-1"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Desconectar</span>
                  </button>
                ) : (
                  <button
                    onClick={handleSignIn}
                    disabled={isSigningIn}
                    className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center space-x-2 shadow-xs"
                  >
                    {isSigningIn ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Conectando...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>Conectar con Google</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Report Preview Data to Export */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Contenido que se exportará a la Hoja de Cálculo
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[11px] text-slate-500 block">Ventas Facturadas</span>
                <span className="text-sm font-bold text-slate-900">${totalVentasUsd.toFixed(2)}</span>
                <span className="text-[10px] text-slate-400 block">{sales.length} transacciones</span>
              </div>

              <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-xl">
                <span className="text-[11px] text-amber-700 block">Divisas Compradas</span>
                <span className="text-sm font-bold text-amber-900">+${totalUsdRecibidosDivisas.toFixed(2)}</span>
                <span className="text-[10px] text-amber-600 block">-{totalBsGastadosDivisas.toLocaleString('es-VE')} Bs</span>
              </div>

              <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-xl">
                <span className="text-[11px] text-blue-700 block">Positivo Solo Dólares</span>
                <span className="text-sm font-bold text-blue-900">${positivoSoloDolaresUsd.toFixed(2)}</span>
                <span className="text-[10px] text-blue-600 block">USD Netos</span>
              </div>

              <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl">
                <span className="text-[11px] text-emerald-700 block">Saldo Restante Bs</span>
                <span className="text-sm font-bold text-emerald-900">{saldoRestanteBs.toLocaleString('es-VE')} Bs</span>
                <span className="text-[10px] text-emerald-600 block">Descontado divisas</span>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-800">Estructura de Pestañas en el Google Sheet generado:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-600 pl-1">
                <li><strong>Resumen Financiero:</strong> Balances, tasas, ganancia neta, saldo en Bs y saldo en solo dólares.</li>
                <li><strong>Compras de Divisas P2P:</strong> Detalle de compras Binance USDT, Zelle y Efectivo USD con Bs pagados.</li>
                <li><strong>Detalle de Ventas:</strong> Línea por línea con clientes, RIF, número de factura y métodos de pago.</li>
                <li><strong>Gastos Operativos:</strong> Clasificación de alquiler, nóminas, fletes y servicios públicos.</li>
                <li><strong>Conciliación BDV:</strong> Cruce de movimientos de la cuenta Banco de Venezuela.</li>
              </ul>
            </div>
          </div>

          {/* Success Result View */}
          {exportResult && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 space-y-3 animate-in fade-in">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="font-bold text-sm">¡Hoja de cálculo generada exitosamente en Google Drive!</span>
              </div>
              <p className="text-xs text-emerald-800">
                Se ha creado el documento <strong>"{exportResult.title}"</strong> con todas las pestañas financieras actualizadas.
              </p>
              <div className="pt-1">
                <a
                  href={exportResult.spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                >
                  <span>Abrir en Google Sheets</span>
                  <ArrowUpRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-colors"
          >
            Cerrar
          </button>

          <button
            onClick={handleExport}
            disabled={!authState.isAuthenticated || isExporting}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-xs flex items-center space-x-2 transition-all ${
              !authState.isAuthenticated || isExporting
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95'
            }`}
          >
            {isExporting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Exportando a Google Sheets...</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4" />
                <span>Exportar Reporte a Google Sheets</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
