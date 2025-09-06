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

// Se cambia el nombre del secret a DB_CONNECTION_STRING para mayor claridad y como workaround.
const databaseUrl = Deno.env.get('DB_CONNECTION_STRING');
const pool = databaseUrl ? new Pool(databaseUrl, 3, true) : null;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!pool) {
    console.error("Configuration Error: DB_CONNECTION_STRING environment variable not set.");
    return new Response(
      JSON.stringify({ msg: 'Server Configuration Error: Database connection is not available. Please ensure the DB_CONNECTION_STRING secret is set correctly.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }

  let connection;

  try {
    connection = await pool.connect();
    
    const { id_proveedor, id_sucursal, monto_total, estado, items } = await req.json();

    if (!id_proveedor || !id_sucursal || typeof monto_total !== 'number' || !items || !Array.isArray(items) || items.length === 0) {
      throw new Error('Required data for creating a purchase is missing or invalid.');
    }

    await connection.queryObject('BEGIN');

    const compraResult = await connection.queryObject(
      `INSERT INTO public."Compras" (id_proveedor, id_sucursal, monto_total, estado, fecha_compra)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id;`,
      [id_proveedor, id_sucursal, monto_total, estado, new Date()]
    );
    const newCompraId = compraResult.rows[0].id;

    for (const item of items) {
      if (typeof item.id_producto !== 'number' || typeof item.cantidad !== 'number' || typeof item.costo_unitario !== 'number' || item.cantidad <= 0) {
          throw new Error(`Invalid item data for product ID ${item.id_producto}.`);
      }
        
      await connection.queryObject(
        `INSERT INTO public."Detalles_Compra" (id_compra, id_producto, cantidad, costo_unitario)
         VALUES ($1, $2, $3, $4);`,
        [newCompraId, item.id_producto, item.cantidad, item.costo_unitario]
      );
      
      // Upsert into inventory with weighted average cost calculation
      await connection.queryObject(
        `INSERT INTO public."Inventario" (id_producto, id_sucursal, cantidad, costo_promedio)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id_producto, id_sucursal)
         DO UPDATE SET
           costo_promedio = (("Inventario".cantidad * "Inventario".costo_promedio) + ($3 * $4)) / ("Inventario".cantidad + $3),
           cantidad = "Inventario".cantidad + $3;`,
        [item.id_producto, id_sucursal, item.cantidad, item.costo_unitario]
      );
    }
    
    await connection.queryObject('COMMIT');
    
    return new Response(JSON.stringify({ success: true, compraId: newCompraId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("Error in purchase transaction:", error);
    if (connection) {
        try {
            await connection.queryObject('ROLLBACK');
        } catch (rollbackError) {
            console.error("Failed to rollback transaction:", rollbackError);
        }
    }
    
    return new Response(JSON.stringify({ msg: `Database Error: ${error.message}` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  } finally {
    if (connection) {
        connection.release();
    }
  }
});