-- ============================================================================
-- Armazém da Cidadania - Descrição opcional do atendimento
-- ============================================================================
-- Texto livre para o núcleo detalhar como foi o atendimento. Totalmente
-- opcional (nullable, sem default).
--
-- Como rodar: Supabase Dashboard > SQL Editor > cole este arquivo > Run.
-- ============================================================================

alter table public.atendimentos
  add column if not exists descricao text;

comment on column public.atendimentos.descricao is 'Descrição livre (opcional) de como foi o atendimento, preenchida pelo núcleo';
