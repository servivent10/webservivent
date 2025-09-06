/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://fqsviuilbepdxehrveuo.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxc3ZpdWlsYmVwZHhlaHJ2ZXVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3NDM2MjYsImV4cCI6MjA3MjMxOTYyNn0.4NOzZ0oeeZm05WH8MnuHc8ivgP-07Nt9tbnepjA86RE';

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase URL and Anon Key must be provided.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
