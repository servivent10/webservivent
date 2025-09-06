/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Fix: Declarar el objeto global `Deno` para resolver errores de TypeScript.
declare const Deno: any;

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId, newPassword } = await req.json();
    if (!userId || !newPassword) {
      throw new Error('Faltan campos obligatorios: userId y newPassword son requeridos.');
    }
    
    if (newPassword.length < 6) {
      throw new Error('La nueva contraseña debe tener al menos 6 caracteres.');
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (error) {
        if (error.message.includes('Password should be at least 6 characters')) {
            throw new Error('La contraseña debe tener al menos 6 caracteres.');
        }
        if (error.message.includes('User not found')) {
            throw new Error('El usuario especificado no fue encontrado.');
        }
        throw error;
    }

    if (!data.user) {
        throw new Error('No se pudo actualizar el usuario.');
    }

    return new Response(JSON.stringify({ success: true, userId: data.user.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ msg: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});