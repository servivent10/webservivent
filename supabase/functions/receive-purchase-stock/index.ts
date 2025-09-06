/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

declare const Deno: any;

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { Pool } from 'https://deno.land/x/postgres@v0.17.0/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const databaseUrl = Deno.env.get('DB_CONNECTION_STRING');
const pool = databaseUrl ? new Pool(databaseUrl, 3, true) : null;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!pool) {
    console.error("FATAL: DB_CONNECTION_STRING environment variable not set.");
    return new Response(
      JSON.stringify({ msg: 'Server Configuration Error: Database connection is not available.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }

  let connection;

  try {
    const { purchase_id } = await req.json();
    if (!purchase_id) {
      throw new Error('El ID de la compra es obligatorio.');
    }

    connection = await pool.connect();
    await connection.queryObject('BEGIN');

    // Paso 1: Bloquear y validar la compra, obteniendo sucursal y tipo de cambio.
    const purchaseResult = await connection.queryObject(
      `SELECT "estado", "id_sucursal", "tipo_cambio" FROM public."Compras" WHERE "id" = $1 FOR UPDATE;`,
      [purchase_id]
    );
    const purchase = purchaseResult.rows[0];
    
    if (!purchase) throw new Error(`Compra con ID ${purchase_id} no encontrada.`);
    if (purchase.estado !== 'Pendiente') throw new Error(`La compra ya está en estado '${purchase.estado}'.`);
    
    const branchId = purchase.id_sucursal;
    const exchangeRate = purchase.tipo_cambio || 1;

    // Paso 2: Obtener los items de la compra.
    const itemsResult = await connection.queryObject(
      `SELECT "id_producto", "cantidad", "costo_unitario", "moneda" FROM public."Detalles_Compra" WHERE "id_compra" = $1;`,
      [purchase_id]
    );
    const items = itemsResult.rows;

    if (items.length === 0) {
      throw new Error('La compra no tiene productos para recibir.');
    }

    // Paso 3: Iterar y actualizar el inventario.
    for (const item of items) {
      if (item.cantidad <= 0) {
        continue; // Ignorar items con cantidad cero o negativa.
      }
      
      const receivedCostInBaseCurrency = item.moneda === '$'
          ? item.costo_unitario * exchangeRate
          : item.costo_unitario;

      // Este UPSERT atómico calcula el costo promedio ponderado.
      // El costo del nuevo item se pasa en el cuarto parámetro ($4).
      await connection.queryObject(
        `INSERT INTO public."Inventario" ("id_producto", "id_sucursal", "cantidad", "costo_promedio")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("id_producto", "id_sucursal")
         DO UPDATE SET
           "costo_promedio" = CASE 
                              WHEN ("Inventario"."cantidad" + EXCLUDED."cantidad") = 0 THEN 0
                              ELSE (("Inventario"."cantidad" * "Inventario"."costo_promedio") + (EXCLUDED."cantidad" * EXCLUDED."costo_promedio")) / ("Inventario"."cantidad" + EXCLUDED."cantidad")
                            END,
           "cantidad" = "Inventario"."cantidad" + EXCLUDED."cantidad";`,
        [item.id_producto, branchId, item.cantidad, receivedCostInBaseCurrency]
      );
    }

    // Paso 4: Actualizar el estado de la compra a 'Confirmado'.
    await connection.queryObject(
      `UPDATE public."Compras" SET "estado" = 'Confirmado' WHERE "id" = $1;`,
      [purchase_id]
    );
    
    await connection.queryObject('COMMIT');
    
    return new Response(JSON.stringify({ success: true, message: 'Stock actualizado correctamente.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("Error in receive-purchase-stock function:", error.message, error);
    if (connection) {
        try {
            await connection.queryObject('ROLLBACK');
        } catch (rollbackError) {
            console.error("Failed to rollback transaction:", rollbackError);
        }
    }
    
    return new Response(JSON.stringify({ msg: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  } finally {
    if (connection) {
        connection.release();
    }
  }
});