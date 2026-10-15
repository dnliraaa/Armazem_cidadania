#!/usr/bin/env bash
# Funções comuns dos scripts de deploy. Não é executado direto: os outros scripts fazem
#   source "$(dirname "$0")/_comum.sh"

# Raiz do repositório (a pasta acima de deploy/)
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_SUPABASE="${ENV_SUPABASE:-$RAIZ/deploy/supabase/.env}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"

erro() { echo "ERRO: $*" >&2; exit 1; }
aviso() { echo "AVISO: $*" >&2; }
info() { echo "==> $*"; }

exigir_comando() { command -v "$1" >/dev/null 2>&1 || erro "'$1' não encontrado. Instale antes de continuar."; }

# Lê o POSTGRES_PASSWORD do .env do Supabase (sem executar o arquivo como shell).
carregar_senha_postgres() {
  [ -f "$ENV_SUPABASE" ] || erro "Não achei $ENV_SUPABASE. Rode deploy/supabase/gerar-segredos.sh primeiro."
  POSTGRES_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' "$ENV_SUPABASE" | head -n1 | cut -d= -f2-)"
  [ -n "$POSTGRES_PASSWORD" ] || erro "POSTGRES_PASSWORD vazio em $ENV_SUPABASE."
}

exigir_banco_no_ar() {
  exigir_comando docker
  docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER" \
    || erro "O container '$DB_CONTAINER' não está rodando. Suba o Supabase: (cd deploy/supabase && docker compose up -d)."
}

# psql dentro do container do banco. O usuário padrão é 'postgres' (como no SQL Editor do Supabase);
# use DB_USUARIO=supabase_admin para tarefas de superusuário (backup/restore).
# A senha vai por variável de ambiente do docker exec — não aparece na linha de comando do host.
psql_banco() {
  docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
    psql -h 127.0.0.1 -U "${DB_USUARIO:-postgres}" -d postgres -v ON_ERROR_STOP=1 "$@"
}
