import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variável de ambiente ${name} não definida. Confira o arquivo .env (veja .env.example).`
    );
  }
  return value;
}

const producao = process.env.NODE_ENV === "production";

// Em produção o CORS tem que ser explícito (só o domínio do sistema): sem o valor padrão de
// desenvolvimento (localhost), para uma configuração esquecida não liberar a origem errada.
const frontendUrl = producao ? required("FRONTEND_URL") : process.env.FRONTEND_URL ?? "http://localhost:5173";

export const env = {
  producao,
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseAnonKey: required("SUPABASE_ANON_KEY"),
  port: Number(process.env.PORT ?? 3333),
  // Em produção use HOST=127.0.0.1: a API só é alcançada pelo Nginx (proxy reverso), nunca direto da internet.
  host: process.env.HOST ?? "0.0.0.0",
  frontendUrl,
};
