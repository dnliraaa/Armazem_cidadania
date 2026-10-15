# Ambiente de TESTE: Vercel (frontend) + Railway (backend) + Supabase na nuvem

> ## ⚠ Somente dados FICTÍCIOS
> Este arranjo é para **desenvolvimento e demonstração**. Vercel e Railway têm servidores fora do Brasil
> (o Railway, até onde se sabe, só EUA/Europa/Ásia — confira no painel). O **backend** recebe e processa
> todos os dados dos cidadãos (CPF, nome da mãe, telefone...), então **não coloque dados pessoais reais**
> aqui até a Secretaria (controlador dos dados, encarregado de dados/LGPD) aprovar onde a produção vai rodar.
> Para a produção, o caminho recomendado é backend e banco **no Brasil** (infraestrutura da Prefeitura ou
> provedor brasileiro) — o `deploy/DEPLOY.md` serve para qualquer VPS Ubuntu.

```
Navegador ──> Vercel (frontend estático)
     │
     ├──> Railway (backend Node, /api) ──> Supabase Cloud (banco + Auth)   [chave service_role, só no backend]
     └──> Supabase Cloud (somente o login /auth/v1)                        [chave anon, pública]
```

**Termos e custo (confira, mudam com o tempo):** o plano gratuito da Vercel costuma ser só para uso pessoal/não comercial
(um projeto de órgão público provavelmente exige plano pago); o Railway cobra por uso depois de um crédito inicial;
o Supabase gratuito pausa o projeto após um período sem uso. **Combine com a Secretaria quem paga e em nome de quem a conta é aberta**
antes de cadastrar qualquer cartão.

---

## 0. Antes de começar

1. **Envie o código ao GitHub** (`git add`, `commit`, `push`): Vercel e Railway puxam do repositório. Tudo que foi feito
   (módulo Itinerante, pasta `deploy/`, `vercel.json`, `railway.json`, correção do build) precisa estar enviado.
2. Tenha à mão do Supabase (Project Settings → API): **Project URL**, **anon key** e **service_role key**.
   A service_role **nunca** vai para a Vercel nem para o código.

## 1. Supabase (nuvem)

1. **Migrations:** o projeto atual já tem tudo até a `0020`. Num projeto novo, aplique `supabase/migrations/*.sql` em ordem no SQL Editor
   (veja o aviso sobre o `0003`, reconstruído, em `deploy/migrar-dados-da-nuvem.md`).
2. **Permissões:** rode `deploy/supabase-cloud-permissoes.sql` no SQL Editor. Ele impede que a chave pública (anon) chame funções como
   `proxima_senha_numero` pela API REST.
3. **Fechar o cadastro aberto:** *Authentication → Sign In / Providers* (ou *Providers → Email*) → **desative “Allow new users to sign up”**.
   O sistema é fechado: os usuários são criados por um administrador.
4. *Authentication → URL Configuration*: coloque em **Site URL** o endereço da Vercel (passo 3), quando o tiver.
5. Se ainda não existe administrador, crie com `npm run create-admin --prefix backend` (a partir do seu computador, com o `backend/.env` apontando para este projeto).

## 2. Railway — backend

