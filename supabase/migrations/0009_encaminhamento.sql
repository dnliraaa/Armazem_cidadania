-- ============================================================================
-- Armazém da Cidadania - Encaminhamento da recepção
-- ============================================================================
-- A recepção agora identifica/cadastra o cidadão ao atender uma senha e cria
-- um atendimento 'encaminhado' — ainda sem núcleo/demanda, que só serão
-- preenchidos quando o núcleo efetivamente atender (funcionalidade futura).
--
-- Como rodar: Supabase Dashboard > SQL Editor > cole este arquivo > Run.
-- ============================================================================

-- Atendimentos já existentes ficam como 'concluido' (default); os criados
-- pelo fluxo da recepção entram como 'encaminhado'.
alter table public.atendimentos
  add column if not exists status text not null default 'concluido';

alter table public.atendimentos
  drop constraint if exists atendimentos_status_check;
alter table public.atendimentos
  add constraint atendimentos_status_check check (status in ('encaminhado', 'concluido'));

-- Na hora do encaminhamento ainda não se sabe qual núcleo/demanda atenderá.
alter table public.atendimentos alter column nucleo_id drop not null;
alter table public.atendimentos alter column demanda_principal_id drop not null;

-- Origem do atendimento na fila de senhas e unidade (herdada da senha).
alter table public.atendimentos
  add column if not exists senha_id uuid references public.senhas (id) on delete set null;
alter table public.atendimentos
  add column if not exists unidade_id uuid references public.unidades (id) on delete set null;

create index if not exists atendimentos_senha_id_idx on public.atendimentos (senha_id);
create index if not exists atendimentos_unidade_id_idx on public.atendimentos (unidade_id);

comment on column public.atendimentos.status is 'encaminhado = identificado na recepção, aguardando o núcleo; concluido = atendimento finalizado';
comment on column public.atendimentos.senha_id is 'Senha da fila que originou este atendimento (quando veio da recepção)';
comment on column public.atendimentos.unidade_id is 'Unidade onde o atendimento ocorreu (herdada da senha)';
