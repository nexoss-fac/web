import React, { useState } from 'react';
import { BellRing, BellOff, LoaderCircle } from 'lucide-react';

function decodeVapidKey(value: string): Uint8Array {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function getExistingSubscription(registration: ServiceWorkerRegistration) {
  return registration.pushManager.getSubscription();
}

export const PushNotificationSettings: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [enabled, setEnabled] = useState(false);

  const activate = async () => {
    setBusy(true);
    setMessage('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        throw new Error('Este navegador no admite notificaciones push web.');
      }
      if (!window.isSecureContext) throw new Error('Las notificaciones requieren HTTPS (o localhost para pruebas).');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('No se concedió permiso para mostrar notificaciones.');

      const keyResponse = await fetch('/api/push/public-key');
      const keyData = await keyResponse.json().catch(() => ({}));
      if (!keyResponse.ok || !keyData.publicKey) throw new Error(keyData.error || 'El servidor aún no está configurado para notificaciones push.');

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      let subscription = await getExistingSubscription(registration);
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(keyData.publicKey),
        });
      }
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.saved) throw new Error(result.error || 'No se pudo registrar el dispositivo.');
      setEnabled(true);
      setMessage('Notificaciones activadas en este dispositivo.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron activar las notificaciones.');
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
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error('No se pudo desactivar el dispositivo en el servidor.');
        await subscription.unsubscribe();
      }
      setEnabled(false);
      setMessage('Notificaciones desactivadas en este dispositivo.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo desactivar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-3 my-2 flex flex-wrap items-center gap-3 rounded-xl border border-indigo-100 bg-white p-3 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
        {enabled ? <BellRing size={20} /> : <BellOff size={20} />}
      </div>
      <div className="min-w-[180px] flex-1">
        <p className="text-sm font-semibold text-slate-900">Notificaciones del administrador</p>
        <p className="text-xs text-slate-500">Ventas y gastos nuevos en este dispositivo.</p>
        {message && <p role="status" className="mt-1 text-xs text-slate-600">{message}</p>}
      </div>
      <button
        type="button"
        onClick={enabled ? deactivate : activate}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy && <LoaderCircle size={16} className="animate-spin" />}
        {busy ? 'Procesando…' : enabled ? 'Desactivar' : 'Activar notificaciones'}
      </button>
    </section>
  );
};