1. *New Project → Deploy from GitHub repo* → escolha o repositório.
2. No serviço: **Settings → Source → Root Directory = `backend`**. (O arquivo `backend/railway.json` já define build, start e o teste de saúde `/api/health`.)
3. **Variables** (aba do serviço):

   | Variável | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `SUPABASE_URL` | URL do projeto (`https://xxxx.supabase.co`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | chave service_role |
   | `SUPABASE_ANON_KEY` | chave anon |
   | `FRONTEND_URL` | endereço da Vercel (passo 3), **sem barra no final** — pode deixar provisório e ajustar depois |

   - **Não defina `HOST`** nem `PORT`: o Railway injeta a porta, e o padrão de escutar em todas as interfaces é o que ele precisa
     (`HOST=127.0.0.1` é só para a VPS com Nginx e **quebraria** o Railway).
   - Em produção o backend **recusa subir sem `FRONTEND_URL`** (de propósito: o CORS só libera o domínio informado).
4. **Settings → Networking → Generate Domain** → anote a URL pública (algo como `https://armazem-backend-production.up.railway.app`).
5. Teste: abra `https://SUA-URL-DO-RAILWAY/api/health` → deve mostrar `{"ok":true,...}`.

> O `backend/nixpacks.toml` instala também as dependências de desenvolvimento (`npm ci --include=dev`), porque o TypeScript é necessário para compilar
> e, com `NODE_ENV=production` definido, o instalador padrão as omitiria e o build falharia.

## 3. Vercel — frontend

1. *Add New → Project* → importe o repositório.
2. **Root Directory = `frontend`**. Framework: Vite (detecta sozinho). Build: `npm run build`. Output: `dist`.
3. **Environment Variables** (Production, e Preview se quiser):

   | Variável | Valor |
   |---|---|
   | `VITE_API_URL` | `https://SUA-URL-DO-RAILWAY/api` (com `/api` no final) |
   | `VITE_SUPABASE_URL` | URL do projeto Supabase |
   | `VITE_SUPABASE_ANON_KEY` | chave **anon** (a pública) |

   Estes valores são gravados no JavaScript no momento do build: depois de mudá-los, é preciso **fazer um novo deploy**.
4. O `frontend/vercel.json` já cuida das rotas do React (`/armazem/...`, `/itinerante/...`): sem ele, recarregar a página daria 404.
5. Anote o endereço final (`https://seu-projeto.vercel.app`).

## 4. Fechar o ciclo

1. Volte ao **Railway** e ajuste `FRONTEND_URL` para o endereço da Vercel (exatamente como aparece no navegador, sem barra no final). Se tiver domínio próprio ou
   mais de um endereço, separe por vírgula. O Railway reinicia sozinho.
2. Volte ao **Supabase** → URL Configuration → Site URL = endereço da Vercel.

## 5. Teste final

- `https://SUA-URL-DO-RAILWAY/api/health` responde.
- Abra o endereço da Vercel, entre com o administrador e navegue (`/armazem/...`, recarregue a página: não pode dar 404).
- Console do navegador (F12 → Console): **sem erros de CORS**. Se aparecer “blocked by CORS policy”, o `FRONTEND_URL` do Railway não bate exatamente
  com o endereço da página (confira `https`, subdomínio e barra no final).
- Cadastre uma unidade e um cidadão **fictício**, retire uma senha etc.

## Solução de problemas

| Sintoma | Verifique |
|---|---|
| Build do Railway falha com “tsc: not found” | O `railway.json` está na pasta `backend` e o Root Directory é `backend`? |
| Railway “unhealthy” / não sobe | Logs do serviço; `FRONTEND_URL` e as chaves do Supabase definidos? `HOST` **não** definido? |
| Erro de CORS | `FRONTEND_URL` ≠ endereço real da página; ou `VITE_API_URL` aponta para o lugar errado |
| Login dá “Invalid API key” | `VITE_SUPABASE_ANON_KEY` errada, ou faltou novo deploy depois de mudar as variáveis |
| Página branca / 404 ao recarregar | `frontend/vercel.json` não foi enviado ao GitHub |
| `PGRST205 ... schema cache` | Rode `notify pgrst, 'reload schema';` no SQL Editor do Supabase |
| Projeto Supabase “pausado” | Plano gratuito: reative pelo painel |

## Segurança (checklist rápido)

- [ ] service_role **só** nas variáveis do Railway; nunca na Vercel, no código nem no GitHub.
- [ ] `deploy/supabase-cloud-permissoes.sql` executado.
- [ ] “Allow new users to sign up” **desligado** no Supabase.
- [ ] `FRONTEND_URL` do Railway = só o endereço do sistema.
- [ ] **Somente dados fictícios** neste ambiente.
