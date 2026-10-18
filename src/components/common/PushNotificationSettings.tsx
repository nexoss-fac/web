import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, BellOff, LoaderCircle, Send } from 'lucide-react';

type Props = { mode?: 'prompt' | 'settings'; companyId?: string };

function decodeVapidKey(value: string): Uint8Array {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export const PushNotificationSettings: React.FC<Props> = ({ mode = 'prompt', companyId = '' }) => {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [checking, setChecking] = useState(true);
  const [databaseVariable, setDatabaseVariable] = useState('MAKD_SHOP_DATABASE_URL');

  const refreshStatus = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch('/api/push/status');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404 && data.error === 'Ruta API no encontrada.') {
          throw new Error('El backend abierto es anterior a esta versión. Reinicia el servidor NEXOSS para cargar la ruta /api/push/status.');
        }
        throw new Error(data.error || 'No se pudo consultar el estado.');
      }
      setEnabled(Boolean(data.active));
      setConfigured(Boolean(data.configured));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo consultar el estado de notificaciones.');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  const activate = async () => {
    setBusy(true);
    setMessage('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        throw new Error('Este navegador no admite notificaciones push web.');
      }
      if (!window.isSecureContext) throw new Error('Las notificaciones requieren HTTPS (o localhost para pruebas).');

      const keyResponse = await fetch('/api/push/public-key');
      const keyData = await keyResponse.json().catch(() => ({}));
      if (!keyResponse.ok || !keyData.publicKey) throw new Error(keyData.error || 'El servidor aún no está configurado para notificaciones push.');
      setConfigured(true);

      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('No se concedió permiso para mostrar notificaciones.');

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(keyData.publicKey) });
      }
      const response = await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.saved) throw new Error(result.error || 'No se pudo registrar el dispositivo.');
      setEnabled(true);
      setMessage('Dispositivo activado. Usa “Enviar prueba” para comprobar la entrega.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron activar las notificaciones.');
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    setBusy(true);
    setMessage('');
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch('/api/push/unsubscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'No se pudo desactivar el dispositivo en el servidor.');
        await subscription.unsubscribe();
      }
      setEnabled(false);
      setMessage('Notificaciones desactivadas en este dispositivo y empresa.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo desactivar.');
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/push/test', { method: 'POST' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.sent) throw new Error(result.error || 'No se pudo entregar la prueba.');
      setMessage('Prueba enviada. Confirma que apareció en este dispositivo.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo enviar la notificación de prueba.');
    } finally {
      setBusy(false);
    }
  };

  const repairCompanyConnection = async () => {
    setBusy(true);
    setMessage('');
    try {
      const variableName = databaseVariable.trim().toUpperCase();
      if (!/^[A-Z][A-Z0-9_]*_DATABASE_URL$/.test(variableName) || ['DATABASE_URL', 'CONTROL_PLANE_DATABASE_URL'].includes(variableName)) {
        throw new Error('Escribe el nombre de la variable Neon configurada en Render, por ejemplo MAKD_SHOP_DATABASE_URL.');
      }
      const response = await fetch(`/api/platform/companies/${companyId}/database`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variableName }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'No se pudo verificar la conexión.');
      setMessage('Conexión de la empresa verificada. Recarga la página para continuar.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo reparar la conexión.');
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'prompt' && (checking || enabled)) return null;

  return (
    <section className={`${mode === 'prompt' ? 'mx-3 my-2' : ''} flex flex-wrap items-center gap-3 rounded-xl border border-indigo-100 bg-white p-3 shadow-sm`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
        {enabled ? <BellRing size={20} /> : <BellOff size={20} />}
      </div>
      <div className="min-w-[180px] flex-1">
        <p className="text-sm font-semibold text-slate-900">Notificaciones de la empresa</p>
        <p className="text-xs text-slate-500">Avisos de ventas y gastos en este dispositivo.</p>
        {!configured && <p role="alert" className="mt-1 text-xs text-amber-700">Falta configurar las claves Web Push en el servidor.</p>}
        {message && <p role="status" className="mt-1 text-xs text-slate-600">{message}</p>}
        {message.toLowerCase().includes('no se pudo resolver la conexión de la empresa') && companyId && <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><label className="text-xs text-slate-600">Variable Neon configurada en Render<input value={databaseVariable} onChange={(event) => setDatabaseVariable(event.target.value.toUpperCase())} placeholder="MAKD_SHOP_DATABASE_URL" className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900"/><span className="mt-1 block">Escribe solo el nombre de la variable, nunca la URL ni la contraseña.</span></label><button type="button" onClick={() => void repairCompanyConnection()} disabled={busy} className="self-end rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Verificar y conectar</button></div>}
      </div>
      {mode === 'settings' && enabled && <button type="button" onClick={() => void sendTest()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-60"><Send size={15} />Enviar prueba</button>}
      <button
        type="button" onClick={() => void (enabled ? deactivate() : activate())} disabled={busy || checking || !configured}
        className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60 ${enabled ? 'border border-slate-300 text-slate-700' : 'bg-indigo-600 text-white'}`}
      >
        {busy && <LoaderCircle size={16} className="animate-spin" />}
        {busy ? 'Procesando…' : enabled ? 'Desactivar en este dispositivo' : 'Activar notificaciones'}
      </button>
    </section>
  );
};
