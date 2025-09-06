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
    const { productId, recordsToUpsert, branchIdsToDelete } = await req.json();

    if (typeof productId !== 'number' || !Array.isArray(recordsToUpsert) || !Array.isArray(branchIdsToDelete)) {
      throw new Error('Datos inválidos: se requieren productId, recordsToUpsert y branchIdsToDelete.');
    }

    connection = await pool.connect();
    await connection.queryObject('BEGIN');

    // 1. Eliminar los precios que el usuario ha borrado
    if (branchIdsToDelete.length > 0) {
      await connection.queryObject(
        `DELETE FROM public."Precios_Sucursal" WHERE "id_producto" = $1 AND "id_sucursal" = ANY($2::int[]);`,
        [productId, branchIdsToDelete]
      );
    }

    // 2. Insertar o actualizar los precios nuevos/modificados
    if (recordsToUpsert.length > 0) {
      for (const record of recordsToUpsert) {
         if (typeof record.id_sucursal !== 'number' || typeof record.precio_venta !== 'number') {
             throw new Error('Registro para upsert con formato inválido.');
         }
         await connection.queryObject(
            `INSERT INTO public."Precios_Sucursal" (id_producto, id_sucursal, precio_venta)
             VALUES ($1, $2, $3)
             ON CONFLICT (id_producto, id_sucursal)
             DO UPDATE SET precio_venta = EXCLUDED.precio_venta;`,
            [productId, record.id_sucursal, record.precio_venta]
        );
      }
    }

    await connection.queryObject('COMMIT');
    
    return new Response(JSON.stringify({ success: true, message: 'Precios actualizados correctamente.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("Error in update-branch-prices function:", error.message, error);
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