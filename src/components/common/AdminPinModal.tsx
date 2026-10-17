import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Lock, Delete, X, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';
import { MakdLogo } from './MakdLogo';
import { useStore } from '../../context/StoreContext';

interface AdminPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { verifyAdminPin, adminPin, setAdminPin, userRole } = useStore();
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isChangingPin, setIsChangingPin] = useState<boolean>(false);
  const [currentPinInput, setCurrentPinInput] = useState<string>('');
  const [newPinInput, setNewPinInput] = useState<string>('');
  const [confirmPinInput, setConfirmPinInput] = useState<string>('');
  const [changeSuccess, setChangeSuccess] = useState<string | null>(null);
  const [shake, setShake] = useState<boolean>(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(null);
      setIsChangingPin(false);
      setChangeSuccess(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Handle number input (0-9)
  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError(null);

      if (nextPin.length === 4) {
        verify(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    setPin('');
    setError(null);
  };

  const verify = (enteredPin: string) => {
    if (verifyAdminPin(enteredPin)) {
      onSuccess();
      onClose();
    } else {
      setShake(true);
      setError('PIN incorrecto. Intenta de nuevo.');
      setTimeout(() => {
        setShake(false);
        setPin('');
      }, 600);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen || isChangingPin) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pin, isChangingPin]);

  const handleChangePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyAdminPin(currentPinInput)) {
      setError('El PIN actual es incorrecto.');
      return;
    }
    if (!/^\d{4}$/.test(newPinInput)) {
      setError('El nuevo PIN debe tener exactamente 4 dígitos numéricos.');
      return;
    }
    if (newPinInput !== confirmPinInput) {
      setError('Los nuevos PIN no coinciden.');
      return;
    }

    setAdminPin(newPinInput);
    setChangeSuccess('¡PIN de administrador actualizado exitosamente!');
    setError(null);
    setCurrentPinInput('');
    setNewPinInput('');
    setConfirmPinInput('');
    setTimeout(() => {
      setIsChangingPin(false);
      setChangeSuccess(null);
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
      <div
        className={`bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 shadow-2xl transition-transform ${
          shake ? 'animate-shake' : ''
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">
                {isChangingPin ? 'Cambiar PIN Administrador' : 'Acceso Administrador'}
              </h2>
              <span className="text-[10px] text-slate-500 font-medium">
                NEXOSS • Sede no configurada
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isChangingPin ? (
          <div className="mt-5 space-y-5">
            <div className="text-center">
              <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-2 text-indigo-600">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <p className="text-xs text-slate-600 font-medium">
                Ingresa tu PIN de 4 dígitos para acceder al panel administrativo y reportes
              </p>
            </div>

            {/* Visual 4 PIN Dots */}
            <div className="flex justify-center items-center space-x-4 py-2">
              {[0, 1, 2, 3].map((index) => {
                const filled = pin.length > index;
                return (
                  <div
                    key={index}
                    className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                      filled
                        ? 'bg-indigo-600 border-indigo-600 scale-110 shadow-xs'
                        : 'bg-slate-100 border-slate-300'
                    }`}
                  />
                );
              })}
            </div>

            {/* Hidden Input for Mobile Auto-keyboard */}
            <input
              ref={inputRef}
              type="password"
              maxLength={4}
              value={pin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                if (val.length <= 4) {
                  setPin(val);
                  if (val.length === 4) verify(val);
                }
              }}
              className="opacity-0 pointer-events-none absolute -z-10"
              autoFocus
            />

            {/* Error message */}
            {error && (
              <div className="flex items-center justify-center space-x-1.5 text-xs text-rose-600 bg-rose-50 border border-rose-200 py-1.5 px-3 rounded-lg animate-pulse">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="font-semibold">{error}</span>
              </div>
            )}

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleDigit(num)}
                  className="h-12 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 border border-slate-200 rounded-xl text-lg font-bold text-slate-800 transition-colors flex items-center justify-center cursor-pointer shadow-2xs active:scale-95"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                className="h-12 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 transition-colors flex items-center justify-center cursor-pointer active:scale-95"
              >
                Limpiar
              </button>
              <button
                type="button"
                onClick={() => handleDigit('0')}
                className="h-12 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 border border-slate-200 rounded-xl text-lg font-bold text-slate-800 transition-colors flex items-center justify-center cursor-pointer shadow-2xs active:scale-95"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                className="h-12 bg-slate-50 hover:bg-rose-50 hover:border-rose-200 border border-slate-200 rounded-xl text-slate-600 hover:text-rose-600 transition-colors flex items-center justify-center cursor-pointer active:scale-95"
                title="Borrar dígito"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            {/* Footer info & Change PIN option */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span>PIN predeterminado: <strong className="text-slate-700 font-mono">1234</strong></span>
              <button
                type="button"
                onClick={() => {
                  setIsChangingPin(true);
                  setError(null);
                }}
                className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center space-x-1 cursor-pointer"
              >
                <KeyRound className="w-3 h-3" />
                <span>Cambiar PIN</span>
              </button>
            </div>
          </div>
        ) : (
          /* Form: Cambiar PIN */
          <form onSubmit={handleChangePinSubmit} className="mt-4 space-y-4">
            {error && (
              <div className="flex items-center space-x-1.5 text-xs text-rose-600 bg-rose-50 border border-rose-200 py-2 px-3 rounded-lg">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="font-semibold">{error}</span>
              </div>
            )}

            {changeSuccess && (
              <div className="flex items-center space-x-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 py-2 px-3 rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span className="font-semibold">{changeSuccess}</span>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                PIN Actual
              </label>
              <input
                type="password"
                maxLength={4}
                value={currentPinInput}
                onChange={(e) => setCurrentPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-center text-lg font-mono tracking-widest text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Nuevo PIN (4 dígitos)
              </label>
              <input
                type="password"
                maxLength={4}
                value={newPinInput}
                onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-center text-lg font-mono tracking-widest text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Confirmar Nuevo PIN
              </label>
              <input
                type="password"
                maxLength={4}
                value={confirmPinInput}
                onChange={(e) => setConfirmPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-center text-lg font-mono tracking-widest text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                required
              />
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsChangingPin(false);
                  setError(null);
                }}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition shadow-xs"
              >
                Guardar PIN
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
