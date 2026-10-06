# Deploy do Armazém da Cidadania numa VPS Ubuntu

Guia passo a passo para colocar o sistema inteiro — frontend, backend e Supabase self-hosted — numa única VPS Ubuntu 22.04/24.04. Os comandos estão prontos para copiar e colar via SSH, na ordem.

**Convenções usadas neste guia** (troque pelos seus valores reais):
- `SEUDOMINIO.com` — seu domínio.
- `app.SEUDOMINIO.com` — domínio do sistema (frontend + backend).
- `api.SEUDOMINIO.com` — domínio do Supabase self-hosted (opcional, ver passo 12).
- `/opt/armazem-da-cidadania` — caminho onde o projeto fica na VPS. Se usar outro caminho, ajuste também `deploy/ecosystem.config.js` e `deploy/nginx-armazem.conf`.
- Usuário SSH com privilégios `sudo` (não root direto).

---

## 1. Preparação da VPS

Atualize os pacotes, configure o firewall e instale proteção básica contra brute-force de SSH:

```bash
sudo apt update && sudo apt upgrade -y

# Firewall: libera só SSH, HTTP e HTTPS
sudo apt install -y ufw
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status

# fail2ban: bane IPs que tentam força bruta no SSH
sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
sudo systemctl status fail2ban --no-pager
```

---

## 2. Instalar Docker e Docker Compose

Comandos oficiais do docker.com:

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
rm get-docker.sh

# Permite rodar docker sem sudo (relogue depois, ou rode `newgrp docker`)
sudo usermod -aG docker $USER
newgrp docker

