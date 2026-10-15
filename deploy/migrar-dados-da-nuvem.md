# Migrar os dados do Supabase na nuvem para o servidor novo

Use este guia **só se o Supabase atual (supabase.co) tem dados que valem a pena manter** — cadastros de cidadãos, funcionários, atendimentos, núcleos/demandas. Se for começar do zero, pule: o passo a passo normal (`DEPLOY.md`) já cria o banco vazio e o primeiro administrador.

> **Nada neste guia altera o Supabase da nuvem.** Os comandos só **leem** (pg_dump) de lá. Mesmo assim, faça-os com calma e guarde os arquivos gerados em local seguro: eles têm dados pessoais.

## Antes de tudo: a pegadinha das migrations 0003 a 0006

As migrations `0003` a `0006` originais **não estão no repositório** (as tabelas `senhas`, `senha_contadores`, `atendimentos`, `atendimentos_pendentes` e a função `proxima_senha_numero` foram criadas à mão no SQL Editor da nuvem). Por isso foi criado o arquivo `supabase/migrations/0003_base_tabelas_operacionais.sql`, que **reconstrói** essas tabelas a partir do código.

Há dois caminhos. O **Caminho A** (recomendado, se você já tem dados) usa o esquema real da nuvem e dispensa a reconstrução.

---

## Pré-requisitos

- O servidor novo já está de pé até o passo "Subir o Supabase" do `DEPLOY.md` (containers rodando).
- Ter à mão a **string de conexão do banco da nuvem**: Supabase (nuvem) → *Project Settings → Database → Connection string → URI* (a que usa a porta 5432 / “Session pooler” ou “Direct”). Ela inclui a senha do banco da nuvem.
- Cliente PostgreSQL 15+ na máquina onde vai rodar o `pg_dump` (`sudo apt install postgresql-client`). Se for rodar a partir do servidor novo, funciona também.

```bash
export CLOUD_URL='postgresql://postgres.xxxxxxxx:SENHA@aws-0-regiao.pooler.supabase.com:5432/postgres'
```

> Não coloque a senha em arquivo versionado nem em script. Use a variável só na sessão do terminal.

---

## Caminho A (recomendado): esquema + dados reais da nuvem

### 1. Exportar da nuvem (somente leitura)

```bash
mkdir -p ~/migracao && cd ~/migracao

# Esquema + dados do schema public (suas tabelas) — sem donos nem privilégios do Supabase Cloud
pg_dump "$CLOUD_URL" --schema=public --no-owner --no-privileges --no-comments \
  -f public.sql

# Usuários e logins (para os funcionários manterem as senhas)
pg_dump "$CLOUD_URL" --data-only --no-owner --no-privileges \
  --table=auth.users --table=auth.identities \
  -f auth_dados.sql
```

Confira que os arquivos não estão vazios: `ls -lh ~/migracao` e `grep -c "CREATE TABLE" public.sql`.

### 2. Importar no servidor novo

Copie os arquivos para o servidor (`scp -r ~/migracao usuario@servidor:~/`) e, **no servidor**, a partir da raiz do projeto:

```bash
cd /opt/armazem-da-cidadania
source deploy/_comum.sh && carregar_senha_postgres

# a) esquema e dados do public
docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" supabase-db \
  psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 < ~/migracao/public.sql

# b) usuários do Auth (precisa de superusuário por causa dos gatilhos/FKs)
docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" supabase-db \
  psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  -c "set session_replication_role = replica;" -f - < ~/migracao/auth_dados.sql
```

> Se a etapa (a) reclamar de `funcionarios.id` apontando para `auth.users`, importe antes o `auth_dados.sql` (b) e depois o `public.sql` (a): os funcionários dependem dos usuários.

### 3. Dizer ao controle de migrations que o esquema já existe

Como o esquema veio pronto da nuvem, **não rode as migrations** — só registre-as como aplicadas:

```bash
./deploy/aplicar-migrations.sh --marcar-todas
./deploy/aplicar-migrations.sh --so-permissoes    # reaplica o endurecimento de permissões
```

### 4. Conferir

```bash
./deploy/aplicar-migrations.sh --status
docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" supabase-db psql -h 127.0.0.1 -U postgres -d postgres \
  -c "select (select count(*) from public.cidadaos) cidadaos, (select count(*) from public.funcionarios) funcionarios, (select count(*) from auth.users) usuarios;"
```

Compare as contagens com as da nuvem. Depois entre no sistema com um usuário antigo: o login deve funcionar com a **mesma senha** de antes (os hashes foram copiados).

---

## Caminho B: criar o esquema pelas migrations e importar só os dados

Use se preferir o esquema do repositório. **Antes**, compare a reconstrução com a nuvem para garantir que nenhuma coluna ficou de fora:

```bash
pg_dump "$CLOUD_URL" --schema-only --no-owner --no-privileges \
  --table=public.senhas --table=public.senha_contadores \
  --table=public.atendimentos --table=public.atendimentos_pendentes \
  -f ~/migracao/esquema_operacional_nuvem.sql
```

Leia o arquivo e compare com `supabase/migrations/0003_base_tabelas_operacionais.sql` + as colunas que as migrations seguintes acrescentam. Se houver coluna a mais na nuvem, adicione-a ao `0003` antes de continuar.

Depois:

```bash
./deploy/aplicar-migrations.sh            # cria todo o esquema no servidor novo

# dados (ordem importa: auth primeiro, depois public)
pg_dump "$CLOUD_URL" --data-only --no-owner --no-privileges \
  --table=auth.users --table=auth.identities -f ~/migracao/auth_dados.sql
pg_dump "$CLOUD_URL" --data-only --no-owner --no-privileges --disable-triggers \
  --schema=public -f ~/migracao/public_dados.sql
```

Importe `auth_dados.sql` e depois `public_dados.sql` como no Caminho A (passo 2-b e 2-a, usando `supabase_admin` para os dois, por causa de `--disable-triggers`). Atenção: o dump de dados do `public` **não** deve incluir a tabela `_migrations_aplicadas` (ela não existe na nuvem, então não há conflito).

---

## Depois de migrar

1. **Chaves novas.** O servidor novo tem `ANON_KEY` e `SERVICE_ROLE_KEY` próprias. Todos os funcionários precisarão **entrar de novo** (as sessões antigas não valem). As senhas continuam as mesmas.
2. **Atualize** `backend/.env` e `frontend/.env.production` com as chaves do **servidor novo** (nunca as da nuvem) e refaça o build (`./deploy/deploy.sh`).
3. **Dados criados depois do dump** na nuvem não vêm junto. Combine um horário: pare de usar o sistema antigo, faça o dump, importe e só então passe a usar o novo.
4. **Mantenha o Supabase da nuvem intacto** por alguns dias como plano B, antes de desativá-lo.
5. Faça um **backup** (`./deploy/backup.sh`) logo após validar a migração.
