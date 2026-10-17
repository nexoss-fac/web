import React, { useState } from 'react';
import { AlertCircle, Building2, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { MakdLogo } from '../common/MakdLogo';
import { createEmailAccount, signInWithEmail } from '../../lib/firebase';

export const LoginPage: React.FC = () => {
  const { loginWithGoogleAction, isFirebaseConnected } = useStore();
  const [errorMessage, setErrorMessage] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    setErrorMessage('');
    setIsSigningIn(true);
    try {
      await loginWithGoogleAction();
    } catch (error: any) {
      const code = String(error?.code || '');
      if (code === 'auth/popup-closed-by-user') {
        setErrorMessage('Se cerró la ventana de inicio de sesión antes de completar el acceso.');
      } else if (code === 'auth/unauthorized-domain') {
        setErrorMessage('Agrega este dominio local a los dominios autorizados en Firebase Authentication.');
      } else {
        setErrorMessage('No se pudo iniciar sesión con Firebase. Revisa la configuración local y vuelve a intentarlo.');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleEmailAuth = async (create: boolean) => {
    setErrorMessage(''); setIsSigningIn(true);
    try {
      if (create) {
        await createEmailAccount(email, password);
        setErrorMessage('Cuenta creada. Firebase envió el enlace de verificación al emulador; verifícala y vuelve a entrar antes de registrar la empresa.');
      } else await signInWithEmail(email, password);
    } catch (error: any) {
      setErrorMessage(error?.code === 'auth/email-already-in-use' ? 'Ese correo ya tiene una cuenta. Inicia sesión.' : 'No se pudo completar la autenticación. Revisa el correo y la contraseña.');
    } finally { setIsSigningIn(false); }
  };

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-10 text-slate-100">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 p-7 shadow-2xl">
        <header className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white p-1">
            <MakdLogo size={42} showSlogan={false} />
          </div>
          <div>
            <div className="text-sm font-black uppercase tracking-wide">NEXOSS</div>
            <div className="text-xs text-slate-400">Acceso local con identidad Firebase</div>
          </div>
        </header>

        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-300">
            <Building2 className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-extrabold">Iniciar sesión</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Usa tu cuenta autorizada en el proyecto Firebase configurado para este entorno.
          </p>
        </div>

        {errorMessage && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {!isFirebaseConnected && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
            Firebase no está configurado. Completa las variables <code>VITE_FIREBASE_*</code> en tu archivo local <code>.env</code> y reinicia el servidor.
          </div>
        )}

        <button
          type="button"
          onClick={handleLogin}
          disabled={!isFirebaseConnected || isSigningIn}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 font-bold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSigningIn ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <GoogleMark />}
          <span>{isSigningIn ? 'Conectando…' : 'Continuar con Google'}</span>
        </button>

        <div className="mt-6 border-t border-slate-800 pt-5 text-center">
          <p className="text-sm text-slate-300">¿Es tu primera vez en NEXOSS?</p>
          <p className="mt-1 text-xs text-slate-500">Registra tu empresa y configura tu espacio de trabajo.</p>
          <button type="button" onClick={handleLogin} disabled={!isFirebaseConnected || isSigningIn} className="mt-2 font-semibold text-emerald-400 hover:text-emerald-300 disabled:opacity-50">Crear cuenta empresarial →</button>
        </div>

        <div className="mt-5 space-y-2 border-t border-slate-800 pt-5">
          <label className="block text-xs text-slate-400">Correo electrónico<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"/></label>
          <label className="block text-xs text-slate-400">Contraseña<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"/></label>
          <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => void handleEmailAuth(false)} disabled={!isFirebaseConnected || isSigningIn || !email || !password} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-800 disabled:opacity-50">Entrar con correo</button><button type="button" onClick={() => void handleEmailAuth(true)} disabled={!isFirebaseConnected || isSigningIn || !email || password.length < 6} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold hover:bg-indigo-500 disabled:opacity-50">Crear cuenta y verificar</button></div>
        </div>

        <div className="mt-6 flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs leading-relaxed text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <span>El servidor valida tu identidad y el rol asignado en cada empresa. El perfil de cajera solo permite operar el punto de venta.</span>
        </div>
      </div>
    </main>
  );
};

function GoogleMark() {
  return <span aria-hidden="true" className="text-lg font-black leading-none text-[#4285F4]">G</span>;
}
