#!/usr/bin/env bash
# ============================================================================
# Restaura um backup gerado por backup.sh (dump dos schemas public e auth).
#
# ATENÇÃO: SUBSTITUI os dados atuais de public e auth pelos do backup. Tudo que foi
# cadastrado depois da data do backup será perdido. Faça um backup novo antes, se o banco
# atual ainda tem algo que valha a pena.
#
# Uso:   ./deploy/restaurar-backup.sh /var/backups/armazem/armazem_2026-10-14_0315.dump
#
# Restaurando em um servidor NOVO: suba primeiro o Supabase com o MESMO deploy/supabase/.env do
# servidor antigo (JWT_SECRET e demais — por isso o .env precisa estar guardado fora do servidor),
# e só depois rode este script.
# ============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_comum.sh"

ARQUIVO="${1:-}"
[ -n "$ARQUIVO" ] || erro "Informe o arquivo de backup. Ex.: $0 /var/backups/armazem/armazem_AAAA-MM-DD_HHMM.dump"
[ -f "$ARQUIVO" ] || erro "Arquivo não encontrado: $ARQUIVO"

carregar_senha_postgres
exigir_banco_no_ar

docker exec -i "$DB_CONTAINER" pg_restore -l < "$ARQUIVO" >/dev/null 2>&1 \
  || erro "O arquivo não parece um backup válido (pg_restore não consegue ler)."

echo "Backup: $ARQUIVO"
echo "Isto vai SUBSTITUIR os dados atuais de 'public' e 'auth' pelos do backup."
read -r -p "Digite RESTAURAR para continuar: " CONFIRMA
[ "$CONFIRMA" = "RESTAURAR" ] || erro "Cancelado."

# Para a API e o login durante a restauração, para ninguém gravar no meio.
info "Parando a API (PM2) e os serviços que usam o banco"
pm2 stop armazem-backend >/dev/null 2>&1 || aviso "Não consegui parar o armazem-backend no PM2 (ok se não estiver rodando)."
(cd "$RAIZ/deploy/supabase" && docker compose stop auth rest kong >/dev/null)

info "Restaurando (pode levar alguns minutos)"
# --clean --if-exists: remove os objetos existentes de public/auth antes de recriar.
# Podem aparecer avisos sobre objetos de extensão/sistema que já existem: são esperados.
set +e
docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
  pg_restore -h 127.0.0.1 -U supabase_admin -d postgres --clean --if-exists < "$ARQUIVO"
codigo=$?
set -e
[ "$codigo" -eq 0 ] || aviso "pg_restore terminou com avisos/erros (código $codigo). Confira a saída acima; erros sobre extensões/objetos de sistema já existentes são normais."

info "Reaplicando permissões e subindo os serviços"
"$RAIZ/deploy/aplicar-migrations.sh" --so-permissoes
(cd "$RAIZ/deploy/supabase" && docker compose start auth rest kong >/dev/null)
sleep 5
pm2 start armazem-backend >/dev/null 2>&1 || pm2 start "$RAIZ/deploy/ecosystem.config.js" >/dev/null

info "Restauração concluída. Confira: entre no sistema e verifique os dados."
echo "  Dica: ./deploy/aplicar-migrations.sh --status   (migrations aplicadas/pendentes segundo o backup)"
