#!/usr/bin/env bash
# ============================================================================
# Backup do banco: pg_dump (formato custom, já comprimido) dos schemas
#   public → todos os dados do sistema
#   auth   → os usuários/logins (sem isto, os funcionários perdem o acesso)
# Guarda em BACKUP_DIR com a data no nome e apaga os de mais de RETENCAO_DIAS dias.
#
# ATENÇÃO: esta cópia fica NO MESMO SERVIDOR. Se a VPS for perdida, ela vai junto. Configure a
# cópia para FORA do servidor (deploy/backup-externo.sh — veja backup-externo.sh.exemplo e a
# seção "Backups" do DEPLOY.md). Sem isso o script avisa a cada execução.
#
# Também guarde, FORA do servidor, o deploy/supabase/.env (segredos JWT): sem o JWT_SECRET original
# as chaves e a restauração em outro servidor não batem. O .env NÃO é copiado por este script
# (não deve ir em texto puro para fora).
#
# Uso:  ./deploy/backup.sh          (o cron chama este script — ver deploy/cron/armazem-backup)
# Variáveis opcionais: BACKUP_DIR (padrão /var/backups/armazem), RETENCAO_DIAS (padrão 14)
# ============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_comum.sh"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/armazem}"
RETENCAO_DIAS="${RETENCAO_DIAS:-14}"

carregar_senha_postgres
exigir_banco_no_ar

umask 077
mkdir -p "$BACKUP_DIR"

destino="$BACKUP_DIR/armazem_$(date +%Y-%m-%d_%H%M).dump"
parcial="${destino}.parcial"

info "Gerando backup em $destino"
if ! docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
      pg_dump -h 127.0.0.1 -U supabase_admin -d postgres -n public -n auth -Fc > "$parcial"; then
  rm -f "$parcial"
  erro "pg_dump falhou. Nenhum backup foi criado."
fi

# Confere se o arquivo é legível e tem conteúdo antes de considerá-lo válido.
if [ ! -s "$parcial" ] || ! docker exec -i "$DB_CONTAINER" pg_restore -l < "$parcial" >/dev/null 2>&1; then
  rm -f "$parcial"
  erro "O backup gerado está vazio ou corrompido. Descartado."
fi
mv "$parcial" "$destino"
info "Backup concluído ($(du -h "$destino" | cut -f1))."

# Retenção: remove os mais antigos que RETENCAO_DIAS dias.
find "$BACKUP_DIR" -maxdepth 1 -name 'armazem_*.dump' -type f -mtime "+${RETENCAO_DIAS}" -print -delete \
  | sed 's/^/  removido (antigo): /'

# Cópia para FORA do servidor — gancho opcional, DESTINO A DEFINIR por você.
if [ -x "$RAIZ/deploy/backup-externo.sh" ]; then
  info "Enviando cópia para fora do servidor"
  "$RAIZ/deploy/backup-externo.sh" "$destino" \
    || aviso "A cópia para FORA do servidor FALHOU. O backup local existe, mas não está protegido contra perda da VPS."
else
  aviso "Sem cópia FORA do servidor (deploy/backup-externo.sh não configurado). Se a VPS for perdida, os backups vão junto."
fi
