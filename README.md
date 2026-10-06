# Armazém da Cidadania — Sistema

Sistema de gestão do Armazém da Cidadania: cadastro de funcionários e de cidadãos atendidos, núcleos/demandas, fila de atendimentos pendentes e fila de senhas (totem + recepção).

**Stack:** React + TypeScript (frontend), Node.js + TypeScript/Express (backend), Supabase (banco de dados PostgreSQL + autenticação).

## Estrutura do projeto

```
armazem-da-cidadania/
├── package.json                    # scripts raiz (install:all, dev, build)
├── deploy/                         # guia e configs de deploy em VPS (ver deploy/DEPLOY.md)
├── supabase/
│   └── migrations/                 # schema do banco (tabelas, RLS, triggers)
├── backend/                        # API Node/Express
│   ├── src/
│   └── scripts/create-admin.ts     # cria o primeiro usuário administrador
└── frontend/                       # App React (Vite)
    └── src/
```

---

## 1. Criar o projeto no Supabase

1. Crie uma conta em [supabase.com](https://supabase.com) e clique em **New Project**.
2. Escolha um nome (ex: `armazem-da-cidadania`), uma senha para o banco e a região mais próxima.
3. Aguarde o projeto ser provisionado (leva 1–2 minutos).
4. No menu lateral, vá em **SQL Editor** → **New query**, cole o conteúdo de cada arquivo em `supabase/migrations/`, em ordem numérica, e clique em **Run**.
5. Vá em **Project Settings → API** e anote:
   - **Project URL** (ex: `https://xxxxxxxxxxxx.supabase.co`)
   - **anon public key**
   - **service_role key** (fique atento: essa chave é secreta, nunca a exponha no frontend)

---

## 2. Configurar as variáveis de ambiente

### Backend

```bash
cd backend
cp .env.example .env
```

Edite o `.env` e preencha:

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
PORT=3333
FRONTEND_URL=http://localhost:5173
```

### Frontend

```bash
cd frontend
cp .env.example .env
```

Edite o `.env`:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=http://localhost:3333/api
```

---

## 3. Instalar as dependências e criar o primeiro administrador

Na **raiz do projeto**, instale as dependências do backend e do frontend de uma vez:

```bash
npm run install:all
```

Depois, crie o primeiro usuário administrador (isso cria o usuário no Supabase Auth e o cadastro correspondente em `funcionarios`, já pronto para logar no sistema):

```bash
cd backend
npm run create-admin -- --nome "Seu Nome" --cpf 12345678900 --email voce@exemplo.com --senha "umaSenhaForte123"
cd ..
```

---

## 4. Rodando o projeto

### Opção A (recomendada): backend + frontend juntos

Na raiz do projeto:

```bash
npm run dev
```

Isso sobe o backend (`http://localhost:3333`) e o frontend (`http://localhost:5173`) ao mesmo tempo, com os logs de cada um prefixados e coloridos (`BACKEND` em azul, `FRONTEND` em verde). Pressione **Ctrl+C** uma vez para encerrar os dois processos juntos — se um deles cair sozinho, o outro também é encerrado automaticamente.

Acesse `http://localhost:5173` e entre com o e-mail/senha do administrador criado no passo anterior. Para conferir se a API está de pé: `curl http://localhost:3333/api/health`.

### Opção B: backend e frontend em terminais separados

Também é possível rodar cada parte isoladamente, em dois terminais diferentes — útil para acompanhar os logs de cada serviço sem misturá-los, ou para reiniciar só um dos dois:

```bash
# terminal 1
cd backend
npm run dev
```

```bash
# terminal 2
cd frontend
npm run dev
```

### Build de produção

Para gerar os builds de produção de backend e frontend de uma vez, na raiz:

```bash
npm run build
```

---

## 5. Funcionalidades implementadas

### Funcionários (somente administradores)
- Listagem de todos os funcionários cadastrados.
- Cadastro de novo funcionário (nome, CPF único, e-mail, senha).
- Edição de nome, CPF e e-mail.
- Alteração de senha de qualquer funcionário.
- Desativação de acesso (soft delete — preserva o histórico).

### Cidadãos
- Listagem com busca por nome ou CPF.
- Cadastro (nome, CPF opcional mas único quando informado, data de nascimento, telefone).
- Edição e remoção de cadastros.

### Formulários
- Núcleos de atendimento (ex: Jurídico) e as demandas de cada um.

### Atendimentos
- Cadastro manual de atendimentos pendentes, com CPF, demanda principal, outras demandas, resolvida/encaminhamento.
- Busca automática do cidadão pelo CPF; cadastro do cidadão sem sair da tela de revisão, se ainda não existir.
- Confirmação (individual ou em lote) só é liberada depois de corrigir ou ignorar explicitamente as pendências (CPF inválido, cidadão não cadastrado, nome em branco, sem demanda selecionada).

### Fila de atendimento (totem + recepção)
- **Totem** (`/totem`): tela cheia, sem menu, para o cidadão retirar senha normal ou prioritária.
- **Recepção** (`/recepcao`): chama a próxima senha (intercalando prioritárias e normais numa proporção de ~1 para 3), permite rechamar, marcar como atendida ou "não compareceu", e mostra quem está esperando em tempo real.

---

## 6. Como o acesso é controlado

- O login é feito via **Supabase Auth** (e-mail + senha).
- Toda a leitura/escrita no banco passa pela **API do backend**, que valida o token do usuário e confere se ele está cadastrado e ativo em `funcionarios` antes de autorizar qualquer operação.
- O banco tem **Row Level Security (RLS)** habilitado como camada extra de proteção: mesmo que a chave pública (`anon`) seja usada por engano em algum lugar, nenhuma escrita é permitida sem passar pela Service Role Key do backend.
- Atualmente todo funcionário cadastrado tem o papel `admin` — a estrutura já está pronta para você criar outros papéis (ex: atendente) no futuro, caso queira restringir o cadastro de funcionários apenas a alguns.

---

## 7. Publicando em produção (visão geral)

- **Backend:** pode ser publicado em qualquer serviço que rode Node.js (Render, Railway, Fly.io, etc.), configurando as mesmas variáveis de ambiente do `.env`.
- **Frontend:** pode ser publicado como site estático (Vercel, Netlify, Cloudflare Pages), rodando `npm run build` na pasta `frontend` e servindo a pasta `dist`. Lembre de apontar `VITE_API_URL` para a URL pública do backend.
- **Supabase:** já é hospedado; nenhuma configuração extra de infraestrutura é necessária.

Para colocar o sistema inteiro (frontend + backend + Supabase self-hosted) numa única VPS, veja o guia passo a passo em [deploy/DEPLOY.md](deploy/DEPLOY.md).

O layout do frontend é responsivo (o menu lateral vira um menu "hambúrguer" em telas de celular), então o mesmo sistema funciona bem tanto no computador quanto no celular. O totem (`/totem`) é pensado para tablet/computador em modo quiosque, em tela cheia.
