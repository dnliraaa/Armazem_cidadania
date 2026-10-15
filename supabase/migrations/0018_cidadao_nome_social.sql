-- ============================================================================
-- Armazém da Cidadania - Nome social e nome da mãe do cidadão
-- ============================================================================
-- nome_social: opcional; quando preenchido, é o nome chamado no painel.
-- nome_mae: obrigatório nos novos cadastros (regra da aplicação); nullable no
-- banco para não quebrar cadastros antigos. Sem backfill.
--
-- Já existiam em `cidadaos` e não são alterados: nome, cpf, data_nascimento e
-- telefone (este continua `not null` desde a 0001_init.sql).
--
-- Como rodar: Supabase Dashboard > SQL Editor > cole este arquivo > Run.
-- ============================================================================

alter table public.cidadaos
  add column if not exists nome_social text,
  add column if not exists nome_mae text;

comment on column public.cidadaos.nome_social is 'Nome social (opcional); quando preenchido, é o nome chamado no painel';
comment on column public.cidadaos.nome_mae is 'Nome da mãe, para distinguir homônimos';

-- Busca por nome social (a busca por nome completo já usa cidadaos_nome_idx).
create index if not exists cidadaos_nome_social_idx on public.cidadaos using gin (nome_social gin_trgm_ops);
