import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Check,
  DollarSign,
  Tag,
  Boxes,
  ShieldAlert,
  ShieldCheck,
  Camera,
  Upload,
  Link,
  RotateCcw,
  Trash2,
  AlertCircle,
  Sparkles,
  SwitchCamera,
  Layers,
  Plus,
  Minus,
  Smartphone,
  Wand2
} from 'lucide-react';
import { ShoeProduct, ShoeType, ProductCategory, InventoryClassification, INVENTORY_CLASSIFICATIONS } from '../../types';
import { analyzeShoeWithAi, ShoeAiResult } from '../../services/aiShoeService';
import {
  compressImageFile,
  compressImageDataUrl,
  formatFileSize,
  estimateDataUrlSize,
  CompressionResult,
} from '../../utils/imageCompressor';
import { removeBackgroundToWhite } from '../../utils/backgroundRemover';
import { COMPANY_INDUSTRIES, resolveIndustryTemplate } from '../../domain/companyIndustries';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (productData: Omit<ShoeProduct, 'id' | 'created_at'>) => void;
  onSaveBulk?: (productsData: Omit<ShoeProduct, 'id' | 'created_at'>[]) => void;
  editingProduct?: ShoeProduct | null;
  initialAiData?: ShoeAiResult | null;
  initialAiImage?: string | null;
}

interface SizeStockItem {
  talla: string;
  stock: number;
}

