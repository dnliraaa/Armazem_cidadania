#!/usr/bin/env bash
# ============================================================================
# Cria o PRIMEIRO administrador: o usuário no Auth do Supabase novo + o registro em
# public.funcionarios (nível 'admin'). O Auth de um banco novo começa vazio, então sem este
# passo ninguém consegue entrar no sistema.
#
# Pede nome, CPF, e-mail e senha no terminal (a senha não aparece nem fica no histórico) e
# repassa ao script do backend por variáveis de ambiente, não por argumentos de linha de comando.
#
# Pré-requisitos: Supabase no ar, migrations aplicadas, backend/.env preenchido, e
# `npm ci --prefix backend` já executado (precisa das dependências de desenvolvimento).
# ============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_comum.sh"

exigir_comando node
exigir_comando npm
[ -f "$RAIZ/backend/.env" ] || erro "backend/.env não existe. Copie backend/.env.production.example e preencha."
[ -d "$RAIZ/backend/node_modules" ] || erro "Dependências do backend não instaladas. Rode: npm ci --prefix backend"

echo "Criação do administrador do Armazém da Cidadania"
echo

read -r -p "Nome completo: " ADMIN_NOME
read -r -p "CPF (só números ou com pontuação): " ADMIN_CPF
read -r -p "E-mail (será o login): " ADMIN_EMAIL

while true; do
  read -r -s -p "Senha (mínimo 6 caracteres): " ADMIN_SENHA; echo
  read -r -s -p "Repita a senha: " CONFIRMA; echo
  if [ "$ADMIN_SENHA" != "$CONFIRMA" ]; then
    aviso "As senhas não conferem. Tente de novo."
  elif [ "${#ADMIN_SENHA}" -lt 6 ]; then
    aviso "A senha precisa ter ao menos 6 caracteres."
  else
    break
  fi
done
unset CONFIRMA

[ -n "$ADMIN_NOME" ] && [ -n "$ADMIN_CPF" ] && [ -n "$ADMIN_EMAIL" ] || erro "Nome, CPF e e-mail são obrigatórios."

export ADMIN_NOME ADMIN_CPF ADMIN_EMAIL ADMIN_SENHA
npm run create-admin --prefix "$RAIZ/backend"
