-- ============================================================================
-- Armazém da Cidadania - Base das tabelas operacionais (RECONSTRUÍDA)
-- ============================================================================
-- ATENÇÃO: as migrations 0003 a 0006 originais NÃO estão no repositório: as
-- tabelas abaixo foram criadas à mão no SQL Editor do Supabase na nuvem. Sem
-- elas, as migrations seguintes (0007 em diante) falham num banco novo, porque
-- alteram `senhas`, `atendimentos`, etc.
--
-- Este arquivo RECONSTRÓI essas tabelas a partir do que o código e as demais
-- migrations usam. Tudo é `if not exists`, então rodar num banco que já as tem
-- (como o da nuvem) não muda nada.
--
-- Antes de depender dele em produção, COMPARE com o banco da nuvem:
--   pg_dump "<conexão da nuvem>" --schema-only --no-owner -t 'public.senhas' \
--     -t 'public.senha_contadores' -t 'public.atendimentos' -t 'public.atendimentos_pendentes'
-- (ver deploy/migrar-dados-da-nuvem.md). Se houver diferença, ajuste este arquivo.
--
-- Colunas acrescentadas por migrations posteriores NÃO entram aqui (unidade_id,
-- tentativas, status de atendimentos, módulo etc.).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) SENHAS e contadores
-- ----------------------------------------------------------------------------

create table if not exists public.senha_contadores (
  data           date not null,
  tipo           text not null,
  ultimo_numero  int not null default 0,
  primary key (data, tipo)
);

alter table public.senha_contadores enable row level security;

create table if not exists public.senhas (
  id            uuid primary key default gen_random_uuid(),
  data          date not null,
  tipo          text not null check (tipo in ('normal', 'prioritaria')),
  numero        int not null,
  status        text not null default 'aguardando'
                check (status in ('aguardando', 'chamada', 'atendida', 'perdida')),
  guiche        text,
  chamada_por   uuid references public.funcionarios (id) on delete set null,
  criada_em     timestamptz not null default now(),
  chamada_em    timestamptz,
  atendida_em   timestamptz
);

create unique index if not exists senhas_data_tipo_numero_key on public.senhas (data, tipo, numero);
create index if not exists senhas_data_status_idx on public.senhas (data, status);

alter table public.senhas enable row level security;

-- Numeração atômica: duas retiradas simultâneas nunca recebem o mesmo número.
-- (A versão com escopo de módulo/ação vem na 0020, que substitui esta função.)
create or replace function public.proxima_senha_numero(p_tipo text)
returns int
language plpgsql
as $$
declare
  v_numero int;
begin
  insert into public.senha_contadores (data, tipo, ultimo_numero)
  values (current_date, p_tipo, 1)
  on conflict (data, tipo)
  do update set ultimo_numero = senha_contadores.ultimo_numero + 1
  returning ultimo_numero into v_numero;

  return v_numero;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2) ATENDIMENTOS_PENDENTES (fila de revisão / fila do núcleo)
-- ----------------------------------------------------------------------------

create table if not exists public.atendimentos_pendentes (
  id                    uuid primary key default gen_random_uuid(),
  nucleo_id             uuid not null references public.nucleos (id) on delete restrict,
  origem                text not null default 'manual',
  cpf_texto             text,
  cidadao_id            uuid references public.cidadaos (id) on delete set null,
  nome                  text,
  demanda_principal_id  uuid references public.demandas (id) on delete set null,
  outras_demandas       uuid[] not null default '{}',
  resolvida             boolean,
  houve_encaminhamento  boolean,
  validacoes            jsonb,
  status                text not null default 'pendente_revisao'
                        check (status in ('pendente_revisao', 'confirmado', 'rejeitado')),
  data_atendimento      date,
  erro_ignorado         boolean not null default false,
  criado_por            uuid references public.funcionarios (id) on delete set null,
  revisado_por          uuid references public.funcionarios (id) on delete set null,
  revisado_em           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists atendimentos_pendentes_status_idx on public.atendimentos_pendentes (status);

drop trigger if exists set_updated_at on public.atendimentos_pendentes;
create trigger set_updated_at
  before update on public.atendimentos_pendentes
  for each row execute function public.set_updated_at();

alter table public.atendimentos_pendentes enable row level security;

-- ----------------------------------------------------------------------------
-- 3) ATENDIMENTOS (definitivos)
-- ----------------------------------------------------------------------------

create table if not exists public.atendimentos (
  id                    uuid primary key default gen_random_uuid(),
  cidadao_id            uuid references public.cidadaos (id) on delete set null,
  nucleo_id             uuid not null references public.nucleos (id) on delete restrict,
  demanda_principal_id  uuid references public.demandas (id) on delete set null,
  outras_demandas       uuid[] not null default '{}',
  resolvida             boolean not null default false,
  houve_encaminhamento  boolean not null default false,
  origem                text not null default 'manual',
  atendido_por          uuid references public.funcionarios (id) on delete set null,
  pendente_id           uuid references public.atendimentos_pendentes (id) on delete set null,
  data_atendimento      date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists atendimentos_nucleo_idx on public.atendimentos (nucleo_id);
create index if not exists atendimentos_cidadao_idx on public.atendimentos (cidadao_id);

drop trigger if exists set_updated_at on public.atendimentos;
create trigger set_updated_at
  before update on public.atendimentos
  for each row execute function public.set_updated_at();

alter table public.atendimentos enable row level security;
