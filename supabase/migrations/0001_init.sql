-- ============================================================================
-- Armazém da Cidadania - Schema inicial
-- ============================================================================
-- Este script cria:
--   1) a tabela `funcionarios` (perfis vinculados ao Supabase Auth)
--   2) a tabela `cidadaos` (pessoas atendidas pelo serviço)
--   3) triggers e políticas de RLS (Row Level Security)
--
-- Como rodar: Supabase Dashboard > SQL Editor > cole este arquivo > Run.
-- ============================================================================

-- Extensão usada para gerar UUIDs (já vem habilitada na maioria dos projetos)
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1) FUNCIONARIOS
-- ----------------------------------------------------------------------------
-- A senha de login em si é gerenciada pelo Supabase Auth (tabela auth.users).
-- Esta tabela guarda os dados complementares do funcionário (nome, cpf, papel)
-- e tem o mesmo `id` do usuário em auth.users (chave estrangeira 1:1).

create table if not exists public.funcionarios (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text not null,
  cpf         text not null,
  email       text not null,
  role        text not null default 'admin' check (role in ('admin')),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- CPF deve ser único. Normalizamos removendo pontuação antes de gravar
-- (isso é feito no backend), mas a constraint garante unicidade no banco.
create unique index if not exists funcionarios_cpf_key on public.funcionarios (cpf);
create unique index if not exists funcionarios_email_key on public.funcionarios (lower(email));

comment on table public.funcionarios is 'Funcionários com acesso ao sistema (login via Supabase Auth)';

-- ----------------------------------------------------------------------------
-- 2) CIDADAOS
-- ----------------------------------------------------------------------------
-- Pessoas atendidas pelo Armazém da Cidadania.
-- CPF é opcional (nem todo cidadão atendido terá CPF em mãos no ato do cadastro),
-- mas quando informado deve ser único.

create table if not exists public.cidadaos (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  cpf             text,
  data_nascimento date not null,
  telefone        text not null,
  criado_por      uuid references public.funcionarios (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- CPF único apenas quando preenchido (permite múltiplos registros sem CPF)
create unique index if not exists cidadaos_cpf_key
  on public.cidadaos (cpf)
  where cpf is not null and cpf <> '';

create index if not exists cidadaos_nome_idx on public.cidadaos using gin (nome gin_trgm_ops);
create extension if not exists pg_trgm;

comment on table public.cidadaos is 'Cidadãos cadastrados que utilizam os serviços do Armazém da Cidadania';

-- ----------------------------------------------------------------------------
-- 3) updated_at automático
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.funcionarios;
create trigger set_updated_at
  before update on public.funcionarios
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.cidadaos;
create trigger set_updated_at
  before update on public.cidadaos
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4) Row Level Security
-- ----------------------------------------------------------------------------
-- Toda a escrita/leitura passa pelo backend Node usando a Service Role Key,
-- que ignora RLS. Ainda assim habilitamos RLS e políticas restritivas para
-- que, se alguma chave anônima/pública for usada por engano no frontend,
-- nenhum dado sensível vaze e nenhuma escrita não autorizada aconteça.

alter table public.funcionarios enable row level security;
alter table public.cidadaos enable row level security;

-- Um funcionário autenticado pode ler seu próprio registro (útil para o
-- frontend confirmar nome/papel logo após o login).
drop policy if exists "funcionarios: self select" on public.funcionarios;
create policy "funcionarios: self select"
  on public.funcionarios
  for select
  to authenticated
  using (id = auth.uid());

-- Nenhuma escrita direta é permitida via API pública (anon/authenticated).
-- Toda escrita em funcionarios acontece pelo backend com a Service Role Key.
-- (Não criamos policies de insert/update/delete para authenticated/anon,
-- então essas operações ficam bloqueadas por padrão com RLS habilitado.)

-- Cidadãos: leitura/escrita apenas via backend (Service Role Key).
-- Não há necessidade de expor esta tabela para o cliente diretamente.

-- ----------------------------------------------------------------------------
-- 5) Primeiro administrador
-- ----------------------------------------------------------------------------
-- Depois de criar o projeto, crie o primeiro usuário administrador rodando
-- o script `backend/scripts/create-admin.ts` (veja o README), que cria o
-- usuário no Supabase Auth e a linha correspondente em `public.funcionarios`
-- automaticamente.