docker --version
docker compose version
```

---

## 3. Instalar Node.js LTS

Via NodeSource (troque `20.x` por outra LTS se preferir uma mais recente):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

---

## 4. Clonar o repositório

```bash
sudo mkdir -p /opt/armazem-da-cidadania
sudo chown $USER:$USER /opt/armazem-da-cidadania
git clone <URL_DO_SEU_REPOSITORIO> /opt/armazem-da-cidadania
cd /opt/armazem-da-cidadania
```

---

## 5. Subir o Supabase self-hosted

```bash
# Clone raso só do necessário (evita baixar o monorepo inteiro da Supabase)
git clone --depth 1 https://github.com/supabase/supabase /opt/supabase-src
cd /opt/supabase-src/docker
cp .env.example .env
```

### 5.1. Variáveis que PRECISAM ser trocadas antes de subir

Edite `/opt/supabase-src/docker/.env` (`nano .env`). Veja o checklist completo com o porquê de cada uma em [`supabase.env.notes.md`](./supabase.env.notes.md). Resumo do que fazer agora:

**Senha do Postgres:**
```bash
openssl rand -base64 24
# cole o resultado em POSTGRES_PASSWORD
```

**JWT_SECRET** (mínimo 32 caracteres — este valor nunca deve vazar):
```bash
openssl rand -base64 40
# guarde esse valor: você vai usá-lo AGORA (para gerar as chaves abaixo)
# e DEPOIS (para colar em backend/.env e frontend/.env)
```

**ANON_KEY e SERVICE_ROLE_KEY:** essas duas chaves são tokens JWT assinados com o `JWT_SECRET` acima — não são valores aleatórios inventados, seguem uma estrutura fixa (`role`, `iss`, `iat`, `exp`) documentada no guia oficial de self-hosting da Supabase (https://supabase.com/docs/guides/self-hosting/docker, seção "API Keys"). A própria documentação linka uma ferramenta visual para gerar essas chaves a partir do seu `JWT_SECRET`; se preferir gerar localmente sem depender de nenhum site, use a função abaixo (usa só `openssl`, já instalado no Ubuntu — sem instalar nada novo):

```bash
gerar_jwt() {
  local role="$1"
  local secret="$2"
  local header='{"alg":"HS256","typ":"JWT"}'
  local iat=$(date +%s)
  local exp=$((iat + 315360000)) # 10 anos
  local payload="{\"role\":\"$role\",\"iss\":\"supabase\",\"iat\":$iat,\"exp\":$exp}"
  local b64_header=$(printf '%s' "$header" | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')
  local b64_payload=$(printf '%s' "$payload" | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')
  local signing_input="${b64_header}.${b64_payload}"
  local signature=$(printf '%s' "$signing_input" | openssl dgst -sha256 -hmac "$secret" -binary | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')
  echo "${signing_input}.${signature}"
}

JWT_SECRET="cole-aqui-o-valor-que-voce-gerou-acima"
echo "ANON_KEY=$(gerar_jwt anon "$JWT_SECRET")"
echo "SERVICE_ROLE_KEY=$(gerar_jwt service_role "$JWT_SECRET")"
```

Cole os três valores (`JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`) no `.env` da Supabase. Guarde `ANON_KEY` e `SERVICE_ROLE_KEY` também à parte — você vai precisar deles no passo 7.

**Usuário/senha do Dashboard do Supabase Studio:**
```bash
# defina DASHBOARD_USERNAME e gere uma senha forte para DASHBOARD_PASSWORD
openssl rand -base64 18
```

### 5.2. Domínios

Ainda no mesmo `.env`, ajuste:
```
SITE_URL=https://app.SEUDOMINIO.com
API_EXTERNAL_URL=https://api.SEUDOMINIO.com
SUPABASE_PUBLIC_URL=https://api.SEUDOMINIO.com
```

### 5.3. Subir os containers

```bash
cd /opt/supabase-src/docker
docker compose up -d
docker compose ps
```

Confirme que todos os serviços aparecem como `running`/`healthy` antes de continuar.

---

## 6. Aplicar as migrations do projeto no banco self-hosted

Confira a porta real do Postgres no `.env` da Supabase (variável `POSTGRES_PORT`, o padrão costuma ser `5432`). Com o Postgres no ar (passo anterior), rode os arquivos de `supabase/migrations/` **em ordem numérica**:

```bash
cd /opt/armazem-da-cidadania

for f in supabase/migrations/*.sql; do
  echo ">> Aplicando $f"
  PGPASSWORD="a-senha-que-voce-colocou-em-POSTGRES_PASSWORD" \
    psql -h localhost -p 5432 -U postgres -d postgres -f "$f"
done
```

Se o `psql` não estiver instalado no host, instale só o cliente (não precisa do servidor Postgres completo):
```bash
sudo apt install -y postgresql-client
```

> **Atenção:** confira se a pasta `supabase/migrations/` do seu repositório reflete de fato o schema atual do banco (tabelas de núcleos/demandas, atendimentos, fila de senhas etc.) — se algum ajuste de schema foi feito direto pelo SQL Editor do Supabase sem virar um arquivo de migration aqui, ele não vai ser reaplicado automaticamente num banco novo. Nesse caso, exporte o schema atual (`Database → Backups` ou `pg_dump --schema-only`) e adicione como uma migration antes de continuar.

---

## 7. Configurar as variáveis de ambiente do backend e do frontend

```bash
cd /opt/armazem-da-cidadania/backend
cp .env.example .env
nano .env
```

Preencha:
```
SUPABASE_URL=https://api.SEUDOMINIO.com
SUPABASE_SERVICE_ROLE_KEY=<o SERVICE_ROLE_KEY gerado no passo 5>
SUPABASE_ANON_KEY=<o ANON_KEY gerado no passo 5>
PORT=3333
FRONTEND_URL=https://app.SEUDOMINIO.com
```

```bash
cd /opt/armazem-da-cidadania/frontend
cp .env.example .env
nano .env
```

Preencha:
```
VITE_SUPABASE_URL=https://api.SEUDOMINIO.com
VITE_SUPABASE_ANON_KEY=<o mesmo ANON_KEY de cima>
VITE_API_URL=https://app.SEUDOMINIO.com/api
```

---

## 8. Instalar dependências e criar o primeiro administrador

```bash
cd /opt/armazem-da-cidadania
npm run install:all

cd backend
npm run create-admin -- --nome "Seu Nome" --cpf 12345678900 --email voce@exemplo.com --senha "umaSenhaForte123"
```

---

## 9. Build do backend e do frontend

```bash
cd /opt/armazem-da-cidadania
npm run build
```

Isso gera `backend/dist/` (código compilado que o PM2 vai rodar) e `frontend/dist/` (arquivos estáticos que o Nginx vai servir).

---

## 10. Subir o backend com PM2

```bash
sudo npm install -g pm2

cd /opt/armazem-da-cidadania
pm2 start deploy/ecosystem.config.js
pm2 status
pm2 logs --lines 30
```

Salve a lista de processos e configure o PM2 para subir automaticamente no boot da VPS:

```bash
pm2 save
pm2 startup
```

O comando `pm2 startup` **imprime um outro comando** (algo como `sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u seu_usuario --hp /home/seu_usuario`) — copie exatamente essa linha que ele mostrou e rode-a. Isso registra o PM2 como serviço do systemd.

---

## 11. Instalar Nginx e Certbot

```bash
sudo apt install -y nginx

# Certbot via snap (forma recomendada atualmente pelo próprio EFF/Certbot)
sudo snap install core
sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

---

## 12. Configurar o Nginx

```bash
sudo cp /opt/armazem-da-cidadania/deploy/nginx-armazem.conf /etc/nginx/sites-available/armazem
sudo nano /etc/nginx/sites-available/armazem
# troque todas as ocorrências de SEUDOMINIO.com pelo seu domínio real

sudo ln -s /etc/nginx/sites-available/armazem /etc/nginx/sites-enabled/armazem
sudo nginx -t
sudo systemctl reload nginx
```

O arquivo já vem com um bloco comentado de exemplo para expor o Supabase self-hosted num subdomínio próprio (`api.SEUDOMINIO.com`) — descomente e ajuste se quiser usar essa opção (ver comentários dentro do arquivo).

---

## 13. Emitir certificados HTTPS

```bash
sudo certbot --nginx -d app.SEUDOMINIO.com
```

Se você também expôs o domínio da Supabase via Nginx (passo 12, bloco opcional):
```bash
sudo certbot --nginx -d api.SEUDOMINIO.com
```

O Certbot edita o arquivo do Nginx automaticamente, adicionando os blocos HTTPS (porta 443) e o redirecionamento de HTTP para HTTPS. Depois de rodar, confira com `sudo nginx -t` e `sudo systemctl status nginx`.

---

## 14. Testar

1. Acesse `https://app.SEUDOMINIO.com` e faça login com o administrador criado no passo 8.
2. Teste o cadastro manual de um atendimento pendente e a tela `/recepcao`.
3. Acesse `https://app.SEUDOMINIO.com/totem` num tablet/computador para conferir a tela de retirada de senha — vale rodar em modo quiosque do navegador (kiosk mode) se for deixar fixo num totem físico.
4. Confira `pm2 logs armazem-backend` se algo não funcionar.

---

## 15. Manutenção

### Ver logs

```bash
pm2 logs                     # backend, em tempo real
pm2 logs armazem-backend

cd /opt/supabase-src/docker
docker compose logs -f       # logs do Supabase self-hosted
docker compose logs -f db    # só o Postgres, por exemplo
```

### Backup do banco

Crie um script de backup e agende via `cron`:

```bash
sudo mkdir -p /opt/backups
sudo nano /opt/backups/backup-armazem.sh
```

Conteúdo do script (ajuste porta/senha se necessário):
```bash
#!/bin/bash
set -e
DATA=$(date +%Y-%m-%d_%H-%M-%S)
DESTINO="/opt/backups/armazem-db-${DATA}.sql.gz"
PGPASSWORD="a-senha-do-POSTGRES_PASSWORD" \
  pg_dump -h localhost -p 5432 -U postgres postgres | gzip > "$DESTINO"
echo "Backup salvo em $DESTINO"

# Mantém só os últimos 14 backups
ls -1t /opt/backups/armazem-db-*.sql.gz | tail -n +15 | xargs -r rm --
```

```bash
sudo chmod +x /opt/backups/backup-armazem.sh
sudo crontab -e
```

Adicione uma linha para rodar todo dia às 3h da manhã:
```
0 3 * * * /opt/backups/backup-armazem.sh >> /var/log/armazem-backup.log 2>&1
```

### Atualizar o sistema depois de mudanças no código

```bash
cd /opt/armazem-da-cidadania
git pull

npm run install:all
npm run build

# Se houver migrations novas em supabase/migrations/, aplique-as (repita o passo 6
# só para os arquivos novos)

pm2 restart armazem-backend
sudo systemctl reload nginx   # só se você mudou o arquivo de configuração do Nginx
```
