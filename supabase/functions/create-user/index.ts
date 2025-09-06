/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Fix: Declare the `Deno` global object to resolve TypeScript errors. This is necessary
// because Supabase Edge Functions run in a Deno environment where `Deno` is globally available.
declare const Deno: any;

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// El objeto de las cabeceras CORS ahora está definido directamente aquí.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Manejar la solicitud preflight de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Extraer los datos del cuerpo de la solicitud
    const { email, password, nombre, rol, id_sucursal } = await req.json();
    if (!email || !password || !nombre || !rol) {
      throw new Error('Faltan campos obligatorios: email, password, nombre y rol son requeridos.');
    }

    // 2. Crear un cliente de Supabase con privilegios de administrador
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 3. Crear el nuevo usuario en el sistema de autenticación de Supabase
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        nombre: nombre,
      },
    });

    if (authError) {
        if (authError.message.includes('already registered')) {
            throw new Error('Este correo electrónico ya está registrado.');
        }
        if (authError.message.includes('Password should be at least 6 characters')) {
            throw new Error('La contraseña debe tener al menos 6 caracteres.');
        }
        throw authError;
    }
    
    const newUser = authData.user;
    if (!newUser) {
      throw new Error('La creación del usuario en Auth falló y no devolvió un usuario.');
    }

    // 4. Crear el perfil del usuario en la tabla pública 'Usuarios'
    const { error: profileError } = await supabaseAdmin
      .from('Usuarios')
      .insert({
        id: newUser.id,
        Nombre: nombre,
        Email: email,
        rol: rol,
        id_Sucursal: id_sucursal,
      });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.id);
      throw profileError;
    }

    // 5. Devolver una respuesta exitosa
    return new Response(JSON.stringify({ success: true, userId: newUser.id }), {
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
