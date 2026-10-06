import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

/**
 * Cliente "admin" com a Service Role Key.
 * Ignora RLS — usado por todas as rotas da API, que já fazem sua própria
 * checagem de autenticação/autorização antes de tocar no banco.
 */
export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Cliente "anon", usado apenas para validar o token JWT enviado pelo
 * frontend (Authorization: Bearer <token>) via supabase.auth.getUser().
 */
export const supabaseAuthClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
