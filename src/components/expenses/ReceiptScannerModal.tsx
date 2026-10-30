import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../context/StoreContext';
import { ExpenseCategory, Currency } from '../../types';
import { EXPENSE_CUENTA, EXPENSE_PARTIDA, EXPENSE_SUBACCOUNTS, UNCLASSIFIED_EXPENSE, normalizeExpenseCategory } from '../../domain/expenseChart';
import {
  Camera,
  Upload,
  Sparkles,
  X,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  FileText,
  DollarSign,
  Calendar,
  Building,
  Tag,
  CreditCard,
  Zap,
  Image as ImageIcon,
  Check,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  ListPlus
} from 'lucide-react';

interface ReceiptScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExpenseAdded?: () => void;
}

export const ReceiptScannerModal: React.FC<ReceiptScannerModalProps> = ({
  isOpen,
  onClose,
  onExpenseAdded,
}) => {
  const {
    addExpense,
    accounts,
    exchangeRate,
    historicalRates,
    getExchangeRateForDate,
    setExchangeRateForDate,
    userRole,
  } = useStore();

  // Mode: camera vs file upload
  const [activeTab, setActiveTab] = useState<'camera' | 'upload'>('camera');
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Auto-upload toggle
  const [autoUpload, setAutoUpload] = useState<boolean>(true);

  // Scanning state
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Extracted / editable expense fields
  const todayIso = new Date().toISOString().split('T')[0];
  const [fecha, setFecha] = useState(todayIso);
  const [tasaInput, setTasaInput] = useState<string>(() => exchangeRate.toString());
  const [isCustomTasa, setIsCustomTasa] = useState<boolean>(false);
  const [categoria, setCategoria] = useState<ExpenseCategory>(UNCLASSIFIED_EXPENSE);
  const [descripcion, setDescripcion] = useState('');
  const [beneficiario, setBeneficiario] = useState('');
  const [cuentaOrigen, setCuentaOrigen] = useState(accounts[0]?.nombre || 'Efectivo USD');
  const [moneda, setMoneda] = useState<Currency>('USD');
  const [montoInput, setMontoInput] = useState('');
  const [comprobanteRef, setComprobanteRef] = useState('');
  const [notas, setNotas] = useState('');
  const [detallesDetectados, setDetallesDetectados] = useState('');
  const [confidenceLevel, setConfidenceLevel] = useState<'alta' | 'media' | 'baja'>('alta');

  // Session uploaded batch list
  const [sessionUploads, setSessionUploads] = useState<Array<{
    id: string;
    descripcion: string;
    beneficiario: string;
    monto: number;
    moneda: Currency;
    monto_usd: number;
    categoria: ExpenseCategory;
    foto?: string;
  }>>([]);
  const [justUploadedMessage, setJustUploadedMessage] = useState<string | null>(null);

  // DOM Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);

  // 1. Camera Lifecycle
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const startCamera = async (facing: 'environment' | 'user' = cameraFacing) => {
    stopCamera();
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('La cámara no está disponible o tu navegador requiere permisos.');
      }

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((err) => console.warn('Video play warning:', err));
      }
      setIsCameraActive(true);
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError(err.message || 'No se pudo activar la cámara. Puedes subir la foto o usar la cámara nativa.');
      setIsCameraActive(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'camera' && !capturedImage) {
      startCamera(cameraFacing);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab, capturedImage]);

  // Flip camera
  const toggleCameraFacing = () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextFacing);
    if (isCameraActive) {
      startCamera(nextFacing);
    }
  };

  // Helper: compress image to optimal web size (< 450 KB)
  const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const maxDim = 1400;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } else {
          resolve(base64Str);
        }
      };
      img.onerror = () => resolve(base64Str);
      img.src = base64Str;
    });
  };

  // 2. Take Snapshot from Video
  const handleCaptureFromVideo = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (cameraFacing === 'user') {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, width, height);
      const rawDataUrl = canvas.toDataURL('image/jpeg', 0.88);
      stopCamera();

      const compressed = await compressImage(rawDataUrl);
      setCapturedImage(compressed);
      analyzeInvoice(compressed);
    }
  };

  // 3. Handle File Upload or Native Mobile Camera Capture
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const result = event.target?.result as string;
      if (result) {
        stopCamera();
        const compressed = await compressImage(result);
        setCapturedImage(compressed);
        analyzeInvoice(compressed);
      }
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  // 4. Send photo to Gemini Vision OCR
  const analyzeInvoice = async (imageBase64: string) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setJustUploadedMessage(null);
    // No conservar importes ni datos de un escaneo anterior si este intento falla.
    setMontoInput('');
    setCategoria(UNCLASSIFIED_EXPENSE);
    setDescripcion('');
    setBeneficiario('');
    setComprobanteRef('');
    setNotas('');
    setDetallesDetectados('');
    setConfidenceLevel('baja');

    try {
      const response = await fetch('/api/expenses/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify({
          imageBase64,
          exchangeRate,
          historicalRates,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        let errorMsg = errJson?.error || `Error del servidor (${response.status}) al escanear la factura.`;
        if (errorMsg.includes('503') || errorMsg.includes('high demand') || errorMsg.includes('UNAVAILABLE')) {
          errorMsg = 'Los servidores de IA están saturados temporalmente por alta demanda. Pulsa "Reintentar Escaneo" o completa los datos manualmente con la foto.';
        } else if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
          errorMsg = 'Límite de solicitudes momentáneo. Espera unos segundos y pulsa "Reintentar Escaneo".';
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'No se pudo leer la información de la factura.');
      }

      // Populate extracted state
      const detectedMonto = data.monto > 0 ? String(data.monto) : '';
      const detectedMoneda: Currency = data.moneda === 'Bs' ? 'Bs' : 'USD';
      // Si la IA no reconoce la subcuenta queda "Sin clasificar" y la persona debe elegirla.
      const detectedCat: ExpenseCategory = normalizeExpenseCategory(data.categoria);
      const detectedDesc = data.descripcion || 'Gasto operativo registrado por factura';
      const detectedBenef = data.beneficiario || '';
      const detectedFecha = data.fecha || todayIso;
      const detectedRef = data.comprobante_ref || '';

      const detectedRate = (data.tasa_aplicada && Number(data.tasa_aplicada) > 0)
        ? Number(data.tasa_aplicada)
        : getExchangeRateForDate(detectedFecha);
      setTasaInput(detectedRate.toString());
      setIsCustomTasa(false);

      // Pick matching account
      let bestAccount = accounts[0]?.nombre || 'Efectivo USD';
      const suggestedAcc = (data.cuenta_sugerida || '').toLowerCase();
      const match = accounts.find((a) =>
        (a.nombre || '').toLowerCase().includes(suggestedAcc) ||
        (detectedMoneda === 'Bs' && a.moneda === 'Bs') ||
        (detectedMoneda === 'USD' && a.moneda === 'USD')
      );
      if (match) {
        bestAccount = match.nombre;
      }

      setMontoInput(detectedMonto);
      setMoneda(detectedMoneda);
      setCategoria(detectedCat);
      setDescripcion(detectedDesc);
      setBeneficiario(detectedBenef);
      setFecha(detectedFecha);
      setComprobanteRef(detectedRef);
      setCuentaOrigen(bestAccount);
      setDetallesDetectados(data.detalles_detectados || '');
      setConfidenceLevel(data.confianza || 'alta');

      // 5. AUTO-UPLOAD LOGIC:
      // If auto-upload is checked and we got a valid monto, automatically register!
      if (autoUpload && data.monto > 0 && detectedCat !== UNCLASSIFIED_EXPENSE) {
        await executeDirectUpload({
          montoNum: data.monto,
          monedaVal: detectedMoneda,
          categoriaVal: detectedCat,
          descripcionVal: detectedDesc,
          beneficiarioVal: detectedBenef,
          fechaVal: detectedFecha,
          tasaCambio: detectedRate,
          comprobanteVal: detectedRef,
          cuentaVal: bestAccount,
          fotoFactura: imageBase64,
          detallesVal: data.detalles_detectados || '',
        });
      }
    } catch (err: any) {
      console.error('Invoice analysis error:', err);
      const message = err?.name === 'TimeoutError' || err?.name === 'AbortError'
        ? 'El análisis tardó demasiado y se canceló. La foto sigue disponible: puedes reintentar o completar los datos manualmente.'
        : err?.message === 'Failed to fetch'
          ? 'No se pudo completar la conexión con el servidor de análisis. La foto se conserva; reintenta o completa los datos manualmente.'
          : (err.message || 'Error al procesar la factura con IA.');
      setAnalysisError(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Helper to execute direct upload and keep camera ready for the next one
  const executeDirectUpload = async (params: {
    montoNum: number;
    monedaVal: Currency;
    categoriaVal: ExpenseCategory;
    descripcionVal: string;
    beneficiarioVal: string;
    fechaVal: string;
    tasaCambio?: number;
    comprobanteVal: string;
    cuentaVal: string;
    fotoFactura?: string;
    detallesVal?: string;
  }) => {
    const {
      montoNum,
      monedaVal,
      categoriaVal,
      descripcionVal,
      beneficiarioVal,
      fechaVal,
      tasaCambio,
      comprobanteVal,
      cuentaVal,
      fotoFactura,
      detallesVal,
    } = params;

    const effectiveRate = (tasaCambio && tasaCambio > 0)
      ? tasaCambio
      : (parseFloat(tasaInput) > 0 ? parseFloat(tasaInput) : getExchangeRateForDate(fechaVal));

    let monto_usd = 0;
    let monto_bs = 0;

    if (monedaVal === 'USD') {
      monto_usd = montoNum;
      monto_bs = Number((montoNum * effectiveRate).toFixed(2));
    } else {
      monto_bs = montoNum;
      monto_usd = effectiveRate > 0 ? Number((montoNum / effectiveRate).toFixed(2)) : 0;
    }

    addExpense({
      fecha: fechaVal,
      categoria: categoriaVal,
      descripcion: descripcionVal,
      beneficiario: beneficiarioVal,
      cuenta_origen: cuentaVal,
      moneda: monedaVal,
      monto: montoNum,
      tasa_cambio: effectiveRate,
      monto_usd,
      monto_bs,
      comprobante_ref: comprobanteVal,
      registrado_por: userRole === 'admin' ? 'Administrador' : 'Cajera Turno',
      notas: detallesVal ? `[Escaneado IA]: ${detallesVal}` : 'Escaneado automáticamente con foto',
      foto_factura: fotoFactura,
    });

    setExchangeRateForDate(fechaVal, effectiveRate);

    // Record in current session list
    const newSessionItem = {
      id: `session-${Date.now()}`,
      descripcion: descripcionVal,
      beneficiario: beneficiarioVal || 'Proveedor',
      monto: montoNum,
      moneda: monedaVal,
      monto_usd,
      categoria: categoriaVal,
      foto: fotoFactura,
    };
    setSessionUploads((prev) => [newSessionItem, ...prev]);

    // Flash celebratory banner
    setJustUploadedMessage(
      `¡Gasto subido automáticamente! ${categoriaVal}: ${monedaVal === 'USD' ? `$${montoNum.toFixed(2)}` : `${montoNum.toFixed(2)} Bs`} (${descripcionVal})`
    );

    if (onExpenseAdded) {
      onExpenseAdded();
    }

    // Auto-reset captured image so camera immediately reactivates for next invoice!
    setTimeout(() => {
      setCapturedImage(null);
      setMontoInput('');
      setDescripcion('');
      setBeneficiario('');
      setComprobanteRef('');
      setDetallesDetectados('');
      if (activeTab === 'camera') {
        startCamera(cameraFacing);
      }
    }, 1800);
  };

  // Manual save for review mode
  const handleManualConfirmSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedMonto = parseFloat(montoInput);
    if (!parsedMonto || parsedMonto <= 0) {
      setAnalysisError('Ingresa un monto válido para el gasto.');
      return;
    }
    if (categoria === UNCLASSIFIED_EXPENSE) {
      setAnalysisError('Selecciona la subcuenta de Gastos antes de guardar.');
      return;
    }

    const effectiveTasa = parseFloat(tasaInput) > 0 ? parseFloat(tasaInput) : getExchangeRateForDate(fecha);

    executeDirectUpload({
      montoNum: parsedMonto,
      monedaVal: moneda,
      categoriaVal: categoria,
      descripcionVal: descripcion || 'Gasto operativo registrado por factura',
      beneficiarioVal: beneficiario,
      fechaVal: fecha,
      tasaCambio: effectiveTasa,
      comprobanteVal: comprobanteRef,
      cuentaVal: cuentaOrigen,
      fotoFactura: capturedImage || undefined,
      detallesVal: notas || detallesDetectados,
    });
  };

  // Retake or cancel current photo
  const handleRetake = () => {
    setCapturedImage(null);
    setAnalysisError(null);
    setJustUploadedMessage(null);
    setMontoInput('');
    setDescripcion('');
    setBeneficiario('');
    setComprobanteRef('');
    setDetallesDetectados('');
    if (activeTab === 'camera') {
      startCamera(cameraFacing);
    }
  };

  if (!isOpen) return null;

  const totalSessionUsd = sessionUploads.reduce((acc, curr) => acc + curr.monto_usd, 0);

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-auto">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-900/40">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shadow-inner">
              <Camera className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base">
                  Escáner de Facturas & Gastos con IA
                </h3>
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-indigo-300" />
                  Gemini Vision
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Toma foto a la factura para extraer el monto y subir el gasto automáticamente
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Cerrar escáner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Control Bar: Mode Toggle + Auto-Upload Switch */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Tabs */}
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-white">
            <button
              type="button"
              onClick={() => {
                setActiveTab('camera');
                setCapturedImage(null);
                setAnalysisError(null);
              }}
              className={`px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 transition ${
                activeTab === 'camera'
                  ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Cámara en Vivo</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('upload');
                stopCamera();
                setCapturedImage(null);
                setAnalysisError(null);
              }}
              className={`px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 transition ${
                activeTab === 'upload'
                  ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Subir Archivo / Galería</span>
            </button>
          </div>

          {/* Auto-upload switch */}
          <label className="flex items-center gap-2 cursor-pointer select-none bg-indigo-50/80 hover:bg-indigo-50 border border-indigo-200/80 px-3 py-1 rounded-lg transition">
            <input
              type="checkbox"
              checked={autoUpload}
              onChange={(e) => setAutoUpload(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
            />
            <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-900">
              <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span>Subida Automática Inmediata</span>
            </div>
          </label>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 space-y-4 max-h-[75vh] overflow-y-auto">

          {/* Banner notification when an invoice is auto-uploaded */}
          {justUploadedMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{justUploadedMessage}</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 shrink-0">
                Guardado en Neon
              </span>
            </div>
          )}

          {/* Analysis Error Alert with Quick Actions */}
          {analysisError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs space-y-2.5 animate-in fade-in">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold text-rose-950">Aviso del Escáner: </span>
                  <span>{analysisError}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-rose-100">
                {capturedImage && (
                  <>
                    <button
                      type="button"
                      disabled={isAnalyzing}
                      onClick={() => analyzeInvoice(capturedImage)}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold rounded-lg text-[11px] flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
                      <span>{isAnalyzing ? 'Reintentando...' : 'Reintentar Escaneo con IA'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAnalysisError(null)}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold rounded-lg text-[11px] transition cursor-pointer"
                    >
                      Completar datos manualmente
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={handleRetake}
                  className="text-[11px] font-semibold text-rose-700 hover:text-rose-900 underline px-2 py-1"
                >
                  Tomar otra foto
                </button>
              </div>
            </div>
          )}

          {/* VIEW 1: Camera Active / Ready to take photo */}
          {activeTab === 'camera' && !capturedImage && (
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-4/3 sm:aspect-16/10 flex items-center justify-center border-2 border-slate-800 shadow-inner">
                {isCameraActive ? (
                  <>
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />

                    {/* Viewfinder Receipt Overlay Guide */}
                    <div className="absolute inset-4 sm:inset-8 border-2 border-dashed border-white/60 rounded-xl pointer-events-none flex flex-col justify-between p-3">
                      <div className="flex items-center justify-between text-[11px] text-white/80 font-medium">
                        <span className="bg-black/40 px-2 py-0.5 rounded backdrop-blur-xs">
                          Enfoca la factura o recibo aquí
                        </span>
                        <span className="bg-black/40 px-2 py-0.5 rounded backdrop-blur-xs">
                          Asegura buena luz
                        </span>
                      </div>
                      <div className="text-center text-[10px] text-white/70 bg-black/40 py-1 rounded backdrop-blur-xs mx-auto px-3">
                        Total, fecha y proveedor deben verse nítidos
                      </div>
                    </div>

                    {/* Camera Control Overlay: Flip Button */}
                    <button
                      type="button"
                      onClick={toggleCameraFacing}
                      className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black/80 text-white rounded-full backdrop-blur-xs transition shadow-lg"
                      title="Girar cámara (delantera / trasera)"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <div className="text-center p-6 text-slate-400 space-y-3">
                    <Camera className="w-12 h-12 mx-auto text-slate-600" />
                    <p className="text-xs">
                      {cameraError || 'Iniciando cámara del dispositivo...'}
                    </p>
                    <button
                      type="button"
                      onClick={() => startCamera(cameraFacing)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition"
                    >
                      Reintentar Acceso a Cámara
                    </button>
                  </div>
                )}
              </div>

              {/* Shutter Button Bar */}
              <div className="flex items-center justify-center gap-3 pt-1">
                {isCameraActive && (
                  <button
                    type="button"
                    onClick={handleCaptureFromVideo}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg hover:shadow-indigo-500/25 active:scale-95 transition-all cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Tomar Foto a la Factura</span>
                  </button>
                )}

                {/* Direct Native Camera Mobile Input */}
                <input
                  ref={nativeCameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => nativeCameraInputRef.current?.click()}
                  className="px-3.5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
                  title="Abrir app de cámara del móvil"
                >
                  Cámara Nativa
                </button>
              </div>
            </div>
          )}

          {/* VIEW 2: Upload File Mode */}
          {activeTab === 'upload' && !capturedImage && (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-8 text-center cursor-pointer bg-slate-50 hover:bg-indigo-50/30 transition-all space-y-3"
              >
                <div className="w-12 h-12 mx-auto rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    Selecciona o arrastra la foto de la factura
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Formatos JPG, PNG, WEBP o capturas de pantalla de comprobantes
                  </p>
                </div>
                <button
                  type="button"
                  className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-xs"
                >
                  Explorar Archivos
                </button>
              </div>
            </div>
          )}

          {/* VIEW 3: Processing & Analyzing with Gemini */}
          {isAnalyzing && (
            <div className="p-6 rounded-2xl border border-indigo-100 bg-indigo-50/50 text-center space-y-4 animate-in fade-in">
              <div className="relative w-16 h-16 mx-auto">
                <div className="w-16 h-16 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
                <Sparkles className="w-6 h-6 text-indigo-600 absolute inset-0 m-auto animate-pulse" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900">
                  Analizando Factura con Inteligencia Artificial...
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Extrayendo monto total, moneda, beneficiario, categoría y fecha con Gemini Vision.
                </p>
              </div>
              {capturedImage && (
                <div className="w-32 h-20 mx-auto rounded-lg overflow-hidden border border-slate-200 shadow-xs">
                  <img
                    src={capturedImage}
                    alt="Factura capturada"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          )}

          {/* VIEW 4: Review and Edit Mode (if not auto-uploaded or if user wants to tweak fields) */}
          {capturedImage && !isAnalyzing && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span className="font-bold text-xs text-slate-800">
                    Información Extraída de la Factura
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    confidenceLevel === 'alta'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    Confianza: {confidenceLevel}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRetake}
                  className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Tomar otra foto</span>
                </button>
              </div>

              {/* Form Layout */}
              <form onSubmit={handleManualConfirmSubmit} className="space-y-3 text-xs">
                {/* Photo Thumbnail + Monto Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Photo Preview Thumbnail */}
                  <div className="col-span-1 rounded-xl overflow-hidden border border-slate-200 relative group aspect-4/3 sm:aspect-auto">
                    <img
                      src={capturedImage}
                      alt="Factura"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-[11px] font-semibold">
                      Factura adjunta
                    </div>
                  </div>

                  {/* Monto & Moneda Input */}
                  <div className="col-span-2 p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <label className="block font-semibold text-slate-700">
                      Monto Total Facturado *
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        value={moneda}
                        onChange={(e) => setMoneda(e.target.value as Currency)}
                        className="col-span-1 p-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-800"
                      >
                        <option value="USD">USD ($)</option>
                        <option value="Bs">Bs (Bolívares)</option>
                      </select>

                      <div className="col-span-2 relative">
                        <input
                          type="number"
                          step="0.01"
                          required
                          min="0.01"
                          placeholder="0.00"
                          value={montoInput}
                          onChange={(e) => setMontoInput(e.target.value)}
                          className="w-full text-sm font-bold p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 pl-7"
                        />
                        <span className="absolute left-2.5 top-2.5 text-xs text-slate-400 font-bold">
                          {moneda === 'USD' ? '$' : 'Bs'}
                        </span>
                      </div>
                    </div>

                    {/* Real-time Exchange Equivalence based on invoice date rate */}
                    {parseFloat(montoInput) > 0 && parseFloat(tasaInput) > 0 && (
                      <div className="text-[11px] text-slate-600 bg-white p-1.5 rounded border border-slate-200 flex items-center justify-between">
                        <span>Equivalente ({parseFloat(tasaInput).toFixed(2)} Bs/$ de esa fecha):</span>
                        <span className="font-bold text-indigo-700 font-mono">
                          {moneda === 'USD'
                            ? `${(parseFloat(montoInput) * parseFloat(tasaInput)).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs`
                            : `$${(parseFloat(montoInput) / parseFloat(tasaInput)).toFixed(2)} USD`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tasa de cambio aplicada a la fecha de la factura */}
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
                      Tasa de Cambio ({fecha !== todayIso ? `Día ${fecha}` : 'Hoy'})
                    </span>
                    {fecha !== todayIso ? (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        📅 Factura de fecha anterior: tasa fijada para ese día
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Tasa de hoy
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={tasaInput}
                      onChange={(e) => {
                        setTasaInput(e.target.value);
                        setIsCustomTasa(true);
                      }}
                      className="w-full text-xs font-mono font-bold p-1.5 bg-white border border-slate-300 rounded focus:border-indigo-500"
                      placeholder="Ej: 52.40"
                    />
                    <span className="text-xs text-slate-500 font-mono font-medium">Bs/USD</span>
                    {isCustomTasa && (
                      <button
                        type="button"
                        onClick={() => {
                          const originalRate = getExchangeRateForDate(fecha);
                          setTasaInput(originalRate.toString());
                          setIsCustomTasa(false);
                        }}
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 underline whitespace-nowrap cursor-pointer"
                      >
                        Restaurar
                      </button>
                    )}
                  </div>
                </div>

                {/* Categoría & Fecha */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Subcuenta de {EXPENSE_CUENTA} *
                    </label>
                    <select
                      value={categoria}
                      onChange={(e) => setCategoria(e.target.value as ExpenseCategory)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white"
                    >
                      {categoria === UNCLASSIFIED_EXPENSE && <option value={UNCLASSIFIED_EXPENSE}>Selecciona la subcuenta…</option>}
                      <optgroup label={`${EXPENSE_PARTIDA} › ${EXPENSE_CUENTA}`}>
                        {EXPENSE_SUBACCOUNTS.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Fecha de la Factura *
                    </label>
                    <input
                      type="date"
                      required
                      value={fecha}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        setFecha(newDate);
                        if (!isCustomTasa) {
                          const rateForDate = getExchangeRateForDate(newDate);
                          setTasaInput(rateForDate.toString());
                        }
                      }}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white font-mono"
                    />
                  </div>
                </div>

                {/* Descripción / Concepto */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Descripción o Concepto del Gasto *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Compra de bolsas para zapatos / Pago flete Tealca"
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white"
                  />
                </div>

                {/* Beneficiario / Proveedor & Cuenta de Salida */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Beneficiario / Proveedor
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Envases Plásticos C.A. / Corpoelec"
                      value={beneficiario}
                      onChange={(e) => setBeneficiario(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Cuenta de Pago (Salida de Dinero) *
                    </label>
                    <select
                      value={cuentaOrigen}
                      onChange={(e) => setCuentaOrigen(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white"
                    >
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.nombre}>
                          {acc.nombre} ({acc.moneda})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* N° Comprobante & Notas */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      N° Factura / Control / Ref
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: FAC-9041 / 592819"
                      value={comprobanteRef}
                      onChange={(e) => setComprobanteRef(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Detalles o Notas detectadas
                    </label>
                    <input
                      type="text"
                      placeholder="Observaciones..."
                      value={notas || detallesDetectados}
                      onChange={(e) => setNotas(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-3 flex items-center justify-between border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleRetake}
                    className="px-3.5 py-2 text-slate-600 hover:text-slate-900 transition"
                  >
                    Descartar y tomar otra
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Confirmar y Subir Gasto</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Session Uploads Batch Counter (shows what has been uploaded in this session) */}
          {sessionUploads.length > 0 && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-slate-800">
                <span className="flex items-center gap-1.5">
                  <ListPlus className="w-4 h-4 text-emerald-600" />
                  <span>Facturas subidas en esta sesión ({sessionUploads.length})</span>
                </span>
                <span className="text-emerald-700 font-mono">
                  Total: ${totalSessionUsd.toFixed(2)} USD
                </span>
              </div>
              <div className="max-h-28 overflow-y-auto space-y-1.5 divide-y divide-slate-100">
                {sessionUploads.map((item) => (
                  <div key={item.id} className="pt-1.5 flex items-center justify-between text-[11px]">
                    <span className="text-slate-700 truncate max-w-[260px]">
                      <strong>{item.beneficiario}:</strong> {item.descripcion}
                    </span>
                    <span className="font-mono font-bold text-slate-900 shrink-0">
                      {item.moneda === 'USD' ? `$${item.monto.toFixed(2)}` : `${item.monto.toFixed(2)} Bs`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-100/80 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
          <span>
            {autoUpload ? '⚡ Modo activo: cada foto se analiza y sube automáticamente' : 'Modo manual: revisas antes de subir'}
          </span>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="px-3 py-1 bg-white hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-300 font-semibold transition"
          >
            Listo / Salir
          </button>
        </div>

      </div>
    </div>
  );
};
