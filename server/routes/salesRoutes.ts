import type { Express } from 'express';
import { logger } from '../logger.ts';
import { validateSaleTotals } from '../sales/saleTotals.ts';
import { applySaleToStore, pickUpdatableSaleFields, voidSaleInStore } from '../sales/localSales.ts';
import type { ServerStoreState } from '../../server.ts';

/** Lo que las rutas de ventas necesitan del servidor; se inyecta para poder probarlas sin disco ni Neon. */
export interface SalesRouteDeps {
  readServerStore: () => ServerStoreState | Promise<ServerStoreState>;
  writeServerStore: (state: ServerStoreState) => void | Promise<void>;
  readLocalSales: () => any[] | Promise<any[]>;
  getNeonSql: () => any;
  normalizeSales: (rows: any[]) => any[];
  updateSale: (id: string, updates: Record<string, unknown>) => Promise<unknown>;
  voidSale: (id: string, reason: string) => Promise<{ ok: boolean; items?: unknown }>;
  /** Se llama una sola vez cuando una venta NUEVA quedó guardada (no al reenviar una ya registrada). */
  onSaleRegistered?: (sale: any) => void;
}

export function registerSalesRoutes(app: Express, deps: SalesRouteDeps): void {
  const { readServerStore, writeServerStore, readLocalSales, getNeonSql, normalizeSales, updateSale, voidSale } = deps;

  app.get('/api/sales', async (req, res) => {
    const sql = getNeonSql();
    if (sql) {
      try {
        const rows = await sql`SELECT * FROM sales_transactions ORDER BY fecha DESC`;
        return res.json({ source: 'neon_postgres', data: normalizeSales(rows as any[]) });
      } catch (err) {
        logger.error('Neon sales fetch error, using local fallback:', err);
        if (process.env.NODE_ENV === 'production') return res.status(503).json({ error: 'No se pudieron cargar las ventas de esta empresa.' });
      }
    }
    const local = await readLocalSales();
    res.json({ source: 'local_file', data: local });
  });

  app.post('/api/sales', async (req, res) => {
    const body = req.body;
    const s = body?.sale || body;
    if (!s || !s.id) {
      return res.status(400).json({ saved: false, error: 'Datos de venta inválidos' });
    }

    const store = await readServerStore();

    // Una venta nueva no puede traer totales inventados por el navegador. Con
    // NEXOSS_SALE_TOTALS=warn solo se registra el aviso (útil al migrar datos viejos).
    const alreadyStored = store.sales.some((item: any) => String(item.id) === String(s.id));
    if (!alreadyStored && (s.estado || 'completada') === 'completada') {
      const totals = validateSaleTotals(s);
      if (!totals.ok) {
        logger.warn('[Venta] Totales inconsistentes:', s.id, totals.problems);
        if (process.env.NEXOSS_SALE_TOTALS !== 'warn') {
          return res.status(400).json({
            saved: false,
            error: 'Los totales de la venta no coinciden con el cálculo del servidor.',
            problems: totals.problems,
          });
        }
      }
    }

    // Una venta existente solo actualiza cobros; una nueva descuenta stock y suma pagos una vez.
    // Los reintentos del navegador no repiten esos efectos (ver server/sales/localSales.ts).
    const { isNewSale } = applySaleToStore(store, s, body?.updatedProducts, (product, previous, next) => {
      logger.debug(`[Venta] Stock descontado para ${product.nombre} (${product.talla}): ${previous} -> ${next}`);
    });

    await writeServerStore(store);

    let neonInserted = false;
    const sql = getNeonSql();
    if (sql) {
      try {
        // El cliente reintenta hasta 3 veces si recibe un error. Por eso el stock de Neon
        // se descuenta según si la venta ya existe EN NEON (no en el JSON local), y la
        // venta + el stock se guardan en una sola transacción: o entra todo o no entra nada.
        const existing = await sql`SELECT 1 FROM sales_transactions WHERE id = ${s.id} LIMIT 1`;
        if (existing.length > 0) {
          await sql`
            UPDATE sales_transactions SET
              pagos = ${JSON.stringify(s.pagos || [])},
              total_positivo_inmediato_usd = ${s.total_positivo_inmediato_usd || 0},
              total_cashea_pendiente_usd = ${s.total_cashea_pendiente_usd || 0},
              estado_cashea = ${s.estado_cashea || 'sin_cashea'},
              estado = ${s.estado || 'completada'},
              fecha = ${s.fecha},
              notas = ${s.notas || ''}
            WHERE id = ${s.id}
          `;
        } else {
          const statements = [sql`
            INSERT INTO sales_transactions (
              id, numero_factura, cliente_nombre, cliente_apellido,
              cliente_rif, cliente_telefono, cliente_correo, subtotal_usd, descuento_usd,
              aplica_iva, porcentaje_iva, iva_monto_usd, total_usd, total_bs,
              costo_total_usd, ganancia_neta_usd, tasa_cambio, items, pagos,
              fecha, usuario, notas, estado,
              total_positivo_inmediato_usd, total_cashea_pendiente_usd, estado_cashea
            ) VALUES (
              ${s.id}, ${s.numero_factura}, ${s.cliente_nombre || ''}, ${s.cliente_apellido || ''},
              ${s.cliente_rif || null}, ${s.cliente_telefono || null}, ${s.cliente_correo || null},
              ${s.subtotal_usd}, ${s.descuento_usd || 0}, ${Boolean(s.aplica_iva)},
              ${s.porcentaje_iva || 0}, ${s.iva_monto_usd || 0}, ${s.total_usd}, ${s.total_bs},
              ${s.costo_total_usd || 0}, ${s.ganancia_neta_usd || 0}, ${s.tasa_cambio},
              ${JSON.stringify(s.items || [])}, ${JSON.stringify(s.pagos || [])},
              ${s.fecha}, ${s.usuario || 'Cajera'}, ${s.notas || ''},
              ${s.estado || 'completada'},
              ${s.total_positivo_inmediato_usd || 0}, ${s.total_cashea_pendiente_usd || 0},
              ${s.estado_cashea || 'sin_cashea'}
            )
          `];

          if (Array.isArray(s.items)) {
            for (const item of s.items) {
              const qty = Math.max(1, Number(item.cantidad) || 1);
              const prodId = item.producto_id ? String(item.producto_id).trim() : '';
              const sku = item.sku ? String(item.sku).trim() : '';
              const nombre = item.nombre_producto ? String(item.nombre_producto).trim() : '';
              const talla = item.talla ? String(item.talla).trim() : '';
              statements.push(sql`
                UPDATE shoe_products
                SET stock = GREATEST(0, stock - ${qty})
                WHERE (id = ${prodId})
                   OR (${sku} != '' AND sku = ${sku})
                   OR (${nombre} != '' AND ${talla} != '' AND LOWER(nombre) = LOWER(${nombre}) AND talla = ${talla})
              `);
            }
          }

          if (Array.isArray(body?.updatedProducts)) {
            for (const fresh of body.updatedProducts) {
              if (!fresh.id) continue;
              const freshStock = Number(fresh.stock) || 0;
              const freshSku = fresh.sku ? String(fresh.sku).trim() : '';
              statements.push(sql`
                UPDATE shoe_products
                SET stock = ${freshStock}
                WHERE id = ${fresh.id}
                   OR (${freshSku} != '' AND sku = ${freshSku})
              `);
            }
          }

          await sql.transaction(statements);
          neonInserted = true;
        }
      } catch (err) {
        // Antes se respondía saved:true aunque Neon fallara y los dos almacenes
        // quedaban distintos sin aviso. El cliente ya reintenta y muestra el error.
        logger.error('Error saving sale to Neon:', err);
        return res.status(502).json({
          saved: false,
          error: 'La venta quedó en el servidor local, pero no pudo guardarse en Neon. Reintenta.',
        });
      }
    }

    // Avisa solo si la venta es nueva en el almacén local o en Neon: un reintento tras un fallo
    // de Neon sí avisa (el primer intento no avisó) y un reenvío de una venta ya guardada no.
    if (isNewSale || neonInserted) {
      try { deps.onSaleRegistered?.(s); } catch (error) { logger.warn('[Aviso] No se pudo preparar el aviso de venta:', error); }
    }
    res.json({ saved: true, id: s.id });
  });

  // Update Sale (e.g. modify sale date, payments, or cashea reconciliation)
  app.patch('/api/sales/:id', async (req, res) => {
    const { id } = req.params;
    const rawUpdates = req.body || {};
    const updates = pickUpdatableSaleFields(rawUpdates);
    const store = await readServerStore();
    const saleIndex = store.sales.findIndex((item: any) => item.id === id);
    if (saleIndex < 0) {
      if (!getNeonSql()) return res.status(404).json({ success: false, error: 'Venta no encontrada' });
      try {
        const updated = await updateSale(id, updates);
        return updated
          ? res.json({ success: true })
          : res.status(404).json({ success: false, error: 'Venta no encontrada o no hay campos actualizables.' });
      } catch (err) {
        logger.error('Error actualizando venta existente en Neon:', err);
        return res.status(502).json({ success: false, error: 'No se pudo guardar el cambio en Neon.' });
      }
    }
    if (saleIndex >= 0) {
      store.sales[saleIndex] = { ...store.sales[saleIndex], ...updates };
      await writeServerStore(store);

      const sql = getNeonSql();
      if (sql) {
        try {
          await updateSale(id, updates);
        } catch (err) {
          logger.error('Error updating sale in Neon:', err);
          // El cambio ya quedó en el almacén local; se avisa para que no parezca guardado en Neon.
          return res.status(502).json({
            success: false,
            localSaved: true,
            error: 'El cambio se guardó en este equipo, pero no pudo guardarse en Neon.',
            sale: store.sales[saleIndex],
          });
        }
      }
      return res.json({ success: true, sale: store.sales[saleIndex] });
    }
    res.status(404).json({ success: false, error: 'Venta no encontrada' });
  });

  app.post('/api/sales/:id/void', async (req, res) => {
    const { id } = req.params;
    const { motivo } = req.body || {};
    try {
      if (!getNeonSql()) {
        // Modo local-demo: anular sobre el almacenamiento JSON de la empresa.
        const store = await readServerStore();
        const outcome = voidSaleInStore(store, id, String(motivo || ''));
        if (outcome.status === 'not_found') return res.status(404).json({ success: false, error: 'Venta no encontrada.' });
        if (outcome.status === 'already_voided') return res.json({ success: true, id, items: [], alreadyVoided: true });
        await writeServerStore(store);
        return res.json({ success: true, id, items: outcome.restored });
      }
      const result = await voidSale(id, motivo || '');
      if (!result.ok) {
        return res.status(404).json({ success: false, error: 'Venta no encontrada.' });
      }
      res.json({ success: true, id, items: result.items });
    } catch (err) {
      logger.error('Error anulando venta:', err);
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
