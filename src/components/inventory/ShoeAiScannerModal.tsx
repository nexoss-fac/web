import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Upload,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Copy,
  Plus,
  X,
  ExternalLink,
  Tag,
  Layers,
  ShoppingBag,
  Sliders,
  MessageCircle,
  Instagram,
  Eye,
  Search,
  Download,
  Wand2,
  Image as ImageIcon
} from 'lucide-react';
import { analyzeShoeWithAi, ShoeAiResult } from '../../services/aiShoeService';
import { useStore } from '../../context/StoreContext';
import { ShoeProduct } from '../../types';
import {
  compressImageFile,
  compressImageDataUrl,
  formatFileSize,
  CompressionResult,
} from '../../utils/imageCompressor';
import {
  removeBackgroundToWhite,
  createInstagramPostImage,
  downloadImage,
} from '../../utils/backgroundRemover';
import { downloadSocialCard } from '../../utils/socialCardGenerator';

interface ShoeAiScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectForProduct?: (aiData: ShoeAiResult, image: string) => void;
}

export const ShoeAiScannerModal: React.FC<ShoeAiScannerModalProps> = ({
  isOpen,
  onClose,
  onSelectForProduct,
}) => {
  const { products, exchangeRate } = useStore();

  const [mode, setMode] = useState<'camera' | 'upload'>('camera');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [userHint, setUserHint] = useState('');

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionInfo, setCompressionInfo] = useState<CompressionResult | null>(null);
  const [aiResult, setAiResult] = useState<ShoeAiResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Background removal & White background state
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [whiteBgImage, setWhiteBgImage] = useState<string | null>(null);
  const [activeImageMode, setActiveImageMode] = useState<'white' | 'original'>('white');
  const [isProcessingWhiteBg, setIsProcessingWhiteBg] = useState(false);
  const [isDownloadingPost, setIsDownloadingPost] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Automatic white studio background conversion
  const processWhiteBackground = async (rawUrl: string) => {
    setIsProcessingWhiteBg(true);
    try {
      const whiteResult = await removeBackgroundToWhite(rawUrl);
      setWhiteBgImage(whiteResult);
      setCapturedImage(whiteResult);
      setActiveImageMode('white');
    } catch (err) {
      console.warn('Could not auto-apply white background:', err);
    } finally {
      setIsProcessingWhiteBg(false);
    }
  };

  const toggleImageMode = (m: 'white' | 'original') => {
    setActiveImageMode(m);
    if (m === 'white' && whiteBgImage) {
      setCapturedImage(whiteBgImage);
    } else if (m === 'original' && originalImage) {
      setCapturedImage(originalImage);
    }
  };

  const handleDownloadWhiteBgPhoto = () => {
    const target = whiteBgImage || capturedImage;
    if (!target) return;
    const nameSlug = (aiResult?.nombre || 'calzado-nexoss')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    downloadImage(target, `${nameSlug}-fondo-blanco.jpg`);
  };

  const handleDownloadInstagramPost = async () => {
    const target = whiteBgImage || capturedImage;
    if (!target) return;
    setIsDownloadingPost(true);
    try {
      await downloadSocialCard(
        {
          nombre: aiResult?.nombre || 'Calzado Deportivo',
          marca: aiResult?.marca,
          precio: aiResult?.precio_sugerido_usd || 0,
          talla: aiResult?.tallas_sugeridas ? aiResult.tallas_sugeridas.join(', ') : '37',
          imagen: target,
        },
        exchangeRate,
        'square'
      );
    } catch (err) {
      console.error('Error generating Instagram post:', err);
      handleDownloadWhiteBgPhoto();
    } finally {
      setIsDownloadingPost(false);
    }
  };

  // Stop camera cleanly
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  // Start camera
  const startCamera = async (facing: 'environment' | 'user' = cameraFacing) => {
    stopCamera();
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('La cámara no está soportada o no tiene permisos en este navegador.');
      }

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1440, min: 720 },
            aspectRatio: { ideal: 4 / 3 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: false,
        });
      } catch (e) {
        // Fallback to any video device
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;
      try {
        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as any;
        const advanced: any[] = [];
        if (caps?.focusMode?.includes?.('continuous')) advanced.push({ focusMode: 'continuous' });
        if (caps?.exposureMode?.includes?.('continuous')) advanced.push({ exposureMode: 'continuous' });
        if (advanced.length) await track.applyConstraints({ advanced });
      } catch {}
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((err) => console.warn('Video play warning:', err));
      }
      setIsCameraActive(true);
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError(err.message || 'No se pudo acceder a la cámara. Revisa los permisos.');
      setIsCameraActive(false);
    }
  };

  // Manage camera on modal open/close
  useEffect(() => {
    if (isOpen && mode === 'camera' && !capturedImage) {
      startCamera(cameraFacing);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, mode, capturedImage]);

  // Capture frame from video with automatic image compression
  const capturePhoto = async () => {
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
      const rawDataUrl = canvas.toDataURL('image/jpeg', 0.94);
      stopCamera();

      // Compress to optimal web weight (< 500 KB)
      setIsCompressing(true);
      try {
        const compressed = await compressImageDataUrl(rawDataUrl, {
          maxDimension: 1600,
          quality: 0.88,
          maxSizeBytes: 500 * 1024,
        });
        setOriginalImage(compressed.dataUrl);
        setCapturedImage(compressed.dataUrl);
        setCompressionInfo(compressed);
        processWhiteBackground(compressed.dataUrl);
        runAnalysis(compressed.dataUrl);
      } catch (err) {
        console.warn('Compression error on photo capture:', err);
        setOriginalImage(rawDataUrl);
        setCapturedImage(rawDataUrl);
        processWhiteBackground(rawDataUrl);
        runAnalysis(rawDataUrl);
      } finally {
        setIsCompressing(false);
      }
    }
  };

  // Handle image upload from file with automatic compression to < 500 KB
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona una imagen válida (JPG, PNG, WebP).');
      return;
    }

    setIsCompressing(true);
    try {
      const compressed = await compressImageFile(file, {
        maxDimension: 1280,
        quality: 0.82,
        maxSizeBytes: 500 * 1024,
      });
      setOriginalImage(compressed.dataUrl);
      setCapturedImage(compressed.dataUrl);
      setCompressionInfo(compressed);
      processWhiteBackground(compressed.dataUrl);
      runAnalysis(compressed.dataUrl);
    } catch (err) {
      console.error('Error comprimiendo imagen subida:', err);
      // Fallback
      const reader = new FileReader();
      reader.onload = (event) => {
        if (typeof event.target?.result === 'string') {
          const dataUrl = event.target.result;
          setOriginalImage(dataUrl);
          setCapturedImage(dataUrl);
          processWhiteBackground(dataUrl);
          runAnalysis(dataUrl);
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setIsCompressing(false);
    }
  };

  // Trigger Gemini AI analysis
  const runAnalysis = async (imgData: string) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAiResult(null);

    try {
      const res = await analyzeShoeWithAi(imgData, userHint);
      setAiResult(res);
    } catch (err: any) {
      console.error('Shoe AI Error:', err);
      setAnalysisError(err.message || 'Error al comunicarse con el modelo de IA Gemini.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetAll = () => {
    setCapturedImage(null);
    setOriginalImage(null);
    setWhiteBgImage(null);
    setActiveImageMode('white');
    setIsProcessingWhiteBg(false);
    setCompressionInfo(null);
    setIsCompressing(false);
    setAiResult(null);
    setAnalysisError(null);
    if (mode === 'camera') {
      startCamera(cameraFacing);
    }
  };

  const copyToClipboard = (text: string, fieldKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 2500);
  };

  // Find similar shoes in stock
  const matchingStock = React.useMemo(() => {
    if (!aiResult) return [];
    const brandLower = (aiResult.marca || '').toLowerCase();
    const modelLower = (aiResult.modelo || '').toLowerCase();
    const nameLower = (aiResult.nombre || '').toLowerCase();

    return products.filter((p) => {
      const pBrand = (p.marca || '').toLowerCase();
      const pName = (p.nombre || '').toLowerCase();
      return (
        (brandLower && pBrand.includes(brandLower)) ||
        (modelLower && pName.includes(modelLower)) ||
        (nameLower && pName.includes(nameLower))
      );
    });
  }, [aiResult, products]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[95vh]">
        
        {/* Modal Header */}
        <div className="p-4 sm:px-6 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-indigo-500 via-purple-600 to-pink-500 p-0.5 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-white uppercase">
                  Cámara IA • Escáner de Calzado
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full">
                  Gemini Vision
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Apunta al zapato o sube una foto para identificar marca, modelo, silueta y crear descripciones comerciales.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* Main Area: Capture / Image + AI Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: Camera / Image viewport (5 cols) */}
            <div className="lg:col-span-5 flex flex-col space-y-3">
              
              {/* Mode Selector */}
              {!capturedImage && (
                <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('camera');
                      startCamera(cameraFacing);
                    }}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                      mode === 'camera' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Camera className="w-4 h-4" />
                    <span>Cámara en Vivo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('upload');
                      stopCamera();
                      fileInputRef.current?.click();
                    }}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                      mode === 'upload' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Upload className="w-4 h-4" />
                    <span>Subir Foto</span>
                  </button>
                </div>
              )}

              {/* Viewport Frame */}
              <div className="relative aspect-4/3 w-full bg-black rounded-xl overflow-hidden border border-slate-700 shadow-inner flex items-center justify-center">
                
                {/* 1. Live Camera Stream */}
                {mode === 'camera' && !capturedImage && (
                  <div className="relative w-full h-full">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className="w-full h-full object-contain bg-slate-950"
                    />

                    {/* Sneaker Viewfinder Reticle Overlay */}
                    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                      <div className="w-[86%] h-[76%] max-w-[560px] max-h-[360px] border-2 border-dashed border-indigo-400/60 rounded-2xl relative flex items-center justify-center">
                        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-indigo-400 -mt-1 -ml-1" />
                        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-indigo-400 -mt-1 -mr-1" />
                        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-indigo-400 -mb-1 -ml-1" />
                        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-indigo-400 -mb-1 -mr-1" />
                        <span className="text-[10px] font-mono text-indigo-300/80 bg-slate-950/80 px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Mantén el calzado completo dentro del marco
                        </span>
                      </div>
                    </div>

                    {/* Camera Control Overlay Buttons */}
                    <div className="absolute bottom-3 inset-x-3 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          const next = cameraFacing === 'environment' ? 'user' : 'environment';
                          setCameraFacing(next);
                          startCamera(next);
                        }}
                        className="p-2.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700 backdrop-blur-xs transition-transform active:scale-95"
                        title="Cambiar Cámara Trasera / Frontal"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={capturePhoto}
                        className="px-5 py-2.5 bg-linear-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold text-xs rounded-full shadow-lg shadow-indigo-500/40 flex items-center gap-2 transform active:scale-95 transition-all"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Capturar & Analizar</span>
                      </button>

                      <div className="w-10" />
                    </div>
                  </div>
                )}

                {/* 2. Upload Prompt */}
                {mode === 'upload' && !capturedImage && !isCompressing && (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center p-6 text-center cursor-pointer hover:bg-slate-800/50 transition-colors w-full h-full"
                  >
                    <Upload className="w-10 h-10 text-indigo-400 mb-2" />
                    <p className="text-xs font-semibold text-white">Haz clic para subir una foto de calzado</p>
                    <p className="text-[11px] text-slate-400 mt-1">Soporta JPG, PNG o WebP desde tu galería</p>
                  </div>
                )}

                {/* 2.5 Compressing overlay */}
                {isCompressing && (
                  <div className="flex flex-col items-center justify-center p-6 text-center w-full h-full space-y-2 bg-slate-900/60">
                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs font-bold text-white">Comprimiendo imagen...</span>
                    <span className="text-[10px] text-slate-400">Optimizando peso a &lt; 500 KB para envío y catálogo</span>
                  </div>
                )}

                {/* 3. Captured Image with scanning animation */}
                {capturedImage && (
                  <div className="relative w-full h-full bg-slate-900 flex items-center justify-center">
                    <img
                      src={capturedImage}
                      alt="Calzado a analizar"
                      className="w-full h-full object-contain bg-white"
                    />

                    {/* Studio White Background Badge / Spinner */}
                    {isProcessingWhiteBg ? (
                      <div className="absolute top-2.5 left-2.5 z-10 px-2.5 py-1 bg-amber-950/85 border border-amber-500/50 rounded-lg text-[10px] font-bold text-amber-300 backdrop-blur-xs flex items-center gap-1.5 shadow-lg">
                        <Sparkles className="w-3 h-3 animate-spin text-amber-400" />
                        <span>Quitando fondo a blanco...</span>
                      </div>
                    ) : whiteBgImage ? (
                      <div className="absolute top-2.5 left-2.5 z-10 px-2.5 py-1 bg-emerald-950/85 border border-emerald-500/50 rounded-lg text-[10px] font-bold text-emerald-300 backdrop-blur-xs flex items-center gap-1.5 shadow-lg">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>Fondo Blanco Estudio</span>
                      </div>
                    ) : null}

                    {/* Compression indicator badge */}
                    {compressionInfo && (
                      <div className="absolute top-2.5 right-2.5 z-10 px-2 py-1 bg-slate-950/85 border border-indigo-500/40 rounded-lg text-[10px] font-bold text-indigo-300 backdrop-blur-xs flex items-center gap-1 shadow-lg">
                        <span>Optimizado: {formatFileSize(compressionInfo.compressedSize)}</span>
                        {compressionInfo.reductionPercentage > 0 && (
                          <span className="text-emerald-400">(-{compressionInfo.reductionPercentage}%)</span>
                        )}
                      </div>
                    )}

                    {/* Image View Selector (White BG vs Original) & Re-process button */}
                    {originalImage && whiteBgImage && (
                      <div className="absolute bottom-2.5 inset-x-2.5 z-10 flex items-center justify-between">
                        <div className="flex items-center bg-slate-950/90 p-0.5 rounded-lg border border-slate-700/80 backdrop-blur-xs text-[10px]">
                          <button
                            type="button"
                            onClick={() => toggleImageMode('white')}
                            className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                              activeImageMode === 'white'
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            ✨ Fondo Blanco
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleImageMode('original')}
                            className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                              activeImageMode === 'original'
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            Foto Original
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => processWhiteBackground(originalImage)}
                          title="Re-procesar fondo blanco"
                          className="px-2 py-1 bg-slate-900/90 hover:bg-slate-800 text-indigo-300 border border-slate-700 rounded-lg text-[10px] font-semibold backdrop-blur-xs flex items-center gap-1 cursor-pointer"
                        >
                          <Wand2 className="w-3 h-3 text-indigo-400" />
                          <span>Re-limpiar</span>
                        </button>
                      </div>
                    )}

                    {/* Futuristic Laser Scanning Line when analyzing */}
                    {isAnalyzing && (
                      <div className="absolute inset-0 bg-indigo-500/10 backdrop-blur-2xs flex flex-col justify-between overflow-hidden">
                        <div className="w-full h-1 bg-linear-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#22d3ee] animate-bounce duration-1000" />
                        <div className="p-3 text-center bg-slate-950/80 backdrop-blur-md mx-auto mb-4 rounded-xl border border-indigo-500/30">
                          <div className="flex items-center justify-center gap-2 text-indigo-300 font-bold text-xs">
                            <Sparkles className="w-4 h-4 animate-spin text-cyan-400" />
                            <span>Gemini AI analizando silueta y marca...</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">Identificando modelo, materiales y copy comercial</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />

              {/* Action buttons under image */}
              {capturedImage && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={resetAll}
                    className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-slate-700 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Tomar Otra Foto</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => runAnalysis(capturedImage)}
                    disabled={isAnalyzing}
                    className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-indigo-600/30 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Re-analizar IA</span>
                  </button>
                </div>
              )}

              {/* Optional user hint input */}
              <div className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/60">
                <label className="text-[11px] text-slate-400 font-medium block mb-1">
                  Pista o modelo aproximado (opcional):
                </label>
                <input
                  type="text"
                  placeholder="Ej: Nike Dunk, Jordan 4, Samba OG, New Balance 550..."
                  value={userHint}
                  onChange={(e) => setUserHint(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              {/* Camera Error banner */}
              {cameraError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <div>
                    <div className="font-bold">Error de Cámara</div>
                    <div className="text-[11px] mt-0.5">{cameraError}</div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-2 px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[11px] rounded font-bold"
                    >
                      Subir foto desde galería
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: AI Analysis Result (7 cols) */}
            <div className="lg:col-span-7 flex flex-col space-y-4">
              
              {/* State 1: Awaiting photo */}
              {!capturedImage && !isAnalyzing && !aiResult && (
                <div className="h-full min-h-[300px] border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center p-8 text-center bg-slate-950/40">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-3 border border-indigo-500/20">
                    <Sparkles className="w-7 h-7 animate-pulse" />
                  </div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                    Listo para Reconocer Calzados
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mt-1 leading-relaxed">
                    Toma una foto con tu cámara o sube una imagen de zapatillas deportivas o calzado casual. 
                    Gemini AI identificará automáticamente la <strong>marca</strong>, la <strong>silueta o modelo</strong>, el <strong>colorway</strong> y redactará el <strong>copy comercial</strong> para tus redes.
                  </p>
                </div>
              )}

              {/* State 2: Analyzing */}
              {isAnalyzing && (
                <div className="h-full min-h-[300px] border border-indigo-500/30 rounded-2xl flex flex-col items-center justify-center p-8 text-center bg-indigo-950/20 space-y-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-400 animate-spin" />
                    <Sparkles className="w-6 h-6 text-cyan-400 absolute inset-0 m-auto animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Analizando Calzado con Gemini Vision...</h4>
                    <p className="text-xs text-indigo-300 mt-1">
                      Detectando logos, suelas, costuras, siluetas y comparando con tendencias urbanas
                    </p>
                  </div>
                </div>
              )}

              {/* State 3: Analysis Error */}
              {analysisError && (
                <div className="p-4 bg-rose-950/40 border border-rose-800 rounded-2xl text-rose-200 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-rose-300">
                    <AlertCircle className="w-5 h-5 text-rose-400" />
                    <span>No se pudo procesar la imagen con IA</span>
                  </div>
                  <p className="text-xs text-rose-300/80">{analysisError}</p>
                  <button
                    type="button"
                    onClick={() => capturedImage && runAnalysis(capturedImage)}
                    className="px-3 py-1.5 bg-rose-700 hover:bg-rose-600 text-white rounded-lg text-xs font-bold mt-2"
                  >
                    Reintentar análisis
                  </button>
                </div>
              )}

              {/* State 4: AI Result Display */}
              {aiResult && (
                <div className="space-y-4 animate-fadeIn">
                  
                  {/* Top Banner: Brand & Model */}
                  <div className="p-4 bg-linear-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-md bg-indigo-500 text-white font-black text-xs uppercase tracking-wider">
                            {aiResult.marca}
                          </span>
                          <span className="text-xs font-bold text-indigo-300">
                            Modelo: {aiResult.modelo}
                          </span>
                        </div>
                        <h3 className="text-base sm:text-lg font-black text-white mt-1.5 leading-tight">
                          {aiResult.nombre}
                        </h3>
                      </div>

                      <div className="text-right">
                        <div className="text-xs text-slate-400 font-medium">Precio Sugerido</div>
                        <div className="text-xl font-black text-emerald-400">
                          ${aiResult.precio_sugerido_usd.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          ≈ Bs. {(aiResult.precio_sugerido_usd * exchangeRate).toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Metadata chips */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-slate-700/60 text-xs">
                      <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">Tipo:</span>
                        <span className="font-bold text-slate-200">{aiResult.tipo}</span>
                      </div>
                      <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">Género:</span>
                        <span className="font-bold text-slate-200">{aiResult.genero}</span>
                      </div>
                      <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">Colorway:</span>
                        <span className="font-bold text-slate-200 truncate block" title={aiResult.color}>
                          {aiResult.color}
                        </span>
                      </div>
                      <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">Material:</span>
                        <span className="font-bold text-slate-200 truncate block" title={aiResult.material}>
                          {aiResult.material}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Commercial Description */}
                  <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <ShoppingBag className="w-3.5 h-3.5 text-indigo-400" />
                        Descripción Comercial para Catálogo
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(aiResult.descripcion_comercial, 'desc')}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                      >
                        {copiedField === 'desc' ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">¡Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {aiResult.descripcion_comercial}
                    </p>
                    {aiResult.detalles_estilo && (
                      <p className="text-[11px] text-indigo-300 italic pt-1 border-t border-slate-700/50">
                        💡 Tip de estilo: {aiResult.detalles_estilo}
                      </p>
                    )}
                  </div>

                  {/* Social Media Ready Captions (WhatsApp & Instagram) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    
                    {/* WhatsApp Ready Message */}
                    <div className="bg-emerald-950/30 border border-emerald-800/60 rounded-2xl p-3.5 space-y-2 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
                          <span className="flex items-center gap-1.5">
                            <MessageCircle className="w-4 h-4" />
                            Mensaje para WhatsApp
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 mt-2 font-mono whitespace-pre-line line-clamp-3 bg-black/40 p-2 rounded-lg border border-emerald-900/50">
                          {aiResult.copy_social}
                        </p>
                      </div>
                      
                      <button
                        type="button"
                        onClick={() => copyToClipboard(aiResult.copy_social, 'wa')}
                        className="w-full py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {copiedField === 'wa' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedField === 'wa' ? '¡Texto Copiado!' : 'Copiar para WhatsApp'}</span>
                      </button>
                    </div>

                    {/* Instagram Post & Hashtags */}
                    <div className="bg-pink-950/30 border border-pink-800/60 rounded-2xl p-3.5 space-y-2.5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between text-xs font-bold text-pink-400">
                          <span className="flex items-center gap-1.5">
                            <Instagram className="w-4 h-4" />
                            Instagram Feed & Stories
                          </span>
                          <span className="text-[10px] text-pink-300/80 bg-pink-900/40 px-2 py-0.5 rounded-full font-medium">
                            Foto + Copy Listo
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-300 mt-2 font-mono whitespace-pre-line line-clamp-2 bg-black/40 p-2 rounded-lg border border-pink-900/50">
                          {aiResult.nombre} 🔥
                          {aiResult.hashtags ? '\n' + aiResult.hashtags.join(' ') : ''}
                        </div>
                      </div>

                      {/* Direct Image Downloads & Copy Buttons */}
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={handleDownloadWhiteBgPhoto}
                            title="Descargar fotografía con fondo blanco de estudio"
                            className="py-2 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Descargar Foto</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleDownloadInstagramPost}
                            disabled={isDownloadingPost}
                            title="Descargar post cuadrado 1:1 para el Feed de Instagram con precio y tienda"
                            className="py-2 px-2 bg-pink-600/80 hover:bg-pink-600 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                          >
                            <Instagram className="w-3.5 h-3.5" />
                            <span>{isDownloadingPost ? 'Generando...' : 'Post 1:1 Feed'}</span>
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const fullCopy = `${aiResult.nombre} 🔥\n\n${aiResult.descripcion_comercial}\n\n👟 Tallas recomendadas: ${aiResult.tallas_sugeridas?.join(', ')}\n💵 Precio: $${aiResult.precio_sugerido_usd.toFixed(2)} (Bs. ${(aiResult.precio_sugerido_usd * exchangeRate).toFixed(2)})\n📍 Ubicación no configurada - Sede no configurada\n📲 Envíos a toda Venezuela\n\n${aiResult.hashtags?.join(' ') || ''}`;
                            copyToClipboard(fullCopy, 'ig');
                          }}
                          className="w-full py-2 px-2.5 bg-linear-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-pink-600/20"
                        >
                          {copiedField === 'ig' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedField === 'ig' ? '¡Copy Instagram Copiado!' : 'Copiar Copy + Hashtags'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Stock Matches in Store */}
                  {matchingStock.length > 0 && (
                    <div className="bg-indigo-950/40 border border-indigo-800/60 rounded-xl p-3 text-xs">
                      <span className="font-bold text-indigo-300 flex items-center gap-1.5 mb-1.5">
                        <Search className="w-3.5 h-3.5 text-indigo-400" />
                        Coincidencias en Inventario Actual ({matchingStock.length} productos en tienda):
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {matchingStock.slice(0, 4).map((p) => (
                          <div key={p.id} className="bg-slate-900 px-2 py-1 rounded border border-slate-700 text-[11px] flex items-center gap-1.5">
                            <span className="text-white font-semibold">{p.nombre}</span>
                            <span className="text-indigo-400">Talla {p.talla}</span>
                            <span className={`px-1 rounded text-[10px] font-bold ${p.stock > 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                              {p.stock} disp.
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Big Primary Action: Add to Inventory */}
                  {onSelectForProduct && (whiteBgImage || capturedImage) && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectForProduct(aiResult, whiteBgImage || capturedImage!);
                          stopCamera();
                          onClose();
                        }}
                        className="w-full py-3 px-4 bg-linear-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-indigo-500 text-white rounded-xl font-bold text-sm shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-[0.99]"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Usar Datos y Foto (Fondo Blanco) para Registrar Calzado</span>
                      </button>
                    </div>
                  )}

                </div>
              )}

            </div>

          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:px-6 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Motor: Gemini Flash Multimodal Vision</span>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
          >
            Cerrar Escáner
          </button>
        </div>

      </div>
    </div>
  );
};
