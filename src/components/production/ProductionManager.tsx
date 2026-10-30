import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Factory, PackageCheck, Plus, RefreshCw, Save, Search, ShieldAlert } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import type { ShoeProduct } from '../../types';

type RecipeLine = { materialId: string; quantity: number };
type Recipe = { id: string; name: string; finishedProductId: string; outputQuantity: number; unit: string; lines: RecipeLine[]; laborCost?: number; overheadCost?: number; updatedAt: string };
type ProductionOrder = { id: string; recipeId: string; plannedQuantity: number; batchCode: string; expiryDate: string; status: 'planned' | 'completed'; createdAt: string; completedAt?: string; actualOutput?: number; notes?: string };
type ProductionLot = { id: string; batchCode: string; recipeId: string; finishedProductId: string; producedQuantity: number; producedAt: string; expiryDate: string; consumed: Array<{ productId: string; productName: string; quantity: number; sourceLot?: string }>; orderId: string; totalCostUsd?: number; unitCostUsd?: number };

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50';

export const ProductionManager: React.FC = () => {
  const { products, adjustStock, updateProduct, addNotification } = useStore();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [lots, setLots] = useState<ProductionLot[]>([]);
  const [conversionCostByProduct, setConversionCostByProduct] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'recipes' | 'orders' | 'lots'>('recipes');
  const [recipeName, setRecipeName] = useState('');
  const [finishedProductId, setFinishedProductId] = useState('');
  const [outputQuantity, setOutputQuantity] = useState('1');
  const [unit, setUnit] = useState('unidad');
  const [laborCost, setLaborCost] = useState('0');
  const [overheadCost, setOverheadCost] = useState('0');
  const [lines, setLines] = useState<RecipeLine[]>([{ materialId: '', quantity: 1 }]);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [plannedQuantity, setPlannedQuantity] = useState('1');
  const [batchCode, setBatchCode] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [search, setSearch] = useState('');

  const finishedProducts = useMemo(() => products.filter(p => p.activo && (p.clasificacion_inventario === 'Productos terminados' || p.categoria === 'Productos terminados')), [products]);
  const materials = useMemo(() => products.filter(p => p.activo && (p.clasificacion_inventario === 'Materia prima' || p.clasificacion_inventario === 'Productos en proceso')), [products]);

  const persist = async (nextRecipes: Recipe[], nextOrders: ProductionOrder[], nextLots: ProductionLot[]) => {
    setSaving(true);
    try {
      const response = await fetch('/api/store/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productionRecipes: nextRecipes, productionOrders: nextOrders, productionLots: nextLots }) });
      if (!response.ok) throw new Error('No se pudo guardar la producción en el servidor.');
      setRecipes(nextRecipes); setOrders(nextOrders); setLots(nextLots);
    } catch (error) {
      addNotification('No se pudo guardar producción', error instanceof Error ? error.message : 'Error de conexión', 'critical');
      throw error;
    } finally { setSaving(false); }
  };

  const reload = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/store/state');
      if (!response.ok) throw new Error('No se pudo leer la información de producción.');
      const json = await response.json();
      const data = json?.data || {};
      setRecipes(Array.isArray(data.productionRecipes) ? data.productionRecipes : []);
      setOrders(Array.isArray(data.productionOrders) ? data.productionOrders : []);
      setLots(Array.isArray(data.productionLots) ? data.productionLots : []);
      // Costos de conversión del centro de costos: nómina y gastos indirectos del mes,
      // distribuidos por producto según horas de producción (o unidades si no hay horas).
      const costing = data.manufacturingCostData || {};
      const monthKey = new Date().toISOString().slice(0, 7);
      const staffCost = (Array.isArray(costing.staff) ? costing.staff : []).filter((x: any) => x.active !== false).reduce((sum: number, x: any) => {
        const monthly = Number(x.pay || 0) * (x.frequency === 'quincenal' ? 2 : x.frequency === 'semanal' ? 52 / 12 : 1);
        return sum + (x.department === 'produccion' ? monthly : monthly * Math.max(0, Math.min(100, Number(x.productionPercent || 0))) / 100);
      }, 0);
      const monthExpenses = Array.isArray(data.expenses) ? data.expenses.filter((x: any) => String(x.fecha || '').startsWith(monthKey)) : [];
      const actualPayroll = monthExpenses.filter((x: any) => x.centro_costo === 'produccion' && x.naturaleza_costo === 'mano_obra').reduce((sum: number, x: any) => sum + Number(x.monto_usd || 0), 0);
      const indirectCost = monthExpenses.filter((x: any) => x.centro_costo === 'produccion' && x.naturaleza_costo === 'indirecto').reduce((sum: number, x: any) => sum + Number(x.monto_usd || 0), 0);
      const extraIndirect = (Array.isArray(costing.costs) ? costing.costs : []).filter((x: any) => String(x.date || '').startsWith(monthKey) && x.department === 'produccion').reduce((sum: number, x: any) => sum + Number(x.amount || 0), 0);
      const conversionTotal = (actualPayroll > 0 ? actualPayroll : staffCost) + indirectCost + extraIndirect;
      const monthOutputs = (Array.isArray(costing.outputs) ? costing.outputs : []).filter((x: any) => String(x.date || '').startsWith(monthKey));
      const hoursTotal = monthOutputs.reduce((sum: number, x: any) => sum + Number(x.hours || 0), 0);
      const unitsTotal = monthOutputs.reduce((sum: number, x: any) => sum + Number(x.goodUnits || 0), 0);
      const costMap: Record<string, number> = {};
      monthOutputs.forEach((x: any) => {
        const weight = hoursTotal > 0 ? Number(x.hours || 0) / hoursTotal : unitsTotal > 0 ? Number(x.goodUnits || 0) / unitsTotal : 0;
        const key = String(x.product || '').trim().toLowerCase();
        if (key && Number(x.goodUnits || 0) > 0) costMap[key] = (costMap[key] || 0) + conversionTotal * weight / Number(x.goodUnits);
      });
      setConversionCostByProduct(costMap);
    } catch (error) {
      addNotification('Error cargando producción', error instanceof Error ? error.message : 'Error de conexión', 'critical');
    } finally { setLoading(false); }
  };
  useEffect(() => { void reload(); }, []);

  const saveRecipe = async () => {
    const validLines = lines.filter(line => line.materialId && Number(line.quantity) > 0);
    if (!recipeName.trim() || !finishedProductId || Number(outputQuantity) <= 0 || validLines.length === 0) {
      addNotification('Completa la receta', 'Indica nombre, producto final, rendimiento y al menos una materia prima con cantidad válida.', 'warning');
      return;
    }
    const aggregatedLines = Array.from(validLines.reduce((map, line) => map.set(line.materialId, (map.get(line.materialId) || 0) + Number(line.quantity)), new Map<string, number>()), ([materialId, quantity]) => ({ materialId, quantity }));
    const recipe: Recipe = { id: crypto.randomUUID(), name: recipeName.trim(), finishedProductId, outputQuantity: Number(outputQuantity), unit, lines: aggregatedLines, laborCost: Math.max(0, Number(laborCost) || 0), overheadCost: Math.max(0, Number(overheadCost) || 0), updatedAt: new Date().toISOString() };
    try {
      await persist([...recipes, recipe], orders, lots);
      setRecipeName(''); setFinishedProductId(''); setOutputQuantity('1'); setUnit('unidad'); setLaborCost('0'); setOverheadCost('0'); setLines([{ materialId: '', quantity: 1 }]);
      addNotification('Receta guardada', 'La receta está disponible para crear órdenes de producción.', 'success');
    } catch {}
  };

  const createOrder = async () => {
    const recipe = recipes.find(r => r.id === selectedRecipeId);
    const qty = Number(plannedQuantity);
    if (!recipe || !Number.isFinite(qty) || qty <= 0) {
      addNotification('Datos incompletos', 'Selecciona una receta e indica una cantidad de producción válida.', 'warning'); return;
    }
    const generatedBatch = batchCode.trim() || `LOT-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${String(orders.length + 1).padStart(3,'0')}`;
    if ([...orders.filter(o => o.status === 'planned').map(o => o.batchCode), ...lots.map(l => l.batchCode)].some(c => c.toLowerCase() === generatedBatch.toLowerCase())) {
      addNotification('Código de lote duplicado', 'Utiliza un código de lote diferente.', 'warning'); return;
    }
    const order: ProductionOrder = { id: crypto.randomUUID(), recipeId: recipe.id, plannedQuantity: qty, batchCode: generatedBatch, expiryDate, status: 'planned', createdAt: new Date().toISOString() };
    try {
      await persist(recipes, [order, ...orders], lots);
      setBatchCode(''); setExpiryDate(''); setPlannedQuantity('1'); setTab('orders');
      addNotification('Orden creada', `Orden de producción ${generatedBatch} creada. Aún no se ha descontado inventario.`, 'success');
    } catch {}
  };

  const completeOrder = async (order: ProductionOrder, actualOutputText: string) => {
    const recipe = recipes.find(r => r.id === order.recipeId);
    const actualOutput = Number(actualOutputText);
    if (!recipe || !Number.isFinite(actualOutput) || actualOutput <= 0) { addNotification('Cantidad inválida', 'Indica una cantidad producida mayor que cero.', 'warning'); return; }
    const requirements = recipe.lines.map(line => ({ ...line, required: line.quantity * order.plannedQuantity / recipe.outputQuantity, product: products.find(p => p.id === line.materialId) }));
    const missing = requirements.find(r => !r.product || r.product.stock < r.required);
    if (missing) { addNotification('Materia prima insuficiente', `No hay existencias suficientes de ${missing.product?.nombre || 'un material'} para completar la orden.`, 'critical'); return; }
    const outputProduct = products.find(p => p.id === recipe.finishedProductId);
    if (!outputProduct) { addNotification('Producto final no encontrado', 'La receta apunta a un producto que ya no existe.', 'critical'); return; }
    // Validamos todo antes de aplicar movimientos. La operación usa los mismos movimientos de inventario
    // que el resto de NEXOSS y conserva el vínculo de cada lote de fabricación.
    requirements.forEach(r => adjustStock(r.materialId, -r.required, `Consumo producción lote ${order.batchCode}`, 'salida_ajuste'));
    const monthlyConversionUnitCost = conversionCostByProduct[outputProduct.nombre.trim().toLowerCase()];
    const materialCostForOrder = recipeMaterialCost(recipe) * order.plannedQuantity / recipe.outputQuantity;
    const recipeConversionForOrder = ((Number(recipe.laborCost) || 0) + (Number(recipe.overheadCost) || 0)) * order.plannedQuantity / recipe.outputQuantity;
    const totalProductionCost = materialCostForOrder + (monthlyConversionUnitCost !== undefined ? monthlyConversionUnitCost * actualOutput : recipeConversionForOrder);
    const productionUnitCost = totalProductionCost / actualOutput;
    const combinedStock = outputProduct.stock + actualOutput;
    const weightedUnitCost = combinedStock > 0
      ? ((Math.max(0, outputProduct.stock) * (Number(outputProduct.costo) || 0)) + (actualOutput * productionUnitCost)) / combinedStock
      : productionUnitCost;
    adjustStock(outputProduct.id, actualOutput, `Producción terminada lote ${order.batchCode}`, 'entrada');
    updateProduct(outputProduct.id, { stock: combinedStock, costo: Number(weightedUnitCost.toFixed(6)) });
    const lot: ProductionLot = { id: crypto.randomUUID(), batchCode: order.batchCode, recipeId: recipe.id, finishedProductId: outputProduct.id, producedQuantity: actualOutput, producedAt: new Date().toISOString(), expiryDate: order.expiryDate, consumed: requirements.map(r => ({ productId: r.materialId, productName: r.product!.nombre, quantity: r.required })), orderId: order.id, totalCostUsd: totalProductionCost, unitCostUsd: productionUnitCost } as ProductionLot;
    const completed = { ...order, status: 'completed' as const, completedAt: new Date().toISOString(), actualOutput };
    try {
      await persist(recipes, orders.map(o => o.id === order.id ? completed : o), [lot, ...lots]);
      addNotification('Producción registrada', `Lote ${order.batchCode}: consumo registrado y ${actualOutput} ${recipe.unit} añadidos a ${outputProduct.nombre}.`, 'success');
    } catch {
      addNotification('Revisar sincronización', 'Se enviaron movimientos de inventario, pero no se confirmó el guardado de la trazabilidad. Verifica antes de repetir la orden.', 'critical');
    }
  };

  const recipeMaterialCost = (recipe: Recipe) => recipe.lines.reduce((total, line) => total + (Number(products.find(p => p.id === line.materialId)?.costo) || 0) * line.quantity, 0);
  const recipeBatchCost = (recipe: Recipe) => recipeMaterialCost(recipe) + (Number(recipe.laborCost) || 0) + (Number(recipe.overheadCost) || 0);
  const recipeUnitCost = (recipe: Recipe) => recipe.outputQuantity > 0 ? recipeBatchCost(recipe) / recipe.outputQuantity : 0;
  const money = (value: number) => value.toLocaleString('es-VE', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const visibleLots = lots.filter(l => `${l.batchCode} ${products.find(p => p.id === l.finishedProductId)?.nombre || ''} ${l.consumed.map(c => c.productName).join(' ')}`.toLowerCase().includes(search.toLowerCase()));

  return <div className="mx-auto w-full max-w-7xl space-y-6">
    <header className="rounded-2xl bg-gradient-to-r from-slate-950 via-indigo-950 to-indigo-900 p-6 text-white shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3"><div className="rounded-xl bg-white/10 p-3"><Factory className="h-7 w-7" /></div><div><p className="text-xs font-bold uppercase tracking-[.2em] text-indigo-200">Manufactura y trazabilidad</p><h1 className="mt-1 text-2xl font-black">Producción</h1><p className="mt-1 text-sm text-indigo-100">Recetas, consumo de materiales y lotes por empresa.</p></div></div>
        <button onClick={() => void reload()} className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10"><RefreshCw className="h-4 w-4" /> Actualizar</button>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[{label:'Recetas',value:recipes.length},{label:'Órdenes pendientes',value:orders.filter(o=>o.status==='planned').length},{label:'Lotes fabricados',value:lots.length}].map(metric=><div key={metric.label} className="rounded-xl border border-white/10 bg-white/5 p-3"><div className="text-sm text-indigo-100">{metric.label}</div><div className="mt-1 text-2xl font-bold">{metric.value}</div></div>)}
      </div>
    </header>
    <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      {([{id:'recipes',label:'Recetas',icon:ClipboardList},{id:'orders',label:'Órdenes de producción',icon:Factory},{id:'lots',label:'Trazabilidad por lote',icon:PackageCheck}] as const).map(item=>{const Icon=item.icon;return <button key={item.id} onClick={()=>setTab(item.id)} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold ${tab===item.id?'bg-indigo-600 text-white':'text-slate-600 hover:bg-slate-100'}`}><Icon className="h-4 w-4"/>{item.label}</button>})}
      <span className="ml-auto self-center px-2 text-xs text-slate-500">{saving?'Guardando…':loading?'Cargando…':'Datos de la empresa'}</span>
    </div>
    {tab==='recipes' && <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-slate-900">Crear receta</h2><p className="mb-4 mt-1 text-sm text-slate-500">Define el rendimiento base y los materiales requeridos. Las cantidades escalan con la orden.</p>
        <div className="space-y-4"><label className="block text-sm font-semibold">Nombre de la receta<input className={inputClass+' mt-1'} value={recipeName} onChange={e=>setRecipeName(e.target.value)} placeholder="Ej. Yogur natural 1 kg"/></label>
          <label className="block text-sm font-semibold">Producto terminado<select className={inputClass+' mt-1'} value={finishedProductId} onChange={e=>setFinishedProductId(e.target.value)}><option value="">Seleccionar producto del catálogo</option>{finishedProducts.map(p=><option key={p.id} value={p.id}>{p.nombre} · existencia actual {p.stock}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-500">Puedes seleccionar un producto con existencia cero. Primero se registra su ficha y receta; las unidades ingresan al inventario cuando confirmes la fabricación.</span></label>
          <div className="grid grid-cols-2 gap-3"><label className="block text-sm font-semibold">Rendimiento base<input type="number" min="0.001" step="any" className={inputClass+' mt-1'} value={outputQuantity} onChange={e=>setOutputQuantity(e.target.value)}/></label><label className="block text-sm font-semibold">Unidad<select className={inputClass+' mt-1'} value={unit} onChange={e=>setUnit(e.target.value)}>{['unidad','kg','g','litro','ml','paquete','caja'].map(u=><option key={u}>{u}</option>)}</select></label></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold">Mano de obra por rendimiento base (USD)<input type="number" min="0" step="0.01" className={inputClass+' mt-1'} value={laborCost} onChange={e=>setLaborCost(e.target.value)}/></label><label className="block text-sm font-semibold">Costos indirectos por rendimiento base (USD)<input type="number" min="0" step="0.01" className={inputClass+' mt-1'} value={overheadCost} onChange={e=>setOverheadCost(e.target.value)}/></label></div>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900"><div className="font-bold">Costo estimado del rendimiento base</div><div className="mt-1 flex justify-between"><span>Materias primas</span><strong>{money(lines.reduce((sum,line)=>sum+(Number(products.find(p=>p.id===line.materialId)?.costo)||0)*(Number(line.quantity)||0),0))}</strong></div><div className="mt-1 flex justify-between"><span>Mano de obra + indirectos</span><strong>{money((Number(laborCost)||0)+(Number(overheadCost)||0))}</strong></div><div className="mt-2 flex justify-between border-t border-indigo-200 pt-2"><span>Costo por unidad de rendimiento</span><strong>{money((lines.reduce((sum,line)=>sum+(Number(products.find(p=>p.id===line.materialId)?.costo)||0)*(Number(line.quantity)||0),0)+(Number(laborCost)||0)+(Number(overheadCost)||0))/Math.max(0.000001,Number(outputQuantity)||1))}</strong></div></div>
          <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-bold">Materiales e ingredientes</h3><button onClick={()=>setLines(prev=>[...prev,{materialId:'',quantity:1}])} className="text-sm font-semibold text-indigo-600"><Plus className="mr-1 inline h-4 w-4"/>Agregar línea</button></div>
          {lines.map((line,index)=><div key={index} className="grid grid-cols-[minmax(0,1fr)_100px_36px] gap-2"><select className={inputClass} value={line.materialId} onChange={e=>setLines(prev=>prev.map((l,i)=>i===index?{...l,materialId:e.target.value}:l))}><option value="">Seleccionar materia prima</option>{materials.map(p=><option key={p.id} value={p.id}>{p.nombre} · disponible {p.stock}</option>)}</select><input type="number" min="0.001" step="any" aria-label="Cantidad de material" className={inputClass} value={line.quantity} onChange={e=>setLines(prev=>prev.map((l,i)=>i===index?{...l,quantity:Number(e.target.value)}:l))}/><button aria-label="Eliminar material" onClick={()=>setLines(prev=>prev.filter((_,i)=>i!==index))} className="rounded-lg border border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-600">×</button></div>)}</div>
          <button className={buttonClass+' w-full'} disabled={saving} onClick={()=>void saveRecipe()}><Save className="h-4 w-4"/>Guardar receta</button>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Recetas registradas</h2>{recipes.length===0?<div className="mt-5 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Todavía no hay recetas. Crea una para empezar.</div>:<div className="mt-4 space-y-3">{recipes.map(recipe=><article key={recipe.id} className="rounded-xl border border-slate-200 p-4"><div className="font-bold">{recipe.name}</div><div className="mt-1 text-sm text-slate-500">Rendimiento: {recipe.outputQuantity} {recipe.unit} · {recipe.lines.length} materiales</div><div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Costo estimado: <strong>{money(recipeBatchCost(recipe))}</strong> por rendimiento base · <strong>{money(recipeUnitCost(recipe))}</strong> por {recipe.unit}</div><div className="mt-3 space-y-1 text-sm">{recipe.lines.map((line,i)=><div key={i} className="flex justify-between gap-2"><span>{products.find(p=>p.id===line.materialId)?.nombre||'Material eliminado'}</span><span className="font-semibold">{line.quantity}</span></div>)}</div></article>)}</div>}
        {materials.length===0&&<div className="mt-4 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"><ShieldAlert className="h-5 w-5 shrink-0"/>Primero registra los insumos en Compras/Inventario y clasifícalos como «Materia prima».</div>}
      </section>
    </div>}
    {tab==='orders' && <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Nueva orden</h2><p className="mb-4 mt-1 text-sm text-slate-500">Crear una orden no descuenta materiales; eso ocurre al completar la fabricación.</p><div className="space-y-4">
        <label className="block text-sm font-semibold">Receta<select className={inputClass+' mt-1'} value={selectedRecipeId} onChange={e=>setSelectedRecipeId(e.target.value)}><option value="">Seleccionar receta</option>{recipes.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label className="block text-sm font-semibold">Cantidad a fabricar<input type="number" min="0.001" step="any" className={inputClass+' mt-1'} value={plannedQuantity} onChange={e=>setPlannedQuantity(e.target.value)}/></label>
        <label className="block text-sm font-semibold">Código de lote (opcional)<input className={inputClass+' mt-1'} value={batchCode} onChange={e=>setBatchCode(e.target.value)} placeholder="Se genera automáticamente"/></label>
        <label className="block text-sm font-semibold">Fecha de vencimiento (si aplica)<input type="date" className={inputClass+' mt-1'} value={expiryDate} onChange={e=>setExpiryDate(e.target.value)}/></label>
        {recipes.find(r=>r.id===selectedRecipeId)&&<div className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900"><div className="font-bold">Consumo estimado</div><div className="mt-2 flex justify-between border-t border-indigo-200 pt-2"><span>Costo estimado de la orden</span><strong>{money(recipeBatchCost(recipes.find(r=>r.id===selectedRecipeId)!)*Number(plannedQuantity||0)/recipes.find(r=>r.id===selectedRecipeId)!.outputQuantity)}</strong></div><div className="mt-1 flex justify-between"><span>Costo unitario estimado</span><strong>{money(recipeUnitCost(recipes.find(r=>r.id===selectedRecipeId)!))}</strong></div>{recipes.find(r=>r.id===selectedRecipeId)!.lines.map((line,i)=><div key={i} className="mt-1 flex justify-between gap-2"><span>{products.find(p=>p.id===line.materialId)?.nombre}</span><span>{(line.quantity*Number(plannedQuantity||0)/recipes.find(r=>r.id===selectedRecipeId)!.outputQuantity).toLocaleString('es-VE',{maximumFractionDigits:4})}</span></div>)}</div>}
        <button className={buttonClass+' w-full'} disabled={saving||recipes.length===0} onClick={()=>void createOrder()}><Plus className="h-4 w-4"/>Crear orden</button></div></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Órdenes de producción</h2>{orders.length===0?<p className="mt-5 text-sm text-slate-500">No hay órdenes registradas.</p>:<div className="mt-4 space-y-3">{orders.map(order=>{const recipe=recipes.find(r=>r.id===order.recipeId);return <article key={order.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-bold">{recipe?.name||'Receta no disponible'}</div><div className="mt-1 font-mono text-sm text-indigo-700">{order.batchCode}</div><div className="mt-1 text-sm text-slate-500">Planificado: {order.plannedQuantity} {recipe?.unit||''} · {new Date(order.createdAt).toLocaleDateString('es-VE')}</div>{order.expiryDate&&<div className="text-sm text-slate-500">Vence: {order.expiryDate}</div>}</div><span className={`rounded-full px-3 py-1 text-xs font-bold ${order.status==='completed'?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-800'}`}>{order.status==='completed'?'Completada':'Pendiente'}</span></div>{order.status==='planned'&&<div className="mt-4 flex flex-wrap items-end gap-2"><label className="text-xs font-semibold text-slate-600">Cantidad real producida<input id={`actual-${order.id}`} type="number" min="0.001" step="any" defaultValue={order.plannedQuantity} className={inputClass+' mt-1 w-40'}/></label><button className={buttonClass} disabled={saving} onClick={()=>{const el=document.getElementById(`actual-${order.id}`) as HTMLInputElement|null;if(el)void completeOrder(order,el.value)}}><PackageCheck className="h-4 w-4"/>Confirmar producción</button></div>}{order.status==='completed'&&<p className="mt-3 text-sm text-emerald-700">Registrado: {order.actualOutput} {recipe?.unit||''} · {order.completedAt?new Date(order.completedAt).toLocaleString('es-VE'):''}</p>}</article>})}</div>}</section>
    </div>}
    {tab==='lots' && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Trazabilidad por lote</h2><p className="mt-1 text-sm text-slate-500">Consulta producto fabricado, fecha, vencimiento e ingredientes consumidos.</p></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input className={inputClass+' pl-9'} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar lote o material"/></div></div>{visibleLots.length===0?<p className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Los lotes aparecerán aquí al completar la primera orden.</p>:<div className="mt-4 space-y-3">{visibleLots.map(lot=><article key={lot.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2"><div><div className="font-mono font-bold text-indigo-700">{lot.batchCode}</div><div className="mt-1 font-semibold">{products.find(p=>p.id===lot.finishedProductId)?.nombre||'Producto terminado'}</div></div><div className="text-right text-sm"><div className="font-bold">{lot.producedQuantity} producidos</div>{typeof lot.totalCostUsd==='number'&&<div className="text-emerald-700">Costo lote: {money(lot.totalCostUsd)}</div>}{typeof lot.unitCostUsd==='number'&&<div className="text-emerald-700">Costo unitario: {money(lot.unitCostUsd)}</div>}<div className="text-slate-500">{new Date(lot.producedAt).toLocaleDateString('es-VE')}</div>{lot.expiryDate&&<div className="text-slate-500">Vence: {lot.expiryDate}</div>}</div></div><div className="mt-3 border-t border-slate-100 pt-3"><div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Materiales consumidos</div><div className="grid gap-2 sm:grid-cols-2">{lot.consumed.map((item,i)=><div key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="font-medium">{item.productName}</span><span className="float-right font-bold">{item.quantity}</span></div>)}</div></div></article>)}</div>}</section>}
    <p className="text-xs leading-relaxed text-slate-500">Flujo recomendado: registra primero el producto terminado en el catálogo con existencia inicial cero, crea su receta y luego genera una orden. Los ingredientes solo se descuentan al confirmar la fabricación y el inventario terminado aumenta con la cantidad realmente producida. El lote identifica la producción y sus consumos; el origen por lote de cada materia prima debe registrarse en la compra/recepción.</p>
  </div>;
};
