/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Fix: Declare the `Deno` global object to resolve TypeScript errors. This is necessary
// because Supabase Edge Functions run in a Deno environment where `Deno` is globally available.
declare const Deno: any;

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decode } from "https://deno.land/std@0.203.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId, avatarBase64, contentType } = await req.json();
    if (!userId || !avatarBase64 || !contentType) {
      throw new Error('userId, avatarBase64, and contentType are required.');
    }

    // Create a Supabase client with the service role key to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const filePath = `${userId}/avatar.png`;
    
    // The base64 string from the client might include a data URI prefix (e.g., "data:image/png;base64,").
    // We need to remove it before decoding.
    const cleanBase64 = avatarBase64.split(',')[1] ?? avatarBase64;
    const decodedData = decode(cleanBase64);

    // Upload the file to the 'avatares' bucket
    const { error: uploadError } = await supabaseAdmin.storage
      .from('avatares')
      .upload(filePath, decodedData, {
        contentType: contentType,
        upsert: true, // Overwrite the file if it already exists
      });

    if (uploadError) throw uploadError;

    // Get the public URL of the uploaded file
    const { data: urlData } = supabaseAdmin.storage
      .from('avatares')
      .getPublicUrl(filePath);

    // Add a cache-busting timestamp to the URL to ensure the browser fetches the new image
    const publicUrl = `${urlData.publicUrl}?t=${new Date().getTime()}`;

    // Return the public URL to the client
    return new Response(JSON.stringify({ publicUrl }), {
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