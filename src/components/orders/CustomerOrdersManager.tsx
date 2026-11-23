import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Plus, RefreshCw, Truck, CheckCircle2 } from 'lucide-react';

type OrderItem = { name: string; sku?: string; quantity: number; approvedQuantity?: number; deliveredQuantity?: number; unitPrice?: number };
type InvoiceOption = { id: string; numero_factura: string; cliente_nombre: string; cliente_apellido: string; total_usd: number; condicion_pago: string };
type CustomerOrder = {
  id: string; order_number: string; customer_document: string; customer_name: string;
  customer_phone: string; customer_address: string; branch_name: string; branch_address: string;
  requested_delivery_date: string | null; status: string; items: OrderItem[] | string;
  notes: string; invoice_sale_id: string | null; created_at: string;
};
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Error HTTP ${response.status}`);
  return data as T;
}
const statusLabel: Record<string,string> = { pending:'Pendiente', approved:'Aprobado', preparing:'En preparación', dispatched:'Despachado', partial:'Despacho parcial', cancelled:'Cancelado' };

export const CustomerOrdersManager: React.FC = () => {
  const [orders,setOrders] = useState<CustomerOrder[]>([]);
  const [invoices,setInvoices] = useState<InvoiceOption[]>([]);
  const [customerName,setCustomerName] = useState('');
  const [document,setDocument] = useState('');
  const [phone,setPhone] = useState('');
  const [address,setAddress] = useState('');
  const [branch,setBranch] = useState('');
  const [branchAddress,setBranchAddress] = useState('');
  const [deliveryDate,setDeliveryDate] = useState('');
  const [itemsText,setItemsText] = useState('');
  const [notes,setNotes] = useState('');
  const [invoiceIds,setInvoiceIds] = useState<Record<string,string>>({});
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const load = useCallback(async()=>{ try { const [result, invoiceResult]=await Promise.all([api<{orders:CustomerOrder[]}>('/api/customer-orders'),api<{invoices:InvoiceOption[]}>('/api/customer-orders/invoices')]); setOrders(result.orders||[]); setInvoices(invoiceResult.invoices||[]); setError(''); } catch(e){setError(e instanceof Error?e.message:'No se pudieron cargar los pedidos.');} },[]);
  useEffect(()=>{void load();},[load]);
  const create = async () => {
    const items = itemsText.split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{
      const match = /^(.*?)(?:\s*[xX*]\s*(\d+))?$/.exec(line);
      return { name: (match?.[1]||line).trim(), quantity: Math.max(1,Number(match?.[2]||1)) };
    });
    if(!customerName.trim()||!items.length){setError('Indica el nombre del supermercado y los productos con cantidades.');return;}
    setBusy(true);setError('');setNotice('');
    try{
      await api('/api/customer-orders',{method:'POST',body:JSON.stringify({customerName,customerDocument:document,customerPhone:phone,customerAddress:address,branchName:branch,branchAddress,requestedDeliveryDate:deliveryDate||null,items,notes})});
      setCustomerName('');setDocument('');setPhone('');setAddress('');setBranch('');setBranchAddress('');setDeliveryDate('');setItemsText('');setNotes('');
      setNotice('Pedido registrado. Todavía no genera deuda ni descuenta inventario.');await load();
    }catch(e){setError(e instanceof Error?e.message:'No se pudo registrar el pedido.');}finally{setBusy(false);}
  };
  const transition = async(order:CustomerOrder,status:string)=>{
    setBusy(true);setError('');setNotice('');
    try{
      await api(`/api/customer-orders/${encodeURIComponent(order.id)}`,{method:'PATCH',body:JSON.stringify({status,invoiceSaleId:invoiceIds[order.id]||order.invoice_sale_id||undefined})});
      setNotice(`Pedido ${order.order_number}: ${statusLabel[status]||status}.`);await load();
    }catch(e){setError(e instanceof Error?e.message:'No se pudo actualizar el pedido.');}finally{setBusy(false);}
  };
  return <div className="mx-auto max-w-6xl space-y-5">
    <header className="rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-900 p-6 text-white">
      <div className="flex items-center gap-3"><ClipboardList className="h-7 w-7"/><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-200">Macizo Natural · Operación comercial</p><h1 className="text-2xl font-black">Créditos y Pedidos</h1></div></div>
      <p className="mt-2 text-sm text-indigo-100">Solicitudes de supermercados y sucursales, aprobación, preparación, despacho y vínculo con la factura.</p>
    </header>
    {error&&<div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    {notice&&<div role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 font-bold"><Plus className="h-5 w-5 text-indigo-600"/> Registrar solicitud de pedido</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="Supermercado / cliente *" className="rounded-lg border p-3 text-sm"/>
        <input value={document} onChange={e=>setDocument(e.target.value)} placeholder="RIF / documento" className="rounded-lg border p-3 text-sm"/>
        <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Teléfono" className="rounded-lg border p-3 text-sm"/>
        <input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Dirección principal del cliente" className="rounded-lg border p-3 text-sm"/>
        <input value={branch} onChange={e=>setBranch(e.target.value)} placeholder="Nombre de sucursal / anaquel" className="rounded-lg border p-3 text-sm"/>
        <input value={branchAddress} onChange={e=>setBranchAddress(e.target.value)} placeholder="Dirección de la sucursal" className="rounded-lg border p-3 text-sm"/>
        <label className="text-xs text-slate-600">Fecha solicitada de entrega<input type="date" value={deliveryDate} onChange={e=>setDeliveryDate(e.target.value)} className="mt-1 w-full rounded-lg border p-3 text-sm"/></label>
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Observaciones del pedido" className="rounded-lg border p-3 text-sm"/>
      </div>
      <label className="mt-3 block text-xs text-slate-600">Productos y cantidades (un producto por línea; ejemplo: Yogurt natural 1kg x 12)<textarea value={itemsText} onChange={e=>setItemsText(e.target.value)} rows={4} placeholder={'Yogurt natural 1kg x 12\nYogurt fresa 250g x 24'} className="mt-1 w-full rounded-lg border p-3 text-sm"/></label>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">Crear pedido no reserva ni descuenta mercancía y no genera deuda.</p><button disabled={busy} onClick={()=>void create()} className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">Registrar pedido</button></div>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between"><h2 className="font-bold">Seguimiento de pedidos</h2><button onClick={()=>void load()} className="rounded-lg border p-2" aria-label="Actualizar"><RefreshCw className="h-4 w-4"/></button></div>
      <div className="space-y-3">
        {orders.map(order=>{
          const items=Array.isArray(order.items)?order.items:JSON.parse(order.items||'[]');
          return <article key={order.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">{order.order_number} · {order.customer_name}</p><p className="text-xs text-slate-500">{order.customer_document||'Sin RIF'} · {order.customer_phone||'Sin teléfono'}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{statusLabel[order.status]||order.status}</span></div>
            <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2"><p>Dirección cliente: {order.customer_address||'No indicada'}</p><p>Sucursal: {order.branch_name||'Principal'} · {order.branch_address||order.customer_address||'Sin dirección'}</p><p>Entrega solicitada: {order.requested_delivery_date?new Date(order.requested_delivery_date).toLocaleDateString():'Sin fecha'}</p><p>Factura: {order.invoice_sale_id||'Pendiente de vincular'}</p></div>
            <ul className="mt-3 list-disc pl-5 text-sm">{items.map((item:OrderItem,i:number)=><li key={i}>{item.name} · solicitado {item.quantity} · aprobado {item.approvedQuantity??item.quantity} · entregado {item.deliveredQuantity??0}</li>)}</ul>
            {order.notes&&<p className="mt-2 text-xs text-slate-500">Nota: {order.notes}</p>}
            {order.status==='preparing'||order.status==='partial'?<div className="mt-3 flex flex-col gap-2 sm:flex-row"><select value={invoiceIds[order.id]??order.invoice_sale_id??''} onChange={e=>setInvoiceIds(old=>({...old,[order.id]:e.target.value}))} className="min-w-0 flex-1 rounded-lg border p-2 text-sm"><option value="">Vincular factura creada en Ventas…</option>{invoices.filter(invoice=>!order.customer_document||!invoice.cliente_nombre||invoice.cliente_nombre.toLowerCase().includes(order.customer_name.toLowerCase().slice(0,8))).map(invoice=><option key={invoice.id} value={invoice.id}>{invoice.numero_factura} · {invoice.cliente_nombre} · ${Number(invoice.total_usd).toFixed(2)} · {invoice.condicion_pago}</option>)}</select><button disabled={busy} onClick={()=>void transition(order,'dispatched')} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white"><Truck className="mr-1 inline h-4 w-4"/>Confirmar despacho</button><button disabled={busy} onClick={()=>void transition(order,'partial')} className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-bold text-amber-800">Despacho parcial</button></div>:null}
            <div className="mt-3 flex flex-wrap gap-2">
              {order.status==='pending'&&<button disabled={busy} onClick={()=>void transition(order,'approved')} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white">Aprobar pedido</button>}
              {order.status==='approved'&&<button disabled={busy} onClick={()=>void transition(order,'preparing')} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white">Enviar a preparación</button>}
              {['pending','approved','preparing'].includes(order.status)&&<button disabled={busy} onClick={()=>void transition(order,'cancelled')} className="rounded-lg border px-3 py-2 text-xs font-bold text-rose-700">Cancelar</button>}
              {order.status==='dispatched'&&<span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4"/>Despachado y vinculado a factura</span>}
            </div>
          </article>;
        })}
        {orders.length===0&&<p className="py-8 text-center text-sm text-slate-500">Aún no hay pedidos registrados.</p>}
      </div>
    </section>
  </div>;
};
