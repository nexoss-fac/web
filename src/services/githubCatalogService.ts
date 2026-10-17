/**
 * Servicio heredado de publicación externa; está desactivado en NEXOSS local.
 */

import { ShoeProduct } from '../types';

export interface GitHubSyncConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  autoSync?: boolean;
}

export interface GroupedCatalogItem {
  key: string;
  nombre: string;
  marca: string;
  modelo: string;
  color: string;
  categoria: string;
  categoriaCode: string;
  precio: number;
  imagen: string;
  skuPrincipal: string;
  idPrincipal: string;
  tallas: string[];
  stockTotal: number;
  descripcion?: string;
  genero?: string;
}

export const DEFAULT_GITHUB_CONFIG: GitHubSyncConfig = {
  owner: 'nexoss-demo',
  repo: 'nexoss-demo',
  branch: 'main',
  token: '',
  autoSync: false,
};

const STORAGE_CONFIG_KEY = 'nexoss_local_github_sync_config';

/**
 * Cargar configuración guardada de GitHub
 */
export function getSavedGitHubConfig(): GitHubSyncConfig {
  try {
    const saved = localStorage.getItem(STORAGE_CONFIG_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_GITHUB_CONFIG, ...parsed };
    }
  } catch (err) {
    console.warn('Error reading github config from localStorage:', err);
  }
  return { ...DEFAULT_GITHUB_CONFIG };
}

/**
 * Guardar configuración de GitHub
 */
export function saveGitHubConfig(config: GitHubSyncConfig): void {
  try {
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn('Error saving github config to localStorage:', err);
  }
}

/**
 * Clasificar categoría para los filtros de catalogo.html
 * ('futbol' | 'beisbol' | 'running' | 'casual' | 'otros')
 */
export function mapToCatalogCategory(p: ShoeProduct): { code: string; label: string; dotColor: string } {
  const text = `${p.categoria || ''} ${p.tipo || ''} ${p.nombre || ''} ${p.descripcion || ''}`.toLowerCase();

  if (text.includes('futbol') || text.includes('fútbol') || text.includes('tacos') || text.includes('guayos') || text.includes('goletto')) {
    return { code: 'futbol', label: 'Fútbol', dotColor: 'var(--dot-futbol)' };
  }
  if (text.includes('beisbol') || text.includes('béisbol') || text.includes('baseball') || text.includes('softbol')) {
    return { code: 'beisbol', label: 'Béisbol', dotColor: 'var(--dot-beisbol)' };
  }
  if (text.includes('running') || text.includes('correr') || text.includes('maraton') || text.includes('maratón') || text.includes('run')) {
    return { code: 'running', label: 'Running', dotColor: 'var(--dot-running)' };
  }
  if (text.includes('casual') || text.includes('sneaker') || text.includes('urbano') || text.includes('moda')) {
    return { code: 'casual', label: 'Casual', dotColor: 'var(--dot-casual)' };
  }
  if (text.includes('gorra')) {
    return { code: 'gorras', label: 'Gorras', dotColor: 'var(--dot-otros)' };
  }
  if (text.includes('media') || text.includes('calcetin')) {
    return { code: 'medias', label: 'Medias', dotColor: 'var(--dot-otros)' };
  }
  return { code: 'casual', label: 'Casual', dotColor: 'var(--dot-casual)' };
}

/**
 * Agrupar productos de inventario por modelo/color para mostrarlos ordenados
 * con sus tallas disponibles en el catálogo web
 */
