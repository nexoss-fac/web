import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Webhook,
  Send,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Zap,
  Clock,
  Layers,
  FileCode,
  ShieldCheck,
  Server
} from 'lucide-react';
import { ShoeProduct } from '../../types';
import {
  DEFAULT_WEBHOOK_URL,
  DEFAULT_APPLET_ID,
  getWebhookSettings,
  saveWebhookSettings,
  getLastWebhookLog,
  sendInventoryWebhook,
  buildWebhookPayload,
  WebhookSyncResult,
} from '../../services/inventoryWebhookService';

interface InventoryWebhookModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ShoeProduct[];
}

export const InventoryWebhookModal: React.FC<InventoryWebhookModalProps> = ({
  isOpen,
  onClose,
  products,
}) => {
  const [webhookUrl, setWebhookUrl] = useState(DEFAULT_WEBHOOK_URL);
  const [appletId, setAppletId] = useState(DEFAULT_APPLET_ID);
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [lastResult, setLastResult] = useState<WebhookSyncResult | null>(null);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'payload'>('config');

  useEffect(() => {
    if (isOpen) {
      const settings = getWebhookSettings();
      setWebhookUrl(settings.url);
      setAppletId(settings.appletId || DEFAULT_APPLET_ID);
      setIsAutoSyncEnabled(settings.enabled);
      setLastResult(getLastWebhookLog());
    }
  }, [isOpen]);

  const previewPayload = useMemo(() => {
    return buildWebhookPayload(products, appletId);
  }, [products, appletId]);

  const jsonString = useMemo(() => {
    return JSON.stringify(previewPayload, null, 2);
  }, [previewPayload]);

  if (!isOpen) return null;

  const handleSaveSettings = (newEnabled?: boolean) => {
    const updated = saveWebhookSettings({
      url: webhookUrl.trim(),
      appletId: appletId.trim() || DEFAULT_APPLET_ID,
      enabled: newEnabled !== undefined ? newEnabled : isAutoSyncEnabled,
    });
    setWebhookUrl(updated.url);
    setAppletId(updated.appletId);
    setIsAutoSyncEnabled(updated.enabled);
  };

  const handleResetDefaults = () => {
    setWebhookUrl('');
    setAppletId(DEFAULT_APPLET_ID);
    saveWebhookSettings({
      url: '',
      appletId: DEFAULT_APPLET_ID,
    });
  };

  const handleSendNow = async () => {
    setIsSending(true);
    handleSaveSettings();
    try {
      const result = await sendInventoryWebhook(products, {
        force: true,
        url: webhookUrl.trim(),
        appletId: appletId.trim() || DEFAULT_APPLET_ID,
      });
      setLastResult(result);
    } catch (err: any) {
      setLastResult({
        success: false,
        timestamp: new Date().toISOString(),
        productsCount: previewPayload.products.length,
        error: err?.message || 'Error al enviar webhook',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(jsonString);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-6">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-linear-to-r from-slate-900 via-indigo-950/50 to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Webhook className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Sincronización Webhook de Inventario
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Activo
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Envío automático de POST con catálogo y tallas al registrar ventas o existencias
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subtabs Header */}
        <div className="px-6 pt-3 bg-slate-900/60 border-b border-slate-800 flex items-center gap-2">
          <button
            onClick={() => setActiveTab('config')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition flex items-center gap-1.5 cursor-pointer border-b-2 ${
              activeTab === 'config'
                ? 'text-indigo-400 border-indigo-500 bg-slate-800/60'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Configuración y Envío</span>
          </button>
          <button
            onClick={() => setActiveTab('payload')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition flex items-center gap-1.5 cursor-pointer border-b-2 ${
              activeTab === 'payload'
                ? 'text-indigo-400 border-indigo-500 bg-slate-800/60'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Ver Payload JSON ({previewPayload.products.length} modelos)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[72vh] overflow-y-auto">
          {activeTab === 'config' ? (
            <>
              {/* Resumen Métricas */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-800/50 border border-slate-700/60 rounded-xl">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Modelos Únicos</span>
                  </div>
                  <div className="text-xl font-black text-white">
                    {previewPayload.products.length}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Agrupados con tallas
                  </div>
                </div>

                <div className="p-3 bg-slate-800/50 border border-slate-700/60 rounded-xl">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Total Pares Físicos</span>
                  </div>
                  <div className="text-xl font-black text-amber-300">
                    {previewPayload.products.reduce((s, p) => s + p.stock, 0)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    En stock disponible
                  </div>
                </div>

                <div className="p-3 bg-slate-800/50 border border-slate-700/60 rounded-xl">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Estado Sincronización</span>
                  </div>
                  <div className="text-sm font-bold text-emerald-300 flex items-center gap-1.5 mt-1">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Enlace Preparado</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {isAutoSyncEnabled ? 'Automático en ventas/stock' : 'Manual'}
                  </div>
                </div>
              </div>

              {/* URL Webhook Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <span>Dirección Webhook (POST Endpoint)</span>
                    <span className="text-rose-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleResetDefaults}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restaurar URL Predeterminada</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://.../api/inventory/webhook"
                    className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition"
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Las ventas y entradas de calzado enviarán el inventario a esta URL automáticamente.
                </p>
              </div>

              {/* Applet ID */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200">
                  Applet ID Identificador
                </label>
                <input
                  type="text"
                  value={appletId}
                  onChange={(e) => setAppletId(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-slate-300 font-mono focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              {/* Automatic Sync Switch */}
              <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-xl flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Envío Automático en Ventas y Stock</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Disparar una llamada HTTP POST cada vez que se registre una venta o cambie el inventario
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAutoSyncEnabled}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setIsAutoSyncEnabled(val);
                      handleSaveSettings(val);
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Last execution result */}
              {lastResult && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex items-start gap-3 ${
                    lastResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  }`}
                >
                  {lastResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1 flex-1">
                    <div className="font-bold flex items-center justify-between">
                      <span>
                        {lastResult.success ? 'Envío Exitoso' : 'Aviso de Envío'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(lastResult.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-[11px] opacity-90">
                      {lastResult.message || lastResult.error || 'Webhook procesado.'}
                    </p>
                    {lastResult.statusCode && (
                      <div className="text-[10px] opacity-75 font-mono">
                        Código HTTP: {lastResult.statusCode} | {lastResult.productsCount} modelos sincronizados
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Payload Preview Tab */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-slate-300">
                  Estructura JSON generada según la especificación:
                </div>
                <button
                  type="button"
                  onClick={handleCopyPayload}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
                >
                  {copiedPayload ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">¡Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar JSON</span>
                    </>
                  )}
                </button>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-x-auto max-h-96 text-[11px] font-mono text-emerald-300">
                <pre>{jsonString}</pre>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition cursor-pointer"
          >
            Cerrar
          </button>

          <button
            type="button"
            onClick={handleSendNow}
            disabled={isSending}
            className="px-5 py-2 bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:opacity-90 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition cursor-pointer"
          >
            {isSending ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Enviando Webhook...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Enviar Webhook Ahora</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
