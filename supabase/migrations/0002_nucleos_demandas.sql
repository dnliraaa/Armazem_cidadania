-- ============================================================================
-- Armazém da Cidadania - Núcleos e Demandas
-- ============================================================================
-- Base de cadastro para o módulo "Formulários": cada Núcleo (ex: JURÍDICO)
-- agrupa várias Demandas (ex: DIVÓRCIO, PENSÃO POR MORTE). Ainda não há
-- vínculo com cidadão nem lógica de formulário preenchido — isso vem depois.
--
-- Como rodar: Supabase Dashboard > SQL Editor > cole este arquivo > Run.
-- (Se as tabelas já existirem, os índices/trigger abaixo são aplicados sem
-- duplicar nada, graças aos "if not exists"/"or replace".)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) NUCLEOS
-- ----------------------------------------------------------------------------

create table if not exists public.nucleos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  ativo       boolean not null default true,
  criado_por  uuid references public.funcionarios (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Nome de núcleo único (case-insensitive) — o backend já confere isso antes
-- de inserir, mas o índice garante a regra também no banco.
create unique index if not exists nucleos_nome_key on public.nucleos (lower(nome));

comment on table public.nucleos is 'Núcleos de atendimento (ex: Jurídico), usados para agrupar Demandas';

-- ----------------------------------------------------------------------------
-- 2) DEMANDAS
-- ----------------------------------------------------------------------------

create table if not exists public.demandas (
  id          uuid primary key default gen_random_uuid(),
  nucleo_id   uuid not null references public.nucleos (id) on delete cascade,
  nome        text not null,
  ativo       boolean not null default true,
  criado_por  uuid references public.funcionarios (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Nome de demanda único (case-insensitive) dentro do mesmo núcleo.
create unique index if not exists demandas_nucleo_nome_key on public.demandas (nucleo_id, lower(nome));

comment on table public.demandas is 'Demandas atendidas dentro de um Núcleo (ex: Divórcio, dentro de Jurídico)';

-- ----------------------------------------------------------------------------
-- 3) updated_at automático (reaproveita a função criada em 0001_init.sql)
-- ----------------------------------------------------------------------------

drop trigger if exists set_updated_at on public.nucleos;
create trigger set_updated_at
  before update on public.nucleos
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.demandas;
create trigger set_updated_at
  before update on public.demandas
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4) Row Level Security
-- ----------------------------------------------------------------------------
-- Mesmo esquema das demais tabelas: toda leitura/escrita passa pelo backend
-- com a Service Role Key. RLS fica habilitado sem policies de escrita para
-- anon/authenticated, bloqueando qualquer acesso direto por engano.

alter table public.nucleos enable row level security;
alter table public.demandas enable row level security;
