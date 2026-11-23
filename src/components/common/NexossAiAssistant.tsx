import React, { useEffect, useRef, useState } from 'react';
import { Bot, X, Send, Sparkles, LoaderCircle, ChevronDown } from 'lucide-react';

type Message = { role: 'user' | 'assistant'; content: string };
type AiStatus = { ready: boolean; provider: string | null; model: string | null; availableProviders: string[] };

export const NexossAiAssistant: React.FC<{ companyName: string; companyId: string }> = ({ companyName, companyId }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch('/api/ai/status').then(async (response) => {
      if (!response.ok) throw new Error('No se pudo consultar la configuración de IA.');
      setStatus(await response.json());
    }).catch((err) => setError(err instanceof Error ? err.message : 'Error de conexión.'));
  }, [open, companyId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    const content = draft.trim();
    if (!content || loading || !companyId) return;
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setDraft('');
    setError('');
    setLoading(true);
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-nexoss-company-name': companyName },
        body: JSON.stringify({ messages: next }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No se pudo obtener respuesta.');
      setMessages((current) => [...current, { role: 'assistant', content: payload.text }]);
      setStatus((current) => current ? { ...current, ready: true, provider: payload.provider, model: payload.model } : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo conectar con NEXOSS AI.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Abrir NEXOSS AI"
        className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-40 h-14 px-4 rounded-full bg-indigo-700 hover:bg-indigo-800 text-white shadow-xl flex items-center gap-2 font-bold">
        <Sparkles className="w-5 h-5" /> <span>NEXOSS AI</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-end sm:p-5 bg-slate-950/25">
          <section className="w-full sm:w-[440px] h-[min(720px,92dvh)] bg-white sm:rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            <header className="bg-slate-950 text-white p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center"><Bot className="w-6 h-6 text-indigo-300" /></div>
              <div className="flex-1 min-w-0"><h2 className="font-black">NEXOSS AI</h2><p className="text-xs text-slate-300 truncate">{companyName} · Asistente de empresa</p></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar asistente" className="p-2 hover:bg-white/10 rounded-lg"><X className="w-5 h-5" /></button>
            </header>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
              {messages.length === 0 && <div className="mt-8 text-center space-y-3"><div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center"><Sparkles className="w-7 h-7 text-indigo-700" /></div><h3 className="font-bold text-slate-900">¿En qué te ayudo?</h3><p className="text-sm text-slate-500">Consulta procesos, prepara fichas de productos o pide ayuda con la gestión de tu empresa.</p><div className="text-xs text-slate-500 bg-white border rounded-xl p-3 text-left">Ejemplo: “Quiero registrar un producto. ¿Qué información necesitas para preparar su ficha?”</div></div>}
              {messages.map((message, index) => <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${message.role === 'user' ? 'bg-indigo-700 text-white rounded-br-md' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md'}`}>{message.content}</div></div>)}
              {loading && <div className="flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="w-4 h-4 animate-spin" /> NEXOSS AI está pensando…</div>}
              {error && <div role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</div>}
              {status && <p className="text-[10px] text-slate-400 text-center">{status.ready ? `Proveedor: ${status.provider} · ${status.model}` : 'Proveedor de IA pendiente de configuración'}</p>}
            </div>
            <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="p-3 border-t border-slate-200 bg-white flex items-end gap-2">
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Escribe a NEXOSS AI…" rows={2} maxLength={4000} className="flex-1 resize-none rounded-xl border border-slate-300 p-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <button type="submit" disabled={!draft.trim() || loading || !companyId} className="h-11 w-11 shrink-0 rounded-xl bg-indigo-700 text-white flex items-center justify-center disabled:opacity-40" aria-label="Enviar mensaje"><Send className="w-4 h-4" /></button>
            </form>
            <div className="px-3 pb-2 text-[10px] text-slate-400 text-center">En esta versión conversa y prepara borradores; no modifica registros.</div>
          </section>
        </div>
      )}
    </>
  );
};
