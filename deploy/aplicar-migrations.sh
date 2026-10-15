#!/usr/bin/env bash
# ============================================================================
# Aplica, em ordem, os arquivos de supabase/migrations/*.sql no Postgres do container.
#
# Cada arquivo roda numa transação única junto com o seu registro na tabela de controle
# public._migrations_aplicadas: ou aplica tudo e registra, ou não muda nada. Por isso é seguro
# rodar de novo — só os arquivos ainda não registrados são aplicados.
#
# Uso:
#   ./deploy/aplicar-migrations.sh                aplica as pendentes
#   ./deploy/aplicar-migrations.sh --status       só lista o que está aplicado / pendente
#   ./deploy/aplicar-migrations.sh --marcar-todas REGISTRA todas como aplicadas SEM executar
#                                                 (use ao importar um banco que já tem o esquema,
#                                                  ex.: dump vindo da nuvem — ver migrar-dados-da-nuvem.md)
#   ./deploy/aplicar-migrations.sh --so-permissoes só reaplica o endurecimento de permissões
# ============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_comum.sh"

MODO="${1:-aplicar}"
PASTA="$RAIZ/supabase/migrations"

carregar_senha_postgres
exigir_banco_no_ar

# Permissões: este sistema só acessa o banco pelo backend, com a service_role. Os roles anon e
# authenticated (que a chave pública ANON_KEY e o login usam) não precisam de NADA em public — e
# funções (como proxima_senha_numero) são executáveis por qualquer um por padrão no Postgres.
# Fecha tudo e libera só a service_role; vale também para tabelas/funções criadas no futuro.
endurecer_permissoes() {
  info "Ajustando permissões (somente service_role acessa o schema public)"
  psql_banco -q <<'SQL'
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public grant all on tables to service_role;
alter default privileges for role postgres in schema public grant all on sequences to service_role;
alter default privileges for role postgres in schema public grant execute on functions to service_role;

-- Faz o PostgREST (API) recarregar o esquema.
notify pgrst, 'reload schema';
SQL
}

if [ "$MODO" = "--so-permissoes" ]; then
  endurecer_permissoes
  exit 0
fi

[ -d "$PASTA" ] || erro "Pasta de migrations não encontrada: $PASTA"

# Tabela de controle (fica no banco, junto com os dados — entra nos backups).
psql_banco -q <<'SQL'
create table if not exists public._migrations_aplicadas (
  arquivo     text primary key,
  checksum    text,
  aplicada_em timestamptz not null default now()
);
alter table public._migrations_aplicadas enable row level security;
SQL

mapfile -t ARQUIVOS < <(find "$PASTA" -maxdepth 1 -name '*.sql' | sort)
[ "${#ARQUIVOS[@]}" -gt 0 ] || erro "Nenhum arquivo .sql em $PASTA."

aplicadas=0
for arquivo in "${ARQUIVOS[@]}"; do
  nome="$(basename "$arquivo")"
  checksum="$(sha256sum "$arquivo" | cut -d' ' -f1)"
  ja_aplicada="$(psql_banco -tA -c "select 1 from public._migrations_aplicadas where arquivo = '${nome}'")"

  if [ "$ja_aplicada" = "1" ]; then
    echo "  = ${nome} (já aplicada)"
    continue
  fi

  case "$MODO" in
    --status)
      echo "  - ${nome} (PENDENTE)"
      ;;
    --marcar-todas)
      psql_banco -q -c "insert into public._migrations_aplicadas (arquivo, checksum) values ('${nome}', '${checksum}')"
      echo "  + ${nome} (marcada como aplicada, sem executar)"
      ;;
    aplicar)
      echo "  > aplicando ${nome} ..."
      # Uma transação só: o arquivo + o registro. Se algo falhar, nada é gravado.
      if { cat "$arquivo"; printf '\n;\ninsert into public._migrations_aplicadas (arquivo, checksum) values (%s, %s);\n' \
            "'${nome}'" "'${checksum}'"; } | psql_banco -q --single-transaction -f - >/dev/null; then
        aplicadas=$((aplicadas + 1))
      else
        erro "Falha em ${nome}. Nada desse arquivo foi gravado. Corrija e rode o script de novo (as anteriores seguem aplicadas)."
      fi
      ;;
    *)
      erro "Opção desconhecida: $MODO"
      ;;
  esac
done

if [ "$MODO" = "aplicar" ]; then
  endurecer_permissoes
  info "Pronto: ${aplicadas} migration(s) aplicada(s) agora."
fi
