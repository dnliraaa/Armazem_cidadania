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

export const env = {
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseAnonKey: required("SUPABASE_ANON_KEY"),
  port: Number(process.env.PORT ?? 3333),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
  omrServiceUrl: process.env.OMR_SERVICE_URL ?? "http://localhost:8000",
};
