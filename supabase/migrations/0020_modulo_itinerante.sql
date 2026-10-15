-- ============================================================================
-- Armazém da Cidadania - Módulo "Armazém Itinerante"
-- ============================================================================
-- A plataforma passa a ter dois módulos:
--   1) Armazém da Cidadania: tudo que já existia, organizado por UNIDADE.
--   2) Armazém Itinerante: as mesmas funcionalidades, mas vinculado a uma
--      "Ação Itinerante" (no lugar da unidade) e com dados operacionais separados.
--
-- COMPARTILHADO entre os módulos: cidadãos, núcleos, demandas, serviços
-- externos e funcionários.
-- SEPARADO por módulo: senhas, contadores de senha, atendimentos_pendentes
-- (filas), atendimentos (histórico), atendimentos_recepcao, totens e painéis.
--
-- Todos os dados existentes passam a pertencer ao módulo 'armazem'.
--
-- Como rodar: Supabase Dashboard > SQL Editor > cole este arquivo > Run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) AÇÕES ITINERANTES
-- ----------------------------------------------------------------------------
-- "Em andamento" = ativo E a data de hoje (America/Sao_Paulo) entre data_inicio
-- e data_fim (calculado pelo backend).

create table if not exists public.acoes_itinerantes (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  descricao    text,
  local        text,
  data_inicio  date not null,
  data_fim     date not null,
  ativo        boolean not null default true,
  criado_por   uuid references public.funcionarios (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint acoes_itinerantes_datas_check check (data_fim >= data_inicio)
);

comment on table public.acoes_itinerantes is 'Ações do Armazém Itinerante (fazem o papel da unidade no módulo Itinerante)';

drop trigger if exists set_updated_at on public.acoes_itinerantes;
create trigger set_updated_at
  before update on public.acoes_itinerantes
  for each row execute function public.set_updated_at();

alter table public.acoes_itinerantes enable row level security;

-- ----------------------------------------------------------------------------
-- 2) FUNCIONARIOS: acesso por módulo
-- ----------------------------------------------------------------------------
-- O nível 'admin' tem acesso aos dois módulos sempre, independente destes campos.

alter table public.funcionarios
  add column if not exists acesso_armazem boolean not null default true,
  add column if not exists acesso_itinerante boolean not null default false;

-- ----------------------------------------------------------------------------
-- 3) TABELAS OPERACIONAIS: módulo + ação itinerante
-- ----------------------------------------------------------------------------

do $$
declare
  t text;
  tabelas text[] := array[
    'senhas', 'senha_contadores', 'atendimentos_pendentes',
    'atendimentos', 'atendimentos_recepcao', 'totens'
  ];
begin
  foreach t in array tabelas loop
    execute format('alter table public.%I add column if not exists modulo text not null default %L', t, 'armazem');
    execute format(
      'alter table public.%I add column if not exists acao_itinerante_id uuid references public.acoes_itinerantes (id) on delete restrict',
      t
    );
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_modulo_check');
    execute format(
      'alter table public.%I add constraint %I check (
         (modulo = %L and acao_itinerante_id is null) or (modulo = %L and acao_itinerante_id is not null)
       )',
      t, t || '_modulo_check', 'armazem', 'itinerante'
    );
    execute format(
      'create index if not exists %I on public.%I (modulo, acao_itinerante_id)',
      t || '_modulo_acao_idx', t
    );
  end loop;
end $$;

-- Unidade: obrigatória nos totens do Armazém e nula nos do Itinerante.
alter table public.totens alter column unidade_id drop not null;
alter table public.totens drop constraint if exists totens_unidade_modulo_check;
alter table public.totens add constraint totens_unidade_modulo_check check (
  (modulo = 'armazem' and unidade_id is not null) or (modulo = 'itinerante' and unidade_id is null)
);

-- Nas demais tabelas a unidade segue opcional no Armazém (há registros antigos
-- sem unidade, como os lançamentos de papel), mas o Itinerante nunca tem unidade.
do $$
declare
  t text;
  tabelas text[] := array['senhas', 'atendimentos_pendentes', 'atendimentos', 'atendimentos_recepcao'];
