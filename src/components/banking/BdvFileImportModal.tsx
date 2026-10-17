import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  Landmark,
  ArrowDownLeft,
  ArrowUpRight,
  Sparkles,
  Search,
  Check,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { parseBdvFile, parseBdvRawText } from '../../services/bdvParser';
import { BdvParsedMovement } from '../../types';

interface BdvFileImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (count: number) => void;
}

export const BdvFileImportModal: React.FC<BdvFileImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { sales, expenses, exchangeRate, importBankMovements } = useStore();

  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [parsedMovements, setParsedMovements] = useState<BdvParsedMovement[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'todos' | 'credito' | 'debito'>('todos');
  const [searchTerm, setSearchTerm] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Cross-reference parsed movements with sales
  const crossReferenceMovements = (raw: BdvParsedMovement[]): BdvParsedMovement[] => {
    return raw.map((mov) => {
      // Look for matching sale by reference
      const cleanRef = mov.referencia.replace(/\D/g, '');

      const matchedSale = sales.find((s) => {
        return s.pagos.some((p) => {
          if (!p.referencia) return false;
          const cleanPaymentRef = p.referencia.replace(/\D/g, '');
          if (cleanPaymentRef.length >= 4 && cleanRef.length >= 4) {
            return (
              cleanPaymentRef.endsWith(cleanRef.slice(-6)) ||
              cleanRef.endsWith(cleanPaymentRef.slice(-6)) ||
              cleanPaymentRef === cleanRef
            );
          }
          return String(p.referencia || '').trim().toLowerCase() === String(mov.referencia || '').trim().toLowerCase();
        });
      });

      if (matchedSale) {
        return {
          ...mov,
          estado_conciliacion: 'conciliado',
          venta_id: matchedSale.id,
          factura_ref: matchedSale.numero_factura,
          cliente: `${matchedSale.cliente_nombre} ${matchedSale.cliente_apellido || ''}`.trim(),
        };
      }

      return mov;
    });
  };

  const handleFileUpload = (file: File) => {
    setErrorMsg(null);
    setIsProcessing(true);
    setFileName(file.name);

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        if (!buffer) {
          throw new Error('No se pudo leer el archivo seleccionado.');
        }

        const parsed = parseBdvFile(buffer as ArrayBuffer);
        if (parsed.length === 0) {
          setErrorMsg(
            'No se encontraron filas con transacciones reconocibles en el archivo. Verifique que sea el formato de Banco de Venezuela.'
          );
          setParsedMovements([]);
        } else {
          const crossReferenced = crossReferenceMovements(parsed);
          setParsedMovements(crossReferenced);
        }
      } catch (err: any) {
        console.error('Error parsing BDV file:', err);
        setErrorMsg('Error al procesar el archivo: ' + (err.message || 'Formato no compatible.'));
      } finally {
        setIsProcessing(false);
      }
    };

    reader.onerror = () => {
      setErrorMsg('Error al abrir el archivo.');
      setIsProcessing(false);
    };

    if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleProcessPastedText = () => {
    if (!pastedText.trim()) {
      setErrorMsg('Por favor pegue las filas del estado de cuenta de BDV en Línea.');
      return;
    }
    setErrorMsg(null);
    try {
      const parsed = parseBdvRawText(pastedText);
      if (parsed.length === 0) {
        setErrorMsg('No se detectaron transacciones válidas en el texto pegado.');
      } else {
        const crossReferenced = crossReferenceMovements(parsed);
        setParsedMovements(crossReferenced);
      }
    } catch (err: any) {
      setErrorMsg('Error al procesar texto: ' + err.message);
    }
  };

  const handleConfirmImport = () => {
    if (parsedMovements.length === 0) return;

    const toImport = parsedMovements.map((m) => ({
      fecha: m.fecha,
      banco: 'Banco de Venezuela (0102)',
      tipo: m.tipo,
      referencia: m.referencia,
      descripcion: m.descripcion,
      monto_bs: m.monto_bs,
      monto_usd: Number((m.monto_bs / exchangeRate).toFixed(2)),
      estado_conciliacion: m.estado_conciliacion,
      vinculado_tipo: m.venta_id ? ('venta' as const) : undefined,
      vinculado_id: m.venta_id,
      notas: m.factura_ref
        ? `Cruzado con Venta #${m.factura_ref} (${m.cliente})`
        : 'Importado de Estado de Cuenta BDV',
    }));

    const count = importBankMovements(toImport);
    if (onSuccess) onSuccess(count);
    onClose();
  };

  // Metrics
  const totalCreditosBs = parsedMovements
    .filter((m) => m.tipo === 'credito_ingreso')
    .reduce((sum, m) => sum + m.monto_bs, 0);

  const totalDebitosBs = parsedMovements
    .filter((m) => m.tipo === 'debito_egreso')
    .reduce((sum, m) => sum + m.monto_bs, 0);

  const totalCoincidentes = parsedMovements.filter((m) => m.estado_conciliacion === 'conciliado').length;

  const filteredDisplay = parsedMovements.filter((m) => {
    if (filterType === 'credito' && m.tipo !== 'credito_ingreso') return false;
    if (filterType === 'debito' && m.tipo !== 'debito_egreso') return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        (m.referencia || '').toLowerCase().includes(term) ||
        (m.descripcion || '').toLowerCase().includes(term) ||
        (m.cliente && (m.cliente || '').toLowerCase().includes(term))
      );
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-red-700 via-rose-800 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/15 rounded-xl backdrop-blur-xs">
              <Landmark className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Conciliador Banco de Venezuela (BDV)</h2>
              <p className="text-xs text-rose-200">
                Sube o pega el formato de estado de cuenta de BDV para verificar lo que entró al banco y conciliar automáticamente con ventas.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center space-x-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Subtab selection */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex space-x-2">
              <button
                onClick={() => setActiveTab('upload')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center space-x-1.5 ${
                  activeTab === 'upload'
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Subir Archivo (.xlsx / .csv / .txt)</span>
              </button>
              <button
                onClick={() => setActiveTab('paste')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center space-x-1.5 ${
                  activeTab === 'paste'
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Pegar Texto de BDV en Línea</span>
              </button>
            </div>

            <div className="text-[11px] text-slate-500 flex items-center space-x-1">
              <span>Soporta estados de cuenta:</span>
              <strong className="text-slate-800">BDV Empresas y Personas</strong>
            </div>
          </div>

          {/* Upload Box */}
          {activeTab === 'upload' ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-red-500 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-slate-50 hover:bg-red-50/20"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.txt"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                className="hidden"
              />
              <div className="w-12 h-12 bg-red-100 text-red-700 rounded-full flex items-center justify-center mx-auto mb-3">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-800">
                {fileName ? fileName : 'Arrastra aquí tu archivo de Banco de Venezuela o haz clic'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Formatos compatibles: Excel (.xlsx, .xls), CSV delimitado por comas/puntos y comas, o TXT descargado del BDV.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder={`Pega aquí las líneas copiadas del estado de cuenta de BDV en Línea:\nEjemplo:\n04/09/2026\t002910481\tPAGOMOVILBDV DE JUAN PEREZ\t6507.50\n04/09/2026\t002910482\tPUNTO DE VENTA DE DEMOSTRACIÓN\t9450.00`}
                className="w-full h-32 p-3 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-hidden"
              />
              <button
                onClick={handleProcessPastedText}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-xs transition-colors"
              >
                Analizar Líneas Pegadas
              </button>
            </div>
          )}

          {/* Parsed Movements Preview */}
          {parsedMovements.length > 0 && (
            <div className="space-y-3 pt-2">
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Total Movimientos</span>
                  <span className="text-base font-black text-slate-900">{parsedMovements.length}</span>
                  <span className="text-[10px] text-slate-400 block">Detectados en BDV</span>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <span className="text-[10px] text-emerald-700 block uppercase font-bold">Créditos / Entró al BDV</span>
                  <span className="text-base font-black text-emerald-800">{totalCreditosBs.toLocaleString('es-VE')} Bs</span>
                  <span className="text-[10px] text-emerald-600 block">
                    ≈ ${(totalCreditosBs / exchangeRate).toFixed(2)} USD
                  </span>
                </div>

                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                  <span className="text-[10px] text-rose-700 block uppercase font-bold">Débitos / Salidas</span>
                  <span className="text-base font-black text-rose-800">{totalDebitosBs.toLocaleString('es-VE')} Bs</span>
                  <span className="text-[10px] text-rose-600 block">Comisiones y retiros</span>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <span className="text-[10px] text-blue-700 block uppercase font-bold">Cruzados con Ventas</span>
                  <span className="text-base font-black text-blue-800">{totalCoincidentes} coincidencias</span>
                  <span className="text-[10px] text-blue-600 block">Por referencia y monto</span>
                </div>
              </div>

              {/* Table Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs text-slate-500 font-medium">Ver:</span>
                  {(['todos', 'credito', 'debito'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setFilterType(t)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-md capitalize transition-colors ${
                        filterType === t
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {t === 'todos' ? 'Todos' : t === 'credito' ? 'Solo Entradas (Crédito)' : 'Solo Salidas (Débito)'}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filtrar por referencia o texto..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Movements Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Fecha</th>
                      <th className="py-2.5 px-3">Referencia</th>
                      <th className="py-2.5 px-3">Concepto / Descripción</th>
                      <th className="py-2.5 px-3 text-right">Monto (Bs.)</th>
                      <th className="py-2.5 px-3">Cruce con Ventas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredDisplay.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 text-slate-600 font-mono text-[11px]">{m.fecha}</td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-900 text-[11px]">
                          {m.referencia}
                        </td>
                        <td className="py-2 px-3 text-slate-700 max-w-xs truncate">{m.descripcion}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold whitespace-nowrap">
                          {m.tipo === 'credito_ingreso' ? (
                            <span className="text-emerald-700">+{m.monto_bs.toLocaleString('es-VE')} Bs</span>
                          ) : (
                            <span className="text-rose-600">-{m.monto_bs.toLocaleString('es-VE')} Bs</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {m.factura_ref ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Factura #{m.factura_ref} ({m.cliente})
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600">
                              Directo en BDV
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-colors"
          >
            Cancelar
          </button>

          <button
            onClick={handleConfirmImport}
            disabled={parsedMovements.length === 0}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-xs flex items-center space-x-2 transition-all ${
              parsedMovements.length === 0
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700 active:scale-95'
            }`}
          >
            <Landmark className="w-4 h-4" />
            <span>Subir e Importar {parsedMovements.length} Movimientos a la Conciliación</span>
          </button>
        </div>
      </div>
    </div>
  );
};
