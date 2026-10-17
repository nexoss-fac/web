import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Boxes,
  HelpCircle,
  RefreshCw,
  Search,
  Check
} from 'lucide-react';
import { ShoeProduct, ShoeType, ProductCategory, InventoryClassification, INVENTORY_CLASSIFICATIONS } from '../../types';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport?: (products: Omit<ShoeProduct, 'id' | 'created_at'>[], replaceExisting: boolean) => void;
  onImportSuccess?: (products: Omit<ShoeProduct, 'id' | 'created_at'>[], replaceExisting: boolean) => void;
}

interface ParsedRowPreview {
  nombre: string;
  sku: string;
  categoria: string;
  clasificacion_inventario: InventoryClassification;
  marca: string;
  tipo: ShoeType;
  talla: string;
  color: string;
  precio: number;
  costo: number;
  stock: number;
  stock_minimo: number;
  imagen: string;
  isValid: boolean;
  error?: string;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
  onImportSuccess,
}) => {
  if (!isOpen) return null;

  const [parsedItems, setParsedItems] = useState<ParsedRowPreview[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [replaceExisting, setReplaceExisting] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Normalizador de texto para emparejar nombres de columnas
  const normalizeKey = (key: string) => {
    return key
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  };

  // Función para procesar el archivo Excel o CSV
  const processExcelFile = async (file: File) => {
    setIsLoading(true);
    setStatusMessage(null);
    setFileName(file.name);

    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (rawRows.length === 0) {
        setStatusMessage({ text: 'El archivo está vacío o no contiene filas de datos.', type: 'error' });
        setIsLoading(false);
        return;
      }

      const generatedItems: ParsedRowPreview[] = [];

      // Detectamos si el archivo tiene columnas específicas de tallas (formato matricial unificado: 35, 36, 37... o S, M, L)
      const sizeColumnsNumbers = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '35.5', '36.5', '37.5', '38.5', '39.5', '40.5', '41.5', '42.5', '43.5', '44.5'];
      const sizeColumnsLetters = ['unica', 'ajustable', 's', 'm', 'l', 'xl', 'xxl', 'packx3', 'packx6'];

      rawRows.forEach((row, index) => {
        // Encontrar llaves del objeto
        const keys = Object.keys(row);
        const normalizedMap: Record<string, any> = {};
        keys.forEach((k) => {
          normalizedMap[normalizeKey(k)] = row[k];
        });

        // Extraer campos principales
        const nombre = String(
          normalizedMap['nombre'] ||
          normalizedMap['producto'] ||
          normalizedMap['modelo'] ||
          normalizedMap['descripcion'] ||
          normalizedMap['name'] ||
          ''
        ).trim();

        if (!nombre) return; // Ignorar filas vacías

        const baseSku = String(
          normalizedMap['sku'] ||
          normalizedMap['codigo'] ||
          normalizedMap['cod'] ||
          normalizedMap['referencia'] ||
          `MKD-${Math.floor(1000 + Math.random() * 9000)}`
        ).trim().toUpperCase();

        const marca = String(
          normalizedMap['marca'] ||
          normalizedMap['brand'] ||
          'Genérica'
        ).trim();

        const rawCat = String(
          normalizedMap['categoria'] ||
          normalizedMap['category'] ||
          'Calzado'
        ).trim();

        // Mapear categoría
        let categoria: ProductCategory = 'Calzado';
        const lowerCat = rawCat.toLowerCase();
        if (lowerCat.includes('gorra')) categoria = 'Gorras';
        else if (lowerCat.includes('media') || lowerCat.includes('calcetin')) categoria = 'Medias';
        else if (lowerCat.includes('accesorio')) categoria = 'Accesorios';
        else if (lowerCat.includes('ropa') || lowerCat.includes('textil')) categoria = 'Ropa';
        else if (lowerCat.includes('otro')) categoria = 'Otros';
        else categoria = 'Calzado';

        const rawInventoryClassification = String(
          normalizedMap['clasificacioninventario'] ||
          normalizedMap['clasificacion'] ||
          normalizedMap['tipodebien'] ||
          'Mercancía'
        ).trim();
        const clasificacion_inventario = INVENTORY_CLASSIFICATIONS.find(
          (classification) => classification.toLowerCase() === rawInventoryClassification.toLowerCase()
        ) || 'Mercancía';

        // Tipo
        let tipo: ShoeType = 'Botines Fútbol Campo';
        const rawTipo = String(normalizedMap['tipo'] || normalizedMap['type'] || '').trim();
        const lowerTipo = rawTipo.toLowerCase();
        const lowerNombre = String(nombre || '').toLowerCase();

        if (lowerTipo.includes('botin') && (lowerTipo.includes('futbol') || lowerTipo.includes('campo'))) {
          tipo = 'Botines Fútbol Campo';
        } else if (lowerTipo.includes('micro') || lowerTipo.includes('taco')) {
          tipo = 'Micro Tacos';
        } else if (lowerTipo.includes('futsal') || lowerTipo.includes('sala')) {
          tipo = 'Futsala';
        } else if (lowerTipo.includes('gancho')) {
          tipo = 'Béisbol Gancho';
        } else if (lowerTipo.includes('beisbol') || lowerTipo.includes('baseball')) {
          tipo = 'Béisbol';
        } else if (lowerTipo.includes('futbol') || lowerTipo.includes('campo')) {
          tipo = 'Fútbol Campo';
        } else if (lowerTipo.includes('run')) {
          tipo = 'Running';
        } else if (rawTipo) {
          tipo = rawTipo as ShoeType;
        } else if (lowerNombre.includes('botin')) {
          tipo = 'Botines Fútbol Campo';
        } else if (lowerNombre.includes('micro') || lowerNombre.includes('taco')) {
          tipo = 'Micro Tacos';
        } else if (lowerNombre.includes('futsal') || lowerNombre.includes('sala')) {
          tipo = 'Futsala';
        } else if (lowerNombre.includes('gancho')) {
          tipo = 'Béisbol Gancho';
        } else if (lowerNombre.includes('beisbol') || lowerNombre.includes('baseball')) {
          tipo = 'Béisbol';
        } else if (categoria === 'Gorras') {
          tipo = 'Gorras';
        } else if (categoria === 'Medias') {
          tipo = 'Medias';
        } else if (categoria === 'Accesorios') {
          tipo = 'Accesorios';
        } else if (categoria === 'Ropa') {
          tipo = 'Ropa';
        } else {
          tipo = 'Fútbol Campo';
        }

        const color = String(
          normalizedMap['color'] ||
          normalizedMap['colores'] ||
          'Estándar'
        ).trim();

        const precio = Math.max(0, Number(normalizedMap['precio'] || normalizedMap['preciousd'] || normalizedMap['pvp'] || normalizedMap['price'] || 0));
        const costo = Math.max(0, Number(normalizedMap['costo'] || normalizedMap['costousd'] || normalizedMap['cost'] || 0));
        const stockMin = Math.max(1, Number(normalizedMap['stockminimo'] || normalizedMap['minimo'] || 2));
        const imagen = String(normalizedMap['imagen'] || normalizedMap['imagenurl'] || normalizedMap['foto'] || '').trim();

        // Comprobar si la fila tiene columnas individuales para tallas (formato matricial)
        const matchedSizeCols = keys.filter((k) => {
          const norm = normalizeKey(k);
          return sizeColumnsNumbers.includes(norm) || sizeColumnsLetters.includes(norm);
        });

        if (matchedSizeCols.length > 0) {
          // Formato Matricial: Generar una variante por cada columna de talla que tenga stock > 0
          matchedSizeCols.forEach((colKey) => {
            const qty = Number(row[colKey]) || 0;
            if (qty > 0) {
              const rawTalla = colKey.trim();
              const formattedTalla = rawTalla.replace(/[^0-9a-zA-Z]/g, '');
              const itemSku = `${baseSku}-${formattedTalla}`;

              generatedItems.push({
                nombre,
                sku: itemSku,
                categoria,
                clasificacion_inventario,
                marca,
                tipo,
                talla: rawTalla,
                color,
                precio: precio || 60,
                costo: costo || 30,
                stock: qty,
                stock_minimo: stockMin,
                imagen: imagen || '/shoe-placeholder.svg',
                isValid: true,
              });
            }
          });
        } else {
          // Formato estándar con columna Talla o Tallas
          const rawTallasField = String(
            normalizedMap['talla'] ||
            normalizedMap['tallas'] ||
            normalizedMap['size'] ||
            normalizedMap['sizes'] ||
            (categoria === 'Calzado' ? '38' : 'Única')
          ).trim();

          const generalStock = Math.max(0, Number(normalizedMap['stock'] || normalizedMap['cantidad'] || normalizedMap['cant'] || normalizedMap['pares'] || 1));

          // Si el usuario puso múltiples tallas en la misma celda separadas por comas o barras (ej: "38, 39, 40, 41" o "38:2, 39:4")
          if (rawTallasField.includes(',') || rawTallasField.includes('/') || rawTallasField.includes(';') || rawTallasField.includes(':')) {
            const splitTallas = rawTallasField.split(/[,/;]/).map((t) => t.trim()).filter(Boolean);
            splitTallas.forEach((tallaToken) => {
              let tName = tallaToken;
              let tStock = generalStock;

              // Soporte para "38:4" (talla 38 con 4 unidades)
              if (tallaToken.includes(':')) {
                const parts = tallaToken.split(':');
                tName = parts[0].trim();
                tStock = Number(parts[1]) || generalStock;
              }

              generatedItems.push({
                nombre,
                sku: `${baseSku}-${tName.replace(/\s+/g, '')}`,
                categoria,
                clasificacion_inventario,
                marca,
                tipo,
                talla: tName,
                color,
                precio: precio || 60,
                costo: costo || 30,
                stock: tStock,
                stock_minimo: stockMin,
                imagen: imagen || '/shoe-placeholder.svg',
                isValid: true,
              });
            });
          } else {
            // Un solo registro por fila
            generatedItems.push({
              nombre,
              sku: baseSku,
              categoria,
              clasificacion_inventario,
              marca,
              tipo,
              talla: rawTallasField,
              color,
              precio: precio || 60,
              costo: costo || 30,
              stock: generalStock,
              stock_minimo: stockMin,
              imagen: imagen || '/shoe-placeholder.svg',
              isValid: true,
            });
          }
        }
      });

      if (generatedItems.length === 0) {
        setStatusMessage({
          text: 'No se encontraron productos con formato válido. Descarga la plantilla de ejemplo para ver las columnas esperadas.',
          type: 'error',
        });
      } else {
        setParsedItems(generatedItems);
        setStatusMessage({
          text: `Se leyeron correctamente ${generatedItems.length} artículos/tallas listos para importar.`,
          type: 'success',
        });
      }
    } catch (err: any) {
      console.error('Error al procesar archivo Excel:', err);
      setStatusMessage({
        text: `Error al leer el archivo: ${err.message || 'Formato no soportado o corrupto'}`,
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processExcelFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processExcelFile(file);
    }
  };

  // Descargar plantilla Excel de ejemplo
  const downloadSampleTemplate = async () => {
    const sampleData = [
      {
        Nombre: 'Nike Air Force 1 07 Low',
        SKU: 'NK-AF1-WHT',
        Categoria: 'Calzado',
        Marca: 'Nike',
        Tipo: 'Deportivo',
        Talla: '38',
        Color: 'Blanco',
        Precio: 85,
        Costo: 45,
        Stock: 6,
        Stock_Minimo: 2,
        Clasificacion_Inventario: 'Mercancía',
        Imagen: '/shoe-placeholder.svg',
      },
      {
        Nombre: 'Nike Air Force 1 07 Low',
        SKU: 'NK-AF1-WHT-39',
        Categoria: 'Calzado',
        Marca: 'Nike',
        Tipo: 'Deportivo',
        Talla: '39',
        Color: 'Blanco',
        Precio: 85,
        Costo: 45,
        Stock: 8,
        Stock_Minimo: 2,
        Clasificacion_Inventario: 'Mercancía',
        Imagen: '/shoe-placeholder.svg',
      },
      {
        Nombre: 'Nike Air Force 1 07 Low',
        SKU: 'NK-AF1-WHT-40',
        Categoria: 'Calzado',
        Marca: 'Nike',
        Tipo: 'Deportivo',
        Talla: '40',
        Color: 'Blanco',
        Precio: 85,
        Costo: 45,
        Stock: 10,
        Stock_Minimo: 2,
        Clasificacion_Inventario: 'Mercancía',
        Imagen: '/shoe-placeholder.svg',
      },
      {
        Nombre: 'Adidas Samba Classic OG',
        SKU: 'AD-SAMBA-BLK',
        Categoria: 'Calzado',
        Clasificacion_Inventario: 'Mercancía',
        Marca: 'Adidas',
        Tipo: 'Casual',
        Talla: '38, 39, 40, 41, 42',
        Color: 'Negro / Blanco',
        Precio: 90,
        Costo: 48,
        Stock: 4,
        Stock_Minimo: 2,
        Imagen: '/shoe-placeholder.svg',
      },
      {
        Nombre: 'Gorra New Era NY Yankees 59FIFTY',
        SKU: 'NE-NY-5950',
        Categoria: 'Gorras',
        Marca: 'New Era',
        Tipo: 'Gorras',
        Talla: 'Ajustable',
        Color: 'Azul Marino',
        Precio: 35,
        Costo: 18,
        Stock: 12,
        Stock_Minimo: 3,
        Clasificacion_Inventario: 'Mercancía',
        Imagen: '/shoe-placeholder.svg',
      },
      {
        Nombre: 'Medias Deportivas Nike Cushion Crew (Pack x3)',
        SKU: 'NK-SOCK-PACK3',
        Categoria: 'Medias',
        Marca: 'Nike',
        Tipo: 'Medias',
        Talla: 'Pack x3',
        Color: 'Blancas',
        Precio: 15,
        Costo: 7,
        Stock: 25,
        Stock_Minimo: 5,
        Clasificacion_Inventario: 'Mercancía',
        Imagen: '/shoe-placeholder.svg',
      },
      {
        Nombre: 'Trenzas Planas Reflectivas 120cm',
        SKU: 'ACC-LACES-REF',
        Categoria: 'Accesorios',
        Clasificacion_Inventario: 'Mercancía',
        Marca: 'Crep Protect',
        Tipo: 'Accesorios',
        Talla: 'Única',
        Color: 'Gris Reflectivo',
        Precio: 8,
        Costo: 3,
        Stock: 30,
        Stock_Minimo: 5,
        Imagen: '/shoe-placeholder.svg',
      },
    ];

    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario');

    XLSX.writeFile(workbook, 'Plantilla_Inventario_NEXOSS_SHOP.xlsx');
  };

  const handleConfirmImport = () => {
    if (parsedItems.length === 0) return;

    const formattedProducts: Omit<ShoeProduct, 'id' | 'created_at'>[] = parsedItems.map((p) => ({
      nombre: p.nombre,
      sku: p.sku,
      categoria: p.categoria,
      clasificacion_inventario: p.clasificacion_inventario,
      marca: p.marca,
      tipo: p.tipo,
      talla: p.talla,
      color: p.color,
      moneda: 'USD',
      precio: p.precio,
      costo: p.costo,
      stock: p.stock,
      stock_minimo: p.stock_minimo,
      activo: true,
      imagen: p.imagen,
    }));

    if (onImport) {
      onImport(formattedProducts, replaceExisting);
    } else if (onImportSuccess) {
      onImportSuccess(formattedProducts, replaceExisting);
    }
    onClose();
  };

  const totalStockCount = parsedItems.reduce((sum, it) => sum + it.stock, 0);
  const totalCostAmount = parsedItems.reduce((sum, it) => sum + it.costo * it.stock, 0);
  const totalRetailAmount = parsedItems.reduce((sum, it) => sum + it.precio * it.stock, 0);

  const filteredPreview = parsedItems.filter((it) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (it.nombre || '').toLowerCase().includes(term) ||
      (it.sku || '').toLowerCase().includes(term) ||
      (it.marca || '').toLowerCase().includes(term) ||
      (it.categoria || '').toLowerCase().includes(term) ||
      (String(it.talla || '')).toLowerCase().includes(term)
    );
  });

  return (
    <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg tracking-tight flex items-center gap-2">
                <span>Subir Inventario desde Excel / CSV</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  .xlsx / .xls / .csv
                </span>
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Importa tu catálogo, añade calzado con múltiples tallas, gorras, medias y accesorios de una sola vez.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">

          {/* Download Template Banner */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2.5">
              <Download className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <span className="font-bold text-emerald-950">¿No tienes el formato exacto?</span>
                <p className="text-[11px] text-emerald-700">
                  Descarga nuestra plantilla oficial con ejemplos de calzado, gorras y medias con tallas unificadas.
                </p>
              </div>
            </div>
            <button
              onClick={downloadSampleTemplate}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-lg transition shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar Plantilla Excel</span>
            </button>
          </div>

          {/* Drag and Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-2.5 ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50/50'
                : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-slate-800">
                Arrastra tu archivo Excel aquí o haz clic para seleccionarlo
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Archivos compatibles: .xlsx, .xls, .csv (Detecta automáticamente columnas de tallas y productos)
              </p>
            </div>
            {fileName && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full">
                <FileText className="w-3.5 h-3.5" />
                <span>{fileName}</span>
              </span>
            )}
          </div>

          {/* Loading Indicator */}
          {isLoading && (
            <div className="py-8 text-center text-xs text-slate-500 flex flex-col items-center space-y-2">
              <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin" />
              <span>Analizando y extrayendo tallas y modelos del archivo...</span>
            </div>
          )}

          {/* Status message */}
          {statusMessage && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center space-x-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : statusMessage.type === 'error'
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : 'bg-blue-50 text-blue-800 border-blue-200'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span className="font-medium">{statusMessage.text}</span>
            </div>
          )}

          {/* Parsed Preview Section */}
          {parsedItems.length > 0 && (
            <div className="space-y-3 pt-2">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Modelos / Tallas</div>
                  <div className="text-base sm:text-lg font-bold text-slate-900 font-mono">
                    {parsedItems.length}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Unidades Físicas</div>
                  <div className="text-base sm:text-lg font-bold text-emerald-600 font-mono">
                    {totalStockCount} pares/uds
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Inversión (Costo)</div>
                  <div className="text-base sm:text-lg font-bold text-indigo-600 font-mono">
                    ${totalCostAmount.toFixed(2)}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Valor Venta (PVP)</div>
                  <div className="text-base sm:text-lg font-bold text-slate-900 font-mono">
                    ${totalRetailAmount.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Table Search and Options */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 pt-2">
                <div className="relative w-full sm:w-72">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Buscar en el archivo cargado..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Import Mode Selector */}
                <div className="flex items-center space-x-3 text-xs">
                  <label className="flex items-center space-x-2 cursor-pointer text-slate-700">
                    <input
                      type="radio"
                      name="importMode"
                      checked={!replaceExisting}
                      onChange={() => setReplaceExisting(false)}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-semibold">Sumar y conservar inventario actual</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer text-rose-700">
                    <input
                      type="radio"
                      name="importMode"
                      checked={replaceExisting}
                      onChange={() => setReplaceExisting(true)}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    <span className="font-semibold">Reemplazar catálogo completo</span>
                  </label>
                </div>
              </div>

              {/* Preview Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Producto / Modelo</th>
                      <th className="py-2 px-2.5">SKU</th>
                      <th className="py-2 px-2.5">Categoría</th>
                      <th className="py-2 px-2 text-center">Talla</th>
                      <th className="py-2 px-2">Color</th>
                      <th className="py-2 px-2 text-right">Costo</th>
                      <th className="py-2 px-2 text-right">Precio</th>
                      <th className="py-2 px-3 text-center">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredPreview.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-semibold text-slate-900 max-w-[200px] truncate">
                          {item.nombre}
                          <span className="text-[10px] text-slate-400 block font-normal">{item.marca}</span>
                        </td>
                        <td className="py-2 px-2.5 font-mono text-[11px] text-slate-600">{item.sku}</td>
                        <td className="py-2 px-2.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                            {item.categoria}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {item.talla}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-[11px] text-slate-700">{item.color}</td>
                        <td className="py-2 px-2 text-right font-mono text-[11px] text-slate-500">${item.costo.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right font-mono text-[11px] font-bold text-slate-900">${item.precio.toFixed(2)}</td>
                        <td className="py-2 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full font-mono font-bold text-xs bg-emerald-100 text-emerald-800">
                            {item.stock}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Footer actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg transition cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={parsedItems.length === 0}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 transition cursor-pointer disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" />
            <span>
              {replaceExisting
                ? `Reemplazar Inventario con ${parsedItems.length} Artículos`
                : `Importar ${parsedItems.length} Artículos / Tallas`}
            </span>
          </button>
        </div>

      </div>
    </div>
  );
};
