import React, { useState } from 'react';
import { useStore } from '../../context/StoreContext';
import { MakdLogo } from './MakdLogo';
import {
  User,
  ShieldCheck,
  Building,
  KeyRound,
  CheckCircle2,
  X,
  LogOut,
  DollarSign,
  AlertCircle
} from 'lucide-react';

interface UserWindowModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserWindowModal: React.FC<UserWindowModalProps> = ({ isOpen, onClose }) => {
  const {
    userRole,
    currentUser,
    exchangeRate,
    adminPin,
    cajeraPin,
    setAdminPin,
    setCajeraPin,
    logoutSession,
  } = useStore();

  // State for Admin configuring PINs
  const [activeTab, setActiveTab] = useState<'info' | 'security'>('info');
  const [newAdminPin, setNewAdminPin] = useState('');
  const [confirmAdminPin, setConfirmAdminPin] = useState('');
  const [newCajeraPin, setNewCajeraPin] = useState('');
  const [confirmCajeraPin, setConfirmCajeraPin] = useState('');
  const [securitySuccessMsg, setSecuritySuccessMsg] = useState('');
  const [securityErrorMsg, setSecurityErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSaveSecurityPins = (e: React.FormEvent) => {
    e.preventDefault();
    setSecuritySuccessMsg('');
    setSecurityErrorMsg('');

    let adminUpdated = false;
    let cajeraUpdated = false;

    // Admin PIN update
    if (newAdminPin || confirmAdminPin) {
      if (newAdminPin.length !== 4 || !/^\d{4}$/.test(newAdminPin)) {
        setSecurityErrorMsg('La nueva clave de Administrador debe tener exactamente 4 dígitos numéricos.');
        return;
      }
      if (newAdminPin !== confirmAdminPin) {
        setSecurityErrorMsg('Las claves de Administrador ingresadas no coinciden.');
        return;
      }
      setAdminPin(newAdminPin);
      adminUpdated = true;
    }

    // Cajera PIN update
    if (newCajeraPin || confirmCajeraPin) {
      if (newCajeraPin.length !== 4 || !/^\d{4}$/.test(newCajeraPin)) {
        setSecurityErrorMsg('La nueva clave de Cajera debe tener exactamente 4 dígitos numéricos.');
        return;
      }
      if (newCajeraPin !== confirmCajeraPin) {
        setSecurityErrorMsg('Las claves de Cajera ingresadas no coinciden.');
        return;
      }
      setCajeraPin(newCajeraPin);
      cajeraUpdated = true;
    }

    if (!adminUpdated && !cajeraUpdated) {
      setSecurityErrorMsg('Ingresa al menos una nueva clave para actualizar.');
      return;
    }

    setNewAdminPin('');
    setConfirmAdminPin('');
    setNewCajeraPin('');
    setConfirmCajeraPin('');
    setSecuritySuccessMsg('¡Claves de seguridad actualizadas con éxito!');
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header with Brand Logo */}
        <div className="bg-slate-900 text-white p-5 relative flex flex-col items-center justify-center text-center border-b border-slate-800 shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-md transition cursor-pointer"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>

          {/* NEXOSS logo */}
          <div className="bg-white p-2 rounded-xl shadow-lg border border-slate-700/80 mb-2">
            <MakdLogo size={58} showSlogan={true} />
          </div>

          <h2 className="text-sm font-bold tracking-tight text-white uppercase">
            Ventana de Perfil & Seguridad
          </h2>
          <p className="text-[11px] text-slate-400">
            NEXOSS • marcamos tu estilo
          </p>
        </div>

        {/* Tab Navigation if Admin */}
        {userRole === 'admin' && (
          <div className="flex border-b border-slate-200 bg-slate-50 text-xs shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('info')}
              className={`flex-1 py-2.5 font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeTab === 'info'
                  ? 'bg-white text-indigo-600 border-b-2 border-indigo-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Perfil de Usuario</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('security')}
              className={`flex-1 py-2.5 font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeTab === 'security'
                  ? 'bg-white text-indigo-600 border-b-2 border-indigo-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Configurar Claves</span>
            </button>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          
          {activeTab === 'security' && userRole === 'admin' ? (
            /* ADMIN SECURITY TAB: Configurar Claves */
            <form onSubmit={handleSaveSecurityPins} className="space-y-4">
              <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-3 text-[11px] text-indigo-900 space-y-1">
                <p className="font-bold flex items-center gap-1 text-indigo-950">
                  <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                  Gestor de Claves de Acceso (4 Dígitos)
                </p>
                <p className="text-indigo-700 leading-relaxed">
                  Como Administrador puedes cambiar tanto tu clave de acceso como la clave asignada a las cajeras para operar el punto de venta.
                </p>
              </div>

              {securitySuccessMsg && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{securitySuccessMsg}</span>
                </div>
              )}

              {securityErrorMsg && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-1.5 font-semibold">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{securityErrorMsg}</span>
                </div>
              )}

              {/* Clave de Administrador */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Cambiar Clave de Administrador
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      Nueva Clave Admin
                    </label>
                    <input
                      type="password"
                      maxLength={4}
                      placeholder="4 dígitos"
                      value={newAdminPin}
                      onChange={(e) => setNewAdminPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full text-xs font-mono p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      Confirmar Clave
                    </label>
                    <input
                      type="password"
                      maxLength={4}
                      placeholder="4 dígitos"
                      value={confirmAdminPin}
                      onChange={(e) => setConfirmAdminPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full text-xs font-mono p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                    />
                  </div>
                </div>
              </div>

              {/* Clave de Cajera */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-indigo-600" />
                  Cambiar Clave de Cajera (POS)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      Nueva Clave Cajera
                    </label>
                    <input
                      type="password"
                      maxLength={4}
                      placeholder="4 dígitos"
                      value={newCajeraPin}
                      onChange={(e) => setNewCajeraPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full text-xs font-mono p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      Confirmar Clave
                    </label>
                    <input
                      type="password"
                      maxLength={4}
                      placeholder="4 dígitos"
                      value={confirmCajeraPin}
                      onChange={(e) => setConfirmCajeraPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full text-xs font-mono p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Guardar Nuevas Claves de Seguridad</span>
              </button>
            </form>
          ) : (
            /* INFO TAB */
            <>
              {/* User ID Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-full font-bold flex items-center justify-center text-sm border shadow-2xs ${
                    userRole === 'admin'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-indigo-100 text-indigo-700 border-indigo-200'
                  }`}>
                    {userRole === 'admin' ? 'AD' : 'CJ'}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {currentUser?.displayName || currentUser?.email || (userRole === 'admin' ? 'Administrador' : 'Cajera de turno')}
                    </h3>
                    <p className="text-[11px] text-slate-500 flex items-center space-x-1">
                      {userRole === 'admin' ? (
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <User className="w-3.5 h-3.5 text-indigo-600" />
                      )}
                      <span className={`font-semibold uppercase ${userRole === 'admin' ? 'text-emerald-700' : 'text-indigo-700'}`}>
                        {userRole === 'admin' ? 'Administrador General' : 'Operador de Ventas'}
                      </span>
                    </p>
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Activa
                </span>
              </div>

              {/* Location & Context */}
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="flex items-center space-x-2 text-slate-500">
                    <Building className="w-3.5 h-3.5 text-slate-400" />
                    <span>Sucursal:</span>
                  </span>
                  <span className="font-semibold text-slate-800">Ubicación no configurada - Sede no configurada (Sede no configurada)</span>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="flex items-center space-x-2 text-slate-500">
                    <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                    <span>Tasa Oficial BCV:</span>
                  </span>
                  <span className="font-bold text-slate-900 font-mono">
                    {exchangeRate.toFixed(2)} Bs/USD
                  </span>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="flex items-center space-x-2 text-slate-500">
                    <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Control de Acceso:</span>
                  </span>
                  <span className="font-semibold text-slate-800">Protegido con Clave Privada</span>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Perfil asignado por la empresa
                </label>
                <p className="text-xs text-slate-600">
                  {userRole === 'admin' ? 'Administrador de la empresa' : 'Operador de ventas'}
                </p>
              </div>

              {/* Botón para Configurar Claves (Visible para Admin) */}
              {userRole === 'admin' && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('security')}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-slate-600" />
                    <span>Configurar Claves de Acceso (Admin / Cajera)</span>
                  </button>
                </div>
              )}
            </>
          )}

          {/* Bottom Actions: Cerrar Sesión & Volver */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                logoutSession();
              }}
              className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar Sesión Completa / Salir al Login</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
            >
              Listo / Continuar en la Tienda
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
