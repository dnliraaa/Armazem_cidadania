-- ============================================================================
-- Armazém da Cidadania - Demanda resolvida na recepção
-- ============================================================================
-- Ao encaminhar o cidadão para o núcleo, a recepção pode marcar que a demanda
-- já foi resolvida ali mesmo e registrar uma breve informação sobre isso. O
-- núcleo vê esse registro na fila.
--
-- Como rodar: Supabase Dashboard > SQL Editor > cole este arquivo > Run.
-- ============================================================================

alter table public.atendimentos_pendentes
  add column if not exists resolvida_recepcao boolean not null default false,
  add column if not exists descricao_recepcao text;

comment on column public.atendimentos_pendentes.resolvida_recepcao is 'true = a recepção resolveu a demanda ao encaminhar';
comment on column public.atendimentos_pendentes.descricao_recepcao is 'Informação registrada pela recepção sobre a demanda resolvida';
