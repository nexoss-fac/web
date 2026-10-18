import React, { useState } from 'react';
import {
  Printer,
  CheckCircle,
  X,
  Share2,
  Calendar,
  Edit2,
  Check,
  Copy,
  Receipt,
  Smartphone,
  Sliders,
  DollarSign,
  ShieldCheck,
  Clock,
  Sparkles
} from 'lucide-react';
import { Sale } from '../../types';
import { useStore } from '../../context/StoreContext';
import { BarcodeSvg } from './BarcodeSvg';
import { resolveIndustryTemplate, COMPANY_INDUSTRIES } from '../../domain/companyIndustries';
import { MakdLogo } from './MakdLogo';

interface ReceiptModalProps {
  sale: Sale | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ sale, onClose }) => {
  const industry = COMPANY_INDUSTRIES[resolveIndustryTemplate(localStorage.getItem('nexoss_active_company_industry'))];
  const isFootwear = resolveIndustryTemplate(localStorage.getItem('nexoss_active_company_industry')) === 'footwear';
  const { updateSaleDate } = useStore();
  const [activeView, setActiveView] = useState<'thermal' | 'digital'>('thermal');
  const [thermalWidth, setThermalWidth] = useState<'80mm' | '58mm'>('80mm');
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [editDateValue, setEditDateValue] = useState(sale?.fecha ? sale.fecha.slice(0, 16) : '');
  const [copiedText, setCopiedText] = useState(false);

  if (!sale) return null;

  const handleSaveDate = () => {
    if (!editDateValue) return;
    const isoDate = new Date(editDateValue).toISOString();
    updateSaleDate(sale.id, isoDate);
    sale.fecha = isoDate;
    setIsEditingDate(false);
  };

  const handlePrint = () => {
    window.print();
  };

  const getReceiptSummaryText = () => {
    return (
      `*NEXOSS - COMPROBANTE DE COMPRA*\n` +
      `Factura: #${sale.numero_factura}\n` +
      `Cliente: ${sale.cliente_nombre} ${sale.cliente_apellido || ''}\n` +
      (sale.cliente_rif ? `Cédula/RIF: ${sale.cliente_rif}\n` : '') +
      `Fecha: ${new Date(sale.fecha).toLocaleString('es-VE')}\n` +
      `Total USD: $${sale.total_usd.toFixed(2)}\n` +
      `Total Bs: ${sale.total_bs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs (Tasa: ${sale.tasa_cambio.toFixed(2)})\n\n` +
      `${isFootwear ? "*Calzados Comprados:*" : "*Productos Comprados:*"}\n` +
      sale.items.map((it) => `• ${it.nombre_producto} (${industry.variantLabel} ${it.talla}) x${it.cantidad} = $${it.subtotal.toFixed(2)}`).join('\n') +
      `\n\n*Formas de Pago:*\n` +
      sale.pagos.map((p) => `• ${p.cuenta}: ${p.moneda === 'Bs' ? `${p.monto.toFixed(2)} Bs` : `$${p.monto.toFixed(2)}`}`).join('\n') +
      `\n\n¡Gracias por preferir NEXOSS!\nSede no configurada, Sede no configurada, Ubicación no configurada.`
    );
  };

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(getReceiptSummaryText());
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleShareWhatsApp = () => {
    const rawText = getReceiptSummaryText();
    const encodedText = encodeURIComponent(rawText);
    const cleanPhone = (sale.cliente_telefono || '').replace(/\D/g, '');
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone.startsWith('58') ? cleanPhone : '58' + cleanPhone}?text=${encodedText}`
      : `https://wa.me/?text=${encodedText}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto backdrop-blur-xs print:p-0 print:bg-white print:static">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden print:border-none print:shadow-none print:bg-white print:text-black my-4 sm:my-8 flex flex-col">
        
        {/* Modal Top Header (Screen Only) */}
        <div className="p-3.5 sm:p-4 bg-slate-900 text-white flex items-center justify-between print-hide">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-emerald-400 shrink-0">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-xs sm:text-sm text-white truncate">
                Comprobante de Venta Emitido
              </h3>
              <p className="text-[11px] text-slate-400 font-mono truncate">
                Factura #{sale.numero_factura} • {new Date(sale.fecha).toLocaleDateString('es-VE')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer shrink-0"
            title="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* View Switcher: Ticket Térmico vs Comprobante Digital (Screen Only) */}
        <div className="bg-slate-100 p-2 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap print-hide">
          <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveView('thermal')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                activeView === 'thermal'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Ticket Térmico POS</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('digital')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                activeView === 'digital'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Voucher Digital</span>
            </button>
          </div>

          {/* Width selector when in Thermal Mode */}
          {activeView === 'thermal' && (
            <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-white px-2 py-1 rounded-xl border border-slate-200">
              <span className="text-slate-400 text-[10px] uppercase font-bold">Papel:</span>
              <button
                type="button"
                onClick={() => setThermalWidth('80mm')}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition cursor-pointer ${
                  thermalWidth === '80mm'
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                80mm
              </button>
              <button
                type="button"
                onClick={() => setThermalWidth('58mm')}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition cursor-pointer ${
                  thermalWidth === '58mm'
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                58mm
              </button>
            </div>
          )}
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-3 sm:p-5 bg-slate-100/60 overflow-y-auto max-h-[calc(85vh-180px)] flex justify-center print:p-0 print:bg-white print:max-h-none">
          
          {/* ======================================================== */}
          {/* VIEW 1: TICKET TÉRMICO (Realista con corte dentado y POS) */}
          {/* ======================================================== */}
          {activeView === 'thermal' && (
            <div
              className={`bg-stone-50 text-stone-900 font-mono text-[11px] leading-relaxed shadow-lg border border-stone-200/80 rounded-sm relative print-receipt-container transition-all mx-auto ${
                thermalWidth === '58mm' ? 'max-w-[280px] p-3 text-[10px]' : 'max-w-[340px] sm:max-w-[360px] p-4 sm:p-5'
              }`}
            >
              {/* Sawtooth Top Edge */}
              <div className="thermal-sawtooth-top -mt-4 sm:-mt-5 mb-3 print-hide opacity-80" />

              {/* Receipt Header */}
              <div className="text-center pb-3 border-b border-dashed border-stone-400 space-y-0.5">
                <h2 className="text-base sm:text-lg font-black tracking-wider text-stone-950 uppercase">
                  NEXOSS
                </h2>
                <p className="text-[10px] font-bold text-stone-600 uppercase tracking-widest">
                  Marcamos Tu Estilo
                </p>
                <p className="text-[10px] text-stone-600 font-semibold">
                  Razón Social: Empresa de demostración
                </p>
                <p className="text-[10px] text-stone-600 font-semibold">
                  RIF: RIF de demostración
                </p>
                <p className="text-[9.5px] text-stone-500 leading-tight px-2">
                  Datos de domicilio no configurados
                </p>
                <p className="text-[9.5px] text-stone-500">
                  Tel: Teléfono de demostración • @nexossdemo
                </p>

                {/* Invoice Tag */}
                <div className="mt-2.5 inline-block px-3 py-1 bg-stone-200/90 text-stone-900 border border-stone-300 rounded font-black text-xs tracking-wider">
                  FACTURA #{sale.numero_factura}
                </div>

                {/* Date with quick editor */}
                <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[10px] text-stone-600">
                  {isEditingDate ? (
                    <div className="flex items-center gap-1 bg-stone-200 p-1 rounded print-hide">
                      <input
                        type="datetime-local"
                        value={editDateValue}
                        onChange={(e) => setEditDateValue(e.target.value)}
                        className="px-1.5 py-0.5 text-[10px] border border-stone-400 rounded bg-white text-stone-900"
                      />
                      <button
                        type="button"
                        onClick={handleSaveDate}
                        className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 cursor-pointer"
                        title="Guardar nueva fecha"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingDate(false)}
                        className="p-1 text-stone-600 hover:text-stone-900 cursor-pointer"
                        title="Cancelar"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span>{new Date(sale.fecha).toLocaleString('es-VE')}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditDateValue(sale.fecha ? sale.fecha.slice(0, 16) : '');
                          setIsEditingDate(true);
                        }}
                        className="p-0.5 text-stone-500 hover:text-stone-900 rounded print-hide cursor-pointer"
                        title="Modificar fecha de emisión"
                      >
                        <Edit2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Customer Info */}
              <div className="py-2.5 border-b border-dashed border-stone-400 space-y-1 text-[10.5px]">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-stone-500 shrink-0">CLIENTE:</span>
                  <span className="font-bold text-stone-900 truncate text-right">
                    {sale.cliente_nombre} {sale.cliente_apellido || ''}
                  </span>
                </div>
                {sale.cliente_rif && (
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="text-stone-500 shrink-0">CÉDULA / RIF:</span>
                    <span className="font-bold text-stone-900">{sale.cliente_rif}</span>
                  </div>
                )}
                {sale.cliente_telefono && (
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="text-stone-500 shrink-0">TELÉFONO:</span>
                    <span className="text-stone-900">{sale.cliente_telefono}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-stone-500 shrink-0">CAJERO / TURNO:</span>
                  <span className="text-stone-900 font-semibold">{sale.usuario || 'Cajero Principal'}</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="py-2.5 border-b border-dashed border-stone-400">
                <div className="flex justify-between text-[10px] font-black uppercase text-stone-500 pb-1 border-b border-stone-300">
                  <span>CANT / DESCRIPCIÓN</span>
                  <span>TOTAL ($)</span>
                </div>

                <div className="divide-y divide-stone-200/70 pt-1 space-y-1.5">
                  {sale.items.map((item, idx) => (
                    <div key={idx} className="pt-1.5 first:pt-0">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-stone-950 break-words leading-tight">
                            {item.cantidad}x {item.nombre_producto}
                          </p>
                          <p className="text-[10px] text-stone-600 mt-0.5">
                            {industry.variantLabel}: <strong>{item.talla}</strong> • P.U: ${item.precio_unitario.toFixed(2)}
                          </p>
                        </div>
                        <div className="font-black text-stone-950 font-mono shrink-0 text-right">
                          ${item.subtotal.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals & Tax */}
              <div className="py-2.5 border-b border-dashed border-stone-400 space-y-1.5 text-right">
                <div className="flex justify-between text-stone-600">
                  <span>SUBTOTAL:</span>
                  <span className="font-bold text-stone-900">${sale.subtotal_usd.toFixed(2)}</span>
                </div>

                {sale.descuento_usd > 0 && (
                  <div className="flex justify-between text-emerald-800 font-bold">
                    <span>DESCUENTO APLICADO:</span>
                    <span>-${sale.descuento_usd.toFixed(2)}</span>
                  </div>
                )}

                {sale.aplica_iva && (
                  <div className="flex justify-between text-stone-600">
                    <span>IVA 16% {sale.iva_incluido ? '(incluido)' : ''}:</span>
                    <span className="font-bold text-stone-900">${sale.iva_monto_usd.toFixed(2)}</span>
                  </div>
                )}

                <div className="pt-2 border-t border-stone-400 flex justify-between items-baseline">
                  <span className="font-black text-stone-950 text-xs sm:text-sm">TOTAL USD:</span>
                  <span className="font-black text-stone-950 text-base sm:text-lg">
                    ${sale.total_usd.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-baseline pt-0.5 text-stone-700">
                  <span className="text-[10px]">TASA OFICIAL BCV:</span>
                  <span className="font-bold">{sale.tasa_cambio.toFixed(2)} Bs/$</span>
                </div>

                <div className="flex justify-between items-baseline pt-0.5 border-t border-stone-300 font-bold text-stone-900">
                  <span className="text-xs">TOTAL EN BS:</span>
                  <span className="text-sm sm:text-base font-black">
                    {sale.total_bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
                  </span>
                </div>
              </div>

              {/* Payments Breakdown */}
              <div className="py-2.5 border-b border-dashed border-stone-400 space-y-1 text-[10.5px]">
                <div className="font-black text-stone-500 uppercase text-[9.5px] pb-1">
                  MÉTODOS DE PAGO RECIBIDOS
                </div>
                {sale.pagos.map((p, idx) => {
                  const isCashea = (p.cuenta || '').toLowerCase().includes('cashea');
                  return (
                    <div key={idx} className="flex justify-between items-baseline">
                      <div className="min-w-0 pr-2">
                        <span className="font-bold text-stone-900">{p.cuenta}</span>
                        {p.referencia && (
                          <span className="text-stone-500 text-[9.5px] ml-1">
                            (Ref: {p.referencia})
                          </span>
                        )}
                        {isCashea && (
                          <span className="ml-1 text-[9px] font-black uppercase text-amber-800">
                            [{p.estado_liquidacion === 'conciliado_en_banco' ? 'Liquidado' : 'Por Conciliar'}]
                          </span>
                        )}
                      </div>
                      <span className="font-bold text-stone-950 shrink-0">
                        {p.moneda === 'Bs' ? `${p.monto.toFixed(2)} Bs` : `$${p.monto.toFixed(2)}`}
                      </span>
                    </div>
                  );
                })}

                {/* Cashea summary if exists */}
                {sale.total_cashea_pendiente_usd !== undefined && sale.total_cashea_pendiente_usd > 0 && (
                  <div className="mt-2 pt-1.5 border-t border-stone-300 text-[10px] text-stone-700">
                    <div className="flex justify-between">
                      <span>Caja Inmediata:</span>
                      <span className="font-bold">${(sale.total_positivo_inmediato_usd || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-amber-900 font-bold">
                      <span>Saldo Cashea:</span>
                      <span>${sale.total_cashea_pendiente_usd.toFixed(2)}</span>
                    </div>
                  </div>
                )}
                {!!sale.cashea_abonos?.length && (
                  <div className="mt-2 pt-1.5 border-t border-stone-300 text-[9px] text-stone-700">
                    <p className="font-black uppercase tracking-wide mb-1">Abonos Cashea registrados</p>
                    {sale.cashea_abonos.map((abono) => (
                      <div key={abono.id} className="flex justify-between gap-2 py-0.5">
                        <span className="min-w-0 truncate">{abono.fecha?.slice(0, 10)} · Cuota {abono.cuota || 'N/D'} · Ref. {abono.referencia || 'N/D'}</span>
                        <span className="font-bold shrink-0">-${Number(abono.monto_aplicado_usd || 0).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t border-stone-200 mt-1 pt-1 font-black text-amber-900">
                      <span>Saldo pendiente actual</span>
                      <span>${Number(sale.total_cashea_pendiente_usd || 0).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Barcode & Footer Notice */}
              <div className="pt-3 text-center space-y-2">
                <div className="flex flex-col items-center justify-center">
                  <BarcodeSvg
                    value={sale.numero_factura || 'NEXOSS-DEMO'}
                    height={38}
                    className="max-w-[200px]"
                  />
                  <p className="text-[9px] font-mono text-stone-500 tracking-widest mt-1">
                    *{sale.numero_factura}*
                  </p>
                </div>

                <div className="text-[9.5px] text-stone-600 leading-tight space-y-0.5">
                  <p className="font-bold text-stone-900">¡GRACIAS POR SU PREFERENCIA!</p>
                  <p>Cambios de talla únicamente dentro de los 7 días continuos presentando este comprobante.</p>
                  <p className="text-stone-500 italic">{isFootwear ? "El calzado debe estar sin uso y en su caja original." : "Conserva este comprobante para cualquier consulta."}</p>
                </div>
              </div>

              {/* Sawtooth Bottom Edge */}
              <div className="thermal-sawtooth-bottom -mb-4 sm:-mb-5 mt-4 print-hide opacity-80" />
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 2: VOUCHER DIGITAL MÓVIL (Elegante para WhatsApp) */}
          {/* ======================================================== */}
          {activeView === 'digital' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-md max-w-md w-full overflow-hidden">
              
              {/* Voucher Brand Banner */}
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
                
                <div className="flex items-center justify-between relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center p-1.5 shadow-md">
                      <MakdLogo size={42} showSlogan={false} />
                    </div>
                    <div>
                      <h2 className="text-base font-black tracking-tight uppercase">NEXOSS</h2>
                      <p className="text-[10px] text-indigo-200">Comprobante Digital Oficial</p>
                    </div>
                  </div>

                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
                    PAGADO
                  </span>
                </div>

                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-300">Factura: #{sale.numero_factura}</span>
                  <span className="text-indigo-200">{new Date(sale.fecha).toLocaleDateString('es-VE')}</span>
                </div>
              </div>

              {/* Voucher Body */}
              <div className="p-4 sm:p-5 space-y-4">
                
                {/* Customer card */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Cliente:</span>
                    <span className="font-bold text-slate-900">{sale.cliente_nombre} {sale.cliente_apellido || ''}</span>
                  </div>
                  {sale.cliente_rif && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Cédula / RIF:</span>
                      <span className="font-mono text-slate-800">{sale.cliente_rif}</span>
                    </div>
                  )}
                  {sale.cliente_telefono && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Teléfono:</span>
                      <span className="text-slate-800">{sale.cliente_telefono}</span>
                    </div>
                  )}
                </div>

                {/* Items */}
                <div className="space-y-2">
                  <span className="text-xs font-black uppercase text-slate-500 tracking-wider block">
                    {isFootwear ? "Calzados adquiridos (" : "Productos adquiridos ("}{sale.items.reduce((acc, it) => acc + it.cantidad, 0)} {industry.unitLabel})
                  </span>

                  <div className="space-y-2">
                    {sale.items.map((it, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 hover:bg-slate-100/70 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                            {it.nombre_producto}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                              {industry.variantLabel} {it.talla}
                            </span>
                            <span className="text-xs text-slate-500 font-mono">
                              {it.cantidad} {industry.unitLabel} x ${it.precio_unitario.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-black font-mono text-slate-900">
                            ${it.subtotal.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totals Highlight Box */}
                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/60 p-4 rounded-2xl border border-indigo-200 space-y-2">
                  <div className="flex justify-between text-xs text-slate-600 font-semibold">
                    <span>Subtotal:</span>
                    <span className="font-mono text-slate-900">${sale.subtotal_usd.toFixed(2)}</span>
                  </div>
                  {sale.descuento_usd > 0 && (
                    <div className="flex justify-between text-xs text-emerald-700 font-bold">
                      <span>Descuento aplicado:</span>
                      <span className="font-mono">-${sale.descuento_usd.toFixed(2)}</span>
                    </div>
                  )}
                  {sale.aplica_iva && (
                    <div className="flex justify-between text-xs text-slate-600 font-semibold">
                      <span>IVA (16% SENIAT) {sale.iva_incluido ? 'incluido' : 'adicional'}:</span>
                      <span className="font-mono text-slate-900">${sale.iva_monto_usd.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="pt-2 border-t border-indigo-200 flex items-baseline justify-between">
                    <span className="font-black text-slate-900 text-sm">TOTAL USD:</span>
                    <span className="text-2xl font-black font-mono text-indigo-700">
                      ${sale.total_usd.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between text-xs font-bold text-slate-700 pt-0.5">
                    <span>Total en Bolívares (Tasa {sale.tasa_cambio.toFixed(2)}):</span>
                    <span className="text-base font-black font-mono text-slate-900">
                      {sale.total_bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
                    </span>
                  </div>
                </div>

                {/* Payments Badge List */}
                <div className="space-y-1.5">
                  <span className="text-xs font-black uppercase text-slate-500 tracking-wider block">
                    Forma de Pago
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {sale.pagos.map((p, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-bold border border-slate-200 flex items-center gap-1.5"
                      >
                        <span>{p.cuenta}</span>
                        <span className="font-mono text-indigo-700">
                          ({p.moneda === 'Bs' ? `${p.monto.toFixed(2)} Bs` : `$${p.monto.toFixed(2)}`})
                        </span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Guarantee & Store Details */}
                <div className="p-3 bg-slate-50 rounded-xl text-center text-xs text-slate-600 space-y-1">
                  <p className="font-bold text-slate-800">
                    Garantía de Cambio: 7 días continuos
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Ubicación no configurada • CC Sede no configurada, Sede no configurada PB
                  </p>
                </div>

              </div>
            </div>
          )}

        </div>

        {/* Modal Action Buttons Footer (Screen Only) */}
        <div className="p-3.5 sm:p-4 bg-white border-t border-slate-200 flex flex-wrap sm:flex-nowrap gap-2 print-hide">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 min-w-[120px] py-2.5 sm:py-3 px-3 sm:px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition shadow-xs whitespace-nowrap shrink-0"
          >
            <Printer className="w-4 h-4 shrink-0" />
            <span>Imprimir Ticket</span>
          </button>

          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="flex-1 min-w-[130px] py-2.5 sm:py-3 px-3 sm:px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition shadow-md shadow-emerald-600/20 whitespace-nowrap shrink-0"
          >
            <Share2 className="w-4 h-4 shrink-0" />
            <span>Enviar WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={handleCopySummary}
            className={`py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition cursor-pointer border whitespace-nowrap shrink-0 ${
              copiedText
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-black'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            }`}
            title="Copiar texto resumen de factura"
          >
            {copiedText ? (
              <>
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>¡Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="hidden xs:inline">Copiar</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="py-2.5 sm:py-3 px-3 sm:px-4 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl font-bold text-xs sm:text-sm cursor-pointer transition whitespace-nowrap shrink-0"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};
