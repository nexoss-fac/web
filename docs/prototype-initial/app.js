(() => {
  const categories = ['Mercancía', 'Materia prima', 'Productos en proceso', 'Productos terminados', 'Bienes muebles e inmuebles'];
  const subaccounts = ['Sueldos empleados', 'Sueldos directores', 'Tributos pagados', 'Indemnizaciones laborales', 'Depreciaciones y amortizaciones', 'Intereses', 'Traslados', 'Pérdidas', 'Reservas', 'Arrendamientos', 'Transporte', 'Honorarios profesionales', 'Reparaciones', 'Publicidad comercial', 'Seguros', 'Investigación', 'Representación', 'Personal', 'Bancos', 'Servicios públicos', 'Servicios privados'];
  const examples = [
    {id:'e-1',type:'inventory',date:'2026-10-10',reference:'INV-001',description:'Compra de insumos de empaque',movement:'Entrada',category:categories[1],quantity:120,unit:'unidades',amount:840,rate:36.5},
    {id:'e-2',type:'expense',date:'2026-10-09',reference:'EGR-014',description:'Servicio mensual de internet',subcategory:'Servicios privados',supplier:'Conexión Ejemplo',amount:68,rate:36.5},
    {id:'e-3',type:'inventory',date:'2026-10-08',reference:'INV-002',description:'Salida para orden de producción',movement:'Salida',category:categories[1],quantity:24,unit:'unidades',amount:168,rate:36.4},
    {id:'e-4',type:'expense',date:'2026-10-07',reference:'EGR-013',description:'Mantenimiento preventivo',subcategory:'Reparaciones',supplier:'Taller Demostración',amount:125,rate:36.4},
    {id:'e-5',type:'inventory',date:'2026-10-05',reference:'INV-003',description:'Venta de producto terminado',movement:'Salida',category:categories[3],quantity:16,unit:'cajas',amount:560,rate:36.2},
    {id:'e-6',type:'expense',date:'2026-10-03',reference:'EGR-012',description:'Honorarios del periodo',subcategory:'Honorarios profesionales',supplier:'Consultoría Local',amount:210,rate:36.2}
  ];
  const storageKey='nexoss-local-prototype-v1';
  let records;
  try { const stored=JSON.parse(localStorage.getItem(storageKey)); records=Array.isArray(stored)?stored:examples; } catch { records=examples; }
  let view='overview';
  const $=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat('es-VE',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
  const number=n=>new Intl.NumberFormat('es-VE',{maximumFractionDigits:2}).format(n);
  const dateLabel=s=>new Intl.DateTimeFormat('es-VE',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${s}T00:00:00Z`));
  const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function save(){localStorage.setItem(storageKey,JSON.stringify(records));}
  function setOptions(id,items){$(id).innerHTML=items.map(x=>`<option>${escapeHTML(x)}</option>`).join('');}
  setOptions('category',categories); setOptions('subcategory',subaccounts);
  const filtered=()=>records.filter(r=>view==='overview'||r.type===(view==='inventory'?'inventory':'expense'));
  function metric(label,value,icon){return `<article class="metric"><div class="metric-top"><span>${label}</span><span class="metric-icon">${icon}</span></div><div class="metric-value">${value}</div></article>`;}
  function renderMetrics(){
    const inv=records.filter(r=>r.type==='inventory'),exp=records.filter(r=>r.type==='expense');
    const invValue=inv.reduce((s,r)=>s+(r.movement==='Salida'?-Number(r.amount):Number(r.amount)),0);
    const expValue=exp.reduce((s,r)=>s+Number(r.amount),0);
    const month=new Date().toISOString().slice(0,7); const monthExpenses=exp.filter(r=>r.date.startsWith(month)).reduce((s,r)=>s+Number(r.amount),0);
    const stats=[['Registros de inventario',inv.length,'▤'],['Egresos registrados',exp.length,'↗'],['Actividad inventario (USD)',money(invValue),'◈'],['Egresos del mes (USD)',money(monthExpenses),'＄']];
    $('metrics').innerHTML=stats.map(x=>metric(...x)).join('');
  }
  function renderTable(){
    const rows=filtered().filter(r=>{const q=$('search').value.trim().toLocaleLowerCase('es');const period=$('period-filter').value;const text=[r.reference,r.description,r.category,r.subcategory,r.supplier,r.movement].join(' ').toLocaleLowerCase('es');return (!q||text.includes(q))&&(period==='all'||r.date.startsWith(period));}).sort((a,b)=>b.date.localeCompare(a.date));
    $('table-head').innerHTML='<tr><th>FECHA</th><th>REFERENCIA / DESCRIPCIÓN</th><th>TIPO</th><th>CATEGORÍA / SUBCUENTA</th><th>CANTIDAD</th><th>MONTO USD</th><th>TASA DEMO</th></tr>';
    $('table-body').innerHTML=rows.length?rows.map(r=>`<tr><td>${dateLabel(r.date)}</td><td><div class="primary-cell">${escapeHTML(r.reference)}</div><div class="sub-cell">${escapeHTML(r.description)}${r.supplier?` · ${escapeHTML(r.supplier)}`:''}</div></td><td><span class="tag ${r.type==='expense'?'expense':r.movement==='Salida'?'out':''}">${r.type==='expense'?'Egreso':escapeHTML(r.movement)}</span></td><td>${escapeHTML(r.type==='expense'?r.subcategory:r.category)}</td><td>${r.type==='expense'?'—':`${number(r.quantity)} ${escapeHTML(r.unit)}`}</td><td class="amount">${money(Number(r.amount))}</td><td>${number(Number(r.rate))}</td></tr>`).join(''):'<tr><td class="empty" colspan="7">No hay registros para los filtros seleccionados.</td></tr>';
    $('result-count').textContent=`${rows.length} ${rows.length===1?'registro':'registros'}`;
  }
  function render(){
    const copy={overview:['Resumen','VISTA GENERAL','Una lectura rápida de la actividad registrada en este espacio.','Actividad reciente','Movimientos y egresos de ejemplo'],inventory:['Inventario','CONTROL DE EXISTENCIAS','Consulta y registra actividad de inventario.','Actividad de inventario','Entradas, salidas y autoconsumo'],expenses:['Egresos','CLASIFICACIÓN DE EGRESOS','Consulta y registra egresos por subcuenta y proveedor.','Egresos registrados','Clasificación y proveedores de ejemplo']}[view];
    $('crumb-current').textContent=copy[0];$('page-title').textContent=copy[0];$('page-eyebrow').textContent=copy[1];$('page-description').textContent=copy[2];$('table-title').textContent=copy[3];$('table-subtitle').textContent=copy[4];
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    $('metrics').hidden=view!=='overview';
    const periods=[...new Set(filtered().map(r=>r.date.slice(0,7)))].sort().reverse(); $('period-filter').innerHTML='<option value="all">Todos los periodos</option>'+periods.map(p=>`<option value="${p}">${new Intl.DateTimeFormat('es-VE',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${p}-01T00:00:00Z`))}</option>`).join('');
    renderMetrics();renderTable();
  }
  document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;render();}));
  $('search').addEventListener('input',renderTable);$('period-filter').addEventListener('change',renderTable);
  $('dismiss-notice').addEventListener('click',()=>document.querySelector('.notice').remove());
  $('record-type').addEventListener('change',()=>{const inventory=$('record-type').value==='inventory';$('inventory-fields').hidden=!inventory;$('expense-fields').hidden=inventory;});
  $('new-record').addEventListener('click',()=>{$('record-date').value=new Date().toISOString().slice(0,10);$('record-dialog').showModal();});
  $('record-form').addEventListener('submit',e=>{e.preventDefault();if(!$('record-form').reportValidity())return;const type=$('record-type').value;const record={id:crypto.randomUUID(),type,date:$('record-date').value,reference:$('record-reference').value.trim(),description:$('record-description').value.trim(),amount:Number($('amount').value),rate:Number($('rate').value)};if(type==='inventory')Object.assign(record,{movement:$('movement').value,category:$('category').value,quantity:Number($('quantity').value),unit:$('unit').value.trim()||'unidad'});else Object.assign(record,{subcategory:$('subcategory').value,supplier:$('supplier').value.trim()});records.unshift(record);save();$('record-dialog').close();e.target.reset();$('record-date').value=new Date().toISOString().slice(0,10);$('rate').value='36.5';$('record-type').dispatchEvent(new Event('change'));render();});
  $('reset-data').addEventListener('click',()=>{if(confirm('¿Restablecer los registros de ejemplo y borrar los datos guardados en este navegador?')){records=structuredClone(examples);save();render();}});
  render();
})();
