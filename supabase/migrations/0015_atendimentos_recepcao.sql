-- ============================================================================
-- Armazém da Cidadania - Atendimentos resolvidos na recepção
-- ============================================================================
-- Quando a demanda do cidadão é resolvida na própria recepção, não há
-- encaminhamento para núcleo: só fica o registro de que foi resolvida ali.
--
-- Isto substitui a ideia da 0014 (guardar a informação no pendente do núcleo):
-- as colunas da 0014 saem de `atendimentos_pendentes` e o registro passa a
-- viver na tabela própria `atendimentos_recepcao`.
--
-- Como rodar: Supabase Dashboard > SQL Editor > cole este arquivo > Run.
-- ============================================================================

-- Desfaz a 0014 (se ela foi aplicada; se não, não faz nada).
alter table public.atendimentos_pendentes
  drop column if exists resolvida_recepcao,
  drop column if exists descricao_recepcao;

create table if not exists public.atendimentos_recepcao (
  id          uuid primary key default gen_random_uuid(),
  cidadao_id  uuid references public.cidadaos (id) on delete set null,
  senha_id    uuid references public.senhas (id) on delete set null,
  unidade_id  uuid references public.unidades (id) on delete set null,
  descricao   text not null,
  criado_por  uuid references public.funcionarios (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists atendimentos_recepcao_unidade_idx on public.atendimentos_recepcao (unidade_id, created_at desc);
create index if not exists atendimentos_recepcao_senha_idx on public.atendimentos_recepcao (senha_id);

comment on table public.atendimentos_recepcao is 'Atendimentos cuja demanda foi resolvida na própria recepção (sem encaminhamento para núcleo)';

-- Mesmo padrão das demais tabelas: acesso só pelo backend (Service Role Key).
alter table public.atendimentos_recepcao enable row level security;