interface ColorImageItem {
  id: string;
  color: string;
  imagen: string;
  nombre?: string;
  sku?: string;
  talla?: string;
  stock?: number;
  costo?: number;
  precio?: number;
  descripcion?: string;
  marca?: string;
  tipo?: string;
  genero?: string;
  aiLoading?: boolean;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onSaveBulk,
  editingProduct,
  initialAiData,
  initialAiImage,
}) => {
  const industryKey = resolveIndustryTemplate(localStorage.getItem('nexoss_active_company_industry'));
  const industry = COMPANY_INDUSTRIES[industryKey];
  const isFootwear = industryKey === 'footwear';
  const defaultProductCategory = (industry.initialCategories as readonly string[]).includes('Productos terminados')
    ? 'Productos terminados'
    : industry.initialCategories[0];
  const classificationForCategory = (category: string): InventoryClassification => {
    if (category === 'Productos terminados') return 'Productos terminados';
    if (category === 'Productos en proceso' || category === 'Producción en proceso') return 'Productos en proceso';
    if (['Materia prima', 'Insumos y cultivos', 'Insumos de producción', 'Empaques'].includes(category)) return 'Materia prima';
    return 'Mercancía';
  };
  // Entry Mode: Multi-size model vs single item
  const [entryMode, setEntryMode] = useState<'multi' | 'single'>(
    editingProduct || !isFootwear ? 'single' : 'multi'
  );

  // Category
  const [categoria, setCategoria] = useState<ProductCategory>(
    (editingProduct?.categoria as ProductCategory) || defaultProductCategory as ProductCategory
  );
  const [configuredProductCategories, setConfiguredProductCategories] = useState<string[]>([]);
  const [clasificacionInventario, setClasificacionInventario] = useState<InventoryClassification>(
    editingProduct?.clasificacion_inventario || classificationForCategory(defaultProductCategory)
  );

  // Basic Info
  const [nombre, setNombre] = useState(editingProduct?.nombre || '');
  const [sku, setSku] = useState(editingProduct?.sku || '');
  const [marca, setMarca] = useState(editingProduct?.marca || (isFootwear ? 'Nike' : ''));
  const [tipo, setTipo] = useState<ShoeType>(editingProduct?.tipo || (isFootwear ? 'Botines Fútbol Campo' : 'Otros'));
  const [color, setColor] = useState(editingProduct?.color || '');
  const [costo, setCosto] = useState(editingProduct?.costo?.toString() || '40.00');
  const [precio, setPrecio] = useState(editingProduct?.precio?.toString() || '80.00');
  const [stockMinimo, setStockMinimo] = useState(editingProduct?.stock_minimo?.toString() || '2');
  const [costoTotalCompra, setCostoTotalCompra] = useState('');
  const [imagen, setImagen] = useState(editingProduct?.imagen || '');
  // Carga masiva: cada foto puede representar un color distinto del mismo modelo.
  const [colorImages, setColorImages] = useState<ColorImageItem[]>(
    editingProduct?.imagen ? [{ id: 'existing-1', color: editingProduct?.color || 'Estándar', imagen: editingProduct.imagen, nombre: editingProduct.nombre, sku: editingProduct.sku, talla: editingProduct.talla, stock: editingProduct.stock, costo: editingProduct.costo, precio: editingProduct.precio }] : []
  );
  const [descripcion, setDescripcion] = useState(editingProduct?.descripcion || '');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch('/api/company/categories')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudieron consultar las categorías.');
        const rows = Array.isArray(data.categories) ? data.categories as Array<{ name?: string; kind?: string }> : [];
        if (!cancelled) setConfiguredProductCategories(rows
          .filter((item) => item.kind === 'product' && typeof item.name === 'string')
          .map((item) => item.name as string));
      })
      .catch((error) => console.warn('No se pudieron cargar las categorías administradas:', error));
    return () => { cancelled = true; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (editingProduct) {
      setColorImages(editingProduct.imagen ? [{ id: `existing-${editingProduct.id}`, color: editingProduct.color || 'Estándar', imagen: editingProduct.imagen, nombre: editingProduct.nombre, sku: editingProduct.sku, talla: editingProduct.talla, stock: editingProduct.stock, costo: editingProduct.costo, precio: editingProduct.precio }] : []);
    } else {
      setColorImages([]);
    }
  }, [isOpen, editingProduct?.id]);
  const [descripcionOriginalIA, setDescripcionOriginalIA] = useState<string | null>(null);
  const [genero, setGenero] = useState(editingProduct?.genero || 'Unisex');
  const [esOriginal, setEsOriginal] = useState(editingProduct?.es_original !== false);

  // Image Compression State (ensures images stay < 500KB with high clarity)
  const [isCompressingImage, setIsCompressingImage] = useState(false);
  const [compressionInfo, setCompressionInfo] = useState<CompressionResult | null>(null);

  // AI Recognition State
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiAnalysisSuccess, setAiAnalysisSuccess] = useState<ShoeAiResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);

  // Single Item Mode: single size & stock
  const [singleTalla, setSingleTalla] = useState(editingProduct?.talla || (isFootwear ? '38' : 'Unidad'));
  const [singleStock, setSingleStock] = useState(editingProduct?.stock?.toString() || '0');

  // Multi-Sizes Mode: Matrix of sizes & stocks
  const defaultSizesForCalzado: SizeStockItem[] = [
    { talla: '37', stock: 4 },
    { talla: '38', stock: 6 },
    { talla: '39', stock: 6 },
    { talla: '40', stock: 8 },
    { talla: '41', stock: 6 },
    { talla: '42', stock: 4 },
  ];

  const [activeSizes, setActiveSizes] = useState<SizeStockItem[]>(defaultSizesForCalzado);
  const [bulkQtyToApply, setBulkQtyToApply] = useState<number>(4);
  const [customTallaInput, setCustomTallaInput] = useState<string>('');

  // Rehydrate every field when the modal switches to a different existing product.
  // Without this, React keeps the previous modal state and a Neon sync can make the
  // edited shoe type appear to revert to its old value.
  useEffect(() => {
    if (!isOpen || !editingProduct) return;
    setEntryMode('single');
    setCategoria((editingProduct.categoria as ProductCategory) || defaultProductCategory as ProductCategory);
    setClasificacionInventario(editingProduct.clasificacion_inventario || 'Mercancía');
    setNombre(editingProduct.nombre || '');
    setSku(editingProduct.sku || '');
    setMarca(editingProduct.marca || (isFootwear ? 'Nike' : ''));
    setTipo(editingProduct.tipo || (isFootwear ? 'Botines Fútbol Campo' : 'Otros'));
    setColor(editingProduct.color || '');
    setCosto(editingProduct.costo?.toString() || '40.00');
    setPrecio(editingProduct.precio?.toString() || '80.00');
    setStockMinimo(editingProduct.stock_minimo?.toString() || '2');
    setCostoTotalCompra('');
    setImagen(editingProduct.imagen || '');
    setDescripcion(editingProduct.descripcion || '');
    setGenero(editingProduct.genero || 'Unisex');
    setEsOriginal(editingProduct.es_original !== false);
    setSingleTalla(editingProduct.talla || (isFootwear ? '38' : 'Unidad'));
    setSingleStock(editingProduct.stock?.toString() || '0');
    setAiAnalysisSuccess(null);
  }, [editingProduct?.id, isOpen]);

  useEffect(() => {
    if (isOpen && !editingProduct) {
      setCategoria(defaultProductCategory as ProductCategory);
      setClasificacionInventario(classificationForCategory(defaultProductCategory));
      setSingleStock('0');
    }
  }, [isOpen, editingProduct?.id]);

  // Auto-fill from initialAiData
  useEffect(() => {
    if (initialAiData) {
      if (initialAiData.nombre) setNombre(initialAiData.nombre);
      if (initialAiData.marca) setMarca(initialAiData.marca);
      if (initialAiData.color) setColor(initialAiData.color);
      if (initialAiData.tipo) setTipo(initialAiData.tipo as ShoeType);
      if (initialAiData.genero) setGenero(initialAiData.genero);
      if (initialAiData.precio_sugerido_usd) {
        setPrecio(initialAiData.precio_sugerido_usd.toString());
        setCosto(Math.round(initialAiData.precio_sugerido_usd * 0.55).toString());
      }
      if (initialAiData.descripcion_comercial) {
        const textoIA =
          initialAiData.descripcion_comercial + (initialAiData.detalles_estilo ? '\n\n💡 ' + initialAiData.detalles_estilo : '');
        setDescripcion(textoIA);
        setDescripcionOriginalIA(textoIA);
      }
      if (initialAiData.tallas_sugeridas && initialAiData.tallas_sugeridas.length > 0) {
        setActiveSizes(initialAiData.tallas_sugeridas.map((t) => ({ talla: t, stock: 4 })));
      }
      setAiAnalysisSuccess(initialAiData);
    }
    if (initialAiImage) {
      setImagen(initialAiImage);
    }
  }, [initialAiData, initialAiImage]);

  // Camera & Image state
  const [imageMode, setImageMode] = useState<'camera' | 'upload' | 'url'>('camera');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);

  // Available size presets per category
  const getPresetSizes = (cat: ProductCategory): string[] => {
    switch (cat) {
      case 'Calzado':
        return ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'];
      case 'Gorras':
        return ['Ajustable', 'Única', 'S/M', 'L/XL'];
      case 'Medias':
        return ['Pack x3', 'Pack x6', 'Única', '35-38', '39-42'];
      case 'Accesorios':
        return ['Única', 'S', 'M', 'L'];
      case 'Ropa':
        return ['S', 'M', 'L', 'XL', 'XXL'];
      default:
        return ['Única', '38', '39', '40', '41', '42'];
    }
  };

  // Types available per category
  const getTypesForCategory = (cat: ProductCategory): ShoeType[] => {
    switch (cat) {
      case 'Calzado':
        return [
          'Botines Fútbol Campo',
          'Fútbol Campo',
          'Micro Tacos',
          'Futsala',
          'Running',
          'Béisbol',
          'Béisbol Gancho',
          'Casual',
          'Deportivo',
          'Botas',
          'Tacones',
          'Sandalias',
          'Mocasines',
          'Infantil',
          'Otros',
        ];
      case 'Gorras':
        return ['Gorras'];
      case 'Medias':
        return ['Medias'];
      case 'Accesorios':
        return ['Accesorios'];
      case 'Ropa':
        return ['Ropa'];
      default:
        return ['Otros'];
    }
  };

  // When category changes, adjust default type
  const handleCategoryChange = (newCat: ProductCategory) => {
    setCategoria(newCat);
    const nextClassification = classificationForCategory(String(newCat));
    setClasificacionInventario(nextClassification);
    if (nextClassification === 'Productos terminados') setSingleStock('0');
    const available = getTypesForCategory(newCat);
    setTipo(available[0]);

    // Reset default sizes
    if (newCat === 'Calzado') {
      setActiveSizes(defaultSizesForCalzado);
      setSingleTalla('38');
    } else if (newCat === 'Gorras') {
      setActiveSizes([{ talla: 'Ajustable', stock: 10 }]);
      setSingleTalla('Ajustable');
    } else if (newCat === 'Medias') {
      setActiveSizes([{ talla: 'Pack x3', stock: 15 }]);
      setSingleTalla('Pack x3');
    } else {
      setActiveSizes([{ talla: 'Única', stock: 10 }]);
      setSingleTalla('Única');
    }
  };

  // Toggle or add size
  const togglePresetSize = (sz: string) => {
    const exists = activeSizes.some((s) => s.talla === sz);
    if (exists) {
      setActiveSizes((prev) => prev.filter((s) => s.talla !== sz));
    } else {
      setActiveSizes((prev) => [...prev, { talla: sz, stock: bulkQtyToApply || 4 }]);
    }
  };

  // Change stock for a specific size
  const updateSizeStock = (sz: string, qty: number) => {
    const val = Math.max(0, qty);
    setActiveSizes((prev) =>
      prev.map((item) => (item.talla === sz ? { ...item, stock: val } : item))
    );
  };

  // Apply same quantity to all active sizes
  const handleApplyToAllSizes = () => {
    const qty = Math.max(0, bulkQtyToApply);
    setActiveSizes((prev) => prev.map((s) => ({ ...s, stock: qty })));
  };

  // Add custom size
  const handleAddCustomTalla = () => {
    const trimmed = customTallaInput.trim();
    if (!trimmed) return;
    if (!activeSizes.some((s) => String(s.talla || '').toLowerCase() === trimmed.toLowerCase())) {
      setActiveSizes((prev) => [...prev, { talla: trimmed, stock: bulkQtyToApply || 4 }]);
    }
    setCustomTallaInput('');
  };

  // Stop camera cleanly
  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsCameraReady(false);
    setCameraError(null);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // When isCameraActive becomes true, attach stream to video element
  useEffect(() => {
    if (isCameraActive && videoRef.current && mediaStreamRef.current) {
      const video = videoRef.current;
      video.srcObject = mediaStreamRef.current;
      video
        .play()
        .then(() => setIsCameraReady(true))
        .catch((err) => {
          console.error('Error al reproducir video de cámara:', err);
        });
    }
  }, [isCameraActive]);

  const startCamera = async (facing: 'environment' | 'user' = cameraFacing) => {
    stopCamera();
    setCameraError(null);
    setIsCameraReady(false);

    try {
      let stream: MediaStream;
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
      } catch (err) {
        // Fallback to any camera available
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1440 }, facingMode: { ideal: facing } },
          audio: false,
        });
      }

      mediaStreamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      try {
        const capabilities = track?.getCapabilities?.() as any;
        const advanced: any[] = [];
        if (capabilities?.focusMode?.includes?.('continuous')) advanced.push({ focusMode: 'continuous' });
        if (capabilities?.exposureMode?.includes?.('continuous')) advanced.push({ exposureMode: 'continuous' });
        if (advanced.length) await track.applyConstraints({ advanced });
      } catch {}
      setIsCameraActive(true);
    } catch (err: any) {
      console.error('Error al acceder a la cámara:', err);
      setCameraError(
        'No se pudo abrir la cámara en el navegador. Puedes usar el botón "Cámara del Teléfono" o "Subir Archivo".'
      );
      setIsCameraActive(false);
    }
  };

  const handleCapturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;

    // Check if video is loaded, ready and has dimensions
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError('La cámara aún se está inicializando. Espera 1 segundo e inténtalo de nuevo o usa la cámara del móvil.');
      return;
    }

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      // Mirror if front camera
      if (cameraFacing === 'user') {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, width, height);

      // Verify that the frame is not pitch black (hardware/buffer issue check)
      try {
        const sampleData = ctx.getImageData(
          Math.floor(width / 4),
          Math.floor(height / 4),
          Math.floor(width / 2),
          Math.floor(height / 2)
        );
        let nonBlackPixels = 0;
        for (let i = 0; i < sampleData.data.length; i += 16) {
          const r = sampleData.data[i];
          const g = sampleData.data[i + 1];
          const b = sampleData.data[i + 2];
          if (r > 12 || g > 12 || b > 12) {
            nonBlackPixels++;
            if (nonBlackPixels > 10) break;
          }
        }

        if (nonBlackPixels <= 5) {
          // Frame is completely black, trigger native camera or retry
          setCameraError('El navegador devolvió un fotograma negro. Abriendo la cámara nativa de tu dispositivo para tomar la foto con calidad...');
          nativeCameraInputRef.current?.click();
          return;
        }
      } catch (err) {
        console.warn('Canvas pixel check info:', err);
      }

      const photoDataUrl = canvas.toDataURL('image/jpeg', 0.94);
      stopCamera();
      setCameraError(null);

      // Immediately compress image to optimize storage (< 500 KB)
      setIsCompressingImage(true);
      compressImageDataUrl(photoDataUrl, {
        maxDimension: 1600,
        quality: 0.88,
        maxSizeBytes: 500 * 1024,
      })
        .then((res) => {
          setImagen(res.dataUrl);
          setCompressionInfo(res);
        })
        .catch(() => {
          setImagen(photoDataUrl);
        })
        .finally(() => {
          setIsCompressingImage(false);
        });
    }
  };

  // Remove background to white studio backdrop
  const handleCleanBackground = async (imageInput?: string) => {
    const target = imageInput || imagen;
    if (!target) return;
    setIsRemovingBackground(true);
    try {
      const whiteResult = await removeBackgroundToWhite(target);
      setImagen(whiteResult);
    } catch (err) {
      console.warn('Could not clean background:', err);
    } finally {
      setIsRemovingBackground(false);
    }
  };

  const handleAnalyzeWithAi = async (imageToAnalyze?: string) => {
    const targetImage = imageToAnalyze || imagen;
    if (!targetImage) {
      alert('Primero debes tomar una foto o subir una imagen del calzado.');
      return;
    }

    setIsAiAnalyzing(true);
    setAiError(null);

    // Auto-apply studio white background immediately when analyzed with Gemini!
    handleCleanBackground(targetImage);

    try {
      const res = await analyzeShoeWithAi(targetImage, undefined, industryKey);
      setAiAnalysisSuccess(res);

      if (res.nombre) setNombre(res.nombre);
      if (res.marca) setMarca(res.marca);
      if (res.color) setColor(res.color);
      if (res.tipo) setTipo(res.tipo as ShoeType);
      if (res.genero) setGenero(res.genero);
      // No inventar precios ni costos: se completan manualmente con factura o lista de proveedor.
      if (res.descripcion_comercial) {
        const textoIA =
          res.descripcion_comercial + (res.detalles_estilo ? '\n\n💡 ' + res.detalles_estilo : '');
        setDescripcion(textoIA);
        setDescripcionOriginalIA(textoIA);
      }
      if (!sku.trim() && res.marca && res.modelo) {
        const brandCode = res.marca.substring(0, 3).toUpperCase();
        const modelCode = res.modelo.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase();
        const rand = Math.floor(100 + Math.random() * 900);
        setSku(`${brandCode}-${modelCode}-${rand}`);
      }
      if (res.tallas_sugeridas && res.tallas_sugeridas.length > 0) {
        setActiveSizes(res.tallas_sugeridas.map((t) => ({ talla: t, stock: 4 })));
      }
    } catch (err: any) {
      console.error('Error analyzing shoe:', err);
      setAiError(err.message || 'Error al conectar con el servicio de IA Gemini.');
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  const handleCaptureAndAnalyzeWithAi = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      if (cameraFacing === 'user') {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, width, height);
      const photoDataUrl = canvas.toDataURL('image/jpeg', 0.94);
      stopCamera();
      setCameraError(null);

      setIsCompressingImage(true);
      let targetForAi = photoDataUrl;
      try {
        const compressed = await compressImageDataUrl(photoDataUrl, {
          maxDimension: 1280,
          quality: 0.82,
          maxSizeBytes: 500 * 1024,
        });
        setImagen(compressed.dataUrl);
        setCompressionInfo(compressed);
        targetForAi = compressed.dataUrl;
      } catch {
        setImagen(photoDataUrl);
      } finally {
        setIsCompressingImage(false);
      }
      handleAnalyzeWithAi(targetForAi);
    }
  };

  const handleSwitchCamera = () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextFacing);
    if (isCameraActive) {
      startCamera(nextFacing);
    }
  };

  const processImageFile = async (file: File): Promise<string> => {
    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona un archivo de imagen válido (JPG, PNG, WebP).');
      return;
    }

    setIsCompressingImage(true);
    try {
      // Compress image file to lightweight size (< 500 KB, guaranteed < 10MB)
      const res = await compressImageFile(file, {
        maxDimension: 1600,
        quality: 0.88,
        maxSizeBytes: 500 * 1024,
      });
      setImagen(res.dataUrl);
      setCompressionInfo(res);
      return res.dataUrl;
      setCameraError(null);
    } catch (err) {
      console.error('Error comprimiendo imagen:', err);
      // Fallback
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (typeof e.target?.result === 'string') {
            setImagen(e.target.result);
            resolve(e.target.result);
          } else reject(new Error('No se pudo leer la imagen'));
        };
        reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen'));
        reader.readAsDataURL(file);
      });
    } finally {
      setIsCompressingImage(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    void handleMultipleImageFiles(files);
    e.target.value = '';
  };

  const handleMultipleImageFiles = async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (!imageFiles.length) {
      alert('Selecciona archivos de imagen válidos.');
      return;
    }
    if (imageFiles.length > 12) {
      alert('Puedes cargar hasta 12 colores/fotos a la vez.');
      return;
    }
    setIsCompressingImage(true);
    try {
      const results: ColorImageItem[] = [];
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const compressed = await compressImageFile(file, {
          maxDimension: 1280,
          quality: 0.82,
          maxSizeBytes: 500 * 1024,
        });
        results.push({
          id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          color: imageFiles.length === 1 ? (color.trim() || 'Estándar') : `Color ${i + 1}`,
          imagen: compressed.dataUrl,
          nombre: imageFiles.length === 1 ? nombre.trim() : `${nombre.trim() || 'Producto'} ${i + 1}`,
          sku: imageFiles.length === 1 ? sku.trim().toUpperCase() : `${sku.trim().toUpperCase() || 'PROD'}-${String(i + 1).padStart(2,'0')}`,
          talla: singleTalla,
          stock: parseInt(singleStock, 10) || 0,
          costo: Number(costo) || 0,
          precio: Number(precio) || 0,
          aiLoading: true,
        });
      }
      setColorImages(results);
      if (results[0]) {
        setImagen(results[0].imagen);
        setColor(results[0].color);
      }
      // La IA no debe bloquear el registro por no crear SKU: el sistema asigna uno provisional.
      setSku((current) => current.trim() || `AUTO-${Date.now().toString().slice(-8)}`);
      if (imageFiles.length === 1 && !nombre.trim()) setNombre('Producto por identificar');
      // Analiza cada foto por separado y completa la ficha de ese producto.
      for (const item of results) {
        try {
          const ai = await analyzeShoeWithAi(item.imagen, 'Analiza exclusivamente el artículo visible. Devuelve nombre, marca, color, tipo, material y descripción objetiva. No inventes SKU, talla, stock ni precio.', industryKey);
          const aiDescription = [ai.descripcion_comercial, ai.detalles_estilo ? `Detalles: ${ai.detalles_estilo}` : '', ai.material ? `Material aparente: ${ai.material}` : ''].filter(Boolean).join('\n\n');
          setColorImages((current) => current.map((x) => x.id !== item.id ? x : ({
            ...x,
            nombre: ai.nombre || x.nombre,
            marca: ai.marca || '',
            color: ai.color || x.color,
            tipo: ai.tipo || '',
            genero: ai.genero || '',
            descripcion: aiDescription,
            aiLoading: false,
          })));
          if (results.length === 1) {
            if (ai.nombre) setNombre(ai.nombre);
            if (ai.marca) setMarca(ai.marca);
            if (ai.color) setColor(ai.color);
            if (ai.tipo) setTipo(ai.tipo as ShoeType);
            if (ai.genero) setGenero(ai.genero);
            if (aiDescription) { setDescripcion(aiDescription); setDescripcionOriginalIA(aiDescription); }
          }
        } catch (error) {
          console.warn('No se pudo analizar una foto de inventario:', error);
          setColorImages((current) => current.map((x) => x.id === item.id ? { ...x, aiLoading: false } : x));
        }
      }
    } catch (err) {
      console.error('Error cargando imágenes múltiples:', err);
      alert('No se pudieron procesar todas las imágenes. Intenta nuevamente.');
    } finally {
      setIsCompressingImage(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) void handleMultipleImageFiles(files);
  };

  const updateColorImage = (id: string, patch: Partial<ColorImageItem>) => {
    setColorImages((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const removeColorImage = (id: string) => {
    setColorImages((prev) => {
      const next = prev.filter((item) => item.id !== id);
      setImagen(next[0]?.imagen || '');
      if (next[0]?.color) setColor(next[0].color);
      return next;
    });
  };

  const handleCloseModal = () => {
    stopCamera();
    onClose();
  };

  const isRawMaterial = clasificacionInventario === 'Materia prima';
  const isProductionInput = isRawMaterial || clasificacionInventario === 'Productos en proceso';
  const parsedCosto = isProductionInput && Number(singleStock) > 0 && costoTotalCompra !== ''
    ? Math.max(0, Number(costoTotalCompra) || 0) / Number(singleStock)
    : parseFloat(costo) || 0;
  const parsedPrecio = parseFloat(precio) || 0;
  const margenGanancia = parsedPrecio - parsedCosto;
  const margenPorcentaje = parsedPrecio > 0 ? (margenGanancia / parsedPrecio) * 100 : 0;

  const totalPairsCount =
    entryMode === 'multi'
      ? activeSizes.reduce((sum, s) => sum + s.stock, 0)
      : parseInt(singleStock, 10) || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const aiBatchMode = entryMode === 'multi' && colorImages.length > 0 && !editingProduct;
    if (!aiBatchMode && (!nombre.trim() || !sku.trim())) {
      alert('Por favor ingresa el nombre y código SKU del producto, o carga una foto para que la IA complete la ficha y el sistema genere un SKU provisional.');
      return;
    }

    stopCamera();

    // Verify and compress image data URL before saving to guarantee low storage weight
    let finalImagen = imagen.trim();
    if (finalImagen.startsWith('data:image/')) {
      try {
        const compressed = await compressImageDataUrl(finalImagen, {
          maxDimension: 1280,
          quality: 0.82,
          maxSizeBytes: 500 * 1024,
        });
        finalImagen = compressed.dataUrl;
      } catch (err) {
        console.warn('Image verification on submit:', err);
      }
    }

    const baseProductData = {
      nombre: nombre.trim(),
      categoria,
      clasificacion_inventario: clasificacionInventario,
      marca: marca.trim() || 'Genérica',
      tipo,
      color: color.trim() || 'Estándar',
      moneda: 'USD' as const,
      costo: parsedCosto,
      precio: parsedPrecio,
      stock_minimo: parseInt(stockMinimo, 10) || 2,
      activo: true,
      descripcion: descripcion.trim() || undefined,
      genero: genero.trim() || undefined,
      es_original: esOriginal,
      imagen:
        finalImagen ||
        (categoria === 'Gorras'
          ? '/shoe-placeholder.svg'
          : categoria === 'Medias'
          ? '/shoe-placeholder.svg'
          : categoria === 'Accesorios'
          ? '/shoe-placeholder.svg'
          : '/shoe-placeholder.svg'),
    };

    if (entryMode === 'multi' && !editingProduct) {
      // Si hay varias fotos, cada foto representa un producto independiente.
      // En este modo cada tarjeta trae su propia talla y stock, por lo que no exigimos la tabla de tallas compartidas.
      // Comparten costo/precio del formulario, pero pueden tener nombre, SKU, color, talla y stock propios.
      if (colorImages.length > 1) {
        const itemsToCreate = colorImages.map((item, index) => ({
          ...baseProductData,
          costo: Number(item.costo ?? parsedCosto),
          precio: Number(item.precio ?? parsedPrecio),
          nombre: item.nombre?.trim() || `${nombre.trim() || 'Producto por identificar'} ${index + 1}`,
          // Código generado localmente cuando el usuario no ingresó uno. Se puede editar antes de guardar.
          sku: item.sku?.trim().toUpperCase() || `AUTO-${Date.now().toString().slice(-8)}-${String(index + 1).padStart(2,'0')}`,
          marca: item.marca?.trim() || baseProductData.marca,
          tipo: item.tipo || baseProductData.tipo,
          genero: item.genero || baseProductData.genero,
          descripcion: item.descripcion?.trim() || baseProductData.descripcion,
          color: item.color?.trim() || 'Estándar',
          imagen: item.imagen,
          talla: item.talla?.trim() || singleTalla,
          stock: Number(item.stock ?? 0),
        }));
        if (onSaveBulk) onSaveBulk(itemsToCreate); else itemsToCreate.forEach((item) => onSave(item));
        onClose();
        return;
      }

      if (activeSizes.length === 0) {
        alert('Debes seleccionar al menos una talla para el modelo.');
        return;
      }

      // Check if user specified multiple colors (e.g. "Negro, Blanco")
      const colorTokens = color
        .split(/[,/;]/)
        .map((c) => c.trim())
        .filter(Boolean);

      const itemsToCreate: Omit<ShoeProduct, 'id' | 'created_at'>[] = [];
      // Si se cargaron varias fotos, cada foto es una variante de color.
      // Todas comparten costo, precio, marca, modelo y tallas; solo cambia color/imagen/SKU.
      const colorVariants = colorImages.length > 0
        ? colorImages.map((v) => ({ color: v.color.trim() || 'Estándar', imagen: v.imagen }))
        : colorTokens.map((c) => ({ color: c, imagen: finalImagen }));

      if (colorVariants.length > 1) {
        colorVariants.forEach((variant) => {
          activeSizes.forEach((s) => {
            const formattedTalla = s.talla.replace(/\s+/g, '');
            const colorCode = variant.color.substring(0, 3).replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'COL';
            itemsToCreate.push({
              ...baseProductData,
              color: variant.color,
              imagen: variant.imagen,
              sku: `${sku.trim().toUpperCase()}-${colorCode}-${formattedTalla}`,
              talla: s.talla,
              stock: s.stock,
            });
          });
        });
      } else {
        const variant = colorVariants[0] || { color: color.trim() || 'Estándar', imagen: finalImagen };
        activeSizes.forEach((s) => {
          const formattedTalla = s.talla.replace(/\s+/g, '');
          itemsToCreate.push({
            ...baseProductData,
            color: variant.color,
            imagen: variant.imagen,
            sku: `${sku.trim().toUpperCase()}-${formattedTalla}`,
            talla: s.talla,
            stock: s.stock,
          });
        });
      }

      if (onSaveBulk) {
        onSaveBulk(itemsToCreate);
      } else {
        itemsToCreate.forEach((item) => onSave(item));
      }
    } else {
      // Single Item
      onSave({
        ...baseProductData,
        sku: sku.trim().toUpperCase(),
        talla: singleTalla,
        stock: parseInt(singleStock, 10) || 0,
      });
    }

    onClose();
  };

  const footwearCategories: { key: ProductCategory; label: string; icon: string }[] = [
    { key: 'Calzado', label: '👟 Calzado', icon: 'Shoes' },
    { key: 'Gorras', label: '🧢 Gorras', icon: 'Cap' },
    { key: 'Medias', label: '🧦 Medias', icon: 'Socks' },
    { key: 'Accesorios', label: '🎒 Accesorios', icon: 'Bag' },
    { key: 'Ropa', label: '👕 Ropa', icon: 'Shirt' },
    { key: 'Otros', label: '📦 Otros', icon: 'Box' },
  ];
  const defaultCategories: { key: ProductCategory; label: string; icon: string }[] = isFootwear
    ? footwearCategories
    : industry.initialCategories.map((category) => ({ key: category as ProductCategory, label: category, icon: 'Box' }));
  const categoriesList = Array.from(new Set([
    ...defaultCategories.map((item) => item.key),
    ...configuredProductCategories,
    categoria,
  ])).map((category) => defaultCategories.find((item) => item.key === category) || {
    key: category as ProductCategory, label: category, icon: 'Box',
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden my-6 max-h-[92vh] flex flex-col">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg tracking-tight">
                {editingProduct ? `Editar ${industry.productLabel}` : `Registrar ${industry.productLabel}`}
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                {editingProduct
                  ? 'Modifica precios, existencias y datos del artículo'
                  : isFootwear
                    ? 'Crea un modelo con múltiples tallas y colores o un artículo individual'
                    : 'Registra un producto, presentación, precio y cantidad disponible'}
              </p>
            </div>
          </div>
          <button
            onClick={handleCloseModal}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs (Only for new products) */}
        {!editingProduct && isFootwear && (
          <div className="bg-slate-100 p-2 border-b border-slate-200 flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setEntryMode('multi')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                entryMode === 'multi'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Modelo con Múltiples Tallas (Recomendado)</span>
            </button>
            <button
              type="button"
              onClick={() => setEntryMode('single')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                entryMode === 'single'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Tag className="w-4 h-4" />
              <span>Artículo Individual (1 sola talla)</span>
            </button>
          </div>
        )}

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs flex-1">
          
          {/* Category Selector Chips */}
          <div>
            <label className="block text-slate-700 font-bold mb-1.5">
              Categoría del Producto *
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {categoriesList.map((cat) => (
                <button
                  type="button"
                  key={cat.key}
                  onClick={() => handleCategoryChange(cat.key)}
                  className={`py-2 px-2 text-center rounded-xl border text-xs font-semibold transition cursor-pointer ${
                    categoria === cat.key
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-bold shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-slate-700 font-bold">
              Clasificación de inventario *
              <select
                required
                value={clasificacionInventario}
                onChange={(event) => {
                  const nextClassification = event.target.value as InventoryClassification;
                  setClasificacionInventario(nextClassification);
                  if (industryKey === 'food_manufacturing' && (industry.initialCategories as readonly string[]).includes(nextClassification)) {
                    setCategoria(nextClassification as ProductCategory);
                  }
                  if (nextClassification === 'Productos terminados' && !editingProduct) setSingleStock('0');
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
              >
                {INVENTORY_CLASSIFICATIONS.map((classification) => (
                  <option key={classification} value={classification}>{classification}</option>
                ))}
              </select>
              <span className="mt-1 block text-[10px] font-normal text-slate-500">
                Los bienes muebles e inmuebles se administran como activos fijos, fuera del inventario.
              </span>
            </label>
          </div>

          {/* Product Basic Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-slate-700 font-bold mb-1">
                {isFootwear ? 'Nombre del modelo / artículo *' : clasificacionInventario === 'Materia prima' ? 'Nombre de la materia prima / insumo *' : clasificacionInventario === 'Productos en proceso' ? 'Nombre del producto en proceso *' : clasificacionInventario === 'Productos terminados' ? 'Nombre del producto terminado *' : 'Nombre del ' + industry.productLabel.toLocaleLowerCase('es') + ' / artículo *'}
              </label>
              <input
                type="text"
                required={!(entryMode === 'multi' && colorImages.length > 0 && !editingProduct)}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder={
                  isFootwear
                    ? categoria === 'Gorras'
                      ? 'Ej. Gorra New Era NY Yankees 59FIFTY'
                      : categoria === 'Medias'
                        ? 'Ej. Medias deportivas pack x3'
                        : 'Ej. Modelo, marca y referencia'
                    : clasificacionInventario === 'Materia prima'
                      ? 'Ej. Harina, tela, resina, acero, envases...'
                      : clasificacionInventario === 'Productos en proceso'
                        ? 'Ej. Producto en elaboración / lote'
                        : clasificacionInventario === 'Productos terminados'
                          ? 'Ej. Nombre comercial del producto'
                          : 'Ej. Nombre del producto o artículo'
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white text-xs"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">
                Código SKU Base *
              </label>
              <input
                type="text"
                required={!(entryMode === 'multi' && colorImages.length > 0 && !editingProduct)}
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder={isFootwear ? 'Ej. NK-AF1-003' : clasificacionInventario === 'Materia prima' ? 'Ej. MP-001' : 'Ej. SKU-001'}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono focus:outline-none focus:border-indigo-500 focus:bg-white text-xs"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                {entryMode === 'multi' && isFootwear ? 'Se anexará -TALLA a cada variante (ej. NK-AF1-38)' : 'Código único del artículo'}
              </span>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">
                Marca
              </label>
              <input
                type="text"
                value={marca}
                onChange={(e) => setMarca(e.target.value)}
                placeholder={isFootwear ? 'Nike, Adidas, New Era, Puma...' : 'Marca, fabricante o proveedor (opcional)'}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white text-xs"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">
                {isFootwear && categoria === 'Calzado' ? 'Tipo de calzado' : isFootwear ? 'Tipo / subcategoría' : 'Tipo / especificación'}
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as ShoeType)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white text-xs font-semibold"
              >
                {(isFootwear
                ? Array.from(new Set([...getTypesForCategory(categoria), ...(tipo ? [tipo] : [])]))
                : clasificacionInventario === 'Materia prima'
                  ? ['Otros', 'Líquido', 'Sólido', 'Polvo', 'Granulado', 'Refrigerado', 'Congelado']
                  : clasificacionInventario === 'Productos en proceso'
                    ? ['Otros', 'En elaboración', 'En control de calidad', 'Pendiente de ensamblaje']
                    : ['Otros', 'Unidad', 'Paquete', 'Caja', 'Litro', 'Kilogramo', 'Metro', 'Servicio']
              ).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {isFootwear && <div>
              <label className="block text-slate-700 font-bold mb-1">
                Color o Colores
              </label>
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder={entryMode === 'multi' ? 'Ej. Blanco, Negro (separa con coma para varios)' : 'Ej. Blanco / Rojo'}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white text-xs"
              />
              {entryMode === 'multi' && (
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Si colocas varios colores separados por coma, se crearán para cada talla.
                </span>
              )}
            </div>}

            {isFootwear && <div>
              <label className="block text-slate-700 font-bold mb-1">
                Público / Género
              </label>
              <select
                value={genero}
                onChange={(e) => setGenero(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white text-xs"
              >
                <option value="Unisex">Unisex</option>
                <option value="Caballero">Caballero (Hombre)</option>
                <option value="Dama">Dama (Mujer)</option>
                <option value="Niño">Niño</option>
                <option value="Niña">Niña</option>
              </select>
            </div>}
          </div>

          {/* Autenticidad: Original vs Réplica */}
          {isFootwear && <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <label className="block text-slate-700 font-bold mb-2 text-xs">
              Autenticidad
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEsOriginal(true)}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border-2 transition cursor-pointer ${
                  esOriginal
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Original
              </button>
              <button
                type="button"
                onClick={() => setEsOriginal(false)}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border-2 transition cursor-pointer ${
                  !esOriginal
                    ? 'bg-amber-50 border-amber-500 text-amber-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                Réplica
              </button>
            </div>
          </div>}

          {/* Description & Social Media Copy */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-slate-800 font-bold text-xs flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>{isFootwear ? 'Descripción comercial y catálogo' : 'Descripción del producto (opcional)'}</span>
              </label>
              {aiAnalysisSuccess && (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  ✓ Generado por Gemini AI
                </span>
              )}
            </div>
            <textarea
              rows={3}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={isFootwear ? 'Descripción comercial, materiales y detalles del modelo...' : 'Descripción breve, composición, uso o especificaciones del producto (opcional)...'}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 text-xs resize-none"
            />
            {descripcionOriginalIA && descripcion !== descripcionOriginalIA && (
              <button
                type="button"
                onClick={() => setDescripcion(descripcionOriginalIA)}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                title="Descartar tus cambios y volver al texto que generó la IA"
              >
                <RotateCcw className="w-3 h-3" />
                Restaurar descripción original de la IA
              </button>
            )}
          </div>

          {/* Pricing & Cost Matrix */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
            <div className="font-bold text-slate-800 text-xs flex items-center justify-between">
              <span>Precios y Márgenes de Ganancia</span>
              {clasificacionInventario !== 'Materia prima' && clasificacionInventario !== 'Productos en proceso' && <span className={`text-[11px] font-bold ${margenGanancia >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                Margen: ${margenGanancia.toFixed(2)} ({margenPorcentaje.toFixed(1)}%)
              </span>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">
                  {isProductionInput ? 'Costo total de compra/lote (USD) *' : 'Costo de compra unitario (USD) *'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 font-bold">$</span>
                  <input type="number" step="0.01" min="0" required value={isProductionInput ? costoTotalCompra : costo} onChange={(e) => isProductionInput ? setCostoTotalCompra(e.target.value) : setCosto(e.target.value)} placeholder={isProductionInput ? 'Ej. 120.00' : 'Ej. 1.20'} className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 font-mono font-bold focus:outline-none focus:border-indigo-500" />
                </div>
                {isProductionInput && <p className="mt-1 text-[11px] leading-snug text-slate-500">Se divide entre la cantidad recibida para calcular el costo unitario.</p>}
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">{isProductionInput ? 'Costo unitario calculado (USD)' : 'Costo unitario (USD)'}</label>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-mono font-bold text-emerald-800">
                  {'$' + (isProductionInput && Number(singleStock) > 0 && costoTotalCompra !== '' ? parsedCosto.toFixed(4) : (parseFloat(costo) || 0).toFixed(2))}
                </div>
                {isProductionInput && <p className="mt-1 text-[11px] leading-snug text-slate-500">Este valor se guarda y se utiliza en las recetas.</p>}
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">
                  {isProductionInput ? 'Precio de venta (opcional)' : 'Precio de Venta PVP (USD) *'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required={clasificacionInventario !== 'Materia prima' && clasificacionInventario !== 'Productos en proceso'}
                    value={precio}
                    onChange={(e) => setPrecio(e.target.value)}
                    className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 font-mono font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">
                  Stock Mínimo de Alerta
                </label>
                <input
                  type="number"
                  min="0"
                  value={stockMinimo}
                  onChange={(e) => setStockMinimo(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* SIZES AND STOCK SECTION */}
          {entryMode === 'multi' && !editingProduct ? (
            <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold text-indigo-950 text-xs flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <span>Tallas y Cantidades Físicas en Stock</span>
                  </h4>
                  <p className="text-[11px] text-indigo-700">
                    Marca las tallas disponibles e indica cuántos pares/unidades tienes de cada una.
                  </p>
                </div>

                <div className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-lg border border-indigo-200 text-xs">
                  <span className="font-bold text-slate-700">Total a ingresar:</span>
                  <span className="px-2 py-0.5 rounded-full font-mono font-bold bg-indigo-600 text-white text-[11px]">
                    {totalPairsCount} pares/uds
                  </span>
                </div>
              </div>

              {/* Preset Size Buttons Chips */}
              <div>
                <span className="text-[11px] text-slate-500 font-semibold mb-1.5 block">
                  Tallas predeterminadas para {categoria} (haz clic para activar/desactivar):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {getPresetSizes(categoria).map((sz) => {
                    const isSelected = activeSizes.some((s) => s.talla === sz);
                    return (
                      <button
                        type="button"
                        key={sz}
                        onClick={() => togglePresetSize(sz)}
                        className={`px-3 py-1 rounded-lg font-mono text-xs font-bold transition cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {sz} {isSelected && '✓'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Add Custom Size input */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Otra talla personalizada (ej. 36.5, XL, Pack)..."
                  value={customTallaInput}
                  onChange={(e) => setCustomTallaInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomTalla();
                    }
                  }}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 flex-1"
                />
                <button
                  type="button"
                  onClick={handleAddCustomTalla}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg text-xs cursor-pointer"
                >
                  + Añadir Talla
                </button>
              </div>

              {/* Bulk Quantity Tool */}
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center justify-between gap-3 text-xs">
                <span className="text-slate-600 font-medium text-[11px]">
                  Rellenar todas las tallas seleccionadas con la misma cantidad:
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={bulkQtyToApply}
                    onChange={(e) => setBulkQtyToApply(parseInt(e.target.value, 10) || 0)}
                    className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-center font-mono font-bold"
                  />
                  <button
                    type="button"
                    onClick={handleApplyToAllSizes}
                    className="px-3 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-bold rounded transition cursor-pointer text-xs"
                  >
                    Aplicar a todas
                  </button>
                </div>
              </div>

              {/* Active Sizes Steppers Grid */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-700 block">
                  Cantidades por Talla ({activeSizes.length} seleccionadas):
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {activeSizes.map((item) => (
                    <div
                      key={item.talla}
                      className="bg-white p-2 rounded-xl border border-slate-200 flex items-center justify-between shadow-xs"
                    >
                      <span className="font-mono font-bold text-slate-900 text-xs px-1.5 py-0.5 bg-slate-100 rounded">
                        Talla {item.talla}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateSizeStock(item.talla, item.stock - 1)}
                          className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={item.stock}
                          onChange={(e) => updateSizeStock(item.talla, parseInt(e.target.value, 10) || 0)}
                          className="w-12 py-0.5 text-center font-mono font-bold bg-slate-50 border border-slate-200 rounded text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => updateSizeStock(item.talla, item.stock + 1)}
                          className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Single Item Mode: 1 Talla and 1 Stock */
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Talla del Producto *
                </label>
                <input
                  type="text"
                  required
                  value={singleTalla}
                  onChange={(e) => setSingleTalla(e.target.value)}
                  placeholder="Ej. 38, Ajustable, Pack x3..."
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 font-mono font-bold text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Cantidad Física en Stock *
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={singleStock}
                  onChange={(e) => setSingleStock(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 font-mono font-bold text-xs"
                />
                {industryKey === 'food_manufacturing' && clasificacionInventario === 'Productos terminados' && (
                  <span className="mt-1 block text-[10px] font-normal text-slate-500">Si todavía no has fabricado este producto, déjalo en 0. Las existencias se agregarán al confirmar la primera producción.</span>
                )}
              </div>
            </div>
          )}

          {/* IMAGE & CAMERA SECTION (COMPLETELY FIXED - NO BLACK PHOTOS) */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <label className="text-slate-700 font-bold flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-indigo-600" />
                <span>Fotografía del Producto</span>
              </label>

              {/* Mode buttons */}
              <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setImageMode('camera');
                    startCamera();
                  }}
                  className={`px-2.5 py-1 rounded-md font-semibold transition flex items-center gap-1 cursor-pointer ${
                    imageMode === 'camera'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Camera className="w-3 h-3" />
                  <span>Cámara en Vivo</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setImageMode('upload');
                  }}
                  className={`px-2.5 py-1 rounded-md font-semibold transition flex items-center gap-1 cursor-pointer ${
                    imageMode === 'upload'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Upload className="w-3 h-3" />
                  <span>Subir Foto</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setImageMode('url');
                  }}
                  className={`px-2.5 py-1 rounded-md font-semibold transition flex items-center gap-1 cursor-pointer ${
                    imageMode === 'url'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Link className="w-3 h-3" />
                  <span>URL</span>
                </button>
              </div>
            </div>

            {/* LIVE CAMERA MODE */}
            {imageMode === 'camera' && (
              <div className="space-y-2">
                {isCameraActive ? (
                  <div className="relative bg-black rounded-xl overflow-hidden border border-slate-300 aspect-4/3 max-h-64 flex items-center justify-center">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      onLoadedMetadata={(e) => {
                        const vid = e.currentTarget;
                        vid.play().then(() => setIsCameraReady(true)).catch(console.error);
                      }}
                      className="w-full h-full object-cover"
                    />

                    {/* Viewfinder crosshairs */}
                    <div className="absolute inset-4 border-2 border-dashed border-white/60 rounded-xl pointer-events-none flex flex-col justify-between p-2">
                      <span className="text-[9px] text-white/90 bg-black/60 px-2 py-0.5 rounded self-start font-mono">
                        Enfoca el calzado o artículo
                      </span>
                      <span className="text-[9px] text-white/90 bg-black/60 px-2 py-0.5 rounded self-end font-mono">
                        {cameraFacing === 'environment' ? 'Cámara Trasera' : 'Cámara Frontal'}
                      </span>
                    </div>

                    {/* Camera controls toolbar */}
                    <div className="absolute bottom-3 inset-x-3 flex items-center justify-between px-3 py-2 bg-black/75 backdrop-blur-xs rounded-xl">
                      <button
                        type="button"
                        onClick={handleSwitchCamera}
                        className="px-2.5 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition flex items-center gap-1.5 text-xs cursor-pointer"
                        title="Cambiar Cámara"
                      >
                        <SwitchCamera className="w-4 h-4" />
                        <span className="hidden sm:inline">Girar</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleCapturePhoto}
                          className="px-3 sm:px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg cursor-pointer transition transform active:scale-95"
                        >
                          <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
                          <span>Foto</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleCaptureAndAnalyzeWithAi}
                          className="px-3 sm:px-4 py-2 rounded-full bg-linear-to-r from-cyan-500 via-indigo-600 to-purple-600 hover:opacity-90 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg cursor-pointer transition transform active:scale-95"
                          title="Tomar foto y reconocer calzado con IA Gemini"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-cyan-200 animate-spin" />
                          <span>Foto + IA</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={stopCamera}
                        className="px-2.5 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition text-xs cursor-pointer"
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                        <Camera className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 text-xs">Cámara en Vivo</p>
                        <p className="text-[11px] text-slate-500">
                          Abre tu cámara web o usa la cámara de tu móvil para tomar la foto directamente.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => startCamera()}
                        className="flex-1 sm:flex-none px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Abrir Cámara</span>
                      </button>

                      {/* Native Mobile Camera trigger */}
                      <button
                        type="button"
                        onClick={() => nativeCameraInputRef.current?.click()}
                        className="flex-1 sm:flex-none px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                        title="Tomar foto con app nativa del celular"
                      >
                        <Smartphone className="w-4 h-4 text-emerald-400" />
                        <span>Cámara del Móvil</span>
                      </button>
                    </div>
                  </div>
                )}

                {cameraError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{cameraError}</span>
                  </div>
                )}
              </div>
            )}

            {/* UPLOAD FILE MODE */}
            {imageMode === 'upload' && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-1.5 ${
                  isDraggingFile
                    ? 'border-indigo-500 bg-indigo-50/50'
                    : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
                }`}
              >
                <Upload className="w-6 h-6 text-slate-400" />
                <p className="font-semibold text-slate-700 text-xs">
                  Haz clic o arrastra varias imágenes aquí
                </p>
                <p className="text-[10px] text-slate-400">JPG, PNG o WebP • varias a la vez • cada foto puede ser un color</p>
              </div>
            )}

            {/* MULTI-COLOR IMAGE VARIANTS */}
            {colorImages.length > 0 && (
              <div className="space-y-2 p-3 bg-indigo-50/60 border border-indigo-200 rounded-xl">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-indigo-900 text-xs">Productos a crear ({colorImages.length})</p>
                    <p className="text-[10px] text-indigo-700">Cada foto será un producto independiente. La IA completa nombre, marca, tipo y descripción cuando puede; si falta el SKU, el sistema lo genera. Revisa y completa talla, stock, costo y precio antes de vender.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {colorImages.map((item, index) => (
                    <div key={item.id} className="bg-white border border-indigo-100 rounded-xl p-2 flex gap-2 items-center">
                      <img src={item.imagen} alt={`Color ${index + 1}`} className="w-16 h-16 rounded-lg object-contain bg-slate-50 border border-slate-200 shrink-0" />
                      <div className="min-w-0 flex-1 grid grid-cols-2 gap-1.5">
                        <input type="text" value={item.nombre || ''} onChange={(e) => updateColorImage(item.id,{nombre:e.target.value})} placeholder="Nombre del producto" className="col-span-2 w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs" />
                        <input type="text" value={item.sku || ''} onChange={(e) => updateColorImage(item.id,{sku:e.target.value.toUpperCase()})} placeholder="SKU" className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs" />
                        <input type="text" value={item.color || ''} onChange={(e) => updateColorImage(item.id,{color:e.target.value})} placeholder="Color" className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs" />
                        <input type="text" value={item.talla || ''} onChange={(e) => updateColorImage(item.id,{talla:e.target.value})} placeholder="Talla" className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs" />
                        <input type="number" min="0" value={Number(item.stock ?? 0)} onChange={(e) => updateColorImage(item.id,{stock:Number(e.target.value)||0})} placeholder="Stock" className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs" />
                        <input type="number" min="0" step="0.01" value={Number(item.costo ?? costo)} onChange={(e) => updateColorImage(item.id,{costo:Number(e.target.value)||0})} placeholder="Costo" className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs" />
                        <input type="number" min="0" step="0.01" value={Number(item.precio ?? precio)} onChange={(e) => updateColorImage(item.id,{precio:Number(e.target.value)||0})} placeholder="Precio" className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs" />
                        <input type="text" value={item.marca || ''} onChange={(e) => updateColorImage(item.id,{marca:e.target.value})} placeholder="Marca detectada por IA" className="col-span-2 w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs" />
                        <textarea value={item.descripcion || ''} onChange={(e) => updateColorImage(item.id,{descripcion:e.target.value})} placeholder={item.aiLoading ? 'La IA está analizando esta foto…' : 'Descripción individual de esta foto'} rows={3} className="col-span-2 w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs" />
                        <div className="col-span-2 text-[10px] text-indigo-600">{item.aiLoading ? '✨ Analizando esta imagen con IA…' : item.descripcion ? '✓ Descripción individual lista; puedes editarla' : 'No se pudo generar la descripción automáticamente; puedes escribirla.'}</div>
                      </div>
                      <button type="button" onClick={() => removeColorImage(item.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg" title="Quitar foto/color">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* URL MODE */}
            {imageMode === 'url' && (
              <div>
                <input
                  type="url"
                  placeholder="https://ejemplo.com/foto-calzado.jpg"
                  value={imagen}
                  onChange={(e) => setImagen(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 text-xs"
                />
              </div>
            )}

            {/* Hidden file inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <input
              ref={nativeCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Compressing Indicator */}
            {isCompressingImage && (
              <div className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-700 text-xs animate-pulse">
                <span className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin shrink-0" />
                <div>
                  <span className="font-semibold block">Optimizando y comprimiendo imagen...</span>
                  <span className="text-[11px] text-indigo-600">Reduciendo peso a &lt; 500 KB manteniendo alta resolución para catálogo.</span>
                </div>
              </div>
            )}

            {/* Image Preview Thumbnail */}
            {imagen && (
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl gap-3">
                  <div className="flex items-center space-x-3 min-w-0">
                    <img
                      src={imagen}
                      alt="Vista previa"
                      className="w-14 h-14 object-cover rounded-lg border border-slate-200 bg-white shrink-0 shadow-xs"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-slate-800 block truncate">
                        Foto lista para catálogo
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-emerald-600 font-semibold">
                          ✓ Asignada
                        </span>
                        {compressionInfo ? (
                          <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded font-medium">
                            {formatFileSize(compressionInfo.compressedSize)}
                            {compressionInfo.reductionPercentage > 0 && (
                              <span className="text-emerald-700 ml-1 font-bold">
                                (-{compressionInfo.reductionPercentage}%)
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-medium">
                            {formatFileSize(estimateDataUrlSize(imagen))}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Background cleaning button */}
                    <button
                      type="button"
                      onClick={() => handleCleanBackground()}
                      disabled={isRemovingBackground}
                      title="Quitar fondo y poner fondo blanco de estudio"
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-indigo-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      <Wand2 className={`w-3.5 h-3.5 text-indigo-600 ${isRemovingBackground ? 'animate-spin' : ''}`} />
                      <span>{isRemovingBackground ? 'Limpiando...' : 'Fondo Blanco'}</span>
                    </button>

                    {/* Trigger Gemini AI Analysis */}
                    <button
                      type="button"
                      onClick={() => handleAnalyzeWithAi()}
                      disabled={isAiAnalyzing}
                      className="px-3 py-1.5 bg-linear-to-r from-cyan-600 via-indigo-600 to-purple-600 hover:opacity-95 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap"
                    >
                      <Sparkles className={`w-3.5 h-3.5 text-cyan-200 ${isAiAnalyzing ? 'animate-spin' : ''}`} />
                      <span>{isAiAnalyzing ? 'Analizando...' : '✨ Auto-Identificar con IA'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setImagen('')}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-200 transition cursor-pointer"
                      title="Eliminar foto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* AI Detection Banner */}
                {aiAnalysisSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold flex items-center gap-1 text-emerald-700">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        <span>¡Calzado Reconocido con Éxito!</span>
                      </div>
                      <div className="text-[11px] text-emerald-800 mt-0.5">
                        Marca: <strong>{aiAnalysisSuccess.marca}</strong> • Modelo: <strong>{aiAnalysisSuccess.modelo}</strong> • Tipo: <strong>{aiAnalysisSuccess.tipo}</strong>
                      </div>
                      <div className="text-[10px] text-emerald-600 mt-0.5">
                        Campos de nombre, marca, color, material y descripción completados. Los precios deben confirmarse manualmente.
                      </div>
                    </div>
                  </div>
                )}

                {/* AI Error */}
                {aiError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{aiError}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleCloseModal}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg transition cursor-pointer whitespace-nowrap"
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="px-4 py-2 sm:px-5 sm:py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 transition cursor-pointer whitespace-nowrap"
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>
                {editingProduct
                  ? 'Guardar Cambios'
                  : entryMode === 'multi'
                  ? `Guardar Modelo (${activeSizes.length} Tallas, ${totalPairsCount} pares)`
                  : 'Guardar Producto'}
              </span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
