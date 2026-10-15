#!/usr/bin/env bash
# ============================================================================
# Gera o deploy/supabase/.env com segredos novos e fortes:
#   - POSTGRES_PASSWORD  (alfanumérica, 40 caracteres)
#   - JWT_SECRET         (alfanumérico, 64 caracteres; o mínimo exigido é 32)
#   - ANON_KEY / SERVICE_ROLE_KEY  (JWT HS256 assinados com o JWT_SECRET, role anon / service_role)
#   - DASHBOARD_USERNAME / DASHBOARD_PASSWORD
#
# Uso:   ./gerar-segredos.sh                 (usa os domínios padrão abaixo)
#        ./gerar-segredos.sh --force         (SOBRESCREVE um .env existente — só em instalação nova!)
#        DOMINIO_APP=meusite.com.br DOMINIO_API=db.meusite.com.br ./gerar-segredos.sh
#
# Os segredos são mostrados só aqui (e gravados no .env). Guarde uma cópia do .env em um
# gerenciador de senhas: sem o JWT_SECRET você não consegue restaurar o sistema num servidor novo.
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")"

DOMINIO_APP="${DOMINIO_APP:-armazemdacidadania.tech}"
DOMINIO_API="${DOMINIO_API:-db.armazemdacidadania.tech}"
ARQUIVO=".env"

if [ -f "$ARQUIVO" ] && [ "${1:-}" != "--force" ]; then
  echo "ERRO: já existe um $ARQUIVO aqui. Gerar outro invalidaria o banco/logins atuais." >&2
  echo "      Se isto é uma instalação NOVA e você quer recomeçar, rode:  $0 --force" >&2
  exit 1
fi

command -v openssl >/dev/null || { echo "ERRO: openssl não encontrado (apt install openssl)." >&2; exit 1; }

# Texto aleatório alfanumérico de N caracteres (sem símbolos que quebrem URLs de conexão).
aleatorio() {
  local tamanho="$1" saida=""
  while [ "${#saida}" -lt "$tamanho" ]; do
    saida+="$(openssl rand -base64 96 | tr -dc 'A-Za-z0-9')"
  done
  echo "${saida:0:$tamanho}"
}

# base64url sem padding, lendo stdin
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

# JWT HS256:  gerar_jwt <role> <segredo>   (validade de 10 anos, como nas chaves padrão do Supabase)
gerar_jwt() {
  local role="$1" segredo="$2"
  local agora exp header payload assinatura
  agora="$(date +%s)"
  exp=$((agora + 315360000))
  header='{"alg":"HS256","typ":"JWT"}'
  payload="{\"role\":\"${role}\",\"iss\":\"supabase\",\"iat\":${agora},\"exp\":${exp}}"
  header="$(printf '%s' "$header" | b64url)"
  payload="$(printf '%s' "$payload" | b64url)"
  assinatura="$(printf '%s' "${header}.${payload}" | openssl dgst -sha256 -hmac "$segredo" -binary | b64url)"
  echo "${header}.${payload}.${assinatura}"
}

POSTGRES_PASSWORD="$(aleatorio 40)"
JWT_SECRET="$(aleatorio 64)"
ANON_KEY="$(gerar_jwt anon "$JWT_SECRET")"
SERVICE_ROLE_KEY="$(gerar_jwt service_role "$JWT_SECRET")"
DASHBOARD_PASSWORD="$(aleatorio 24)"
PG_META_CRYPTO_KEY="$(aleatorio 48)"

umask 077
cat > "$ARQUIVO" <<EOF
# Gerado por gerar-segredos.sh em $(date '+%Y-%m-%d %H:%M:%S'). NÃO versionar. Veja .env.example.

POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRY=3600
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}

PG_META_CRYPTO_KEY=${PG_META_CRYPTO_KEY}

SITE_URL=https://${DOMINIO_APP}
API_EXTERNAL_URL=https://${DOMINIO_API}
ADDITIONAL_REDIRECT_URLS=

KONG_HTTP_PORT=8000
STUDIO_PORT=3000

DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}
EOF
chmod 600 "$ARQUIVO"

echo "OK: $(pwd)/$ARQUIVO criado (permissão 600)."
echo
echo "Use estes valores nos arquivos de ambiente do sistema:"
echo "  backend/.env              -> SUPABASE_SERVICE_ROLE_KEY e SUPABASE_ANON_KEY"
echo "  frontend/.env.production  -> VITE_SUPABASE_ANON_KEY"
echo
echo "ANON_KEY (pública, vai no frontend):"
echo "  ${ANON_KEY}"
echo
echo "IMPORTANTE: guarde uma cópia do $ARQUIVO num gerenciador de senhas (fora do servidor)."
