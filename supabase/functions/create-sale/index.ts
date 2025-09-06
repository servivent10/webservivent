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

    const { id_sucursal, id_usuario, monto_total, metodo_pago, items } = await req.json();

    if (!id_sucursal || !id_usuario || typeof monto_total !== 'number' || !metodo_pago || !items || !Array.isArray(items) || items.length === 0) {
      throw new Error('Datos requeridos para crear la venta están incompletos o son inválidos.');
    }

    await connection.queryObject('BEGIN');

    // FIX: Se añade la columna "estado" con el valor 'Completada' para cumplir con la restricción NOT NULL de la base de datos.
    const ventaResult = await connection.queryObject(
      `INSERT INTO public."Ventas" (id_sucursal, monto_total, fecha_venta, id_usuario, metodo_pago, estado)
       VALUES ($1, $2, $3, $4, $5, 'Completada')
       RETURNING id;`,
      [id_sucursal, monto_total, new Date(), id_usuario, metodo_pago]
    );
    // FIX: Cast the returned ID to a Number to prevent BigInt serialization errors with JSON.stringify.
    const newVentaId = Number(ventaResult.rows[0].id);

    for (const item of items) {
      if (typeof item.id_producto !== 'number' || typeof item.cantidad !== 'number' || typeof item.precio_unitario !== 'number' || item.cantidad <= 0) {
          throw new Error(`Datos de item inválidos para el producto ID ${item.id_producto}.`);
      }
      
      await connection.queryObject(
        `INSERT INTO public."Detalles_Venta" (id_venta, id_producto, cantidad, precio_unitario)
         VALUES ($1, $2, $3, $4);`,
        [newVentaId, item.id_producto, item.cantidad, item.precio_unitario]
      );
      
      // REFACTOR: Atomic inventory update.
      // This single operation checks for stock and decrements it. It's safer than a separate SELECT and UPDATE.
      const updateResult = await connection.queryObject(
        `UPDATE public."Inventario"
         SET cantidad = cantidad - $1
         WHERE id_producto = $2 AND id_sucursal = $3 AND cantidad >= $1;`,
        [item.cantidad, item.id_producto, id_sucursal]
      );

      // If no rows were affected, it means the WHERE clause (cantidad >= X) failed.
      if (updateResult.rowCount === 0) {
        // Now, get product info for a user-friendly error message. This is safe because we are about to rollback.
        const stockInfo = await connection.queryObject(
            `SELECT p."Nombre", i.cantidad FROM public."Inventario" i
             JOIN public."Productos" p ON p.id = i.id_producto
             WHERE i.id_producto = $1 AND i.id_sucursal = $2;`,
            [item.id_producto, id_sucursal]
        );
        const productName = stockInfo.rows[0]?.Nombre || `Producto ID ${item.id_producto}`;
        const availableStock = stockInfo.rows[0]?.cantidad ?? 0;
        
        throw new Error(`Stock insuficiente para "${productName}". Disponible: ${availableStock}, Solicitado: ${item.cantidad}.`);
      }
    }
    
    await connection.queryObject('COMMIT');
    
    return new Response(JSON.stringify({ success: true, ventaId: newVentaId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("Error en la transacción de venta:", error);
    if (connection) {
        try {
            await connection.queryObject('ROLLBACK');
        } catch (rollbackError) {
            console.error("Fallo al revertir la transacción:", rollbackError);
        }
    }
    
    // Make sure to pass the specific error message from the transaction to the client.
    return new Response(JSON.stringify({ msg: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});