begin
  foreach t in array tabelas loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_unidade_modulo_check');
    execute format(
      'alter table public.%I add constraint %I check (modulo = %L or unidade_id is null)',
      t, t || '_unidade_modulo_check', 'armazem'
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3b) ATENDIMENTOS_PENDENTES: marca os encaminhamentos feitos pela recepção
-- ----------------------------------------------------------------------------
-- Até aqui a fila do núcleo separava os encaminhamentos dos lançamentos de papel
-- olhando `unidade_id`. No Itinerante não há unidade, então a marca passa a ser
-- explícita. Os encaminhamentos já existentes (que têm unidade) são marcados agora.

alter table public.atendimentos_pendentes
  add column if not exists encaminhado boolean not null default false;

update public.atendimentos_pendentes set encaminhado = true where unidade_id is not null and encaminhado = false;

-- ----------------------------------------------------------------------------
-- 4) CONTADORES E NUMERAÇÃO DE SENHAS POR ESCOPO
-- ----------------------------------------------------------------------------
-- A numeração passa a reiniciar por (dia, tipo, módulo, ação). No Armazém
-- (acao_itinerante_id nulo) o comportamento é exatamente o de antes.

-- senha_contadores: remove a chave antiga (data, tipo) e cria a nova com escopo.
do $$
declare
  c record;
  i record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'senha_contadores'
      and rel.relnamespace = 'public'::regnamespace
      and con.contype in ('p', 'u')
  loop
    execute format('alter table public.senha_contadores drop constraint %I', c.conname);
  end loop;

  for i in
    select ic.relname as nome
    from pg_index ix
    join pg_class ic on ic.oid = ix.indexrelid
    join pg_class t on t.oid = ix.indrelid
    where t.relname = 'senha_contadores'
      and t.relnamespace = 'public'::regnamespace
      and ix.indisunique
  loop
    execute format('drop index if exists public.%I', i.nome);
  end loop;
end $$;

create unique index if not exists senha_contadores_escopo_key
  on public.senha_contadores (data, tipo, modulo, (coalesce(acao_itinerante_id, '00000000-0000-0000-0000-000000000000'::uuid)));

-- senhas: o índice único de (data, tipo, numero) precisa considerar o escopo.
-- (A chave primária por id é mantida.)
do $$
declare
  c record;
  i record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'senhas'
      and rel.relnamespace = 'public'::regnamespace
      and con.contype = 'u'
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = rel.oid and a.attnum = any (con.conkey) and a.attname = 'numero'
      )
  loop
    execute format('alter table public.senhas drop constraint %I', c.conname);
  end loop;

  for i in
    select ic.relname as nome
    from pg_index ix
    join pg_class ic on ic.oid = ix.indexrelid
    join pg_class t on t.oid = ix.indrelid
    where t.relname = 'senhas'
      and t.relnamespace = 'public'::regnamespace
      and ix.indisunique
      and not ix.indisprimary
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = t.oid and a.attnum = any (ix.indkey::int2[]) and a.attname = 'numero'
      )
  loop
    execute format('drop index if exists public.%I', i.nome);
  end loop;
end $$;

create unique index if not exists senhas_escopo_numero_key
  on public.senhas (data, tipo, numero, modulo, (coalesce(acao_itinerante_id, '00000000-0000-0000-0000-000000000000'::uuid)));

-- Função atômica de numeração. A versão antiga (só p_tipo) sai para não haver
-- duas funções ambíguas; os parâmetros novos têm default, então chamar só com
-- p_tipo continua numerando o Armazém como antes.
drop function if exists public.proxima_senha_numero(text);

create or replace function public.proxima_senha_numero(
  p_tipo   text,
  p_modulo text default 'armazem',
  p_acao   uuid default null
)
returns int
language plpgsql
as $$
declare
  v_numero int;
begin
  insert into public.senha_contadores (data, tipo, ultimo_numero, modulo, acao_itinerante_id)
  values (current_date, p_tipo, 1, p_modulo, p_acao)
  on conflict (data, tipo, modulo, (coalesce(acao_itinerante_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  do update set ultimo_numero = senha_contadores.ultimo_numero + 1
  returning ultimo_numero into v_numero;

  return v_numero;
end;
$$;
