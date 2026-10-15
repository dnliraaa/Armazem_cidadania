# Deploy do Armazém da Cidadania — VPS Ubuntu com tudo hospedado lá

Runbook do zero até o sistema no ar, com **frontend, backend e banco (Supabase self-hosted) no mesmo servidor**.

| Endereço | O que é |
|---|---|
| `https://armazemdacidadania.tech` | o sistema (frontend estático + `/api` → backend Node) |
| `https://db.armazemdacidadania.tech` | só o Auth do Supabase (`/auth/v1/`) — o resto fica fechado |

```
Internet ──443──> Nginx ──┬─ armazemdacidadania.tech ──> /var/www/armazemdacidadania (frontend)
                          │                           └ /api ──> 127.0.0.1:3333  (backend Node, PM2)
                          └─ db.armazemdacidadania.tech /auth/v1 ──> 127.0.0.1:8000 (Kong)
                                                                          │ (rede interna do Docker)
                                         backend ──> 127.0.0.1:8000 ──> auth (GoTrue) · rest (PostgREST) ──> db (Postgres)
                                         Studio: só 127.0.0.1:3000 → acesso por túnel SSH
```

**Requisitos:** VPS Ubuntu 22.04 ou 24.04, 4 GB de RAM ou mais, acesso `sudo`, e os dois domínios apontando para o IP da VPS.
**Convenções:** o projeto fica em `/opt/armazem-da-cidadania`; os comandos assumem um usuário comum com `sudo` (não o root). Se usar outro caminho, ajuste `deploy/ecosystem.config.js`, `deploy/cron/armazem-backup` e as variáveis dos scripts.

---

## 0. Antes de começar (no seu computador)

1. **Envie o código para o GitHub.** O servidor atualiza com `git pull`, então tudo que você quer em produção precisa estar commitado e enviado (`git push`) — inclusive a pasta `deploy/` e as migrations novas.
2. Os arquivos `.env` **nunca** vão para o git (o `.gitignore` já cobre). Os segredos serão gerados no servidor.

---

## 1. DNS (manual, no painel do seu domínio)

Crie registros **A** apontando para o IP público da VPS:

| Tipo | Nome | Valor |
|---|---|---|
| A | `@` (armazemdacidadania.tech) | IP da VPS |
| A | `www` | IP da VPS |
| A | `db` | IP da VPS |

Confira (pode levar de minutos a horas): `dig +short armazemdacidadania.tech` e `dig +short db.armazemdacidadania.tech` devem mostrar o IP. **O certbot (passo 12) só funciona depois disso.**

---

## 2. Preparar a VPS

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ufw fail2ban git curl rsync unattended-upgrades ca-certificates openssl

# Firewall: só SSH, HTTP e HTTPS
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status

# Proteção contra força bruta no SSH + atualizações de segurança automáticas
sudo systemctl enable --now fail2ban
sudo dpkg-reconfigure -plow unattended-upgrades
```

> **Recomendado:** depois de configurar sua chave SSH, desative o login por senha (`PasswordAuthentication no` em `/etc/ssh/sshd_config`, e `sudo systemctl reload ssh`). Teste a chave em outra janela antes de fechar a sessão atual.

---

## 3. Instalar Docker, Node.js, Nginx, Certbot e PM2

```bash
# Docker + Compose (script oficial)
curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh && rm get-docker.sh
sudo usermod -aG docker $USER && newgrp docker
docker --version && docker compose version

# Node.js 22 LTS (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v

