import React, { useState, useEffect, useRef } from 'react';
import {
  DollarSign,
  ArrowRightLeft,
  X,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  TrendingDown,
  TrendingUp,
  Camera,
  Upload,
  Sparkles,
  RotateCw,
  FileText,
  Loader2,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { CurrencyPurchaseMethod } from '../../types';

interface CurrencyPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CurrencyPurchaseModal: React.FC<CurrencyPurchaseModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { addCurrencyPurchase, exchangeRate, accounts } = useStore();
  const [operation, setOperation] = useState<'compra' | 'venta'>('compra');
  const usdAccounts = accounts.filter(a => a.moneda === 'USD');
  const bsAccounts = accounts.filter(a => a.moneda === 'Bs');
  const [usdAccount, setUsdAccount] = useState('');
  const [bsAccount, setBsAccount] = useState('');

  const todayIso = new Date().toISOString().split('T')[0];
  const [fecha, setFecha] = useState(todayIso);
  const [metodo, setMetodo] = useState<CurrencyPurchaseMethod>('Binance P2P (USDT)');
  const [montoBs, setMontoBs] = useState('');
  const [tasaCompra, setTasaCompra] = useState(exchangeRate.toString());
  const [montoUsd, setMontoUsd] = useState('');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [evidenceImage, setEvidenceImage] = useState<string | null>(null);
  const [evidenceName, setEvidenceName] = useState('');
  const [evidenceIsPdf, setEvidenceIsPdf] = useState(false);
  const [isReadingEvidence, setIsReadingEvidence] = useState(false);
  const [evidenceError, setEvidenceError] = useState('');
  const [evidenceDetails, setEvidenceDetails] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const evidenceInputRef = useRef<HTMLInputElement | null>(null);

  const stopEvidenceCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  useEffect(() => {
    if (!isOpen || !cameraOpen) {
      stopEvidenceCamera();
      return;
    }
    let cancelled = false;
    const open = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Este navegador no permite acceder a la cámara. Puedes subir una foto o captura.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        setCameraError('');
        setCameraActive(true);
      } catch (err: any) {
        setCameraError(err?.message || 'No se pudo activar la cámara. Revisa los permisos del navegador.');
        setCameraActive(false);
      }
    };
    void open();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setCameraActive(false);
    };
  }, [isOpen, cameraOpen]);

  useEffect(() => {
    if (!cameraActive || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    video.srcObject = stream;
    const play = async () => {
      try { await video.play(); }
      catch { setCameraError('La cámara se activó, pero no se pudo mostrar el video. Revisa los permisos o vuelve a intentarlo.'); }
    };
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) void play();
    else video.onloadedmetadata = () => { void play(); };
    return () => {
      video.onloadedmetadata = null;
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [cameraActive]);

  const readCurrencyEvidence = async (dataUrl: string) => {
    setIsReadingEvidence(true);
    setEvidenceError('');
    setEvidenceDetails('');
    try {
      const response = await fetch('/api/currency/scan-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(65000),
        body: JSON.stringify({ imageBase64: dataUrl, operation, currentRate: Number(tasaCompra) || 0 }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `No se pudo analizar la evidencia (HTTP ${response.status}).`);
      }

      const bs = Number(data.monto_bs) > 0 ? Number(data.monto_bs) : 0;
      const usd = Number(data.monto_usd) > 0 ? Number(data.monto_usd) : 0;
      const rate = Number(data.tasa) > 0 ? Number(data.tasa) : 0;
      const usableRate = rate || (Number(tasaCompra) > 0 ? Number(tasaCompra) : 0);

      if (bs > 0) setMontoBs(bs.toFixed(2));
      if (usd > 0) setMontoUsd(usd.toFixed(2));
      if (rate > 0) setTasaCompra(rate.toString());
      else if (bs > 0 && usd > 0) setTasaCompra((bs / usd).toFixed(4));
      else if (usableRate > 0 && bs > 0 && !usd) setMontoUsd((bs / usableRate).toFixed(2));
      else if (usableRate > 0 && usd > 0 && !bs) setMontoBs((usd * usableRate).toFixed(2));

      if (data.fecha) setFecha(data.fecha);
      if (data.referencia) setReferencia(data.referencia);
      if (data.metodo) setMetodo(data.metodo as CurrencyPurchaseMethod);
      setEvidenceDetails(data.detalles || 'La IA no encontró detalles adicionales.');
      if (!bs && !usd) {
        setEvidenceError('La IA no pudo identificar un importe con suficiente claridad. Puedes completar los campos manualmente; la evidencia se conserva.');
      }
    } catch (err: any) {
      setEvidenceError(err?.message || 'No se pudo leer la evidencia. Inténtalo de nuevo.');
    } finally {
      setIsReadingEvidence(false);
    }
  };

  const handleEvidenceFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setEvidenceError('Formato no compatible. Selecciona JPG, PNG, WEBP o PDF.');
      event.target.value = '';
      return;
    }
    if (file.size > 18 * 1024 * 1024) {
      setEvidenceError('El archivo supera 18 MB. Reduce su tamaño e inténtalo de nuevo.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) return;
      setEvidenceImage(result);
      setEvidenceName(file.name);
      setEvidenceIsPdf(isPdf);
      setCameraOpen(false);
      await readCurrencyEvidence(result);
    };
    reader.onerror = () => setEvidenceError('No se pudo abrir el archivo seleccionado.');
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const captureCurrencyEvidence = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      setCameraError('La cámara todavía está iniciando. Espera un momento.');
      return;
    }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL('image/jpeg', 0.86);
    setEvidenceImage(imageData);
    setEvidenceName('Captura de cámara');
    setEvidenceIsPdf(false);
    setCameraOpen(false);
    stopEvidenceCamera();
    await readCurrencyEvidence(imageData);
  };


  // Update calculated USD when Bs or Rate changes
  const handleBsChange = (val: string) => {
    setMontoBs(val);
    const bsNum = parseFloat(val);
    const tasaNum = parseFloat(tasaCompra);
    if (!isNaN(bsNum) && !isNaN(tasaNum) && tasaNum > 0) {
      setMontoUsd((bsNum / tasaNum).toFixed(2));
    } else {
      setMontoUsd('');
    }
  };

  const handleTasaChange = (val: string) => {
    setTasaCompra(val);
    const bsNum = parseFloat(montoBs);
    const tasaNum = parseFloat(val);
    if (!isNaN(bsNum) && !isNaN(tasaNum) && tasaNum > 0) {
      setMontoUsd((bsNum / tasaNum).toFixed(2));
    }
  };

  const handleUsdChange = (val: string) => {
    setMontoUsd(val);
    const usdNum = parseFloat(val);
    const tasaNum = parseFloat(tasaCompra);
    if (!isNaN(usdNum) && !isNaN(tasaNum) && tasaNum > 0) {
      setMontoBs((usdNum * tasaNum).toFixed(2));
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const bsNum = parseFloat(montoBs);
    const tasaNum = parseFloat(tasaCompra);
    const usdNum = parseFloat(montoUsd);

    if (isNaN(bsNum) || bsNum <= 0) {
      setError('Por favor ingrese una cantidad válida en Bolívares.');
      return;
    }

    if (isNaN(tasaNum) || tasaNum <= 0) {
      setError('Por favor especifique una tasa de cambio válida.');
      return;
    }

    if (isNaN(usdNum) || usdNum <= 0) {
      setError('El monto en dólares resultante debe ser mayor a cero.');
      return;
    }

    if (operation === 'venta') {
      const source = usdAccounts.find(a => a.nombre === usdAccount);
      const target = bsAccounts.find(a => a.nombre === bsAccount);
      if (!source || !target) { setError('Selecciona las cuentas de origen USD y destino Bs.'); return; }
      if (source.saldo < usdNum) { setError('El saldo disponible en ' + source.nombre + ' es insuficiente.'); return; }
    }
    addCurrencyPurchase({
      fecha, metodo,
      monto_bs_gastado: operation === 'compra' ? Number(bsNum.toFixed(2)) : 0,
      tasa_compra: Number(tasaNum.toFixed(4)),
      monto_usd_recibido: operation === 'compra' ? Number(usdNum.toFixed(2)) : 0,
      tipo_operacion: operation,
      cuenta_origen: operation === 'venta' ? usdAccount : undefined,
      cuenta_destino: operation === 'venta' ? bsAccount : undefined,
      monto_bs_resultante: operation === 'venta' ? Number(bsNum.toFixed(2)) : undefined,
      monto_usd_entregado: operation === 'venta' ? Number(usdNum.toFixed(2)) : undefined,
      referencia: referencia.trim() || undefined,
      usuario: 'Administrador',
      notas: notas.trim() || undefined,
    });

    // Reset
    setMontoBs('');
    setMontoUsd('');
    setReferencia('');
    setNotas('');
    onClose();
  };

  const calculatedBs = parseFloat(montoBs) || 0;
  const calculatedUsd = parseFloat(montoUsd) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/15 rounded-xl backdrop-blur-xs">
              <ArrowRightLeft className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">{operation === 'compra' ? 'Comprar divisas' : 'Vender divisas'}</h2>
              <p className="text-xs text-blue-200">{operation === 'compra' ? 'Entrega bolívares y recibe dólares en tu cuenta.' : 'Entrega dólares y recibe bolívares en la cuenta seleccionada.'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <section className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-indigo-950 flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> Lector inteligente de divisas</p>
                <p className="text-[10px] text-slate-600">Lee comprobantes P2P, transferencias o billetes en efectivo.</p>
              </div>
              {isReadingEvidence && <span className="text-[10px] text-indigo-700 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analizando</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { setEvidenceError(''); setCameraOpen(v => !v); }} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700">
                <Camera className="w-4 h-4" /> {cameraOpen ? 'Cerrar cámara' : 'Tomar foto'}
              </button>
              <button type="button" onClick={() => evidenceInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-50">
                <Upload className="w-4 h-4" /> Subir capture / archivo
              </button>
              {evidenceImage && (
                <button type="button" onClick={() => { setEvidenceImage(null); setEvidenceName(''); setEvidenceDetails(''); setEvidenceError(''); }} className="rounded-lg px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-white">Quitar evidencia</button>
              )}
            </div>
            <input ref={evidenceInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" className="hidden" onChange={handleEvidenceFile} />
            {cameraOpen && (
              <div className="space-y-2">
                <div className="relative overflow-hidden rounded-xl bg-slate-950 aspect-video flex items-center justify-center">
                  {cameraActive ? <video ref={videoRef} playsInline muted className="h-full w-full object-contain" /> : <p className="p-4 text-center text-xs text-slate-300">{cameraError || 'Activando cámara…'}</p>}
                </div>
                {cameraError && <p className="text-xs text-rose-700">{cameraError}</p>}
                <div className="flex gap-2">
                  <button type="button" disabled={!cameraActive} onClick={captureCurrencyEvidence} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><Camera className="mr-1 inline h-4 w-4" /> Capturar y analizar</button>
                  <button type="button" onClick={() => setCameraOpen(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Cancelar</button>
                </div>
              </div>
            )}
            {evidenceImage && (
              <div className="flex items-center gap-3 rounded-lg border border-indigo-100 bg-white p-2">
                {evidenceIsPdf ? <FileText className="h-9 w-9 shrink-0 text-rose-600" /> : <img src={evidenceImage} alt="Evidencia de operación" className="h-14 w-16 rounded object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-800">{evidenceName}</p>
                  <p className="text-[10px] text-slate-500">{isReadingEvidence ? 'La IA está leyendo la evidencia…' : 'Evidencia adjunta; revisa los datos extraídos.'}</p>
                </div>
                {!isReadingEvidence && <button type="button" onClick={() => evidenceImage && readCurrencyEvidence(evidenceImage)} className="text-xs font-bold text-indigo-700">Reintentar</button>}
              </div>
            )}
            {evidenceError && <p className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{evidenceError}</p>}
            {evidenceDetails && <p className="rounded-lg bg-white/80 p-2 text-[11px] leading-relaxed text-slate-600"><strong>Lectura IA:</strong> {evidenceDetails}</p>}
            <p className="text-[10px] text-slate-500">La IA solo propone datos. Verifica montos, denominaciones y tasa antes de registrar; nunca contabiliza automáticamente.</p>
          </section>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button type="button" onClick={() => { setOperation('compra'); setError(''); }} className={`rounded-lg px-3 py-2 text-sm font-bold ${operation === 'compra' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>Comprar USD</button>
            <button type="button" onClick={() => { setOperation('venta'); setError(''); }} className={`rounded-lg px-3 py-2 text-sm font-bold ${operation === 'venta' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>Vender USD</button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {operation === 'compra' ? 'Destino de divisa' : 'Canal de venta'}
              </label>
              <select
                value={metodo}
                onChange={(e) => setMetodo(e.target.value as CurrencyPurchaseMethod)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden font-medium"
              >
                <option value="Binance P2P (USDT)">Binance P2P (USDT)</option>
                <option value="Zelle">Zelle</option>
                <option value="Dólares Efectivo">Dólares Efectivo (Caja)</option>
                <option value="Transferencia USD">Transferencia USD</option>
              </select>
            </div>
          </div>

          {operation === 'venta' && <div className="grid grid-cols-2 gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div><label className="mb-1 block text-xs font-semibold text-slate-700">Cuenta de origen (USD)</label><select required value={usdAccount} onChange={e => setUsdAccount(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs"><option value="">Seleccionar cuenta USD</option>{usdAccounts.map(a => <option key={a.id} value={a.nombre}>{a.nombre} · ${a.saldo.toFixed(2)}</option>)}</select></div>
            <div><label className="mb-1 block text-xs font-semibold text-slate-700">Cuenta destino (Bs)</label><select required value={bsAccount} onChange={e => setBsAccount(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs"><option value="">Seleccionar cuenta Bs</option>{bsAccounts.map(a => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}</select></div>
          </div>}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {operation === 'compra' ? 'Bolívares entregados (Bs.)' : 'Bolívares recibidos (Bs.)'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">Bs.</span>
                  <input
                    type="number"
                    step="any"
                    value={montoBs}
                    onChange={(e) => handleBsChange(e.target.value)}
                    placeholder="Ej. 15000"
                    className="w-full text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    required
                  />
                </div>
                <span className="text-[10px] text-slate-500">{operation === 'compra' ? 'Se descuenta de la cuenta en Bs' : 'Se acredita a la cuenta en Bs'}</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {operation === 'compra' ? 'Tasa de Compra (Bs/$)' : 'Tasa de Venta (Bs/$)'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">Bs.</span>
                  <input
                    type="number"
                    step="any"
                    value={tasaCompra}
                    onChange={(e) => handleTasaChange(e.target.value)}
                    placeholder="Ej. 69.50"
                    className="w-full text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    required
                  />
                </div>
                <span className="text-[10px] text-slate-500">Tasa acordada o P2P</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Dólares Netos Recibidos ($ USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">$</span>
                <input
                  type="number"
                  step="any"
                  value={montoUsd}
                  onChange={(e) => handleUsdChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full text-xs pl-7 pr-3 py-2 border border-blue-400 rounded-lg font-black text-blue-900 bg-blue-50/40 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  required
                />
              </div>
              <span className="text-[10px] text-blue-700 font-medium">{operation === 'compra' ? 'Se acredita a la cuenta en USD' : 'Se descuenta de la cuenta en USD'}</span>
            </div>
          </div>

          {/* Visual Accounting Impact */}
          {calculatedBs > 0 && calculatedUsd > 0 && (
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1 text-xs">
              <span className="font-bold text-emerald-900 block flex items-center">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                Impacto en el Arqueo de Fin de Mes:
              </span>
              <p className="text-slate-700">
                • <strong className="text-rose-700">-{calculatedBs.toLocaleString('es-VE')} Bs</strong> se restan del total de ingresos en Bolívares.
              </p>
              <p className="text-slate-700">
                • <strong className="text-emerald-700">+${calculatedUsd.toFixed(2)} USD</strong> se suman a tu balance positivo en solo dólares ({metodo}).
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Referencia / Orden P2P / N° Comprobante (Opcional)
            </label>
            <input
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Ej. BIN-992148 o ZLL-4412"
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Notas / Observaciones (Opcional)
            </label>
            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej. Compra para pago de importación de zapatos"
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-all active:scale-95"
            >
              {operation === 'compra' ? 'Registrar compra de USD' : 'Registrar venta de USD'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
