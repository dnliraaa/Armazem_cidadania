/**
 * Script de linha de comando para criar o primeiro funcionário administrador.
 *
 * Uso:
 *   npm run create-admin -- --nome "Maria Silva" --cpf 12345678900 --email maria@exemplo.com --senha "senhaForte123"
 */
import "dotenv/config";
import { supabaseAdmin } from "../src/config/supabase.js";
import { cpfValido, somenteDigitos } from "../src/utils/cpf.js";

function lerArgumento(nome: string): string | undefined {
  const idx = process.argv.indexOf(`--${nome}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const nome = lerArgumento("nome");
  const cpfBruto = lerArgumento("cpf");
  const email = lerArgumento("email");
  const senha = lerArgumento("senha");

  if (!nome || !cpfBruto || !email || !senha) {
    console.error(
      "Uso: npm run create-admin -- --nome \"Nome Completo\" --cpf 12345678900 --email email@exemplo.com --senha \"senhaForte123\""
    );
    process.exit(1);
  }

  if (!cpfValido(cpfBruto)) {
    console.error("Erro: CPF inválido.");
    process.exit(1);
  }

  const cpf = somenteDigitos(cpfBruto);

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    console.error("Erro ao criar usuário de autenticação:", authError?.message);
    process.exit(1);
  }

  const { error: erroFuncionario } = await supabaseAdmin.from("funcionarios").insert({
    id: authData.user.id,
    nome,
    cpf,
    email,
    role: "admin",
    ativo: true,
  });

  if (erroFuncionario) {
    console.error("Erro ao salvar o cadastro do funcionário:", erroFuncionario.message);
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    process.exit(1);
  }

  console.log(`Administrador "${nome}" criado com sucesso. Já pode fazer login no sistema.`);
  process.exit(0);
}

main();
