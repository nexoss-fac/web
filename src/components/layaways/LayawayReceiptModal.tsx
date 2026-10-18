import React, { useState } from 'react';
import {
  Printer,
  CheckCircle,
  X,
  Share2,
  Calendar,
  ShieldCheck,
  Clock,
  Receipt,
  Smartphone,
  Copy,
  Check,
  BookmarkCheck
} from 'lucide-react';
import { Layaway } from '../../types';
import { BarcodeSvg } from '../common/BarcodeSvg';
import { resolveIndustryTemplate, COMPANY_INDUSTRIES } from '../../domain/companyIndustries';
import { MakdLogo } from '../common/MakdLogo';

interface LayawayReceiptModalProps {
  layaway: Layaway | null;
  onClose: () => void;
}

export const LayawayReceiptModal: React.FC<LayawayReceiptModalProps> = ({ layaway, onClose }) => {
  const industry = COMPANY_INDUSTRIES[resolveIndustryTemplate(localStorage.getItem('nexoss_active_company_industry'))];
  const isFootwear = resolveIndustryTemplate(localStorage.getItem('nexoss_active_company_industry')) === 'footwear';
  const companyName = localStorage.getItem('nexoss_active_company_name') || 'Empresa';
  const [activeView, setActiveView] = useState<'thermal' | 'digital'>('thermal');
  const [thermalWidth, setThermalWidth] = useState<'80mm' | '58mm'>('80mm');
  const [copiedText, setCopiedText] = useState(false);

  if (!layaway) return null;

  const handlePrint = () => {
    window.print();
  };

  const getLayawaySummaryText = () => {
    return (
      `*NEXOSS - COMPROBANTE DE APARTADO*\n` +
      `Código: #${layaway.codigo_apartado}\n` +
      `Cliente: ${layaway.cliente_nombre} ${layaway.cliente_apellido || ''}\n` +
      (layaway.cliente_cedula ? `Cédula: ${layaway.cliente_cedula}\n` : '') +
      `Fecha de Apartado: ${new Date(layaway.fecha_apartado).toLocaleDateString('es-VE')}\n` +
      `*FECHA LÍMITE DE RETIRO: ${new Date(layaway.fecha_vencimiento).toLocaleDateString('es-VE')}*\n` +
      `Estado: ${layaway.estado.toUpperCase()}\n\n` +
      `${isFootwear ? "*Calzados Reservados:*" : "*Productos Reservados:*"}\n` +
      layaway.items.map((it) => `• ${it.nombre_producto} (${industry.variantLabel}: ${it.talla}) x${it.cantidad} = $${it.subtotal.toFixed(2)}`).join('\n') +
      `\n\n*Resumen Financiero:*\n` +
      `Total Apartado: $${Number(layaway.total_usd ?? 0).toFixed(2)}\n` +
      `Total Abonado: $${Number(layaway.total_abonado_usd ?? 0).toFixed(2)}\n` +
      `*SALDO RESTANTE:* $${Number(layaway.saldo_pendiente_usd ?? 0).toFixed(2)} (${layaway.saldo_pendiente_bs.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Bs)\n\n` +
      `*Historial de Abonos:*\n` +
      layaway.abonos.map((a) => `• ${new Date(a.fecha).toLocaleDateString('es-VE')}: $${a.monto_equivalente_usd.toFixed(2)} (${a.cuenta})`).join('\n') +
      `\n\n¡Gracias por preferir NEXOSS!\nRecuerda retirar antes de la fecha límite.`
    );
  };

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(getLayawaySummaryText());
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleShareWhatsApp = () => {
    const rawText = getLayawaySummaryText();
    const encodedText = encodeURIComponent(rawText);
    const cleanPhone = (layaway.cliente_telefono || '').replace(/\D/g, '');
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone.startsWith('58') ? cleanPhone : '58' + cleanPhone}?text=${encodedText}`
      : `https://wa.me/?text=${encodedText}`;
    window.open(url, '_blank');
  };

  const isCompleted = layaway.estado === 'completado';
  const isCancelled = layaway.estado === 'cancelado';

  return (
    <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto backdrop-blur-xs print:p-0 print:bg-white print:static">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden print:border-none print:shadow-none print:bg-white print:text-black my-4 sm:my-8 flex flex-col">
        
        {/* Header (Screen only) */}
        <div className="p-3.5 sm:p-4 bg-slate-900 text-white flex items-center justify-between print-hide">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <BookmarkCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-xs sm:text-sm text-white truncate">
                Comprobante de Apartado & Reserva
              </h3>
              <p className="text-[11px] text-slate-400 font-mono truncate">
                Código #{layaway.codigo_apartado} • Vence: {new Date(layaway.fecha_vencimiento).toLocaleDateString('es-VE')}
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

        {/* View Switcher: Thermal vs Digital (Screen only) */}
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
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Voucher Digital</span>
            </button>
          </div>

          {activeView === 'thermal' && (
            <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-white px-2 py-1 rounded-xl border border-slate-200">
              <span className="text-slate-400 text-[10px] uppercase font-bold">Papel:</span>
              <button
                type="button"
                onClick={() => setThermalWidth('80mm')}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition cursor-pointer ${
                  thermalWidth === '80mm'
                    ? 'bg-amber-50 text-amber-800 border border-amber-300 font-black'
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
                    ? 'bg-amber-50 text-amber-800 border border-amber-300 font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                58mm
              </button>
            </div>
          )}
        </div>

        {/* Scrollable Body */}
        <div className="p-3 sm:p-5 bg-slate-100/60 overflow-y-auto max-h-[calc(85vh-180px)] flex justify-center print:p-0 print:bg-white print:max-h-none">
          
          {/* ======================================================== */}
          {/* VIEW 1: TICKET TÉRMICO DE APARTADO */}
          {/* ======================================================== */}
          {activeView === 'thermal' && (
            <div
              className={`bg-stone-50 text-stone-900 font-mono text-[11px] leading-relaxed shadow-lg border border-stone-200/80 rounded-sm relative print-receipt-container transition-all mx-auto ${
                thermalWidth === '58mm' ? 'max-w-[280px] p-3 text-[10px]' : 'max-w-[340px] sm:max-w-[360px] p-4 sm:p-5'
              }`}
            >
              {/* Sawtooth Top Edge */}
              <div className="thermal-sawtooth-top -mt-4 sm:-mt-5 mb-3 print-hide opacity-80" />

              {/* Header */}
              <div className="text-center pb-3 border-b border-dashed border-stone-400 space-y-0.5">
                <h2 className="text-base sm:text-lg font-black tracking-wider text-stone-950 uppercase">
                  NEXOSS
                </h2>
                <p className="text-[10px] font-bold text-stone-600 uppercase tracking-widest">
                  {isFootwear ? "Tienda Especializada en Calzado" : companyName}
                </p>
                <p className="text-[10px] text-stone-600 font-semibold">
                  RIF: RIF de demostración
                </p>
                <p className="text-[9.5px] text-stone-500 leading-tight px-2">
                  Datos de domicilio no configurados
                </p>

                <div className="mt-2.5 inline-block px-3 py-1 bg-amber-100 text-amber-950 border border-amber-300 rounded font-black text-xs tracking-wider">
                  COMPROBANTE DE APARTADO #{layaway.codigo_apartado}
                </div>

                <div className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-stone-600">
                  <Calendar className="w-3 h-3 text-stone-400" />
                  <span>Emisión: {new Date(layaway.fecha_apartado).toLocaleDateString('es-VE')}</span>
                </div>

                <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[10.5px] text-rose-700 font-black">
                  <Clock className="w-3.5 h-3.5" />
                  <span>VENCE EL: {new Date(layaway.fecha_vencimiento).toLocaleDateString('es-VE')}</span>
                </div>
              </div>

              {/* Client Info */}
              <div className="py-2.5 border-b border-dashed border-stone-400 space-y-1 text-[10.5px]">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-stone-500 shrink-0">CLIENTE:</span>
                  <span className="font-bold text-stone-900 truncate text-right">
                    {layaway.cliente_nombre} {layaway.cliente_apellido || ''}
                  </span>
                </div>
                {layaway.cliente_cedula && (
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="text-stone-500 shrink-0">CÉDULA / RIF:</span>
                    <span className="font-bold text-stone-900">{layaway.cliente_cedula}</span>
                  </div>
                )}
                {layaway.cliente_telefono && (
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="text-stone-500 shrink-0">TELÉFONO:</span>
                    <span className="text-stone-900">{layaway.cliente_telefono}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-stone-500 shrink-0">ESTADO:</span>
                  <span className={`font-black uppercase ${
                    isCompleted ? 'text-emerald-700' : isCancelled ? 'text-rose-700' : 'text-amber-800'
                  }`}>
                    {layaway.estado}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <div className="py-2.5 border-b border-dashed border-stone-400">
                <div className="flex justify-between text-[10px] font-black uppercase text-stone-500 pb-1 border-b border-stone-300">
                  <span>{isFootwear ? "CALZADO RESERVADO" : "PRODUCTOS RESERVADOS"}</span>
                  <span>TOTAL ($)</span>
                </div>

                <div className="divide-y divide-stone-200/70 pt-1 space-y-1.5">
                  {layaway.items.map((item, idx) => (
                    <div key={idx} className="pt-1.5 first:pt-0">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-stone-950 break-words leading-tight">
                            {item.cantidad}x {item.nombre_producto}
                          </p>
                          <p className="text-[10px] text-stone-600 mt-0.5">
                            {industry.variantLabel}: <strong>{item.talla}</strong> • P.U: ${Number(item.precio_unitario ?? 0).toFixed(2)}
                          </p>
                        </div>
                        <div className="font-black text-stone-950 font-mono shrink-0 text-right">
                          ${Number(item.subtotal ?? 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Balance */}
              <div className="py-2.5 border-b border-dashed border-stone-400 space-y-1.5 text-right">
                <div className="flex justify-between text-stone-600">
                  <span>TOTAL APARTADO:</span>
                  <span className="font-bold text-stone-900">${Number(layaway.total_usd ?? 0).toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-emerald-800 font-bold">
                  <span>TOTAL ABONADO:</span>
                  <span>-${Number(layaway.total_abonado_usd ?? 0).toFixed(2)}</span>
                </div>

                <div className="pt-2 border-t-2 border-stone-400 flex justify-between items-baseline text-rose-700">
                  <span className="font-black text-xs sm:text-sm">SALDO PENDIENTE:</span>
                  <span className="font-black text-base sm:text-lg">
                    ${Number(layaway.saldo_pendiente_usd ?? 0).toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-baseline pt-0.5 text-stone-800 font-bold">
                  <span className="text-[10.5px]">EQUIVALENTE EN BS:</span>
                  <span className="text-xs sm:text-sm font-black">
                    {layaway.saldo_pendiente_bs.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Bs
                  </span>
                </div>
              </div>

              {/* Abonos list */}
              <div className="py-2.5 border-b border-dashed border-stone-400 space-y-1 text-[10px]">
                <div className="font-black text-stone-500 uppercase text-[9.5px] pb-1">
                  HISTORIAL DE ABONOS RECIBIDOS ({layaway.abonos.length})
                </div>
                {layaway.abonos.map((p, idx) => (
                  <div key={idx} className="flex justify-between items-baseline">
                    <div className="min-w-0 pr-2 truncate">
                      <span className="text-stone-600">{new Date(p.fecha).toLocaleDateString('es-VE')}</span> •{' '}
                      <span className="font-bold text-stone-900">{p.cuenta}</span>
                      {p.referencia && <span className="text-stone-500 ml-1">({p.referencia})</span>}
                    </div>
                    <span className="font-bold text-stone-950 shrink-0 font-mono">
                      ${Number(p.monto_equivalente_usd ?? 0).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Barcode & Notice */}
              <div className="pt-3 text-center space-y-2">
                <div className="flex flex-col items-center justify-center">
                  <BarcodeSvg
                    value={layaway.codigo_apartado || 'APART'}
                    height={38}
                    className="max-w-[200px]"
                  />
                  <p className="text-[9px] font-mono text-stone-500 tracking-widest mt-1">
                    *{layaway.codigo_apartado}*
                  </p>
                </div>

                <div className="text-[9px] text-stone-600 leading-tight space-y-0.5">
                  <p className="font-bold text-stone-900">CONDICIONES DEL APARTADO:</p>
                  <p>1. Calzado reservado hasta la fecha límite. Al vencer, los pares retornan a venta.</p>
                  <p>2. Abonos no reembolsables en efectivo (solo canje o crédito según políticas).</p>
                  <p>3. Indispensable presentar este comprobante para liquidar y retirar.</p>
                </div>
              </div>

              {/* Sawtooth Bottom Edge */}
              <div className="thermal-sawtooth-bottom -mb-4 sm:-mb-5 mt-4 print-hide opacity-80" />
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 2: VOUCHER DIGITAL MÓVIL DE APARTADO */}
          {/* ======================================================== */}
          {activeView === 'digital' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-md max-w-md w-full overflow-hidden">
              
              {/* Voucher Header Banner */}
              <div className="bg-gradient-to-r from-amber-900 via-amber-950 to-slate-900 p-5 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
                
                <div className="flex items-center justify-between relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center p-1.5 shadow-md">
                      <MakdLogo size={42} showSlogan={false} />
                    </div>
                    <div>
                      <h2 className="text-base font-black tracking-tight uppercase">NEXOSS</h2>
                      <p className="text-[10px] text-amber-200">{isFootwear ? "Reserva Oficial de Calzado" : "Comprobante de Apartado"}</p>
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase ${
                    isCompleted
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}>
                    {layaway.estado}
                  </span>
                </div>

                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-300">Apartado: #{layaway.codigo_apartado}</span>
                  <span className="text-amber-200 font-bold">
                    Vence: {new Date(layaway.fecha_vencimiento).toLocaleDateString('es-VE')}
                  </span>
                </div>
              </div>

              {/* Voucher Content */}
              <div className="p-4 sm:p-5 space-y-4">
                
                {/* Client info */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Cliente:</span>
                    <span className="font-bold text-slate-900">{layaway.cliente_nombre} {layaway.cliente_apellido || ''}</span>
                  </div>
                  {layaway.cliente_cedula && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Cédula:</span>
                      <span className="font-mono text-slate-800">{layaway.cliente_cedula}</span>
                    </div>
                  )}
                  {layaway.cliente_telefono && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Teléfono:</span>
                      <span className="text-slate-800">{layaway.cliente_telefono}</span>
                    </div>
                  )}
                </div>

                {/* Reserved items */}
                <div className="space-y-2">
                  <span className="text-xs font-black uppercase text-slate-500 tracking-wider block">
                    {isFootwear ? "Calzados en reserva (" : "Productos en reserva ("}{layaway.items.reduce((acc, it) => acc + it.cantidad, 0)} {industry.unitLabel})
                  </span>

                  <div className="space-y-2">
                    {layaway.items.map((it, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 hover:bg-slate-100/70 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                            {it.nombre_producto}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
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

                {/* Financial Balance Callout */}
                <div className="bg-gradient-to-br from-amber-50 to-amber-100/60 p-4 rounded-2xl border border-amber-200 space-y-2">
                  <div className="flex justify-between text-xs text-slate-600 font-semibold">
                    <span>Total del Apartado:</span>
                    <span className="font-mono text-slate-900">${Number(layaway.total_usd ?? 0).toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between text-xs text-emerald-700 font-bold">
                    <span>Total Abonado a la Fecha:</span>
                    <span className="font-mono text-emerald-800">-${Number(layaway.total_abonado_usd ?? 0).toFixed(2)}</span>
                  </div>

                  <div className="pt-2 border-t border-amber-300 flex items-baseline justify-between">
                    <span className="font-black text-rose-700 text-sm">SALDO RESTANTE:</span>
                    <span className="text-2xl font-black font-mono text-rose-600">
                      ${Number(layaway.saldo_pendiente_usd ?? 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between text-xs font-bold text-slate-700 pt-0.5">
                    <span>Equivalente en Bolívares:</span>
                    <span className="text-base font-black font-mono text-slate-900">
                      {layaway.saldo_pendiente_bs.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Bs
                    </span>
                  </div>
                </div>

                {/* Expiration date alert */}
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-rose-900 text-xs font-bold">
                  <Clock className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    Fecha de Vencimiento: {new Date(layaway.fecha_vencimiento).toLocaleDateString('es-VE')}
                  </span>
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
            title="Copiar resumen del apartado"
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
