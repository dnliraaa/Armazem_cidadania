-- ============================================================================
-- Armazém da Cidadania - Unidades, Totens e Recepção por unidade
-- ============================================================================
-- Este script cria:
--   1) a tabela `unidades` (locais físicos de atendimento, ex: "Unidade Centro")
--   2) o vínculo de `funcionarios` com uma unidade + o nível 'recepcao'
--   3) a tabela `totens` (aparelhos/telas fixos, vinculados a uma unidade)
--   4) a coluna `unidade_id` em `senhas`, preenchida a partir do totem que
--      gerou a senha
--
-- Como rodar: Supabase Dashboard > SQL Editor > cole este arquivo > Run.
-- (Assume que as tabelas `funcionarios` e `senhas` já existem no seu banco —
-- `senhas` foi criada anteriormente via SQL Editor, não por migration.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) UNIDADES
-- ----------------------------------------------------------------------------

create table if not exists public.unidades (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  ativo       boolean not null default true,
  criado_por  uuid references public.funcionarios (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists unidades_nome_key on public.unidades (lower(nome));

comment on table public.unidades is 'Unidades físicas do Armazém da Cidadania (ex: Unidade Centro)';

drop trigger if exists set_updated_at on public.unidades;
create trigger set_updated_at
  before update on public.unidades
  for each row execute function public.set_updated_at();

alter table public.unidades enable row level security;

-- ----------------------------------------------------------------------------
-- 2) FUNCIONARIOS: vínculo com unidade + nível 'recepcao'
-- ----------------------------------------------------------------------------
-- unidade_id só é obrigatório (na aplicação, não há constraint de banco para
-- isso) quando role = 'recepcao'. Um funcionário 'recepcao' só enxerga/atende
-- a fila da própria unidade.

alter table public.funcionarios
  add column if not exists unidade_id uuid references public.unidades (id) on delete set null;

-- Troca a constraint de verificação da coluna `role` para aceitar 'recepcao'
-- além do(s) valor(es) já existente(s), sem assumir o nome exato da
-- constraint atual (pode variar conforme o histórico do seu banco).
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any (con.conkey)
    where rel.relname = 'funcionarios'
      and con.contype = 'c'
      and att.attname = 'role'
  loop
    execute format('alter table public.funcionarios drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.funcionarios
  add constraint funcionarios_role_check check (role in ('admin', 'recepcao'));

-- ----------------------------------------------------------------------------
-- 3) TOTENS
-- ----------------------------------------------------------------------------
-- Cada totem representa um aparelho/tela fixo de retirada de senha, sempre
-- vinculado à mesma unidade (não depende de quem loga nele no dia a dia).

create table if not exists public.totens (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  unidade_id  uuid not null references public.unidades (id) on delete restrict,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.totens is 'Totens (telas/aparelhos) de retirada de senha, vinculados a uma unidade fixa';

drop trigger if exists set_updated_at on public.totens;
create trigger set_updated_at
  before update on public.totens
  for each row execute function public.set_updated_at();

alter table public.totens enable row level security;

-- ----------------------------------------------------------------------------
-- 4) SENHAS: unidade de origem
-- ----------------------------------------------------------------------------

alter table public.senhas
  add column if not exists unidade_id uuid references public.unidades (id) on delete set null;

-- ----------------------------------------------------------------------------
-- 5) Row Level Security
-- ----------------------------------------------------------------------------
-- Mesmo padrão das demais tabelas: toda leitura/escrita passa pelo backend
-- com a Service Role Key. RLS fica habilitado (já feito acima, por tabela)
-- sem policies de escrita para anon/authenticated, bloqueando qualquer
-- acesso direto por engano.
