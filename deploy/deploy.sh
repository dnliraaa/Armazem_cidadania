#!/usr/bin/env bash
# ============================================================================
# Atualiza o sistema em produção: git pull → dependências → build → publicação → reload.
#
# O build acontece em pastas TEMPORÁRIAS (dist.novo). A versão em produção só é trocada se os dois
# builds passarem; se algo falhar, o script para com uma mensagem clara e a versão que está no ar
# continua intacta. Depois do reload, a API é testada (/api/health) e, se não responder, o backend
# volta automaticamente para a versão anterior.
#
# Uso:   ./deploy/deploy.sh             atualiza e publica
#        ./deploy/deploy.sh --migrar    também aplica migrations novas do banco (antes de publicar)
#
# Variáveis opcionais:
#   WEB_DIR   onde o Nginx serve o frontend      (padrão: /var/www/armazemdacidadania)
#   PM2_APP   nome do app no PM2                 (padrão: armazem-backend)
#   PORTA     porta do backend p/ o teste final  (padrão: 3333)
# ============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_comum.sh"

WEB_DIR="${WEB_DIR:-/var/www/armazemdacidadania}"
PM2_APP="${PM2_APP:-armazem-backend}"
PORTA="${PORTA:-3333}"
MIGRAR="${1:-}"

exigir_comando git
exigir_comando npm
exigir_comando pm2
exigir_comando rsync
exigir_comando curl

cd "$RAIZ"

[ -f backend/.env ] || erro "backend/.env não existe (copie backend/.env.production.example)."
[ -f frontend/.env.production ] || erro "frontend/.env.production não existe (copie frontend/.env.production.example). Sem ele o build sai apontando para o servidor errado."
[ -d "$WEB_DIR" ] && [ -w "$WEB_DIR" ] || erro "$WEB_DIR não existe ou não é gravável por este usuário (veja o passo do Nginx no DEPLOY.md)."

# Limpa as pastas temporárias ao sair (com sucesso ou erro).
limpar() { rm -rf "$RAIZ/backend/dist.novo" "$RAIZ/frontend/dist.novo"; }
trap limpar EXIT
limpar

info "1/6 Atualizando o código (git pull)"
git diff --quiet && git diff --cached --quiet || erro "Há alterações locais não commitadas no servidor. Resolva (git status) antes de atualizar."
git pull --ff-only

info "2/6 Instalando dependências"
npm ci --prefix backend
npm ci --prefix frontend

info "3/6 Build do backend (em dist.novo)"
npm run build --prefix backend -- --outDir dist.novo \
  || erro "O build do BACKEND falhou. A versão em produção NÃO foi alterada."

info "4/6 Build do frontend (em dist.novo)"
npm run build --prefix frontend -- --outDir dist.novo \
  || erro "O build do FRONTEND falhou. A versão em produção NÃO foi alterada."

[ -f backend/dist.novo/server.js ] || erro "Build do backend não gerou dist.novo/server.js. Versão em produção mantida."
[ -f frontend/dist.novo/index.html ] || erro "Build do frontend não gerou dist.novo/index.html. Versão em produção mantida."

if [ "$MIGRAR" = "--migrar" ]; then
  info "5/6 Aplicando migrations do banco"
  "$RAIZ/deploy/aplicar-migrations.sh"
else
  info "5/6 Migrations: não solicitadas (use --migrar para aplicar as novas)"
  # Aviso útil: migrations no repositório que ainda não estão no banco.
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$DB_CONTAINER"; then
    situacao="$("$RAIZ/deploy/aplicar-migrations.sh" --status 2>/dev/null || true)"
    if grep -q PENDENTE <<<"$situacao"; then
      aviso "Há migrations PENDENTES no banco. Rode:  ./deploy/deploy.sh --migrar  (ou ./deploy/aplicar-migrations.sh)"
    fi
  fi
fi

info "6/6 Publicando"
# Backend: troca de pasta guardando a anterior para um possível rollback.
rm -rf backend/dist.antigo
[ -d backend/dist ] && mv backend/dist backend/dist.antigo
mv backend/dist.novo backend/dist
# Frontend: copia o build novo para a pasta servida pelo Nginx.
rsync -a --delete frontend/dist.novo/ "$WEB_DIR"/

if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 reload "$PM2_APP" --update-env
else
  pm2 start "$RAIZ/deploy/ecosystem.config.js"
fi
pm2 save >/dev/null

# Teste final: a API precisa responder. Senão, volta o backend anterior.
sleep 3
if curl -fsS --max-time 10 "http://127.0.0.1:${PORTA}/api/health" >/dev/null; then
  rm -rf backend/dist.antigo
  info "Pronto! Versão nova no ar. (commit: $(git rev-parse --short HEAD))"
else
  aviso "A API não respondeu depois do reload. Voltando o backend para a versão anterior..."
  if [ -d backend/dist.antigo ]; then
    rm -rf backend/dist
    mv backend/dist.antigo backend/dist
    pm2 reload "$PM2_APP" --update-env
    erro "Rollback do BACKEND feito (o frontend novo já foi publicado). Veja os logs: pm2 logs $PM2_APP"
  fi
  erro "Sem versão anterior para restaurar. Veja os logs: pm2 logs $PM2_APP"
fi