export function groupProductsForCatalog(products: ShoeProduct[]): GroupedCatalogItem[] {
  const activeProducts = products.filter((p) => p.activo !== false && (Number(p.stock) > 0 || p.stock === undefined));

  const groups = new Map<string, GroupedCatalogItem>();

  for (const p of activeProducts) {
    const normBrand = (p.marca || 'NEXOSS').trim();
    const normName = (p.nombre || 'Calzado').trim();
    const normColor = (p.color || '').trim();
    const groupKey = `${normBrand}_${normName}_${normColor}`.toLowerCase().replace(/\s+/g, '_');

    const catInfo = mapToCatalogCategory(p);

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: groupKey,
        nombre: normName,
        marca: normBrand,
        modelo: normName,
        color: normColor,
        categoria: catInfo.label,
        categoriaCode: catInfo.code,
        precio: Number(p.precio) || 0,
        imagen: p.imagen || 'images/logo.png',
        skuPrincipal: p.sku || `NEXOSS-${Date.now()}`,
        idPrincipal: p.id,
        tallas: p.talla ? [p.talla.trim()] : [],
        stockTotal: Number(p.stock) || 0,
        descripcion: p.descripcion,
        genero: p.genero,
      });
    } else {
      const existing = groups.get(groupKey)!;
      if (p.talla && !existing.tallas.includes(p.talla.trim())) {
        existing.tallas.push(p.talla.trim());
      }
      existing.stockTotal += Number(p.stock) || 0;
      // Usar imagen si el grupo no tenía una definida
      if ((!existing.imagen || existing.imagen === 'images/logo.png') && p.imagen) {
        existing.imagen = p.imagen;
      }
      // Actualizar precio si es mayor o más reciente
      if (p.precio && p.precio > 0) {
        existing.precio = Number(p.precio);
      }
    }
  }

  // Ordenar tallas numéricamente dentro de cada grupo
  for (const group of groups.values()) {
    group.tallas.sort((a, b) => {
      const na = parseFloat(a);
      const nb = parseFloat(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
  }

  return Array.from(groups.values());
}

/**
 * Genera contenido de catálogo para vista previa local.
 * Conserva fielmente la paleta, tipografía, Cashea SDK y botones de WhatsApp originales.
 */
export function generateCatalogHtml(
  products: ShoeProduct[],
  exchangeRate: number,
  options: {
    whatsappNumber?: string;
    casheaPublicKey?: string;
    apiOrigin?: string;
  } = {}
): string {
  const whatsappNumber = options.whatsappNumber || '584249307158';
  const casheaKey = options.casheaPublicKey || 'PUBLIC_API_KEY_PENDIENTE';
  const apiOrigin = options.apiOrigin || '';

  const grouped = groupProductsForCatalog(products);

  // Extraer categorías únicas para los botones de filtro
  const categoriesSet = new Set<string>(['todos']);
  grouped.forEach((g) => categoriesSet.add(g.categoriaCode));

  const filterButtons = [
    { code: 'todos', label: 'Todos' },
    { code: 'futbol', label: 'Fútbol' },
    { code: 'beisbol', label: 'Béisbol' },
    { code: 'running', label: 'Running' },
    { code: 'casual', label: 'Casual' },
  ];

  // Si hay otras categorías presentes en el inventario, agregarlas
  for (const catCode of categoriesSet) {
    if (!filterButtons.some((b) => b.code === catCode)) {
      filterButtons.push({
        code: catCode,
        label: catCode.charAt(0).toUpperCase() + catCode.slice(1),
      });
    }
  }

  // Render de tarjetas de productos estilo Amazon
  const cardsHtml = grouped
    .map((item, index) => {
      const priceUSD = item.precio;
      const listPriceUSD = priceUSD > 0 ? Math.round(priceUSD * 1.22) : 0;
      const discountPct = listPriceUSD > 0 ? Math.round(((listPriceUSD - priceUSD) / listPriceUSD) * 100) : 18;
      const priceBs = Math.round(priceUSD * exchangeRate);
      const formattedUSD = priceUSD > 0 ? `$${priceUSD.toFixed(2)}` : 'Consultar precio';
      const formattedListUSD = listPriceUSD > 0 ? `$${listPriceUSD.toFixed(2)}` : '';
      const formattedBs = priceUSD > 0 ? `Bs. ${priceBs.toLocaleString('es-VE')}` : '';
      const tallasStr = item.tallas.length > 0 ? item.tallas.join(', ') : 'Consultar';
      const stockBadge =
        item.stockTotal > 0
          ? `${item.stockTotal} ${item.stockTotal === 1 ? 'par disponible' : 'pares disponibles'}`
          : 'Bajo pedido';

      const defaultTalla = item.tallas.length > 0 ? item.tallas[0] : '';
      const waText = encodeURIComponent(
        `Hola NEXOSS, me interesa el modelo estilo Amazon *${item.nombre}* (${item.marca}) ${
          item.color ? `- Color ${item.color}` : ''
        } en Talla *${defaultTalla}* a ${formattedUSD}. ¿Tienen disponibilidad inmediata para entrega?`
      );

      const catInfo = mapToCatalogCategory({
        categoria: item.categoria,
        tipo: 'Deportivo',
        nombre: item.nombre,
      } as any);

      // Limpiar comillas para atributos HTML
      const cleanNombre = item.nombre.replace(/"/g, '&quot;');
      const cleanSku = item.skuPrincipal.replace(/"/g, '&quot;');
      const cleanColor = (item.color || 'Estándar').replace(/"/g, '&quot;');

      return `      <!-- PRODUCTO ${index + 1}: ${cleanNombre} -->
      <article class="card" data-cat="${item.categoriaCode}" data-id="${item.idPrincipal}" data-index="${index}">
        <div class="card-media" onclick="abrirFichaAmazon(${index})">
          <span class="card-badge-amazon">Elección de Amazon</span>
          <img id="main-p${index + 1}" src="${item.imagen}" alt="${cleanNombre}" loading="lazy" onerror="this.src='images/logo.png'">
        </div>
        <div class="card-body">
          <div class="card-brand">${item.marca}</div>
          <h3 onclick="abrirFichaAmazon(${index})">${cleanNombre} ${item.color ? `— ${item.color}` : ''}</h3>
          
          <!-- Amazon Star Rating -->
          <div class="card-rating" onclick="abrirFichaAmazon(${index})">
            <span class="stars">★★★★★</span>
            <span class="rating-val">4.8</span>
            <span class="reviews-count">(1,420)</span>
          </div>

          <!-- Amazon Price Block -->
          <div class="card-precio">
            <div class="precio-row">
              <span class="discount-tag">-${discountPct}%</span>
              <span class="precio-usd">${formattedUSD}</span>
            </div>
            ${formattedListUSD ? `<div class="precio-ant">Precio anterior: <span class="strike">${formattedListUSD}</span></div>` : ''}
            ${formattedBs ? `<div class="precio-bs">${formattedBs} <span class="bcv-note">(Tasa BCV: ${exchangeRate.toFixed(2)} Bs)</span></div>` : ''}
          </div>

          <!-- Size chips preview -->
          <div class="card-sizes">
            <span class="sizes-label">Tallas en stock:</span>
            <div class="sizes-chips">
              ${item.tallas.slice(0, 5).map(sz => `<span class="sz-chip">${sz}</span>`).join('')}
              ${item.tallas.length > 5 ? `<span class="sz-chip more">+${item.tallas.length - 5}</span>` : ''}
            </div>
          </div>

          <!-- Actions: Amazon Detail Sheet + WhatsApp Order -->
          <div class="card-actions">
            <button type="button" class="btn-amazon-sheet" onclick="abrirFichaAmazon(${index})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
              Ver Ficha de Producto
            </button>
            <a class="card-cta" target="_blank" rel="noopener" href="https://wa.me/${whatsappNumber}?text=${waText}">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.81L2 22l5.42-1.36c1.38.72 2.94 1.13 4.62 1.13 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm0 17.87c-1.53 0-2.96-.42-4.19-1.15l-.3-.18-3.11.78.83-3.03-.2-.31a7.86 7.86 0 01-1.24-4.07c0-4.36 3.55-7.91 7.92-7.91 4.36 0 7.91 3.55 7.91 7.91 0 4.37-3.55 7.96-7.62 7.96z"/></svg>
              Comprar por WhatsApp
            </a>
          </div>

          <!-- Cashea Block -->
          <div class="cashea-box" data-cashea data-producto-id="${item.idPrincipal}" data-nombre="${cleanNombre}" data-sku="${cleanSku}" data-precio="${priceUSD}" data-imagen="${item.imagen}">
            <div class="cashea-label">🟣 Paga en 4 cuotas de $${(priceUSD / 4).toFixed(2)} con Cashea</div>
            <div class="cashea-form">
              <input type="text" class="cashea-cedula" placeholder="Tu cédula (ej: V12345678)">
              <button class="cashea-generar" type="button">Pagar con Cashea</button>
            </div>
            <div class="cashea-container"></div>
          </div>
        </div>
      </article>`;
    })
    .join('\n\n');

  const now = new Date();
  const fechaStr = `${now.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })} ${now.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`;

  // Serializar productos para el motor interactivo de Amazon Modal
  const catalogJsonData = JSON.stringify(grouped);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Catálogo Oficial Estilo Amazon — NEXOSS</title>
  <meta name="description" content="Catálogo de calzado deportivo estilo Amazon en NEXOSS. Fútbol, béisbol, running y estilo casual en Ubicación no configurada, Venezuela.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root{
      --amazon-dark:#131921;
      --amazon-nav:#232F3E;
      --amazon-yellow:#FFD814;
      --amazon-yellow-hover:#F7CA00;
      --amazon-orange:#C7511F;
      --amazon-link:#007185;
      --negro:#0F1111;
      --blanco:#FFFFFF;
      --gris-tile:#FFFFFF;
      --gris-texto:#565959;
      --gris-borde:#D5D9D9;
      --verde-stock:#067D62;
      --whatsapp:#25D366;
      --cashea:#7E22CE;
    }
    *{box-sizing:border-box; margin:0; padding:0;}
    body{ font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:var(--negro); background:#EAEDED; -webkit-font-smoothing:antialiased; }
    img{max-width:100%; display:block;}
    a{text-decoration:none; color:inherit;}
    button{font-family:inherit; cursor:pointer;}
    .wrap{ max-width:1440px; margin:0 auto; padding:0 24px; }
    .display{ font-family:'Archivo', Arial, sans-serif; font-weight:900; text-transform:uppercase; letter-spacing:-0.01em; }

    /* Amazon Nav Header */
    nav{ position:sticky; top:0; z-index:50; background:var(--amazon-dark); color:#fff; border-bottom:1px solid #3a4553; }
    .nav-inner{ display:flex; align-items:center; justify-content:space-between; padding:12px 24px; max-width:1440px; margin:0 auto; gap:20px; }
    .brand{ display:flex; align-items:center; gap:10px; cursor:pointer; }
    .brand img{ height:36px; width:36px; object-fit:contain; border-radius:4px; }
    .brand span{ font-family:'Archivo', sans-serif; font-weight:900; font-size:20px; text-transform:uppercase; letter-spacing:0.04em; color:var(--amazon-yellow); }
    
    .nav-search{ flex:1; max-width:600px; display:flex; border-radius:4px; overflow:hidden; border:2px solid transparent; }
    .nav-search:focus-within{ border-color:#FF9900; box-shadow:0 0 0 2px rgba(255,153,0,0.5); }
    .nav-search input{ flex:1; padding:10px 14px; font-size:14px; border:none; outline:none; background:#fff; color:#0F1111; }
    .nav-search button{ background:var(--amazon-yellow); border:none; padding:0 18px; display:flex; align-items:center; justify-content:center; }
    .nav-search button svg{ width:18px; height:18px; color:#0F1111; }

    .nav-links{ display:flex; align-items:center; gap:24px; }
    .nav-links a{ font-size:13.5px; font-weight:600; color:#fff; transition:color .15s; }
    .nav-links a:hover{ color:var(--amazon-yellow); }
    .nav-cta{ display:flex; align-items:center; gap:8px; background:var(--amazon-yellow); color:#0F1111; font-weight:700; font-size:13px; padding:9px 18px; border-radius:4px; transition:background .15s; }
    .nav-cta:hover{ background:var(--amazon-yellow-hover); }
    .nav-cta svg{ width:16px; height:16px; color:#0F1111; }

    /* Sub-header banner */
    .cat-header{ padding:28px 0 16px 0; }
    .cat-header h1{ font-size:clamp(28px,4vw,44px); line-height:1.05; color:var(--amazon-dark); }
    .cat-header p{ margin-top:8px; max-width:680px; font-size:14px; color:var(--gris-texto); line-height:1.5; }

    .live-status-bar{ display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-top:14px; padding:10px 16px; background:#fff; border:1px solid var(--gris-borde); border-radius:8px; font-size:12.5px; color:#334155; }
    .live-dot{ display:inline-block; width:8px; height:8px; border-radius:50%; background:#10B981; margin-right:6px; animation:pulse 2s infinite; }
    @keyframes pulse { 0%,100%{ opacity:1; transform:scale(1); } 50%{ opacity:0.4; transform:scale(1.2); } }

    /* Category Filter Pills */
    .filtros{ display:flex; gap:10px; flex-wrap:wrap; padding:14px 0; margin-bottom:12px; }
    .filtro-btn{ background:#fff; border:1px solid var(--gris-borde); border-radius:20px; padding:7px 18px; font-size:13px; font-weight:600; color:#0F1111; transition:all .15s; }
    .filtro-btn.activo{ background:var(--amazon-dark); color:#fff; border-color:var(--amazon-dark); }
    .filtro-btn:hover:not(.activo){ border-color:#888; }

    /* Product Grid */
    .productos{ padding:10px 0 80px 0; }
    .grid-productos{ display:grid; grid-template-columns:repeat(auto-fill, minmax(290px, 1fr)); gap:20px; }
    .card{ display:flex; flex-direction:column; background:var(--blanco); border:1px solid var(--gris-borde); border-radius:8px; overflow:hidden; transition:transform .2s, box-shadow .2s; }
    .card:hover{ box-shadow:0 8px 24px rgba(0,0,0,0.08); }
    
    .card-media{ position:relative; background:radial-gradient(circle at 50% 38%, #FFFFFF 0%, #FAFCFE 45%, #F4F6F8 82%, #ECEFF2 100%); aspect-ratio:1/1; overflow:hidden; display:flex; align-items:center; justify-content:center; cursor:pointer; padding:20px; }
    .card-media img{ width:100%; height:100%; object-fit:contain; transition:transform .3s ease; filter:drop-shadow(0 4px 12px rgba(40,44,52,0.06)); }
    .card:hover .card-media img{ transform:scale(1.06); }
    
    .card-badge-amazon{ position:absolute; top:12px; left:12px; background:var(--amazon-nav); color:#fff; font-size:10px; font-weight:800; padding:4px 8px; border-radius:3px; letter-spacing:0.02em; }
    
    .card-body{ padding:16px; display:flex; flex-direction:column; gap:8px; flex:1; }
    .card-brand{ font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--amazon-link); }
    .card-body h3{ font-size:15px; font-weight:700; line-height:1.35; color:var(--negro); cursor:pointer; }
    .card-body h3:hover{ color:var(--amazon-orange); }

    /* Star rating */
    .card-rating{ display:flex; align-items:center; gap:5px; font-size:12px; cursor:pointer; }
    .card-rating .stars{ color:#FFA41C; letter-spacing:1px; }
    .card-rating .rating-val{ font-weight:700; color:#0F1111; }
    .card-rating .reviews-count{ color:var(--amazon-link); }

    /* Pricing */
    .card-precio{ margin-top:2px; }
    .precio-row{ display:flex; align-items:baseline; gap:8px; }
    .discount-tag{ color:#CC0C39; font-weight:700; font-size:16px; }
    .precio-usd{ font-size:22px; font-weight:900; color:#0F1111; }
    .precio-ant{ font-size:11.5px; color:var(--gris-texto); margin-top:1px; }
    .precio-ant .strike{ text-decoration:line-through; }
    .precio-bs{ font-size:12px; font-weight:700; color:var(--verde-stock); margin-top:2px; }
    .bcv-note{ font-size:11px; font-weight:400; color:var(--gris-texto); }

    /* Sizes */
    .card-sizes{ display:flex; flex-direction:column; gap:4px; margin-top:4px; font-size:11.5px; }
    .sizes-label{ font-weight:700; color:#334155; }
    .sizes-chips{ display:flex; flex-wrap:wrap; gap:4px; }
    .sz-chip{ background:#F1F5F9; border:1px solid #CBD5E1; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:700; color:#1E293B; }
    .sz-chip.more{ background:#E2E8F0; color:#475569; }

    /* Buttons */
    .card-actions{ display:flex; flex-direction:column; gap:6px; margin-top:8px; }
    .btn-amazon-sheet{ width:100%; display:flex; align-items:center; justify-content:center; gap:6px; background:#fff; border:1px solid var(--gris-borde); color:#0F1111; font-weight:700; font-size:12.5px; padding:10px; border-radius:20px; transition:all .15s; }
    .btn-amazon-sheet:hover{ background:#F7FAFA; border-color:#888; }
    .btn-amazon-sheet svg{ width:14px; height:14px; }

    .card-cta{ display:flex; align-items:center; justify-content:center; gap:8px; background:var(--amazon-yellow); color:#0F1111; font-weight:700; font-size:13px; padding:10px; border-radius:20px; transition:background .15s ease; }
    .card-cta:hover{ background:var(--amazon-yellow-hover); }
    .card-cta svg{ width:15px; height:15px; }

    /* Cashea */
    .cashea-box{ margin-top:4px; border:1px solid #E9D5FF; background:#FAF5FF; border-radius:6px; padding:10px; font-size:11.5px; }
    .cashea-box .cashea-label{ font-weight:700; color:#6B21A8; margin-bottom:6px; }
    .cashea-box input{ width:100%; font-size:12px; padding:6px 8px; border:1px solid #D8B4FE; border-radius:4px; margin-bottom:6px; background:#fff; }
    .cashea-generar{ width:100%; background:var(--cashea); color:#fff; font-weight:700; font-size:11.5px; padding:7px; border:none; border-radius:4px; }
    .cashea-generar:hover{ background:#6B21A8; }

    /* AMAZON FULL MODAL */
    .amazon-modal{ display:none; position:fixed; inset:0; z-index:100; background:rgba(0,0,0,0.8); overflow-y:auto; padding:16px; align-items:center; justify-content:center; }
    .amazon-modal.active{ display:flex; }
    .modal-content{ background:#fff; border-radius:12px; width:100%; max-width:1160px; max-height:92vh; overflow-y:auto; display:flex; flex-direction:column; position:relative; box-shadow:0 24px 60px rgba(0,0,0,0.3); }
    
    .modal-header{ background:var(--amazon-dark); color:#fff; padding:12px 20px; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:10; }
    .modal-header .brand-title{ font-weight:900; color:var(--amazon-yellow); font-size:16px; letter-spacing:0.02em; }
    .modal-close{ background:none; border:none; color:#fff; font-size:24px; line-height:1; cursor:pointer; padding:4px 8px; border-radius:4px; }
    .modal-close:hover{ background:rgba(255,255,255,0.15); }

    .modal-breadcrumb{ background:#F8FAFC; padding:8px 24px; font-size:11.5px; color:var(--gris-texto); border-bottom:1px solid #E2E8F0; display:flex; align-items:center; gap:6px; overflow-x:auto; }
    .modal-breadcrumb span.active{ color:#0F1111; font-weight:700; }

    .modal-grid{ display:grid; grid-template-columns:1fr; gap:24px; padding:24px; }
    @media(min-width:960px){
      .modal-grid{ grid-template-columns: 460px 1fr 300px; gap:24px; }
    }

    /* Modal Gallery */
    .m-gallery{ display:flex; flex-direction:column; gap:12px; }
    .m-stage{ width:100%; aspect-ratio:1/1; background:radial-gradient(circle at 50% 38%, #FFFFFF 0%, #FAFCFE 45%, #F4F6F8 82%, #ECEFF2 100%); border:1px solid var(--gris-borde); border-radius:8px; overflow:hidden; display:flex; align-items:center; justify-content:center; padding:20px; position:relative; }
    .m-stage img{ width:100%; height:100%; object-fit:contain; transition:transform .3s; filter:drop-shadow(0 6px 16px rgba(40,44,52,0.08)); }
    .m-thumbs{ display:flex; gap:8px; justify-content:center; }
    .m-thumb{ width:60px; height:60px; border:1px solid var(--gris-borde); border-radius:6px; padding:4px; background:#fff; cursor:pointer; }
    .m-thumb.active{ border-color:var(--amazon-orange); box-shadow:0 0 0 1px var(--amazon-orange); }
    .m-thumb img{ width:100%; height:100%; object-fit:contain; }

    /* Modal Details */
    .m-details{ display:flex; flex-direction:column; gap:14px; }
    .m-store-link{ font-size:12.5px; color:var(--amazon-link); font-weight:600; cursor:pointer; }
    .m-store-link:hover{ color:var(--amazon-orange); text-decoration:underline; }
    .m-title{ font-size:20px; font-weight:800; line-height:1.3; color:#0F1111; }
    
    .m-ratings{ display:flex; align-items:center; gap:8px; font-size:12.5px; border-bottom:1px solid #E2E8F0; padding-bottom:12px; }
    .m-ratings .stars{ color:#FFA41C; }
    
    .m-price-box{ border-bottom:1px solid #E2E8F0; padding-bottom:14px; }
    .m-price-box .m-discount{ color:#CC0C39; font-size:22px; font-weight:400; margin-right:8px; }
    .m-price-box .m-usd{ font-size:28px; font-weight:900; color:#0F1111; }
    .m-price-box .m-list{ font-size:12px; color:var(--gris-texto); margin-top:2px; }
    .m-price-box .m-bs{ font-size:14px; font-weight:700; color:var(--verde-stock); margin-top:4px; }

    /* Size selector inside modal */
    .m-size-section{ border-bottom:1px solid #E2E8F0; padding-bottom:16px; }
    .m-size-header{ display:flex; justify-content:space-between; align-items:center; font-size:13px; margin-bottom:8px; }
    .m-size-header strong{ color:#0F1111; }
    .m-size-guide-link{ color:var(--amazon-link); font-weight:600; cursor:pointer; font-size:12px; }
    .m-size-guide-link:hover{ color:var(--amazon-orange); text-decoration:underline; }
    .m-sizes-grid{ display:flex; flex-wrap:wrap; gap:8px; }
    .m-size-btn{ min-width:52px; height:40px; padding:0 12px; border:1px solid var(--gris-borde); border-radius:6px; background:#fff; font-size:13px; font-weight:700; display:flex; align-items:center; justify-content:center; transition:all .15s; }
    .m-size-btn.selected{ background:var(--amazon-dark); color:#fff; border-color:var(--amazon-dark); box-shadow:0 0 0 2px var(--amazon-yellow); }

    /* Tech Specs Table */
    .m-specs-table{ width:100%; border-collapse:collapse; font-size:12px; margin-top:8px; }
    .m-specs-table td{ padding:7px 10px; border-bottom:1px solid #F1F5F9; }
    .m-specs-table td.label{ font-weight:700; color:#475569; width:45%; background:#F8FAFC; }
    .m-specs-table td.val{ color:#0F1111; font-weight:500; }

    /* Bullet points */
    .m-bullets{ font-size:12.5px; line-height:1.6; color:#334155; }
    .m-bullets h4{ font-size:14px; font-weight:800; margin-bottom:6px; color:#0F1111; }
    .m-bullets ul{ padding-left:18px; }
    .m-bullets li{ margin-bottom:6px; }
    .m-bullets li strong{ color:#0F1111; }

    /* Modal Buy Box */
    .m-buybox{ background:#fff; border:1px solid var(--gris-borde); border-radius:10px; padding:18px; display:flex; flex-direction:column; gap:12px; height:fit-content; }
    .m-buybox .m-bb-price{ font-size:24px; font-weight:900; color:#0F1111; }
    .m-buybox .m-bb-stock{ color:var(--verde-stock); font-weight:700; font-size:14px; display:flex; align-items:center; gap:4px; }
    .m-buybox .m-bb-qty{ display:flex; align-items:center; gap:8px; font-size:12px; }
    .m-buybox select{ padding:6px 10px; border:1px solid var(--gris-borde); border-radius:4px; font-weight:700; }
    
    .btn-buy-wa{ background:var(--amazon-yellow); color:#0F1111; font-weight:800; font-size:13.5px; padding:12px; border-radius:22px; border:none; text-align:center; display:flex; align-items:center; justify-content:center; gap:8px; transition:background .15s; }
    .btn-buy-wa:hover{ background:var(--amazon-yellow-hover); }
    .btn-buy-wa svg{ width:18px; height:18px; }

    .btn-buy-cashea{ background:var(--cashea); color:#fff; font-weight:800; font-size:12.5px; padding:10px; border-radius:22px; border:none; text-align:center; display:block; transition:background .15s; }
    .btn-buy-cashea:hover{ background:#6B21A8; }

    .m-trust-rows{ font-size:11px; color:#64748B; border-top:1px solid #E2E8F0; padding-top:10px; display:flex; flex-direction:column; gap:6px; }
    .m-trust-rows .row{ display:flex; justify-content:space-between; }
    .m-trust-rows .row strong{ color:#0F1111; }

    /* Size Chart Popup inside modal */
    .size-chart-box{ display:none; background:#F8FAFC; border:1px solid #CBD5E1; border-radius:8px; padding:12px; margin-top:10px; }
    .size-chart-box.active{ display:block; }
    .size-chart-table{ width:100%; text-align:center; border-collapse:collapse; font-size:11px; margin-top:6px; }
    .size-chart-table th{ background:#E2E8F0; padding:5px; border:1px solid #CBD5E1; }
    .size-chart-table td{ padding:5px; border:1px solid #CBD5E1; background:#fff; }

    footer{ border-top:1px solid var(--gris-borde); padding:36px 0; text-align:center; background:#FAFAFA; margin-top:40px; }
    footer p{ font-size:13px; color:var(--gris-texto); }
    footer .footer-sub{ font-size:11px; color:#94A3B8; margin-top:6px; }

    @media (max-width:640px){
      .wrap{ padding:0 16px; }
      .nav-inner{ padding:10px 16px; flex-wrap:wrap; }
      .nav-search{ order:3; width:100%; max-width:100%; }
      .nav-links{ display:none; }
      .grid-productos{ grid-template-columns:1fr; }
    }
  </style>
</head>
<body>

<!-- Navigation Header -->
<nav>
  <div class="nav-inner">
    <div class="brand" onclick="window.scrollTo({top:0, behavior:'smooth'})">
      <img src="images/logo.png" alt="NEXOSS" onerror="this.style.display='none'">
      <span>NEXOSS</span>
    </div>

    <!-- Search bar -->
    <div class="nav-search">
      <input type="text" id="buscador-catalogo" placeholder="Buscar tenis, marca (Adidas, Nike...), modelo o talla...">
      <button type="button" aria-label="Buscar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      </button>
    </div>

    <div class="nav-links">
      <a href="index.html">Inicio</a>
      <a href="catalogo.html" style="color:var(--amazon-yellow); border-bottom:2px solid var(--amazon-yellow); padding-bottom:2px;">Catálogo Oficial</a>
    </div>

    <a class="nav-cta" href="https://wa.me/${whatsappNumber}" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.81L2 22l5.42-1.36c1.38.72 2.94 1.13 4.62 1.13 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm0 17.87c-1.53 0-2.96-.42-4.19-1.15l-.3-.18-3.11.78.83-3.03-.2-.31a7.86 7.86 0 01-1.24-4.07c0-4.36 3.55-7.91 7.92-7.91 4.36 0 7.91 3.55 7.91 7.91 0 4.37-3.55 7.96-7.62 7.96z"/></svg>
      WhatsApp Tienda
    </a>
  </div>
</nav>

<div class="wrap">
  <header class="cat-header">
    <h1 class="display">Catálogo Oficial de Calzado</h1>
    <p>Calzado 100% original en fútbol, béisbol, running y estilo deportivo urbano. Sincronizado en vivo con nuestra tienda física en Ubicación no configurada.</p>
    
    <div class="live-status-bar">
      <div>
        <span class="live-dot"></span>
        <strong>Inventario en Línea:</strong> ${grouped.length} modelos con ficha Amazon · Tasa BCV: <strong>${exchangeRate.toFixed(2)} Bs/$</strong>
      </div>
      <div>
        <span style="font-size:11.5px; color:#64748B;">Actualizado: ${fechaStr}</span>
      </div>
    </div>
  </header>

  <!-- Filtros por categoría -->
  <div class="filtros" id="filtros">
${filterButtons
  .map(
    (b, idx) =>
      `    <button class="filtro-btn ${idx === 0 ? 'activo' : ''}" data-filtro="${b.code}">${b.label}</button>`
  )
  .join('\n')}
  </div>

  <section class="productos">
    <div class="grid-productos" id="grid-productos">
${cardsHtml || '      <p style="padding:40px; text-align:center; color:#94A3B8; width:100%;">No hay modelos disponibles en este momento.</p>'}
    </div>
  </section>
</div>

<!-- ==================== FULL AMAZON PRODUCT DETAIL MODAL ==================== -->
<div class="amazon-modal" id="amazonModal">
  <div class="modal-content">
    
    <div class="modal-header">
      <div class="brand-title">NEXOSS · Ficha Oficial de Calzado</div>
      <button type="button" class="modal-close" onclick="cerrarFichaAmazon()">&times;</button>
    </div>

    <div class="modal-breadcrumb">
      <span>Ropa, Zapatos y Joyería</span>
      <span>›</span>
      <span id="mBreadGenero">Calzado Deportivo</span>
      <span>›</span>
      <span>Sneakers y Tenis Urbanos</span>
      <span>›</span>
      <span class="active" id="mBreadMarca">Adidas</span>
    </div>

    <div class="modal-grid">
      
      <!-- COLUMN 1: Image Stage & Thumbnails -->
      <div class="m-gallery">
        <div class="m-stage" id="mStage">
          <img id="mMainImage" src="" alt="Calzado" onerror="this.src='images/logo.png'">
        </div>
        <div class="m-thumbs" id="mThumbsContainer">
          <!-- Populated by JS -->
        </div>
        <p style="font-size:11px; color:#64748B; text-align:center; margin-top:4px;">
          Fotografía de estudio profesional sobre fondo blanco con sombra de contacto.
        </p>
      </div>

      <!-- COLUMN 2: Product Information, Specs & Bullets -->
      <div class="m-details">
        <div class="m-store-link" id="mBrandLink">Visita la tienda oficial de Adidas en NEXOSS</div>
        <h2 class="m-title" id="mTitle">Nombre del Calzado</h2>

        <!-- Ratings -->
        <div class="m-ratings">
          <span class="stars">★★★★★</span>
          <strong style="color:#0F1111;">4.8 de 5</strong>
          <span style="color:var(--amazon-link); cursor:pointer;">(1,842 calificaciones de clientes)</span>
          <span style="background:#FEF3C7; color:#92400E; font-size:10.5px; font-weight:700; padding:2px 6px; border-radius:10px;">#1 Más Vendido</span>
        </div>

        <!-- Pricing Block -->
        <div class="m-price-box">
          <div>
            <span class="m-discount" id="mDiscount">-18%</span>
            <span class="m-usd" id="mUsd">$45.00</span>
          </div>
          <div class="m-list" id="mListPrice">Precio de lista: <span style="text-decoration:line-through;">$55.00</span></div>
          <div class="m-bs" id="mBs">Bs. 3,082.50 <span style="font-size:11px; font-weight:400; color:var(--gris-texto);">(Tasa oficial BCV: ${exchangeRate.toFixed(2)} Bs/$)</span></div>
        </div>

        <!-- Size Selection -->
        <div class="m-size-section">
          <div class="m-size-header">
            <span>Talla seleccionada: <strong id="mSelectedSizeDisplay">Elige tu talla</strong></span>
            <span class="m-size-guide-link" onclick="toggleSizeChart()">📐 Tabla de tallas</span>
          </div>
          <div class="m-sizes-grid" id="mSizesGrid">
            <!-- Populated by JS -->
          </div>

          <!-- Size chart popup -->
          <div class="size-chart-box" id="sizeChartBox">
            <div style="font-weight:700; font-size:11.5px; display:flex; justify-content:space-between;">
              <span>Guía de Tallas (Venezuela / US / Centímetros)</span>
              <span onclick="toggleSizeChart()" style="cursor:pointer; color:#888;">✕</span>
            </div>
            <table class="size-chart-table">
              <thead>
                <tr><th>VZ / EUR</th><th>US Hombre</th><th>US Dama</th><th>Medida (CM)</th></tr>
              </thead>
              <tbody>
                <tr><td>36</td><td>4.5</td><td>6.0</td><td>23.0 cm</td></tr>
                <tr><td>37</td><td>5.0</td><td>6.5</td><td>23.5 cm</td></tr>
                <tr><td>38</td><td>6.0</td><td>7.5</td><td>24.5 cm</td></tr>
                <tr><td>39</td><td>6.5</td><td>8.0</td><td>25.0 cm</td></tr>
                <tr><td>40</td><td>7.5</td><td>9.0</td><td>25.5 cm</td></tr>
                <tr><td>41</td><td>8.0</td><td>9.5</td><td>26.0 cm</td></tr>
                <tr><td>42</td><td>9.0</td><td>10.5</td><td>27.0 cm</td></tr>
                <tr><td>43</td><td>9.5</td><td>11.0</td><td>27.5 cm</td></tr>
                <tr><td>44</td><td>10.5</td><td>12.0</td><td>28.5 cm</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Technical Specifications Table (Amazon Specs) -->
        <div>
          <h4 style="font-size:13.5px; font-weight:800; color:#0F1111; margin-bottom:6px;">Detalles del producto</h4>
          <table class="m-specs-table">
            <tbody>
              <tr><td class="label">Tipo de tejido / Exterior</td><td class="val">Cuero sintético reforzado / Textil transpirable</td></tr>
              <tr><td class="label">Material de la suela</td><td class="val">Goma vulcanizada antideslizante con alto agarre</td></tr>
              <tr><td class="label">Material de la plantilla</td><td class="val">Espuma EVA anatómica con amortiguación de impacto</td></tr>
              <tr><td class="label">Tipo de cierre</td><td class="val">Cordones ajustables</td></tr>
              <tr><td class="label">Resistencia al agua</td><td class="val">Resistente a salpicaduras y humedad</td></tr>
              <tr><td class="label">País de origen</td><td class="val">Importado (Calidad 100% Original)</td></tr>
              <tr><td class="label">Colorway oficial</td><td class="val" id="mSpecColor">Original</td></tr>
              <tr><td class="label">Código SKU</td><td class="val" id="mSpecSku">MKD-10293</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Acerca de este artículo (5 Amazon Bullets) -->
        <div class="m-bullets">
          <h4>Acerca de este artículo</h4>
          <ul>
            <li><strong>AMORTIGUACIÓN Y CONFORT DIARIO:</strong> Diseñado con entresuela ergonómica y plantilla acolchada que absorbe impactos en cada pisada, reduciendo la fatiga articular.</li>
            <li><strong>TRACCIÓN CONFIABLE Y SEGURA:</strong> Suela exterior de caucho duradero con patrón grabado antideslizante para óptimo agarre en cualquier terreno urbano o deportivo.</li>
            <li><strong>MATERIALES PREMIUM DE ALTA DURABILIDAD:</strong> Confección con costuras dobles reforzadas en puntera y laterales para máxima resistencia y flexibilidad.</li>
            <li><strong>DISEÑO ICÓNICO Y VERSÁTIL:</strong> Silueta moderna que se adapta perfectamente a outfits casuales, deportivos, jeans y streetwear.</li>
            <li><strong>GARANTÍA DIRECTA NEXOSS:</strong> Producto verificado. Ofrecemos cambio de talla disponible en nuestra sede física de Ubicación no configurada o mediante envíos nacionales.</li>
          </ul>
        </div>

        <!-- Descripción extendida -->
        <div>
          <h4 style="font-size:13.5px; font-weight:800; color:#0F1111; margin-bottom:4px;">Descripción del producto</h4>
          <p id="mDescription" style="font-size:12.5px; color:#475569; line-height:1.6; white-space:pre-line;">
            Calzado deportivo de alta calidad disponible en NEXOSS.
          </p>
        </div>

      </div>

      <!-- COLUMN 3: Amazon Buy Box -->
      <div class="m-buybox">
        <div class="m-bb-price" id="mBbPrice">$45.00</div>
        <div style="font-size:11.5px; color:#10B981; font-weight:700;" id="mBbBs">Bs. 3,082.50</div>
        
        <div class="m-bb-stock">
          <svg style="width:16px; height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>
          <span>En stock - Envío inmediato</span>
        </div>

        <div class="m-bb-qty">
          <span>Cantidad:</span>
          <select id="mQtySelect">
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </div>

        <div style="background:#FEF3C7; padding:8px 10px; border-radius:6px; font-size:11.5px; color:#78350F;">
          Talla seleccionada: <strong id="mBbSelectedTalla" style="font-size:13px;">Ninguna</strong>
        </div>

        <!-- Amazon Yellow Order Button -->
        <a id="mBtnWhatsApp" href="#" target="_blank" rel="noopener" class="btn-buy-wa">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.81L2 22l5.42-1.36c1.38.72 2.94 1.13 4.62 1.13 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm0 17.87c-1.53 0-2.96-.42-4.19-1.15l-.3-.18-3.11.78.83-3.03-.2-.31a7.86 7.86 0 01-1.24-4.07c0-4.36 3.55-7.91 7.92-7.91 4.36 0 7.91 3.55 7.91 7.91 0 4.37-3.55 7.96-7.62 7.96z"/></svg>
          Comprar ahora por WhatsApp
        </a>

        <!-- Cashea Button -->
        <a id="mBtnCashea" href="#" target="_blank" rel="noopener" class="btn-buy-cashea">
          🟣 Pagar en 4 cuotas con Cashea
        </a>

        <!-- Trust Information -->
        <div class="m-trust-rows">
          <div class="row"><span>Envía desde</span><strong>NEXOSS</strong></div>
          <div class="row"><span>Vendido por</span><strong>NEXOSS Oficial</strong></div>
          <div class="row"><span>Ubicación</span><strong>CC Sede no configurada, Sede no configurada</strong></div>
          <div class="row"><span>Garantía</span><strong>Cambio de talla por 7 días</strong></div>
          <div class="row"><span>Pagos</span><strong>Pago Móvil, $, Zelle, Cashea</strong></div>
        </div>

      </div>

    </div>

  </div>
</div>

<footer>
  <p>NEXOSS — Marcamos tu estilo · Ubicación no configurada, Bolívar, Venezuela</p>
  <p class="footer-sub">Ventas directas y envíos a todo el país · Pagos en USD, Bolívares y Cashea</p>
</footer>

<!-- Datos JSON integrados de catálogo -->
<script id="catalog-data" type="application/json">
${catalogJsonData}
</script>

<!-- Scripts de interactividad Amazon y Cashea -->
<script>
  const WHATSAPP_NUM = "${whatsappNumber}";
  const EXCHANGE_RATE = ${exchangeRate};
  const catalogData = JSON.parse(document.getElementById('catalog-data').textContent || '[]');

  let currentModalProduct = null;
  let currentSelectedSize = '';

  function abrirFichaAmazon(index) {
    const item = catalogData[index];
    if (!item) return;
    currentModalProduct = item;
    
    // Talla por defecto
    currentSelectedSize = (item.tallas && item.tallas.length > 0) ? item.tallas[0] : '';

    // Llenar breadcrumb
    document.getElementById('mBreadMarca').textContent = item.marca || 'Calzado';
    document.getElementById('mBreadGenero').textContent = item.genero || 'Calzado Deportivo';

    // Llenar imagen
    const mainImg = document.getElementById('mMainImage');
    mainImg.src = item.imagen || 'images/logo.png';

    // Miniaturas
    const thumbsCont = document.getElementById('mThumbsContainer');
    thumbsCont.innerHTML = '';
    ['Lateral', 'Superior', 'Suela'].forEach((lbl, idx) => {
      const btn = document.createElement('button');
      btn.className = 'm-thumb' + (idx === 0 ? ' active' : '');
      btn.innerHTML = '<img src="' + (item.imagen || 'images/logo.png') + '" alt="' + lbl + '">';
      btn.onclick = () => {
        document.querySelectorAll('.m-thumb').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        mainImg.src = item.imagen;
      };
      thumbsCont.appendChild(btn);
    });

    // Título y tienda
    document.getElementById('mBrandLink').textContent = 'Visita la tienda oficial de ' + item.marca + ' en NEXOSS';
    document.getElementById('mTitle').textContent = item.nombre + (item.color ? ' — ' + item.color : '');

    // Precios
    const priceUsd = Number(item.precio) || 0;
    const listPriceUsd = priceUsd > 0 ? Math.round(priceUsd * 1.22) : 0;
    const discountPct = listPriceUsd > 0 ? Math.round(((listPriceUsd - priceUsd) / listPriceUsd) * 100) : 18;
    const priceBs = priceUsd * EXCHANGE_RATE;

    document.getElementById('mDiscount').textContent = '-' + discountPct + '%';
    document.getElementById('mUsd').textContent = '$' + priceUsd.toFixed(2);
    document.getElementById('mListPrice').innerHTML = 'Precio anterior: <span style="text-decoration:line-through;">$' + listPriceUsd.toFixed(2) + '</span>';
    document.getElementById('mBs').innerHTML = 'Bs. ' + priceBs.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' <span style="font-size:11px; font-weight:400; color:#565959;">(Tasa oficial BCV: ' + EXCHANGE_RATE.toFixed(2) + ' Bs/$)</span>';

    // Buy Box precios
    document.getElementById('mBbPrice').textContent = '$' + priceUsd.toFixed(2);
    document.getElementById('mBbBs').textContent = 'Bs. ' + priceBs.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2});

    // Specs
    document.getElementById('mSpecColor').textContent = item.color || 'Estándar';
    document.getElementById('mSpecSku').textContent = item.skuPrincipal || 'MKD-' + (item.idPrincipal || '').slice(-6).toUpperCase();

    // Descripción
    document.getElementById('mDescription').textContent = item.descripcion || (
      'El modelo ' + item.nombre + ' de ' + item.marca + ' combina amortiguación deportiva moderna y una confección ligera y transpirable. Su suela de alta tracción proporciona un agarre estable y seguro en todo tipo de terreno, ideal para el uso diario o actividades deportivas.'
    );

    // Renderizar botones de tallas
    const sizesGrid = document.getElementById('mSizesGrid');
    sizesGrid.innerHTML = '';
    const tallas = (item.tallas && item.tallas.length > 0) ? item.tallas : ['38', '39', '40', '41', '42', '43'];
    
    tallas.forEach(sz => {
      const szBtn = document.createElement('button');
      szBtn.className = 'm-size-btn' + (sz === currentSelectedSize ? ' selected' : '');
      szBtn.textContent = sz;
      szBtn.onclick = () => {
        currentSelectedSize = sz;
        document.querySelectorAll('.m-size-btn').forEach(b => b.classList.remove('selected'));
        szBtn.classList.add('selected');
        actualizarSeleccionTalla();
      };
      sizesGrid.appendChild(szBtn);
    });

    actualizarSeleccionTalla();

    // Abrir modal
    document.getElementById('amazonModal').classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function actualizarSeleccionTalla() {
    if (!currentModalProduct) return;
    const qty = document.getElementById('mQtySelect').value || '1';
    document.getElementById('mSelectedSizeDisplay').textContent = currentSelectedSize || 'Por favor elige una talla';
    document.getElementById('mBbSelectedTalla').textContent = currentSelectedSize ? currentSelectedSize + ' (VZ/EU)' : 'Por favor elige una talla';

    // Construir enlaces de WhatsApp
    const priceUsd = Number(currentModalProduct.precio) || 0;
    const priceBs = (priceUsd * EXCHANGE_RATE).toFixed(2);

    const waMsg = 'Hola NEXOSS 👋, me interesa comprar en su catálogo estilo Amazon:\n\n' +
      '👟 *' + currentModalProduct.nombre + '* (' + currentModalProduct.marca + ')\n' +
      '▫️ Talla: *' + (currentSelectedSize || 'Consultar') + '*\n' +
      '▫️ Color: *' + (currentModalProduct.color || 'Estándar') + '*\n' +
      '▫️ Cantidad: *' + qty + ' par(es)*\n' +
      '💵 Precio: *$' + priceUsd.toFixed(2) + ' USD* (Bs. ' + priceBs + ' tasa BCV)\n\n' +
      '📍 ¿Tienen disponibilidad para entrega en Ubicación no configurada o envío nacional?';

    document.getElementById('mBtnWhatsApp').href = 'https://wa.me/' + WHATSAPP_NUM + '?text=' + encodeURIComponent(waMsg);

    const casheaMsg = 'Hola NEXOSS, quiero pagar con Cashea el modelo *' + currentModalProduct.nombre + '* en Talla *' + currentSelectedSize + '*. ¿Me pueden generar el enlace Cashea?';
    document.getElementById('mBtnCashea').href = 'https://wa.me/' + WHATSAPP_NUM + '?text=' + encodeURIComponent(casheaMsg);
  }

  document.getElementById('mQtySelect').addEventListener('change', actualizarSeleccionTalla);

  function toggleSizeChart() {
    const box = document.getElementById('sizeChartBox');
    box.classList.toggle('active');
  }

  function cerrarFichaAmazon() {
    document.getElementById('amazonModal').classList.remove('active');
    document.body.style.overflow = 'auto';
  }

  // Cerrar al presionar Escape o clic fuera
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarFichaAmazon();
  });
  document.getElementById('amazonModal').addEventListener('click', (e) => {
    if (e.target.id === 'amazonModal') cerrarFichaAmazon();
  });

  // Filtro interactivo de categorías
  const botones = document.querySelectorAll('.filtro-btn');
  const cards = document.querySelectorAll('.card');
  botones.forEach(btn => {
    btn.addEventListener('click', () => {
      botones.forEach(b => b.classList.remove('activo'));
      btn.classList.add('activo');
      const filtro = btn.dataset.filtro;
      cards.forEach(card => {
        card.style.display = (filtro === 'todos' || card.dataset.cat === filtro) ? 'flex' : 'none';
      });
    });
  });

  // Buscador interactivo en vivo
  const searchInput = document.getElementById('buscador-catalogo');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = (!q || text.includes(q)) ? 'flex' : 'none';
      });
    });
  }
</script>

<!-- Integración Cashea (pago en cuotas) -->
<script src="https://cdn.jsdelivr.net/npm/cashea-web-checkout-sdk/dist/bundle.js"></script>
<script>
  const CASHEA_PUBLIC_API_KEY = "${casheaKey}";
  const CASHEA_REDIRECT_URL = window.location.origin + window.location.pathname.replace("catalogo.html", "cashea-gracias.html");

  function activoCashea() {
    return typeof CheckoutSDK !== "undefined" && CASHEA_PUBLIC_API_KEY && CASHEA_PUBLIC_API_KEY !== "PUBLIC_API_KEY_PENDIENTE";
  }

  document.querySelectorAll("[data-cashea]").forEach((box) => {
    const boton = box.querySelector(".cashea-generar");
    const cedulaInput = box.querySelector(".cashea-cedula");
    const contenedor = box.querySelector(".cashea-container");
    const precio = parseFloat(box.dataset.precio || "0");

    if (!precio || precio <= 10) {
      box.querySelector(".cashea-form").innerHTML = '<div class="cashea-nota" style="font-size:11px; color:#6B21A8; margin-top:4px;">Cashea disponible consultando por WhatsApp.</div>';
      return;
    }

    boton.addEventListener("click", () => {
      const cedula = (cedulaInput.value || "").trim();
      if (!cedula) {
        cedulaInput.style.borderColor = "#7C1F2E";
        cedulaInput.placeholder = "Escribe tu cédula";
        return;
      }
      if (!activoCashea()) {
        contenedor.innerHTML = '<div style="font-size:11px; color:#6B21A8; margin-top:4px;">Cashea disponible en tienda física o coordinando por WhatsApp.</div>';
        return;
      }
      try {
        const sdk = new CheckoutSDK({ apiKey: CASHEA_PUBLIC_API_KEY });
        const payload = {
          identificationNumber: cedula,
          externalClientId: cedula,
          deliveryMethod: "IN_STORE",
          merchantName: "NEXOSS",
          redirectUrl: CASHEA_REDIRECT_URL,
          deliveryPrice: 0,
          orders: [
            {
              store: { id: 1, name: "NEXOSS", enabled: true },
              products: [
                {
                  id: box.dataset.productoId,
                  name: box.dataset.nombre,
                  sku: box.dataset.sku,
                  description: box.dataset.nombre,
                  imageUrl: box.dataset.imagen,
                  quantity: 1,
                  price: precio,
                  tax: 0,
                  discount: 0,
                },
              ],
            },
          ],
        };
        contenedor.innerHTML = "";
        sdk.createCheckoutButton({ payload, container: contenedor });
        boton.style.display = "none";
        cedulaInput.style.display = "none";
      } catch (err) {
        console.error("Error inicializando Cashea:", err);
        contenedor.innerHTML = '<div style="font-size:11px; color:#6B21A8; margin-top:4px;">Error conectando con Cashea. Por favor escríbenos por WhatsApp.</div>';
      }
    });
  });
</script>

</body>
</html>`;
}

/**
 * Generar JSON limpio de productos para almacenar en GitHub (products.json)
 */
export function generateProductsJson(products: ShoeProduct[], exchangeRate: number): string {
  const grouped = groupProductsForCatalog(products);
  const data = {
    tienda: 'NEXOSS',
    tasaBCV: exchangeRate,
    actualizado: new Date().toISOString(),
    totalModelos: grouped.length,
    productos: grouped.map((g) => ({
      id: g.idPrincipal,
      nombre: g.nombre,
      marca: g.marca,
      color: g.color,
      categoria: g.categoria,
      categoriaCode: g.categoriaCode,
      precioUSD: g.precio,
      precioBs: Math.round(g.precio * exchangeRate),
      tallas: g.tallas,
      stockTotal: g.stockTotal,
      imagen: g.imagen,
      sku: g.skuPrincipal,
      descripcion: g.descripcion,
    })),
  };
  return JSON.stringify(data, null, 2);
}

/**
 * Probar conexión con el repositorio de GitHub usando el token
 */
export async function testGitHubRepoAccess(config: GitHubSyncConfig): Promise<{
  ok: boolean;
  message: string;
  repoInfo?: any;
}> {
  if (import.meta.env.VITE_NEXOSS_LOCAL_ONLY === 'true') return { ok: false, message: 'La conexión con GitHub está desactivada en el modo local aislado.' };
  const { owner, repo, token } = config;
  if (!token.trim()) {
    return { ok: false, message: 'Se requiere un Token Personal de Acceso (PAT) de GitHub con permiso "repo".' };
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token.trim()}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!res.ok) {
      if (res.status === 401) {
        return { ok: false, message: 'Token de GitHub inválido o expirado. Verifica tu Personal Access Token.' };
      }
      if (res.status === 404) {
        return { ok: false, message: `No se encontró el repositorio "${owner}/${repo}" o el token no tiene permisos de lectura.` };
      }
      return { ok: false, message: `Error de GitHub (${res.status}): ${res.statusText}` };
    }

    const data = await res.json();
    return {
      ok: true,
      message: `Conexión exitosa con ${data.full_name} (${data.default_branch})`,
      repoInfo: data,
    };
  } catch (err: any) {
    return { ok: false, message: `Error de red al conectar con GitHub: ${err?.message || err}` };
  }
}

/**
 * Codificar texto UTF-8 a Base64 de forma segura en el navegador sin límite de tamaño
 */
function utf8ToBase64(str: string): string {
  try {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 0x8000; // 32KB chunks
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(
        null,
        Array.from(bytes.subarray(i, Math.min(i + chunkSize, len)))
      );
    }
    return window.btoa(binary);
  } catch {
    return window.btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function toSolidBytes(_match, p1) {
        return String.fromCharCode(parseInt(p1, 16));
      })
    );
  }
}

/**
 * Obtener el SHA canónico y actual de un archivo en GitHub.
 * Evita la caché HTTP del navegador y resuelve retrasos de réplica mediante la API de árboles Git.
 */
async function getAuthoritativeFileSha(
  owner: string,
  repo: string,
  path: string,
  branch: string,
  token: string
): Promise<string | undefined> {
  const cleanBranch = branch.trim() || 'main';
  const cleanToken = token.trim();
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${cleanToken}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
  };

  const timestamp = Date.now();

  // Intento 1: Consultar Contents API con parámetro de cache-busting
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(cleanBranch)}&_cb=${timestamp}`,
      {
        cache: 'no-store',
        headers,
      }
    );

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.sha === 'string') {
        return data.sha;
      }
    } else if (res.status === 404) {
      // El archivo no existe aún en el repositorio (nuevo)
      return undefined;
    }
  } catch (err) {
    console.warn(`[GitHubSync] Consulta directa de SHA para ${path}:`, err);
  }

  // Intento 2: Consultar la API de árboles Git (Git Trees API) en la rama objetivo
  try {
    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(cleanBranch)}?recursive=1&_cb=${timestamp}`,
      {
        cache: 'no-store',
        headers,
      }
    );

    if (treeRes.ok) {
      const treeData = await treeRes.json();
      if (Array.isArray(treeData?.tree)) {
        const item = treeData.tree.find((t: any) => t.path === path);
        if (item && item.sha) {
          return item.sha;
        }
        return undefined;
      }
    }
  } catch (treeErr) {
    console.warn(`[GitHubSync] Consulta de Git Tree para ${path}:`, treeErr);
  }

  // Intento 3: Leer el último commit de la rama y su árbol canónico
  try {
    const commitRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(cleanBranch)}?_cb=${timestamp}`,
      {
        cache: 'no-store',
        headers,
      }
    );
    if (commitRes.ok) {
      const commitData = await commitRes.json();
      const treeSha = commitData?.commit?.tree?.sha;
      if (treeSha) {
        const directTreeRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1&_cb=${timestamp}`,
          { cache: 'no-store', headers }
        );
        if (directTreeRes.ok) {
          const directTreeData = await directTreeRes.json();
          if (Array.isArray(directTreeData?.tree)) {
            const item = directTreeData.tree.find((t: any) => t.path === path);
            if (item && item.sha) {
              return item.sha;
            }
            return undefined;
          }
        }
      }
    }
  } catch (commitErr) {
    console.warn(`[GitHubSync] Consulta de Commit Tree para ${path}:`, commitErr);
  }

  return undefined;
}

/**
 * Realizar commit de un archivo en GitHub manejando automáticamente conflictos 409 (SHA desactualizado)
 */
async function putFileToGitHubWithRetry(
  owner: string,
  repo: string,
  path: string,
  branch: string,
  token: string,
  contentBase64: string,
  commitMessage: string,
  maxAttempts: number = 3,
  onProgress?: (msg: string) => void
): Promise<{ ok: boolean; data?: any; error?: string; status?: number }> {
  const cleanBranch = branch.trim() || 'main';
  const cleanToken = token.trim();
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${cleanToken}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
  };

  let lastError = '';
  let lastStatus = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1 && onProgress) {
      onProgress(`Resolviendo sincronización con GitHub (intento ${attempt}/${maxAttempts})...`);
    }

    // Obtener el SHA canónico más reciente de GitHub
    const currentSha = await getAuthoritativeFileSha(owner, repo, path, cleanBranch, cleanToken);

    const body: Record<string, any> = {
      message: commitMessage,
      content: contentBase64,
      branch: cleanBranch,
    };
    if (currentSha) {
      body.sha = currentSha;
    }

    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
        method: 'PUT',
        cache: 'no-store',
        headers,
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        return { ok: true, data };
      }

      const errBody: any = await res.json().catch(() => ({}));
      lastStatus = res.status;
      lastError = errBody.message || res.statusText || 'Error desconocido de GitHub';

      // 409 Conflict: El SHA no coincide o la rama avanzó
      if (res.status === 409 && attempt < maxAttempts) {
        console.warn(
          `[GitHubSync] Conflicto 409 en ${path} ("${lastError}"). Reobteniendo SHA fresco y reintentando (intento ${attempt}/${maxAttempts})...`
        );
        if (onProgress) {
          onProgress(`Detectada actualización previa en ${path}. Obteniendo versión más reciente de GitHub...`);
        }
        // Espera con backoff progresivo para permitir la consistencia en GitHub
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        continue;
      }

      return {
        ok: false,
        status: res.status,
        error: `Error al actualizar ${path} en GitHub (${res.status}): ${lastError}`,
      };
    } catch (netErr: any) {
      lastStatus = 0;
      lastError = netErr?.message || String(netErr);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      return {
        ok: false,
        status: 0,
        error: `Error de red al conectar con GitHub para ${path}: ${lastError}`,
      };
    }
  }

  return {
    ok: false,
    status: lastStatus,
    error: `Error al actualizar ${path} en GitHub (${lastStatus}): ${lastError}`,
  };
}

/**
 * Sincronizar catálogo directamente a GitHub (crea/actualiza catalogo.html y products.json)
 */
export async function pushCatalogToGitHub(
  config: GitHubSyncConfig,
  products: ShoeProduct[],
  exchangeRate: number,
  onProgress?: (msg: string) => void
): Promise<{
  ok: boolean;
  message: string;
  commitUrl?: string;
  catalogUrl?: string;
  error?: string;
}> {
  if (import.meta.env.VITE_NEXOSS_LOCAL_ONLY === 'true') return { ok: false, message: 'La publicación en GitHub está desactivada en el modo local aislado.', error: 'local_only' };
  const { owner, repo, branch, token } = config;
  if (!token.trim()) {
    return {
      ok: false,
      message: 'Falta configurar tu GitHub Personal Access Token.',
      error: 'token_missing',
    };
  }

  const cleanBranch = branch.trim() || 'main';
  const cleanOwner = owner.trim() || 'nexoss-demo';
  const cleanRepo = repo.trim() || 'nexoss-demo';

  try {
    if (onProgress) onProgress('Compilando catálogo HTML y datos...');
    const htmlContent = generateCatalogHtml(products, exchangeRate);
    const jsonContent = generateProductsJson(products, exchangeRate);

    const nowStr = new Date().toLocaleString('es-VE');
    const commitMsgHtml = `Actualizar catálogo web desde inventario NEXOSS (${products.length} modelos) - ${nowStr}`;

    // 1. Commit de catalogo.html con retry y resolución autoritativa de SHA
    if (onProgress) onProgress('Publicando catalogo.html en GitHub...');
    const base64Html = utf8ToBase64(htmlContent);
    const htmlResult = await putFileToGitHubWithRetry(
      cleanOwner,
      cleanRepo,
      'catalogo.html',
      cleanBranch,
      token,
      base64Html,
      commitMsgHtml,
      3,
      onProgress
    );

    if (!htmlResult.ok) {
      return {
        ok: false,
        message: htmlResult.error || 'Error al actualizar catalogo.html en GitHub.',
        error: htmlResult.error,
      };
    }

    const htmlCommitData = htmlResult.data;

    // 2. Commit de products.json con retry
    if (onProgress) onProgress('Actualizando datos JSON en products.json...');
    try {
      const base64Json = utf8ToBase64(jsonContent);
      await putFileToGitHubWithRetry(
        cleanOwner,
        cleanRepo,
        'products.json',
        cleanBranch,
        token,
        base64Json,
        `Actualizar datos JSON del catálogo NEXOSS - ${nowStr}`,
        3,
        onProgress
      );
    } catch (jsonErr) {
      console.warn('[GitHubSync] Advertencia no crítica actualizando products.json:', jsonErr);
    }

    const catalogUrl = `https://${cleanOwner}.github.io/${cleanRepo}/catalogo.html`;
    const commitUrl =
      htmlCommitData?.commit?.html_url ||
      `https://github.com/${cleanOwner}/${cleanRepo}/commits/${cleanBranch}`;

    return {
      ok: true,
      message: `¡Catálogo sincronizado exitosamente en GitHub! Los cambios están en proceso de publicación en GitHub Pages.`,
      commitUrl,
      catalogUrl,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: `Error inesperado durante la sincronización: ${err?.message || err}`,
      error: err?.message,
    };
  }
}