# Nginx e Certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# PM2 (gerenciador do backend)
sudo npm install -g pm2
```

---

## 4. Clonar o repositório

```bash
sudo mkdir -p /opt/armazem-da-cidadania && sudo chown $USER: /opt/armazem-da-cidadania
git clone https://github.com/dnliraaa/Armazem_cidadania.git /opt/armazem-da-cidadania
cd /opt/armazem-da-cidadania
chmod +x deploy/*.sh deploy/supabase/*.sh
```

Se o repositório for privado, crie uma *deploy key* (`ssh-keygen -t ed25519`, cadastre a chave pública em *Settings → Deploy keys* do repositório) e clone por SSH.

---

## 5. Gerar os segredos do Supabase

```bash
cd /opt/armazem-da-cidadania/deploy/supabase
./gerar-segredos.sh
```

Cria `deploy/supabase/.env` (permissão 600) com `POSTGRES_PASSWORD`, `JWT_SECRET` (64 caracteres), `ANON_KEY` e `SERVICE_ROLE_KEY` (JWT HS256 assinados com o `JWT_SECRET`) e as URLs dos seus domínios (`SITE_URL` e `API_EXTERNAL_URL`).

> **Guarde uma cópia do `.env` num gerenciador de senhas, fora do servidor.** Sem o `JWT_SECRET` original, você não consegue restaurar o sistema num servidor novo. O `gerar-segredos.sh` recusa sobrescrever um `.env` existente (use `--force` apenas numa instalação nova).

---

## 6. Subir o Supabase

```bash
cd /opt/armazem-da-cidadania/deploy/supabase
docker compose up -d
docker compose ps          # db, auth, rest, kong, meta e studio devem estar "running" (db/auth "healthy")
```

Teste (na primeira subida o banco leva ~1 minuto para inicializar):

```bash
ANON=$(grep ^ANON_KEY= .env | cut -d= -f2)
curl -s -o /dev/null -w "auth: %{http_code}\n" -H "apikey: $ANON" http://127.0.0.1:8000/auth/v1/health   # 200
docker compose logs --tail=30 db auth rest
```

> Os scripts de inicialização (`volumes/db/roles.sql` e `jwt.sql`) só rodam **na primeira subida**, com o volume de dados vazio. Se algo der errado logo no início e você quiser recomeçar do zero: `docker compose down -v` (**apaga o banco**) e suba de novo — só faça isso antes de ter dados.

---

## 7. Aplicar as migrations do banco

```bash
cd /opt/armazem-da-cidadania
./deploy/aplicar-migrations.sh
```

Aplica em ordem tudo de `supabase/migrations/*.sql`, cada arquivo numa transação, registrando-o em `public._migrations_aplicadas` (pode rodar de novo com segurança; só as pendentes são aplicadas). Ao final fecha as permissões (só a `service_role` acessa o schema `public`) e recarrega o esquema da API. `./deploy/aplicar-migrations.sh --status` lista o que está aplicado/pendente.

> **Se esta instalação vai receber dados do Supabase da nuvem**, leia antes o `deploy/migrar-dados-da-nuvem.md` — o fluxo é diferente.
> **Ponto de atenção:** as migrations `0003`–`0006` originais não estavam no repositório; o `0003_base_tabelas_operacionais.sql` as **reconstrói**. Veja o aviso no início desse arquivo.

---

## 8. Configurar as variáveis de ambiente

```bash
cd /opt/armazem-da-cidadania
cp backend/.env.production.example backend/.env && chmod 600 backend/.env
cp frontend/.env.production.example frontend/.env.production

# Pegue as chaves geradas no passo 5
grep -E '^(ANON_KEY|SERVICE_ROLE_KEY)=' deploy/supabase/.env

nano backend/.env              # SUPABASE_SERVICE_ROLE_KEY e SUPABASE_ANON_KEY
nano frontend/.env.production  # VITE_SUPABASE_ANON_KEY
```

- `backend/.env`: `SUPABASE_URL=http://127.0.0.1:8000` (o backend fala com o Kong localmente), `HOST=127.0.0.1`, `FRONTEND_URL=https://armazemdacidadania.tech` (o CORS só libera esse domínio).
- `frontend/.env.production`: `VITE_API_URL=https://armazemdacidadania.tech/api`, `VITE_SUPABASE_URL=https://db.armazemdacidadania.tech`, e a **ANON_KEY** (pública). A SERVICE_ROLE_KEY **nunca** vai para o frontend.

---

## 9. Criar o primeiro administrador

O Auth do banco novo começa vazio — sem este passo ninguém entra.

```bash
cd /opt/armazem-da-cidadania
npm ci --prefix backend      # precisa das dependências (inclui as de desenvolvimento)
./deploy/criar-admin.sh
```

Informe nome, CPF, e-mail (será o login) e senha quando pedido (a senha não aparece na tela nem fica no histórico).

---

## 10. Primeiro build e publicação (PM2)

```bash
# Pasta servida pelo Nginx e pasta de logs
sudo mkdir -p /var/www/armazemdacidadania /var/log/armazem
sudo chown -R $USER: /var/www/armazemdacidadania /var/log/armazem

cd /opt/armazem-da-cidadania
./deploy/deploy.sh
```

O `deploy.sh` faz: `git pull` → `npm ci` → build do backend e do frontend em pastas temporárias → troca a versão em produção → `pm2 reload` → testa `/api/health` (com rollback automático se falhar). Na primeira vez ele também inicia o app no PM2.

Faça o PM2 subir sozinho quando a VPS reiniciar, e ative a rotação dos logs:

```bash
pm2 startup systemd -u $USER --hp $HOME     # ele imprime UM comando "sudo env PATH=..."; copie e rode
pm2 save
pm2 install pm2-logrotate
pm2 status
curl http://127.0.0.1:3333/api/health       # {"ok":true,...}
```

---

## 11. Nginx

```bash
cd /opt/armazem-da-cidadania
sudo cp deploy/nginx/armazemdacidadania.conf /etc/nginx/sites-available/armazemdacidadania
sudo ln -sf /etc/nginx/sites-available/armazemdacidadania /etc/nginx/sites-enabled/armazemdacidadania
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

O arquivo já traz gzip, limite de corpo (5 MB no sistema, 1 MB no Auth), cabeçalhos de segurança, SPA com fallback para `index.html`, proxy de `/api` para o Node e limite de tentativas de login (10/min por IP).

---

## 12. HTTPS com Certbot

(O DNS do passo 1 precisa estar propagado.)

```bash
sudo certbot --nginx \
  -d armazemdacidadania.tech -d www.armazemdacidadania.tech -d db.armazemdacidadania.tech \
  --redirect --agree-tos -m SEU_EMAIL@exemplo.com --no-eff-email
sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run        # confirma que a renovação automática vai funcionar
```

O certbot emite os certificados, adiciona a escuta na porta 443 e cria o redirecionamento HTTP → HTTPS nos dois sites.

---

## 13. Teste final

```bash
# De qualquer máquina:
curl -I https://armazemdacidadania.tech                           # 200
curl -s https://armazemdacidadania.tech/api/health                # {"ok":true,...}
curl -I http://armazemdacidadania.tech                            # 301 -> https
curl -s -o /dev/null -w "%{http_code}\n" https://db.armazemdacidadania.tech/rest/v1/    # 404 (fechado de propósito)
curl -s -o /dev/null -w "%{http_code}\n" https://db.armazemdacidadania.tech/            # 404
```

Depois, no navegador: abra `https://armazemdacidadania.tech`, entre com o admin do passo 9, escolha o módulo, cadastre uma unidade/núcleo de teste. Se algo falhar, vá para "Solução de problemas" ao final.

---

## 14. Backups

**Backup local diário** (pg_dump comprimido dos schemas `public` e `auth`, mantém os últimos 14 dias):

```bash
sudo mkdir -p /var/backups/armazem && sudo chown $USER: /var/backups/armazem
./deploy/backup.sh                                       # teste manual; confira o arquivo gerado
ls -lh /var/backups/armazem

# Cron diário às 03:15 (edite o usuário e o caminho dentro do arquivo antes, se necessário)
sudo cp deploy/cron/armazem-backup /etc/cron.d/armazem-backup
sudo chmod 644 /etc/cron.d/armazem-backup
```

> ### ⚠ O backup local NÃO protege contra a perda da VPS
> Se o servidor for apagado, comprometido ou o provedor tiver um problema, os backups vão junto. É **obrigatório** enviar uma cópia para **fora**. O destino ainda precisa ser escolhido — o `backup.sh` já chama o gancho `deploy/backup-externo.sh` se ele existir (e avisa em cada execução enquanto não existir). Opções:
>
> - **rclone** para um armazenamento externo (Google Drive, Backblaze B2, S3, OneDrive…);
> - **rsync/scp** para outra máquina sua.
>
> Para ativar: `cp deploy/backup-externo.sh.exemplo deploy/backup-externo.sh`, deixe só a opção escolhida (ajustando o destino), `chmod +x deploy/backup-externo.sh`, e teste com `./deploy/backup.sh`. O ideal é **criptografar** o dump antes de enviar (há um exemplo no arquivo), porque ele contém dados pessoais dos cidadãos e os logins.
>
> Guarde também, fora do servidor, o `deploy/supabase/.env` (num gerenciador de senhas).

**Restaurar:** `./deploy/restaurar-backup.sh /var/backups/armazem/armazem_AAAA-MM-DD_HHMM.dump` (pede confirmação digitando `RESTAURAR`; para a API, restaura, reaplica as permissões e sobe de novo). Em um servidor novo, suba o Supabase com o **mesmo `.env`** do servidor antigo antes de restaurar. **Teste uma restauração de verdade** (num servidor de teste) antes de precisar dela.

---

## Operação do dia a dia

**Atualizar o sistema** (depois de `git push` no seu computador):
```bash
cd /opt/armazem-da-cidadania
./deploy/deploy.sh              # código novo
./deploy/deploy.sh --migrar     # código novo + migrations novas do banco
```
Se o build falhar, o script para com a mensagem do erro e a versão no ar **não** é alterada.

**Ver logs**
```bash
pm2 logs armazem-backend                      # backend (ao vivo)
tail -f /var/log/armazem/backend.err.log
tail -f /var/log/armazem/backup.log
cd deploy/supabase && docker compose logs -f --tail=100 db auth rest kong
sudo tail -f /var/log/nginx/error.log /var/log/nginx/access.log
```

**Estado dos serviços:** `pm2 status` · `docker compose -f deploy/supabase/docker-compose.yml ps` · `systemctl status nginx` · `free -h` · `df -h`.

**Reiniciar:** `pm2 restart armazem-backend` · `(cd deploy/supabase && docker compose restart auth rest kong)`.

**Renovar certificados:** automático (timer do certbot). Verifique com `sudo certbot renew --dry-run` e `systemctl list-timers | grep certbot`.

**Acessar o Studio (painel do banco) por túnel SSH** — ele não é exposto na internet:
```bash
ssh -L 3000:127.0.0.1:3000 SEU_USUARIO@IP_DA_VPS
# deixe a sessão aberta e abra no navegador do seu computador:  http://localhost:3000
```

**Atualizar as imagens do Supabase:** faça um backup, edite as versões em `deploy/supabase/docker-compose.yml` (confira as recomendadas no `docker/` do repositório oficial `supabase/supabase`), então `docker compose pull && docker compose up -d`.

**Trocar a senha do Postgres** não é só mudar o `.env`: os roles internos guardam a senha antiga. Troque os dois lados:
```bash
# 1) dentro do banco, para cada role: authenticator, supabase_auth_admin, supabase_admin, postgres...
#    ALTER USER nome WITH PASSWORD 'nova';   2) atualize POSTGRES_PASSWORD no .env;   3) docker compose up -d
```

---

## Checklist de segurança

- [ ] **Só as portas 22, 80 e 443 abertas** (`sudo ufw status`; e `sudo ss -tlnp` — o Postgres não deve aparecer escutando fora do Docker; Kong/Studio só em `127.0.0.1`).
- [ ] O Postgres **não publica porta nenhuma** no `docker-compose.yml`.
- [ ] `https://db.armazemdacidadania.tech/rest/v1/` responde **404** (acesso direto ao banco pela internet fechado) e o Studio **não** está acessível pela internet.
- [ ] `deploy/supabase/.env`, `backend/.env` e `frontend/.env.production` com permissão **600** e **fora do git** (`git status` não deve listá-los; `git check-ignore -v deploy/supabase/.env`).
- [ ] Cópia do `deploy/supabase/.env` guardada **fora** do servidor (gerenciador de senhas).
- [ ] **Backup externo** configurado e uma **restauração testada**.
- [ ] Login por senha no SSH desativado (só chave), `fail2ban` ativo, atualizações automáticas de segurança ligadas.
- [ ] `SERVICE_ROLE_KEY` só no `backend/.env` — nunca no frontend nem em repositório.
- [ ] `FRONTEND_URL` do backend = só `https://armazemdacidadania.tech`.
- [ ] Senha do administrador forte e única.
- [ ] Certificados renovando (`certbot renew --dry-run` ok).

---

## Solução de problemas

| Sintoma | Verifique |
|---|---|
| `502 Bad Gateway` em `/api` | `pm2 status` e `pm2 logs armazem-backend` (erro de variável de ambiente? `backend/.env` completo?) |
| Login dá erro / “Invalid API key” | `ANON_KEY` do frontend (`frontend/.env.production`, **refazer o build**) precisa ser igual à do `deploy/supabase/.env` |
| Tela branca após o deploy | `curl -I https://armazemdacidadania.tech/assets/` e o console do navegador; `ls /var/www/armazemdacidadania` |
| `PGRST205 ... schema cache` | `./deploy/aplicar-migrations.sh --so-permissoes` (recarrega o esquema) e `docker compose restart rest` |
| Container `auth` reiniciando | `docker compose logs auth` — normalmente a senha do `supabase_auth_admin` não bate com o `.env` (volume de dados criado com outra senha) |
| Certbot falha | DNS ainda não propagou, ou a porta 80 está bloqueada (`sudo ufw status`) |
| `deploy.sh` reclama de alterações locais | `git status` no servidor — não edite arquivos no servidor; mude no seu computador e faça `git push` |
