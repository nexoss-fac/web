import React from 'react';
import { Sale } from '../../types';

interface MacizoPreprintedInvoiceProps {
  sale: Sale;
}

/**
 * Impresión sobre papelería preimpresa de Macizo Natural.
 * El membrete, RIF emisor, número de control y pie ya están en el papel:
 * este componente imprime exclusivamente el contenido central.
 */
export const MacizoPreprintedInvoice: React.FC<MacizoPreprintedInvoiceProps> = ({ sale }) => {
  const money = (value: number) => Number(value || 0).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const date = new Date(sale.fecha);
  // En la papelería Fitgurt se imprime la secuencia corta de cinco dígitos; el prefijo MN permanece en el registro interno.
  const invoiceDisplayNumber = String(sale.numero_factura || '').replace(/\D/g, '').slice(-5).padStart(5, '0');
  const payments = (sale.pagos || []).map((payment) => String(payment.cuenta || '').toLowerCase());
  const isCredit = sale.condicion_pago ? sale.condicion_pago === 'credito' : payments.some((method) => method.includes('cashea') || method.includes('crédito') || method.includes('credito'));
  const paymentFlags = {
    cash: payments.some((method) => method.includes('efectivo')),
    mobile: payments.some((method) => method.includes('móvil') || method.includes('movil')),
    debit: payments.some((method) => method.includes('punto de venta') || method.includes('tarjeta de débito') || method.includes('tarjeta de debito')),
    credit: payments.some((method) => method.includes('tarjeta de crédito') || method.includes('tarjeta de credito')),
    transfer: payments.some((method) => method.includes('transferencia') || method.includes('zelle') || method.includes('binance')),
  };
  const subtotalBs = sale.items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0) * Number(sale.tasa_cambio || 0);
  const discountBs = Number(sale.descuento_usd || 0) * Number(sale.tasa_cambio || 0);
  const ivaBs = Number(sale.iva_monto_usd || 0) * Number(sale.tasa_cambio || 0);
  const displaySubtotalBs = sale.aplica_iva && sale.iva_incluido ? Number(sale.total_bs || 0) - ivaBs : subtotalBs - discountBs;
  const dense = sale.items.length > 8;

  return (
    <>
      <style>{`
        @page { size: letter portrait; margin: 0; }
        @media print {
          html, body, #root { width: 8.5in !important; min-height: 11in !important; height: 11in !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: transparent !important; }
          body * { visibility: hidden !important; }
          #macizo-preprinted-invoice, #macizo-preprinted-invoice * { visibility: visible !important; }
          #macizo-preprinted-invoice {
            display: block !important; position: fixed !important; left: 0 !important; top: 0 !important;
            width: 8.5in !important; height: 5.5in !important; margin: 0 !important; padding: 0 !important;
            border: 0 !important; box-shadow: none !important; background: transparent !important;
            color: #111 !important; overflow: hidden !important; z-index: 999999 !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          #macizo-preprinted-invoice .macizo-content { position: absolute !important; left: .42in !important; right: .42in !important; top: 1.2in !important; height: 3.45in !important; }
          #macizo-preprinted-invoice .macizo-screen-hint { display: none !important; }
        }
      `}</style>
      <section id="macizo-preprinted-invoice" className="relative mx-auto aspect-[8.5/5.5] w-full max-w-[1100px] overflow-hidden border border-slate-300 bg-white text-slate-900 shadow-sm">
        <div className="macizo-screen-hint absolute inset-x-0 top-0 z-10 bg-amber-50 px-3 py-1.5 text-center text-[10px] font-semibold text-amber-900">
          Vista de impresión · Solo se imprimen los datos centrales; membrete y pie ya están preimpresos
        </div>
        <div className="macizo-content absolute left-[5%] right-[5%] top-[22%] bottom-[14%] flex flex-col text-[9px] leading-tight">
          <div className="grid grid-cols-2 items-end gap-x-4 border-b border-slate-300 pb-1">
            <div className="flex items-baseline gap-2">
              <strong className="uppercase tracking-wide">Fecha</strong>
              <span className="font-semibold">{date.toLocaleDateString('es-VE')}</span>
            </div>
            <div className="flex items-baseline justify-end gap-2 text-[11px]">
              <strong className="uppercase tracking-wide">FACTURA:</strong>
              <span className="font-black tabular-nums">{invoiceDisplayNumber}</span>
            </div>
          </div>
          <div className="mt-1 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            <div className="min-w-0"><strong>Nombre o razón social: </strong><span className="font-semibold">{[sale.cliente_nombre, sale.cliente_apellido].filter(Boolean).join(' ') || 'Consumidor Final'}</span></div>
            <div><strong>Cond. de pago: </strong><span className="font-bold uppercase">{isCredit ? 'Crédito' : 'Contado'}</span></div>
            <div><strong>Dirección: </strong><span>{sale.cliente_direccion || '—'}</span></div>
            <div><strong>No. RIF: </strong><span className="font-semibold">{sale.cliente_rif || '—'}</span></div>
            <div><strong>Teléfono: </strong><span>{sale.cliente_telefono || '—'}</span></div>
            <div><strong>Orden de entrega: </strong><span>{sale.orden_entrega || '—'}</span></div>
          </div>
          <div className="mt-2 grid grid-cols-[.55fr_3.3fr_1.15fr_.45fr_1.35fr] gap-x-2 border-b border-slate-500 pb-1 font-black uppercase tracking-wide">
            <span>Cant.</span><span>Descripción</span><span className="text-right">P. unitario</span><span className="text-center">E</span><span className="text-right">Precio total</span>
          </div>
          <div className={`min-h-0 flex-1 overflow-hidden ${dense ? 'text-[7px]' : 'text-[8.5px]'}`}>
            {sale.items.map((item, index) => (
              <div key={item.producto_id + '-' + index} className="grid grid-cols-[.55fr_3.3fr_1.15fr_.45fr_1.35fr] gap-x-2 py-[2px]">
                <span className="font-semibold">{item.cantidad}</span>
                <span className="truncate font-medium">{item.nombre_producto}{item.talla ? ` · ${item.talla}` : ''}</span>
                <span className="text-right tabular-nums">{money(Number(item.precio_unitario || 0) * sale.tasa_cambio)}</span>
                <span className="text-center">UN</span>
                <span className="text-right font-semibold tabular-nums">{money(Number(item.subtotal || 0) * sale.tasa_cambio)}</span>
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-[1fr_auto] items-end gap-4 border-t border-slate-400 pt-1">
            <div className="space-y-1 text-[8px]">
              <strong className="uppercase">Forma de pago</strong>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <span>{paymentFlags.cash ? '☒' : '☐'} Efectivo</span>
                <span>{paymentFlags.mobile ? '☒' : '☐'} Pago móvil</span>
                <span>{paymentFlags.debit ? '☒' : '☐'} Tarjeta débito / Punto de venta</span>
                <span>{paymentFlags.credit ? '☒' : '☐'} Tarjeta crédito</span>
                <span>{paymentFlags.transfer ? '☒' : '☐'} Banco / Transferencia</span>
              </div>
              <div className="pt-3 text-center text-[8px]">________________________________ Firma</div>
            </div>
            <div className="min-w-[2.25in] space-y-1 text-[9px]">
              <div className="flex justify-between gap-4"><strong>SUB-TOTAL Bs.</strong><span className="tabular-nums">{money(displaySubtotalBs)}</span></div>
              {sale.descuento_usd > 0 && <div className="flex justify-between gap-4"><strong>Descuento Bs.</strong><span>{money(sale.descuento_usd * sale.tasa_cambio)}</span></div>}
              {sale.aplica_iva && <div className="flex justify-between gap-4"><strong>IVA {sale.porcentaje_iva || 16}% Bs.</strong><span className="tabular-nums">{money(ivaBs)}</span></div>}
              <div className="flex justify-between gap-4 border-t border-slate-500 pt-1 text-[11px] font-black"><strong>TOTAL Bs.</strong><span className="tabular-nums">{money(sale.total_bs)}</span></div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};
