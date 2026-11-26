import React, { useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, MessageSquare, Plus, Sparkles, Upload, X } from 'lucide-react';
import { ShoeProduct } from '../../types';
import { analyzeShoeWithAi, ShoeAiResult } from '../../services/aiShoeService';

interface AleItem {
  id: string;
  image: string;
  fileName: string;
  result?: ShoeAiResult;
  error?: string;
}

interface AleInventoryAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  products: ShoeProduct[];
  industry: string;
  onReviewProduct: (data: ShoeAiResult, image: string) => void;
}

const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

export const AleInventoryAssistant: React.FC<AleInventoryAssistantProps> = ({
  isOpen, onClose, products, industry, onReviewProduct,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<AleItem[]>([]);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  const duplicateIds = useMemo(() => {
    const found = new Set<string>();
    for (const item of items) {
      if (!item.result) continue;
      const key = normalize([item.result.marca, item.result.modelo || item.result.nombre].join(' '));
      if (!key) continue;
      if (products.some(p => normalize([p.marca, p.nombre].join(' ')) === key)) found.add(item.id);
    }
    return found;
  }, [items, products]);

  if (!isOpen) return null;

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const selected = Array.from(files).filter(file => file.type.startsWith('image/')).slice(0, 8 - items.length);
    selected.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const image = String(reader.result || '');
        if (image.startsWith('data:image/')) {
          setItems(current => [...current, { id: crypto.randomUUID(), image, fileName: file.name }]);
        }
      };
      reader.readAsDataURL(file);
    });
    if (fileRef.current) fileRef.current.value = '';
  };

  const analyze = async () => {
    const pending = items.filter(item => !item.result && !item.error);
    if (!pending.length || busy) return;
    setBusy(true);
    let completed = 0;
    for (const item of pending) {
      setProgress(`Analizando fotografía ${++completed} de ${pending.length}…`);
      try {
        const result = await analyzeShoeWithAi(item.image, instruction, industry || 'comercio general');
        setItems(current => current.map(row => row.id === item.id ? { ...row, result } : row));
      } catch (error) {
        setItems(current => current.map(row => row.id === item.id ? {
          ...row, error: error instanceof Error ? error.message : 'No se pudo analizar esta fotografía.',
        } : row));
      }
    }
    setProgress('');
    setBusy(false);
  };

  const reset = () => {
    if (busy) return;
    setItems([]);
    setInstruction('');
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <section className="bg-white w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <header className="p-5 border-b border-slate-200 flex items-start justify-between gap-4 bg-slate-950 text-white">
          <div>
            <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs uppercase tracking-wider"><Sparkles className="w-4 h-4" /> ALE · Asistente de inventario</div>
            <h2 className="text-xl font-bold mt-1">Describe tu entrada y agrega fotografías</h2>
            <p className="text-slate-300 text-xs mt-1">Reconoce productos de distintas categorías y prepara fichas para revisión.</p>
          </div>
          <button onClick={onClose} disabled={busy} className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-40" aria-label="Cerrar ALE"><X className="w-5 h-5" /></button>
        </header>

        <div className="p-5 overflow-y-auto space-y-5">
          <label className="block">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-2 mb-2"><MessageSquare className="w-4 h-4" /> Instrucción para ALE</span>
            <textarea value={instruction} onChange={e => setInstruction(e.target.value)} rows={3}
              placeholder="Ej.: Son gorras deportivas marca X; agrupa las fotos del mismo modelo. No asumas cantidades, tallas ni precios."
              className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-bold text-sm text-slate-900">Fotografías ({items.length}/8)</h3><p className="text-xs text-slate-500">Puedes cargar varias vistas o productos en un mismo lote.</p></div>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy || items.length >= 8}
              className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-40"><Upload className="w-4 h-4" /> Agregar fotos</button>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => addFiles(e.target.files)} />
          </div>

          {items.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {items.map(item => <div key={item.id} className="rounded-xl border border-slate-200 overflow-hidden">
              <img src={item.image} alt={item.fileName} className="w-full h-28 object-contain bg-slate-50" />
              <div className="p-2">
                <p className="text-[10px] text-slate-600 truncate">{item.fileName}</p>
                {item.result && <p className="text-[10px] text-emerald-700 font-bold mt-1">Analizado</p>}
                {item.error && <p className="text-[10px] text-rose-600 mt-1" title={item.error}>Error de análisis</p>}
                {!busy && <button onClick={() => setItems(current => current.filter(row => row.id !== item.id))} className="text-[10px] text-rose-600 mt-1">Quitar</button>}
              </div>
            </div>)}
          </div>}

          {busy && <div className="rounded-xl bg-indigo-50 p-3 text-indigo-800 text-xs flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{progress}</div>}

          {items.some(item => item.result || item.error) && <div className="space-y-3">
            <div className="flex items-center justify-between"><h3 className="font-bold text-sm">Resultados para revisar</h3><span className="text-xs text-slate-500">{items.filter(i => i.result).length} reconocidos</span></div>
            {items.filter(item => item.result || item.error).map(item => item.result ? <article key={item.id} className="border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row gap-3">
              <img src={item.image} alt="" className="w-full sm:w-24 h-24 object-contain bg-slate-50 rounded-lg" />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-bold text-sm text-slate-900">{item.result.nombre}</h4>
                  {duplicateIds.has(item.id) && <span className="text-[10px] px-2 py-1 rounded-full bg-amber-100 text-amber-800 font-bold">Posible duplicado</span>}
                </div>
                <p className="text-xs text-slate-600 mt-1">{[item.result.marca, item.result.modelo, item.result.categoria, item.result.color, item.result.material].filter(Boolean).join(' · ')}</p>
                <p className="text-xs text-slate-500 mt-1">{item.result.descripcion_comercial}</p>
                <button onClick={() => onReviewProduct(item.result!, item.image)} className="mt-3 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Revisar y completar ficha</button>
              </div>
            </article> : <div key={item.id} className="rounded-lg bg-rose-50 text-rose-700 p-3 text-xs flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{item.error}</div>)}
          </div>}

          <p className="text-[11px] text-slate-500 bg-slate-50 rounded-lg p-3">ALE no registra productos ni modifica existencias. Los precios, costos, cantidades, tallas y demás datos no identificables quedan para que los completes y confirmes en la ficha habitual. La detección de duplicados es orientativa.</p>
        </div>

        <footer className="p-4 border-t border-slate-200 flex flex-wrap justify-between gap-2">
          <button onClick={reset} disabled={busy || !items.length} className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-40">Limpiar lote</button>
          <button onClick={analyze} disabled={busy || !items.some(item => !item.result && !item.error)} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-40"><Sparkles className="w-4 h-4" /> {busy ? 'Analizando…' : 'Analizar con ALE'}</button>
        </footer>
      </section>
    </div>
  );
};
