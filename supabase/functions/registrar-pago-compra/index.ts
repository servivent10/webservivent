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
    const { purchaseId, amount, paymentDate, method, notes } = await req.json();
    if (!purchaseId || typeof amount !== 'number' || amount <= 0 || !paymentDate || !method) {
      throw new Error('Faltan datos obligatorios o son inválidos para registrar el pago.');
    }

    connection = await pool.connect();
    await connection.queryObject('BEGIN');

    // 1. Insertar el nuevo pago
    await connection.queryObject(
      `INSERT INTO public."Pagos_Compra" ("id_compra", "monto", "fecha_pago", "metodo_pago", "notas")
       VALUES ($1, $2, $3, $4, $5);`,
      [purchaseId, amount, paymentDate, method, notes]
    );

    // 2. Recalcular el monto total desde los detalles y el total pagado para máxima precisión
    const totalsResult = await connection.queryObject(
      `WITH calculated_total AS (
         SELECT
           COALESCE(SUM(
             CASE
               WHEN d.moneda = '$' THEN d.cantidad * d.costo_unitario * COALESCE(c.tipo_cambio, 1.0)
               ELSE d.cantidad * d.costo_unitario
             END
           ), 0.0) AS total
         FROM public."Compras" c
         LEFT JOIN public."Detalles_Compra" d ON c.id = d.id_compra
         WHERE c.id = $1
       )
       SELECT
         (SELECT total FROM calculated_total) as monto_total_calculado,
         (SELECT COALESCE(SUM(p.monto), 0.0) FROM public."Pagos_Compra" p WHERE p.id_compra = $1) as total_paid;`,
      [purchaseId]
    );

    if (totalsResult.rows.length === 0) {
      throw new Error(`No se encontró la compra con ID ${purchaseId}.`);
    }

    const { monto_total_calculado, total_paid } = totalsResult.rows[0];
    
    // 3. Determinar y actualizar el nuevo estado de pago
    let newStatus = 'Pago Pendiente';
    // Usar una pequeña tolerancia (epsilon) para comparaciones de punto flotante
    if (total_paid >= monto_total_calculado - 0.001) {
      newStatus = 'Pagado';
    } else if (total_paid > 0) {
      newStatus = 'Parcialmente Pagado';
    }

    await connection.queryObject(
      `UPDATE public."Compras" SET "estado_pago" = $1, "monto_total" = $2 WHERE "id" = $3;`,
      [newStatus, monto_total_calculado, purchaseId]
    );

    await connection.queryObject('COMMIT');
    
    return new Response(JSON.stringify({ success: true, message: 'Pago registrado y estado actualizado.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("Error in registrar-pago-compra function:", error.message, error);
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