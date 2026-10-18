import React, { useEffect, useState } from 'react';
import { useStore } from '../../context/StoreContext';
import { MakdLogo } from './MakdLogo';
import {
  User,
  ShieldCheck,
  Building,
  KeyRound,
  X,
  LogOut,
  DollarSign,
} from 'lucide-react';

interface UserWindowModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserWindowModal: React.FC<UserWindowModalProps> = ({ isOpen, onClose }) => {
  const { userRole, currentUser, exchangeRate, logoutSession } = useStore();
  const [companyIdentity, setCompanyIdentity] = useState<{
    legalName?: string; tradeName?: string; address?: string; logoUrl?: string;
    mainBranchName?: string; mainBranchAddress?: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch('/api/company/identity')
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo cargar el perfil de la empresa.');
        return response.json() as Promise<{ company?: typeof companyIdentity }>;
      })
      .then((data) => { if (!cancelled) setCompanyIdentity(data.company || null); })
      .catch(() => { if (!cancelled) setCompanyIdentity(null); });
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;
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
          <div className="grid h-[74px] w-[74px] place-items-center overflow-hidden rounded-xl border border-slate-700/80 bg-white p-2 shadow-lg mb-2">
            {companyIdentity?.logoUrl
              ? <img src={companyIdentity.logoUrl} alt={`Logo de ${companyIdentity.tradeName || companyIdentity.legalName || 'la empresa'}`} className="h-full w-full object-contain" />
              : <MakdLogo size={58} showSlogan={true} />}
          </div>

          <h2 className="text-sm font-bold tracking-tight text-white uppercase">
            Ventana de Perfil & Seguridad
          </h2>
          <p className="text-[11px] text-slate-400">
            {companyIdentity?.tradeName || companyIdentity?.legalName || 'NEXOSS · marcamos tu estilo'}
          </p>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          
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
                  <span className="max-w-[65%] text-right font-semibold text-slate-800">
                    {companyIdentity?.mainBranchName || 'Sede principal'} · {companyIdentity?.mainBranchAddress || companyIdentity?.address || 'Ubicación pendiente'}
                  </span>
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
                    <span>Acceso a la empresa:</span>
                  </span>
                  <span className="font-semibold text-slate-800">Cuenta autenticada y rol asignado</span>
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
          </>

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
