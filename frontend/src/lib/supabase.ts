import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    "Variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configuradas. Veja o arquivo .env.example."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
